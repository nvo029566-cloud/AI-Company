import { SimError } from './sim.js';
import { notifyEnabled, NOTIFY_KINDS } from './settings.js';
import { WARN_AT, round2 } from './pricing.js';

// Thông báo lưu trong cơ sở dữ liệu, sinh ra từ các sự kiện thật của công ty. Giữ tối đa 200 thông báo gần nhất.
const LEVELS = ['info', 'ok', 'warn', 'bad'];
const KEEP = 200;

export function createNotifier({ db, hub, config }) {
  const ins = db.prepare('INSERT OR IGNORE INTO notifications (kind, level, title, body, link, project_id, dedupe) VALUES (?,?,?,?,?,?,?)');
  const one = db.prepare('SELECT * FROM notifications WHERE id = ?');
  const prune = db.prepare('DELETE FROM notifications WHERE id <= (SELECT id FROM notifications ORDER BY id DESC LIMIT 1 OFFSET ?)');
  const shape = r => ({ id: r.id, kind: r.kind, kindLabel: NOTIFY_KINDS[r.kind], level: r.level, title: r.title, body: r.body, link: r.link, projectId: r.project_id, createdAt: r.created_at, read: r.read_at != null });

  // dedupe: cùng khoá thì chỉ báo một lần (ví dụ cảnh báo ngân sách của cùng một tháng).
  function push({ kind, level = 'info', title, body = '', link = null, projectId = null, dedupe = null } = {}) {
    if (!Object.hasOwn(NOTIFY_KINDS, kind) || !LEVELS.includes(level)) throw new SimError(400, 'Thông báo không hợp lệ.');
    const t = String(title ?? '').trim().slice(0, 200);
    if (!t) throw new SimError(400, 'Thông báo cần có tiêu đề.');
    if (link != null && !/^#\//.test(String(link))) throw new SimError(400, 'Liên kết thông báo phải nằm trong ứng dụng.');
    if (!notifyEnabled(db, kind)) return null;
    const r = ins.run(kind, level, t, String(body).slice(0, 500), link, projectId, dedupe);
    if (!r.changes) return null;
    prune.run(KEEP);
    const item = shape(one.get(Number(r.lastInsertRowid)));
    hub?.broadcast?.('notification', item);
    return item;
  }

  function list({ unread, limit } = {}) {
    let n = limit == null || limit === '' ? 30 : Number(limit);
    if (!Number.isInteger(n) || n < 1) throw new SimError(400, 'Số dòng không hợp lệ.');
    n = Math.min(100, n);
    const only = unread === true || unread === '1' || unread === 'true';
    return db.prepare(`SELECT * FROM notifications ${only ? 'WHERE read_at IS NULL' : ''} ORDER BY id DESC LIMIT ?`).all(n).map(shape);
  }
  const unreadCount = () => db.prepare('SELECT COUNT(*) n FROM notifications WHERE read_at IS NULL').get().n;

  function markRead({ ids, all } = {}) {
    if (all === true) db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE read_at IS NULL").run();
    else if (Array.isArray(ids) && ids.length && ids.length <= 100 && ids.every(i => Number.isInteger(i) && i > 0)) {
      const u = db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND read_at IS NULL");
      for (const i of ids) u.run(i);
    } else throw new SimError(400, 'Cần chỉ rõ thông báo nào đã đọc (ids) hoặc all: true.');
    return { unread: unreadCount() };
  }

  // Cảnh báo ngân sách tháng khi chạm 80% và 100%: mỗi mức, mỗi tháng, mỗi mức ngân sách chỉ báo một lần.
  function costCheck() {
    const budget = Number(config.monthlyBudget) || 0;
    if (!budget) return null;
    const ym = db.prepare("SELECT strftime('%Y-%m', 'now') AS ym").get().ym;
    const spent = Number(db.prepare("SELECT COALESCE(SUM(amount), 0) s FROM costs WHERE strftime('%Y-%m', created_at) = ? AND model <> 'Mô phỏng'").get(ym).s) || 0;
    const pct = spent / budget, level = pct >= 1 ? 'over' : pct >= WARN_AT ? 'warn' : 'ok';
    if (level === 'ok') return null;
    return push({
      kind: 'cost', level: level === 'over' ? 'bad' : 'warn', link: '#/chi-phi-ai', dedupe: `cost:${ym}:${level}:${budget}`,
      title: level === 'over' ? `Đã vượt ngân sách tháng (${Math.round(pct * 100)}%)` : `Đã dùng ${Math.round(pct * 100)}% ngân sách tháng`,
      body: `Chi phí tháng này ${round2(spent).toFixed(2)} trên ngân sách ${budget} ${config.currency || ''}. Chỉ tính tiền thật từ AI (chi phí mô phỏng không tính).`.trim()
    });
  }

  return { push, list, unreadCount, markRead, costCheck };
}
