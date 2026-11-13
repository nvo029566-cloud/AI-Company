import { SimError } from './sim.js';
import { round2 } from './pricing.js';

// Cài đặt chỉnh được từ giao diện. Lưu trong bảng settings (khoá "cfg.*" và "notify.*"), ghi đè lên config.json lúc khởi động và áp dụng ngay khi đổi.
export const NOTIFY_KINDS = { approval: 'Cần bạn duyệt', finished: 'Dự án giao xong', bug: 'Kiểm thử tìm ra lỗi', cost: 'Ngân sách tháng', stopped: 'Dự án bị dừng' };
const DEFAULTS_OF = new WeakMap();
const clean = s => String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const bad = msg => { throw new SimError(400, msg); };

const VALIDATE = {
  brandName: v => { if (typeof v !== 'string') bad('Tên công ty phải là chữ.'); const t = clean(v); if (t.length < 1 || t.length > 60) bad('Tên công ty dài từ 1 đến 60 ký tự.'); return t; },
  tagline: v => { if (typeof v !== 'string') bad('Khẩu hiệu phải là chữ.'); const t = clean(v); if (t.length > 120) bad('Khẩu hiệu tối đa 120 ký tự.'); return t; },
  monthlyBudget: v => { if (typeof v !== 'number' || !Number.isFinite(v)) bad('Ngân sách tháng phải là một con số.'); const n = round2(v); if (n < 1 || n > 1000000) bad('Ngân sách tháng phải từ 1 đến 1.000.000.'); return n; },
  bugRatePct: v => { if (!Number.isInteger(v) || v < 0 || v > 100) bad('Tỷ lệ lỗi phải là số nguyên từ 0 đến 100.'); return v; },
  gates: v => { if (typeof v !== 'boolean') bad('Cổng phê duyệt chỉ có thể bật hoặc tắt.'); return v; }
};

function capture(config) {                      // giá trị gốc từ config.json, chụp trước khi áp dụng bất kỳ ghi đè nào
  if (!DEFAULTS_OF.has(config)) DEFAULTS_OF.set(config, {
    brandName: config.brandName, tagline: config.tagline, monthlyBudget: Number(config.monthlyBudget) || 0,
    bugRatePct: Math.round((config.sim?.bugRate ?? 0.35) * 100), gates: config.sim?.gates !== false
  });
  return DEFAULTS_OF.get(config);
}
function apply(config, v) {
  config.brandName = v.brandName; config.tagline = v.tagline; config.monthlyBudget = v.monthlyBudget;
  config.sim = config.sim || {}; config.sim.bugRate = v.bugRatePct / 100; config.sim.gates = v.gates;
}
const read = (db, key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;

// Thông báo loại nào đang bật (mặc định bật hết).
export function notifyEnabled(db, kind) { return read(db, `notify.${kind}`) !== 'false'; }

// Gọi trước khi tạo bộ mô phỏng: nạp cài đặt đã lưu vào config. Giá trị lưu hỏng thì bỏ qua và dùng giá trị gốc.
export function applyOverrides(db, config) {
  const d = capture(config), v = { ...d };
  for (const key of Object.keys(VALIDATE)) {
    const raw = read(db, `cfg.${key}`);
    if (raw == null) continue;
    try { v[key] = VALIDATE[key](JSON.parse(raw)); } catch { /* giữ giá trị gốc */ }
  }
  apply(config, v);
}

export function createSettings({ db, config, sim, hub, hooks }) {
  const defaults = capture(config);
  const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const del = db.prepare("DELETE FROM settings WHERE key LIKE 'cfg.%' OR key LIKE 'notify.%'");
  const values = () => ({ brandName: config.brandName, tagline: config.tagline, monthlyBudget: Number(config.monthlyBudget) || 0, bugRatePct: Math.round((config.sim?.bugRate ?? 0.35) * 100), gates: config.sim?.gates !== false });
  const notify = () => Object.fromEntries(Object.keys(NOTIFY_KINDS).map(k => [k, notifyEnabled(db, k)]));
  const current = () => ({ ...values(), currency: config.currency, notify: notify(), notifyLabels: NOTIFY_KINDS, defaults: { ...defaults, notify: Object.fromEntries(Object.keys(NOTIFY_KINDS).map(k => [k, true])) } });
  const changed = () => { sim?.setConfig({ bugRate: (config.sim?.bugRate ?? 0.35), gates: config.sim?.gates !== false }); hooks?.costCheck?.(); hub?.broadcast?.('settings', { time: Date.now() }); };

  function update(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Cần gửi các mục cần đổi.');
    const keys = Object.keys(input);
    if (!keys.length) bad('Chưa có mục nào để đổi.');
    const next = values(), flags = {};
    for (const k of keys) {
      if (k === 'notify') {
        if (!input.notify || typeof input.notify !== 'object' || Array.isArray(input.notify)) bad('Thông báo phải là danh sách bật/tắt.');
        for (const [nk, nv] of Object.entries(input.notify)) {
          if (!Object.hasOwn(NOTIFY_KINDS, nk)) bad(`Không có loại thông báo "${clean(nk).slice(0, 30)}".`);
          if (typeof nv !== 'boolean') bad('Thông báo chỉ có thể bật hoặc tắt.');
          flags[nk] = nv;
        }
      } else if (Object.hasOwn(VALIDATE, k)) next[k] = VALIDATE[k](input[k]);
      else bad(`Cài đặt không có mục "${clean(k).slice(0, 30)}".`);
    }
    db.exec('BEGIN');
    try {
      for (const k of keys) if (k !== 'notify') set.run(`cfg.${k}`, JSON.stringify(next[k]));
      for (const [nk, nv] of Object.entries(flags)) set.run(`notify.${nk}`, nv ? 'true' : 'false');
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    apply(config, next); changed();
    return current();
  }
  function reset() { del.run(); apply(config, defaults); changed(); return current(); }
  return { current, update, reset };
}
