import { SimError } from './sim.js';
import { round2, WARN_AT } from './pricing.js';

// Chi phí AI ghi nhận theo từng việc. Hiện là chi phí MÔ PHỎNG: giá giả định × hệ số ngẫu nhiên, chưa có số token thật (giai đoạn 10).
export const COST_KIND_LABEL = { work: 'Làm việc', fix: 'Sửa lỗi', retest: 'Kiểm lại', support: 'Hỗ trợ' };
const MAX_LIMIT = 500;
const MONTH = "strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')";
// Ngân sách tháng, cảnh báo 80%/100% và trần của AI chỉ tính TIỀN THẬT (các khoản từ AI thật). Chi phí mô phỏng được tách riêng.
export const REAL_ONLY = "model <> 'Mô phỏng'";

export function createCosts({ db, config }) {
  const monthly = () => Number(config.monthlyBudget) || 0;
  const deptCodes = new Set(db.prepare('SELECT code FROM departments').all().map(r => r.code));

  // Mức dùng ngân sách tháng: ok, warn (từ 80%), over (từ 100%).
  function monthStatus() {
    const spent = round2(Number(db.prepare(`SELECT COALESCE(SUM(amount), 0) s FROM costs WHERE ${MONTH} AND ${REAL_ONLY}`).get().s) || 0);
    const simulated = round2(Number(db.prepare(`SELECT COALESCE(SUM(amount), 0) s FROM costs WHERE ${MONTH} AND NOT (${REAL_ONLY})`).get().s) || 0);
    const budget = monthly(), pct = budget ? spent / budget : 0;
    return { spent, simulated, budget, pct: Math.round(pct * 1000) / 1000, remaining: Math.max(0, round2(budget - spent)), level: pct >= 1 ? 'over' : pct >= WARN_AT ? 'warn' : 'ok' };
  }

  function summary() {
    const one = sql => db.prepare(sql).get();
    const tot = one('SELECT COALESCE(SUM(amount), 0) s, COALESCE(SUM(tokens_in), 0) ti, COALESCE(SUM(tokens_out), 0) tp, COUNT(*) n FROM costs');
    const byProject = db.prepare(`SELECT c.project_id AS projectId, p.title, p.status, p.estimate, p.budget, SUM(c.amount) AS spent
      FROM costs c LEFT JOIN projects p ON p.id = c.project_id GROUP BY c.project_id ORDER BY spent DESC LIMIT 30`).all()
      .map(r => ({ ...r, title: r.projectId == null ? 'Chạy thử (không qua duyệt)' : r.title, spent: round2(r.spent), demo: r.projectId == null }));
    const byDept = db.prepare(`SELECT d.code, d.name, d.color, SUM(c.amount) AS amount FROM costs c JOIN departments d ON d.id = c.dept_id GROUP BY d.id ORDER BY amount DESC`).all().map(r => ({ ...r, amount: round2(r.amount) }));
    const byKind = db.prepare('SELECT kind, SUM(amount) AS amount, COUNT(*) AS n FROM costs GROUP BY kind ORDER BY amount DESC').all().map(r => ({ ...r, label: COST_KIND_LABEL[r.kind], amount: round2(r.amount) }));
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
    const perDay = new Map(db.prepare("SELECT date(created_at) AS day, SUM(amount) AS amount FROM costs WHERE created_at >= datetime('now', '-14 days') GROUP BY day").all().map(r => [r.day, r.amount]));
    const real = one("SELECT COALESCE(SUM(amount), 0) a, COALESCE(SUM(tokens_in), 0) ti, COALESCE(SUM(tokens_out), 0) tp, COUNT(*) n FROM costs WHERE model <> 'Mô phỏng'");       // chi phí do AI thật gây ra
    return {
      month: monthStatus(), total: round2(tot.s), entries: tot.n, tokens: { in: tot.ti, out: tot.tp }, simulated: tot.n === 0 || real.n < tot.n,
      real: { amount: Math.round(real.a * 1e6) / 1e6, tokensIn: real.ti, tokensOut: real.tp, entries: real.n },
      byProject, byDept, byKind, byDay: days.map(day => ({ day, amount: round2(perDay.get(day) || 0) }))
    };
  }

  // Bộ lọc: project (số hoặc "demo"), dept, kind, limit.
  function list(f = {}) {
    const where = [], args = [];
    if (f.project != null && f.project !== '') {
      if (f.project === 'demo') where.push('c.project_id IS NULL');
      else if (/^\d+$/.test(String(f.project))) { where.push('c.project_id = ?'); args.push(Number(f.project)); }
      else throw new SimError(400, 'Dự án không hợp lệ.');
    }
    if (f.dept) {
      if (!deptCodes.has(String(f.dept))) throw new SimError(400, 'Phòng không hợp lệ.');
      where.push('d.code = ?'); args.push(String(f.dept));
    }
    if (f.kind) {
      if (!COST_KIND_LABEL[f.kind]) throw new SimError(400, 'Loại chi phí không hợp lệ.');
      where.push('c.kind = ?'); args.push(f.kind);
    }
    let limit = f.limit == null || f.limit === '' ? 100 : Number(f.limit);
    if (!Number.isInteger(limit) || limit < 1) throw new SimError(400, 'Số dòng không hợp lệ.');
    limit = Math.min(MAX_LIMIT, limit);
    return db.prepare(`SELECT c.id, c.created_at AS createdAt, c.project_id AS projectId, p.title AS projectTitle, d.code AS deptCode, d.name AS deptName, d.color AS deptColor,
        a.name AS agentName, c.kind, c.amount, c.tokens_in AS tokensIn, c.tokens_out AS tokensOut, c.model
      FROM costs c JOIN departments d ON d.id = c.dept_id LEFT JOIN projects p ON p.id = c.project_id LEFT JOIN agents a ON a.id = c.agent_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id DESC LIMIT ?`).all(...args, limit)
      .map(r => ({ ...r, kindLabel: COST_KIND_LABEL[r.kind], demo: r.projectId == null }));
  }

  return { summary, list, monthStatus };
}
