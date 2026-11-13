import { makePlan } from './planner.js';
import { SimError, KIND_LABEL } from './sim.js';
import { createWork } from './work.js';
import { createBugs } from './bugs.js';
import { BUDGET_FACTOR, round2 } from './pricing.js';

// Yêu cầu của CEO → kế hoạch của CTO → chờ duyệt → chạy. Chưa duyệt thì chưa có việc nào được tạo.
export const MAX_PENDING = 30;
export const STATUS_LABEL = { awaiting: 'Chờ duyệt', running: 'Đang chạy', done: 'Đã xong', rejected: 'Đã từ chối', cancelled: 'Đã dừng' };

export function createProjects({ db, sim, config, hub, ai = null }) {
  const work = createWork({ db, sim });
  const bugs = createBugs({ db });
  const q = {
    ins: db.prepare('INSERT INTO projects (title, kind, request, plan, estimate) VALUES (?,?,?,?,?)'),
    get: db.prepare('SELECT * FROM projects WHERE id = ?'),
    list: db.prepare('SELECT * FROM projects ORDER BY id DESC LIMIT ?'),
    pending: db.prepare("SELECT id, title, estimate FROM projects WHERE status = 'awaiting' ORDER BY id"),
    pendingN: db.prepare("SELECT COUNT(*) n FROM projects WHERE status = 'awaiting'"),
    running: db.prepare("SELECT p.estimate, COALESCE((SELECT SUM(c.amount) FROM costs c WHERE c.project_id = p.id), 0) AS spent FROM projects p WHERE p.status = 'running'"),
    monthSpent: db.prepare("SELECT COALESCE(SUM(amount), 0) s FROM costs WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"),
    spentOf: db.prepare('SELECT COALESCE(SUM(amount), 0) s FROM costs WHERE project_id = ?'),
    gateOf: db.prepare("SELECT id, kind, title, detail, created_at AS createdAt FROM approvals WHERE project_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1"),
    run: db.prepare("UPDATE projects SET status = 'running', run_id = ?, budget = ?, decided_at = datetime('now') WHERE id = ? AND status = 'awaiting'"),
    reject: db.prepare("UPDATE projects SET status = 'rejected', decided_at = datetime('now') WHERE id = ? AND status = 'awaiting'")
  };
  const emit = () => hub?.broadcast?.('projects', { time: Date.now() });

  // Ngân sách tháng còn lại = ngân sách tháng − tiền đã tiêu trong tháng − phần các dự án đang chạy còn dự kiến tiêu thêm.
  function budget(estimate) {
    const monthly = Number(config.monthlyBudget) || 0;
    const spentMonth = round2(Number(q.monthSpent.get().s) || 0);
    const committed = round2(q.running.all().reduce((a, r) => a + Math.max(0, r.estimate - r.spent), 0));
    const remaining = Math.max(0, round2(monthly - spentMonth - committed));
    return { monthly, spentMonth, committed, remaining, over: estimate > remaining };
  }

  function progressOf(id) {
    const r = sim?.snapshot().runs.find(x => x.projectId === id);
    if (!r) return null;
    const bugRound = r.items.some(i => i.kind === 'fix' || i.kind === 'retest');      // đang sửa lỗi hoặc kiểm lại
    return { stage: r.stage, total: r.total, delivering: !!r.delivering, bugRound, gate: r.gate ? r.gate.kind : null };
  }

  // Số việc đã xong và chi phí "đã dùng". Chưa có chi phí thật nên tính = giá ước tính của từng phòng × tiến độ việc của phòng đó.
  function statsOf(r, plan, live) {
    const planTasks = plan.stages.flatMap(s => s.tasks);
    const out = { tasksTotal: planTasks.length, tasksDone: 0, spent: 0, bugs: { total: 0, active: 0 } };
    if (r.run_id == null) return out;
    out.bugs = bugs.countFor(r.run_id);
    out.spent = round2(Number(q.spentOf.get(r.id).s) || 0);          // chi phí đã ghi nhận (mô phỏng)
    for (const t of work.list({ run: r.run_id, limit: 500 }, live)) {
      if (t.kind !== 'main') continue;                 // việc hỗ trợ, sửa lỗi và kiểm lại không tính vào số việc của kế hoạch
      if (t.state === 'done') out.tasksDone++;
    }
    return out;
  }

  // budgetCap: ngân sách của dự án (đặt khi duyệt). Khác với budget: ngân sách THÁNG, chỉ có khi kế hoạch còn chờ duyệt.
  function shape(r, withPlan, live) {
    const plan = JSON.parse(r.plan);
    const out = {
      id: r.id, title: r.title, kind: r.kind, kindLabel: KIND_LABEL[r.kind] || r.kind, status: r.status, statusLabel: STATUS_LABEL[r.status],
      estimate: r.estimate, budgetCap: r.budget, ai: !!r.ai, runId: r.run_id, createdAt: r.created_at, decidedAt: r.decided_at, finishedAt: r.finished_at,
      progress: r.status === 'running' ? progressOf(r.id) : null,
      stats: statsOf(r, plan, live)
    };
    if (withPlan) {
      out.request = r.request; out.plan = plan;
      if (r.status === 'awaiting') out.budget = budget(r.estimate);
      out.tasks = r.run_id == null ? [] : work.list({ run: r.run_id, order: 'asc', limit: 500 }, live);
      out.bugs = r.run_id == null ? [] : bugs.list({ run: r.run_id });
      const g = r.status === 'running' ? q.gateOf.get(r.id) : null;
      out.gate = g ? { id: g.id, kind: g.kind, title: g.title, createdAt: g.createdAt, detail: JSON.parse(g.detail) } : null;
    }
    return out;
  }

  function get(id) {
    const r = q.get.get(Number(id));
    if (!r) throw new SimError(404, 'Không có dự án này.');
    return shape(r, true, work.liveMap());
  }

  function create(body) {
    if (q.pendingN.get().n >= MAX_PENDING) throw new SimError(409, `Đang có ${MAX_PENDING} kế hoạch chờ duyệt. Hãy duyệt hoặc từ chối bớt rồi gửi tiếp.`);
    const plan = makePlan({ text: body.text, kind: body.kind, title: body.title });
    const id = Number(q.ins.run(plan.title, plan.kind, String(body.text).trim(), JSON.stringify(plan), plan.estimate.expected).lastInsertRowid);
    emit();
    return get(id);
  }

  function approve(id, body = {}) {
    const r = q.get.get(Number(id));
    if (!r) throw new SimError(404, 'Không có dự án này.');
    if (r.status !== 'awaiting') throw new SimError(409, 'Kế hoạch này đã được xử lý rồi.');
    if (!sim) throw new SimError(503, 'Bộ máy chạy việc chưa sẵn sàng.');
    if (budget(r.estimate).over && body.confirmOverBudget !== true) throw new SimError(409, 'Kế hoạch này vượt phần ngân sách tháng còn lại. Hãy xác nhận vượt ngân sách để tiếp tục.');
    const plan = JSON.parse(r.plan), projBudget = round2(r.estimate * BUDGET_FACTOR);
    const planCosts = Object.fromEntries(plan.stages.flatMap(s => s.tasks).map(t => [t.dept, t.cost]));
    if (ai?.enabled()) ai.assertReady();            // thiếu khoá của nhà cung cấp nào đó thì báo ngay, không để dự án chạy nửa chừng rồi mới dừng
    const run = sim.spawn({ title: r.title, kind: r.kind, projectId: r.id, planCosts, estimate: r.estimate, budget: projBudget, ai: !!ai?.enabled() });       // có thể báo 409 nếu đang đủ 8 việc chạy; khi đó kế hoạch vẫn chờ duyệt
    q.run.run(run.id, projBudget, r.id);
    emit();
    return get(r.id);
  }

  function reject(id) {
    const r = q.get.get(Number(id));
    if (!r) throw new SimError(404, 'Không có dự án này.');
    if (r.status !== 'awaiting') throw new SimError(409, 'Kế hoạch này đã được xử lý rồi.');
    q.reject.run(r.id);
    emit();
    return get(r.id);
  }

  return {
    create, get, approve, reject,
    list: (limit = 50) => { const live = work.liveMap(); return q.list.all(Math.min(100, Math.max(1, Number(limit) || 50))).map(r => shape(r, false, live)); },
    work, bugs,
    pendingCount: () => q.pendingN.get().n,
    pending: () => q.pending.all().map(r => ({ id: r.id, title: r.title, estimate: r.estimate }))
  };
}
