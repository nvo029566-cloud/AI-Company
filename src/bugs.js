import { SimError } from './sim.js';

// Lỗi do phòng Kiểm thử tìm ra: trang Lỗi, chi tiết dự án và trang từng người.
export const BUG_STATUS_LABEL = { open: 'Chờ sửa', fixing: 'Đang sửa', fixed: 'Chờ kiểm lại', closed: 'Đã đóng', cancelled: 'Đã huỷ' };
export const SEVERITY_LABEL = { low: 'Nhẹ', medium: 'Vừa', high: 'Nặng' };
const ACTIVE = ['open', 'fixing', 'fixed'];
const MAX_LIMIT = 500;

const BASE = `
  SELECT b.id, b.title, b.severity, b.status, b.run_id AS runId, b.project_id AS projectId,
         b.owner_agent_id AS ownerId, o.name AS ownerName, od.code AS ownerDeptCode, od.name AS ownerDeptName, od.color AS ownerDeptColor,
         b.found_by_agent_id AS foundById, f.name AS foundByName,
         b.created_at AS createdAt, b.fixing_at AS fixingAt, b.fixed_at AS fixedAt, b.closed_at AS closedAt,
         r.title AS runTitle, p.title AS projectTitle
  FROM bugs b
  JOIN agents o ON o.id = b.owner_agent_id
  JOIN departments od ON od.id = b.owner_dept_id
  LEFT JOIN agents f ON f.id = b.found_by_agent_id
  JOIN runs r ON r.id = b.run_id
  LEFT JOIN projects p ON p.id = b.project_id`;

export function createBugs({ db }) {
  const deptCodes = new Set(db.prepare('SELECT code FROM departments').all().map(r => r.code));
  const shape = r => ({ ...r, severityLabel: SEVERITY_LABEL[r.severity], statusLabel: BUG_STATUS_LABEL[r.status], demo: r.projectId == null });

  // Bộ lọc: status (một trạng thái hoặc "active" = chờ sửa + đang sửa + chờ kiểm lại), project (số hoặc "demo"), run, dept (phòng của người làm ra lỗi), agent (người làm ra lỗi), severity, limit.
  function list(f = {}) {
    const where = [], args = [];
    if (f.status) {
      if (f.status === 'active') where.push(`b.status IN ('open','fixing','fixed')`);
      else if (BUG_STATUS_LABEL[f.status]) { where.push('b.status = ?'); args.push(f.status); }
      else throw new SimError(400, 'Trạng thái lỗi không hợp lệ.');
    }
    if (f.severity) {
      if (!SEVERITY_LABEL[f.severity]) throw new SimError(400, 'Mức độ lỗi không hợp lệ.');
      where.push('b.severity = ?'); args.push(f.severity);
    }
    if (f.project != null && f.project !== '') {
      if (f.project === 'demo') where.push('b.project_id IS NULL');
      else if (/^\d+$/.test(String(f.project))) { where.push('b.project_id = ?'); args.push(Number(f.project)); }
      else throw new SimError(400, 'Dự án không hợp lệ.');
    }
    if (f.run != null && f.run !== '') {
      if (!/^\d+$/.test(String(f.run))) throw new SimError(400, 'Lượt chạy không hợp lệ.');
      where.push('b.run_id = ?'); args.push(Number(f.run));
    }
    if (f.dept) {
      if (!deptCodes.has(String(f.dept))) throw new SimError(400, 'Phòng không hợp lệ.');
      where.push('od.code = ?'); args.push(String(f.dept));
    }
    if (f.agent != null && f.agent !== '') {
      if (!/^\d+$/.test(String(f.agent))) throw new SimError(400, 'Nhân viên không hợp lệ.');
      where.push('b.owner_agent_id = ?'); args.push(Number(f.agent));
    }
    let limit = f.limit == null || f.limit === '' ? 200 : Number(f.limit);
    if (!Number.isInteger(limit) || limit < 1) throw new SimError(400, 'Số dòng không hợp lệ.');
    limit = Math.min(MAX_LIMIT, limit);
    return db.prepare(`${BASE}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY b.id DESC LIMIT ?`).all(...args, limit).map(shape);
  }

  function summary() {
    const out = { open: 0, fixing: 0, fixed: 0, closed: 0, cancelled: 0 };
    for (const r of db.prepare('SELECT status, COUNT(*) n FROM bugs GROUP BY status').all()) out[r.status] = r.n;
    out.active = ACTIVE.reduce((a, k) => a + out[k], 0);
    out.total = out.active + out.closed + out.cancelled;
    return out;
  }

  const countFor = runId => {
    const r = db.prepare(`SELECT COUNT(*) total, COALESCE(SUM(status IN ('open','fixing','fixed')), 0) active FROM bugs WHERE run_id = ?`).get(runId);
    return { total: r.total, active: r.active };
  };

  return { list, summary, countFor };
}
