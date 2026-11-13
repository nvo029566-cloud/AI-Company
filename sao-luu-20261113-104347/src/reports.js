import { SimError, KIND_LABEL } from './sim.js';
import { round2 } from './pricing.js';
import { COST_KIND_LABEL } from './costs.js';
import { DECISION_LABEL } from './approvals.js';

// Báo cáo tổng hợp: toàn công ty theo khoảng thời gian, và từng dự án. Đồng thời liệt kê các lần triển khai.
const PERIODS = { '7': 'Bảy ngày qua', '30': 'Ba mươi ngày qua', all: 'Từ trước tới nay' };
const STATUS_LABEL = { awaiting: 'Chờ duyệt', running: 'Đang chạy', done: 'Đã xong', rejected: 'Đã từ chối', cancelled: 'Đã dừng' };

export function createReports({ db, projects }) {
  const secs = (a, b) => `(strftime('%s', ${b}) - strftime('%s', ${a}))`;
  const pct = (spent, base) => (base > 0 ? Math.round(((spent - base) / base) * 1000) / 10 : null);

  function company(period = '7') {
    if (!Object.hasOwn(PERIODS, String(period))) throw new SimError(400, 'Khoảng thời gian không hợp lệ (7, 30 hoặc all).');
    const key = String(period), cutoff = key === 'all' ? '1970-01-01 00:00:00' : db.prepare(`SELECT datetime('now', ?) t`).get(`-${key} days`).t;
    const one = (sql, ...a) => db.prepare(sql).get(...a);
    const st = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM projects WHERE created_at >= ? GROUP BY status').all(cutoff).map(r => [r.status, r.n]));
    const cost = one('SELECT COALESCE(SUM(amount), 0) s FROM costs WHERE created_at >= ?', cutoff).s;
    const bugs = one("SELECT COUNT(*) found, COALESCE(SUM(status = 'closed'), 0) closed FROM bugs WHERE created_at >= ?", cutoff);
    const dur = one(`SELECT AVG(${secs('created_at', 'finished_at')}) s FROM runs WHERE state = 'done' AND project_id IS NOT NULL AND finished_at >= ?`, cutoff).s;
    const rows = db.prepare(`SELECT p.id, p.title, p.kind, p.status, p.estimate, p.budget AS budgetCap, p.created_at AS createdAt,
        COALESCE((SELECT SUM(amount) FROM costs c WHERE c.project_id = p.id), 0) AS spent,
        (SELECT ${secs('r.created_at', 'r.finished_at')} FROM runs r WHERE r.id = p.run_id AND r.state = 'done') AS durationSecs,
        (SELECT COUNT(*) FROM bugs b WHERE b.project_id = p.id) AS bugs
      FROM projects p WHERE p.created_at >= ? ORDER BY p.id DESC LIMIT 100`).all(cutoff)
      .map(r => ({ ...r, kindLabel: KIND_LABEL[r.kind], statusLabel: STATUS_LABEL[r.status], spent: round2(r.spent), variancePct: r.status === 'awaiting' || r.status === 'rejected' ? null : pct(r.spent, r.estimate) }));
    const done = st.done || 0;
    return {
      period: { key, label: PERIODS[key], from: key === 'all' ? null : cutoff }, generatedAt: new Date().toISOString(), simulated: true,
      summary: {
        projects: Object.values(st).reduce((a, b) => a + b, 0), done, running: st.running || 0, awaiting: st.awaiting || 0, rejected: st.rejected || 0, cancelled: st.cancelled || 0,
        cost: round2(cost), avgCostPerDoneProject: done ? round2(rows.filter(r => r.status === 'done').reduce((a, r) => a + r.spent, 0) / done) : null,
        avgDurationSecs: dur == null ? null : Math.round(dur), bugsFound: bugs.found, bugsClosed: bugs.closed,
        deployments: one('SELECT COUNT(*) n FROM deployments WHERE created_at >= ?', cutoff).n,
        tasksDone: one("SELECT COUNT(*) n FROM work_items WHERE state = 'done' AND finished_at >= ?", cutoff).n
      },
      costByDept: db.prepare(`SELECT d.code, d.name, d.color, SUM(c.amount) AS amount FROM costs c JOIN departments d ON d.id = c.dept_id WHERE c.created_at >= ? GROUP BY d.id ORDER BY amount DESC`).all(cutoff).map(r => ({ ...r, amount: round2(r.amount) })),
      costByKind: db.prepare('SELECT kind, SUM(amount) AS amount FROM costs WHERE created_at >= ? GROUP BY kind ORDER BY amount DESC').all(cutoff).map(r => ({ ...r, label: COST_KIND_LABEL[r.kind], amount: round2(r.amount) })),
      rows
    };
  }

  function project(id) {
    if (!/^\d+$/.test(String(id))) throw new SimError(404, 'Không có dự án này.');
    const p = projects.get(id);
    const row = db.prepare('SELECT run_id FROM projects WHERE id = ?').get(p.id);
    const spent = round2(Number(db.prepare('SELECT COALESCE(SUM(amount), 0) s FROM costs WHERE project_id = ?').get(p.id).s) || 0);
    const dep = db.prepare('SELECT id, version, artifact, created_at AS createdAt, approval_id AS approvalId FROM deployments WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(p.id) || null;
    const gates = db.prepare('SELECT id, kind, title, status, created_at AS createdAt, decided_at AS decidedAt FROM approvals WHERE project_id = ? ORDER BY id').all(p.id)
      .map(g => ({ ...g, statusLabel: DECISION_LABEL[g.status] }));
    const release = gates.find(g => g.kind === 'release' && g.status === 'approved');
    const timeline = [
      { label: 'Gửi yêu cầu', at: p.createdAt }, { label: 'Duyệt kế hoạch', at: p.decidedAt },
      release && { label: 'Cho phép phát hành', at: release.decidedAt }, dep && { label: 'Triển khai', at: dep.createdAt },
      p.finishedAt && { label: p.status === 'done' ? 'Kết thúc' : 'Dừng', at: p.finishedAt }
    ].filter(x => x && x.at);
    const byDept = db.prepare(`SELECT d.code, d.name, d.color, SUM(c.amount) AS amount, COUNT(*) AS n FROM costs c JOIN departments d ON d.id = c.dept_id WHERE c.project_id = ? GROUP BY d.id ORDER BY amount DESC`).all(p.id).map(r => ({ ...r, amount: round2(r.amount) }));
    const byKind = db.prepare('SELECT kind, SUM(amount) AS amount FROM costs WHERE project_id = ? GROUP BY kind ORDER BY amount DESC').all(p.id).map(r => ({ ...r, label: COST_KIND_LABEL[r.kind], amount: round2(r.amount) }));
    const tasksByDept = row.run_id == null ? [] : db.prepare(`SELECT d.code, d.name, d.color, COUNT(*) AS total, COALESCE(SUM(w.state = 'done'), 0) AS done,
        AVG(CASE WHEN w.state = 'done' THEN ${secs('w.started_at', 'w.finished_at')} END) AS avgSecs
      FROM work_items w JOIN departments d ON d.id = w.dept_id WHERE w.run_id = ? GROUP BY d.id ORDER BY MIN(w.stage), d.code`).all(row.run_id).map(r => ({ ...r, avgSecs: r.avgSecs == null ? null : Math.round(r.avgSecs) }));
    const durationSecs = p.finishedAt ? db.prepare(`SELECT ${secs('created_at', 'finished_at')} AS s FROM runs WHERE id = ?`).get(row.run_id)?.s ?? null : null;
    return {
      generatedAt: new Date().toISOString(), simulated: true,
      project: { id: p.id, title: p.title, kind: p.kind, kindLabel: p.kindLabel, status: p.status, statusLabel: p.statusLabel, request: p.request, createdAt: p.createdAt, decidedAt: p.decidedAt, finishedAt: p.finishedAt },
      cost: { estimate: p.estimate, budgetCap: p.budgetCap, spent, variancePct: p.status === 'awaiting' || p.status === 'rejected' ? null : pct(spent, p.estimate), byDept, byKind },
      tasks: { total: p.stats.tasksTotal, done: p.stats.tasksDone, byDept: tasksByDept }, bugs: p.bugs, deployment: dep, approvals: gates, timeline, durationSecs
    };
  }

  function deployments() {
    return db.prepare(`SELECT d.id, d.project_id AS projectId, p.title AS projectTitle, d.version, d.kind, d.artifact, d.cost, d.created_at AS createdAt, d.approval_id AS approvalId,
        (SELECT decided_at FROM approvals a WHERE a.id = d.approval_id) AS approvedAt,
        (SELECT COUNT(*) FROM bugs b WHERE b.project_id = d.project_id) AS bugsTotal,
        (SELECT COUNT(*) FROM bugs b WHERE b.project_id = d.project_id AND b.status = 'closed') AS bugsClosed,
        (SELECT ${secs('r.created_at', 'r.finished_at')} FROM runs r WHERE r.id = d.run_id) AS durationSecs
      FROM deployments d JOIN projects p ON p.id = d.project_id ORDER BY d.id DESC LIMIT 100`).all()
      .map(r => ({ ...r, kindLabel: KIND_LABEL[r.kind], cost: round2(r.cost), simulated: true }));
  }

  return { company, project, deployments };
}
