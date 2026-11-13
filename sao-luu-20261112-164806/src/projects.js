import { makePlan } from './planner.js';
import { SimError, KIND_LABEL } from './sim.js';
import { createWork } from './work.js';

// Yêu cầu của CEO → kế hoạch của CTO → chờ duyệt → chạy. Chưa duyệt thì chưa có việc nào được tạo.
export const MAX_PENDING = 30;
export const STATUS_LABEL = { awaiting: 'Chờ duyệt', running: 'Đang chạy', done: 'Đã xong', rejected: 'Đã từ chối', cancelled: 'Đã dừng' };

export function createProjects({ db, sim, config, hub }) {
  const work = createWork({ db, sim });
  const q = {
    ins: db.prepare('INSERT INTO projects (title, kind, request, plan, estimate) VALUES (?,?,?,?,?)'),
    get: db.prepare('SELECT * FROM projects WHERE id = ?'),
    list: db.prepare('SELECT * FROM projects ORDER BY id DESC LIMIT ?'),
    pending: db.prepare("SELECT id, title, estimate FROM projects WHERE status = 'awaiting' ORDER BY id"),
    pendingN: db.prepare("SELECT COUNT(*) n FROM projects WHERE status = 'awaiting'"),
    committed: db.prepare("SELECT COALESCE(SUM(estimate), 0) s FROM projects WHERE status = 'running'"),
    run: db.prepare("UPDATE projects SET status = 'running', run_id = ?, decided_at = datetime('now') WHERE id = ? AND status = 'awaiting'"),
    reject: db.prepare("UPDATE projects SET status = 'rejected', decided_at = datetime('now') WHERE id = ? AND status = 'awaiting'")
  };
  const emit = () => hub?.broadcast?.('projects', { time: Date.now() });

  function budget(estimate) {
    const monthly = Number(config.monthlyBudget) || 0;
    const committed = Number(q.committed.get().s) || 0;
    const remaining = Math.max(0, Math.round((monthly - committed) * 100) / 100);
    return { monthly, committed: Math.round(committed * 100) / 100, remaining, over: estimate > remaining };
  }

  function progressOf(id) {
    const r = sim?.snapshot().runs.find(x => x.projectId === id);
    return r ? { stage: r.stage, total: r.total } : null;
  }

  // Số việc đã xong và chi phí "đã dùng". Chưa có chi phí thật nên tính = giá ước tính của từng phòng × tiến độ việc của phòng đó.
  function statsOf(r, plan, live) {
    const planTasks = plan.stages.flatMap(s => s.tasks);
    const out = { tasksTotal: planTasks.length, tasksDone: 0, spent: 0 };
    if (r.run_id == null) return out;
    const cost = Object.fromEntries(planTasks.map(t => [t.dept, t.cost]));
    let spent = 0;
    for (const t of work.list({ run: r.run_id, limit: 500 }, live)) {
      if (t.support) continue;
      if (t.state === 'done') out.tasksDone++;
      spent += (cost[t.deptCode] || 0) * t.progress;
    }
    out.spent = Math.round(spent * 100) / 100;
    return out;
  }

  function shape(r, withPlan, live) {
    const plan = JSON.parse(r.plan);
    const out = {
      id: r.id, title: r.title, kind: r.kind, kindLabel: KIND_LABEL[r.kind] || r.kind, status: r.status, statusLabel: STATUS_LABEL[r.status],
      estimate: r.estimate, runId: r.run_id, createdAt: r.created_at, decidedAt: r.decided_at, finishedAt: r.finished_at,
      progress: r.status === 'running' ? progressOf(r.id) : null,
      stats: statsOf(r, plan, live)
    };
    if (withPlan) {
      out.request = r.request; out.plan = plan;
      if (r.status === 'awaiting') out.budget = budget(r.estimate);
      out.tasks = r.run_id == null ? [] : work.list({ run: r.run_id, order: 'asc', limit: 500 }, live);
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
    const run = sim.spawn({ title: r.title, kind: r.kind, projectId: r.id });       // có thể báo 409 nếu đang đủ 8 việc chạy; khi đó kế hoạch vẫn chờ duyệt
    q.run.run(run.id, r.id);
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
    work,
    pendingCount: () => q.pendingN.get().n,
    pending: () => q.pending.all().map(r => ({ id: r.id, title: r.title, estimate: r.estimate }))
  };
}
