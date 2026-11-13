import { SimError } from './sim.js';

// Số liệu cho bản đồ nhiệt: mỗi phòng một con số theo thước đo và khoảng thời gian. Chỉ đọc, không ghi.
export const METRICS = ['tasks', 'cost', 'bugs'];
export const PERIODS = ['7', '30', 'all'];
const round6 = n => Math.round(n * 1e6) / 1e6;

export function createHeatmap({ db }) {
  const since = col => ({ 7: ` AND ${col} >= datetime('now', '-7 days')`, 30: ` AND ${col} >= datetime('now', '-30 days')`, all: '' });
  function get({ metric = 'tasks', period = '7' } = {}) {
    if (!METRICS.includes(metric)) throw new SimError(400, 'Thước đo không hợp lệ (việc xong, chi phí hoặc lỗi).');
    if (!PERIODS.includes(String(period))) throw new SimError(400, 'Khoảng thời gian phải là 7 ngày, 30 ngày hoặc tất cả.');
    const w = since(metric === 'tasks' ? 'w.finished_at' : metric === 'cost' ? 'c.created_at' : 'b.created_at')[period];
    const sql = {
      tasks: `SELECT d.code, COUNT(w.id) AS raw FROM departments d LEFT JOIN work_items w ON w.dept_id = d.id AND w.state = 'done'${w} GROUP BY d.id`,
      cost: `SELECT d.code, COALESCE(SUM(c.amount), 0) AS raw FROM departments d LEFT JOIN costs c ON c.dept_id = d.id${w} GROUP BY d.id`,
      bugs: `SELECT d.code, COUNT(b.id) AS raw FROM departments d LEFT JOIN bugs b ON b.owner_dept_id = d.id${w} GROUP BY d.id`
    }[metric];
    const rows = db.prepare(sql + ' ORDER BY d.code').all().map(r => ({ code: r.code, raw: metric === 'cost' ? round6(Number(r.raw)) : Number(r.raw) }));
    const max = rows.reduce((m, r) => Math.max(m, r.raw), 0);
    return { metric, period: String(period), max, items: rows.map(r => ({ ...r, value: max > 0 ? r.raw / max : 0 })) };
  }
  return { get };
}
