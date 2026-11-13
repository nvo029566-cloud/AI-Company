import { SimError } from './sim.js';

// Việc (work_items) của mọi lượt chạy: dùng cho trang Công việc, chi tiết dự án và trang từng người.
export const TASK_STATES = ['queued', 'working', 'done', 'cancelled'];
export const TASK_STATE_LABEL = { queued: 'Đang chờ', working: 'Đang làm', done: 'Xong', cancelled: 'Đã dừng' };
const MAX_LIMIT = 500;

const BASE = `
  SELECT w.id, w.run_id AS runId, w.stage, w.title, w.support, w.kind, w.bug_id AS bugId, w.state, w.progress,
         w.created_at AS createdAt, w.started_at AS startedAt, w.finished_at AS finishedAt,
         d.code AS deptCode, d.name AS deptName, d.color AS deptColor,
         a.id AS agentId, a.name AS agentName,
         r.title AS runTitle, r.project_id AS projectId, p.title AS projectTitle
  FROM work_items w
  JOIN departments d ON d.id = w.dept_id
  JOIN runs r ON r.id = w.run_id
  LEFT JOIN agents a ON a.id = w.agent_id
  LEFT JOIN projects p ON p.id = r.project_id`;

export function createWork({ db, sim }) {
  const deptCodes = new Set(db.prepare('SELECT code FROM departments').all().map(r => r.code));

  // Tiến độ và lý do chờ của việc đang chạy lấy từ bộ mô phỏng (cơ sở dữ liệu chỉ lưu kết quả cuối).
  const liveMap = () => {
    const m = new Map();
    if (sim) for (const run of sim.snapshot().runs) for (const it of run.items) m.set(it.id, it);
    return m;
  };

  function shape(r, live) {
    const l = live.get(r.id);
    const progress = r.state === 'done' ? 1 : (l ? l.progress : Number(r.progress) || 0);
    let wait = null;
    if (r.state === 'queued' && l) wait = l.inTransit ? 'Chờ hồ sơ từ phòng trước' : 'Chờ người rảnh';
    else if (r.state === 'working' && l && l.travelling) wait = 'Đang đi sang phòng làm việc';
    return {
      id: r.id, runId: r.runId, projectId: r.projectId, projectTitle: r.projectTitle || null, demo: r.projectId == null, runTitle: r.runTitle,
      stage: r.stage + 1, title: r.title, support: !!r.support, kind: r.kind, bugId: r.bugId, state: r.state, stateLabel: TASK_STATE_LABEL[r.state], progress, wait,
      borrowed: !!(l && l.borrowed),
      deptCode: r.deptCode, deptName: r.deptName, deptColor: r.deptColor, agentId: r.agentId, agentName: r.agentName,
      createdAt: r.createdAt, startedAt: r.startedAt, finishedAt: r.finishedAt
    };
  }

  // Bộ lọc: project (số, hoặc "demo" = lượt chạy thử), run, dept, agent, state ("active" = chờ + đang làm), limit, order ("asc" | "desc").
  function list(f = {}, live = liveMap()) {
    const where = [], args = [];
    if (f.project != null && f.project !== '') {
      if (f.project === 'demo') where.push('r.project_id IS NULL');
      else if (/^\d+$/.test(String(f.project))) { where.push('r.project_id = ?'); args.push(Number(f.project)); }
      else throw new SimError(400, 'Dự án không hợp lệ.');
    }
    if (f.run != null && f.run !== '') {
      if (!/^\d+$/.test(String(f.run))) throw new SimError(400, 'Lượt chạy không hợp lệ.');
      where.push('w.run_id = ?'); args.push(Number(f.run));
    }
    if (f.dept) {
      if (!deptCodes.has(String(f.dept))) throw new SimError(400, 'Phòng không hợp lệ.');
      where.push('d.code = ?'); args.push(String(f.dept));
    }
    if (f.agent != null && f.agent !== '') {
      if (!/^\d+$/.test(String(f.agent))) throw new SimError(400, 'Nhân viên không hợp lệ.');
      where.push('w.agent_id = ?'); args.push(Number(f.agent));
    }
    if (f.state) {
      if (f.state === 'active') where.push("w.state IN ('queued','working')");
      else if (TASK_STATES.includes(f.state)) { where.push('w.state = ?'); args.push(f.state); }
      else throw new SimError(400, 'Trạng thái không hợp lệ.');
    }
    let limit = f.limit == null || f.limit === '' ? 200 : Number(f.limit);
    if (!Number.isInteger(limit) || limit < 1) throw new SimError(400, 'Số dòng không hợp lệ.');
    limit = Math.min(MAX_LIMIT, limit);
    const sql = `${BASE}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY ${f.order === 'asc' ? 'w.stage ASC, w.id ASC' : 'w.id DESC'} LIMIT ?`;
    return db.prepare(sql).all(...args, limit).map(r => shape(r, live));
  }

  // Trang từng người: việc đang làm, lịch sử gần đây và số việc đã xong.
  function agentTasks(agentId) {
    const live = liveMap();
    const rows = list({ agent: agentId, limit: 40 }, live);
    return {
      current: rows.find(t => t.state === 'working') || null,
      history: rows.filter(t => t.state !== 'working').slice(0, 20),
      doneCount: db.prepare("SELECT COUNT(*) n FROM work_items WHERE agent_id = ? AND state = 'done'").get(Number(agentId)).n
    };
  }

  return { list, agentTasks, liveMap };
}
