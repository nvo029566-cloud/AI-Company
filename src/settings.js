import { SimError } from './sim.js';
import { round2 } from './pricing.js';
import { normalizeAiConfig, MODEL_RE, DEPT_CODES, validPriceEntry } from './ai/config.js';

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
  gates: v => { if (typeof v !== 'boolean') bad('Cổng phê duyệt chỉ có thể bật hoặc tắt.'); return v; },
  aiEnabled: v => { if (typeof v !== 'boolean') bad('AI thật chỉ có thể bật hoặc tắt.'); return v; },
  aiProvider: v => { if (!['gemini', 'openai', 'anthropic'].includes(v)) bad('Nhà cung cấp AI phải là Gemini, OpenAI hoặc Anthropic.'); return v; },
  aiTier: v => { if (v !== 'free' && v !== 'paid') bad('Bậc dùng phải là miễn phí hoặc trả tiền.'); return v; },
  aiModel: v => { if (typeof v !== 'string' || !MODEL_RE.test(v)) bad('Tên mô hình chỉ gồm chữ, số, dấu chấm, gạch, tối đa 60 ký tự.'); return v; },
  aiDeptModels: v => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) bad('Mô hình theo phòng phải là một danh sách.');
    const out = {};
    for (const [k, m] of Object.entries(v)) {
      if (!DEPT_CODES.includes(k)) bad(`Không có phòng "${clean(k).slice(0, 10)}" để chọn mô hình.`);
      if (m === '' || m == null) continue;
      if (typeof m !== 'string' || !MODEL_RE.test(m)) bad(`Tên mô hình của phòng ${k} không hợp lệ.`);
      out[k] = m;
    }
    return out;
  },
  aiPrices: v => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length > 30) bad('Bảng đơn giá không hợp lệ (tối đa 30 mô hình).');
    const out = {};
    for (const [k, p] of Object.entries(v)) {
      if (!MODEL_RE.test(k)) bad('Tên mô hình trong bảng đơn giá không hợp lệ.');
      if (!validPriceEntry(p)) bad(`Đơn giá của "${k}" phải là hai số từ 0 đến 1000 (USD cho một triệu token).`);
      out[k] = { in: p.in, out: p.out };
    }
    return out;
  },
  aiRpm: v => { if (!Number.isInteger(v) || v < 1 || v > 600) bad('Số lời gọi mỗi phút phải từ 1 đến 600.'); return v; },
  aiDailyCalls: v => { if (!Number.isInteger(v) || v < 1 || v > 5000) bad('Giới hạn lời gọi mỗi ngày phải từ 1 đến 5000.'); return v; },
  aiBugRounds: v => { if (!Number.isInteger(v) || v < 1 || v > 5) bad('Số vòng sửa lỗi phải từ 1 đến 5.'); return v; },
  aiThinking: v => { if (!['auto', 'low', 'medium', 'high'].includes(v)) bad('Mức suy nghĩ phải là tự động, thấp, vừa hoặc cao.'); return v; },
  aiDeepQa: v => { if (typeof v !== 'boolean') bad('Kiểm thử sâu chỉ có thể bật hoặc tắt.'); return v; },
  aiMaxTokens: v => { if (!Number.isInteger(v) || v < 256 || v > 65536) bad('Giới hạn token mỗi câu trả lời phải từ 256 đến 65536.'); return v; }
};

function capture(config) {                      // giá trị gốc từ config.json, chụp trước khi áp dụng bất kỳ ghi đè nào
  if (!DEFAULTS_OF.has(config)) {
    const a = normalizeAiConfig(config);
    DEFAULTS_OF.set(config, {
      brandName: config.brandName, tagline: config.tagline, monthlyBudget: Number(config.monthlyBudget) || 0,
      bugRatePct: Math.round((config.sim?.bugRate ?? 0.35) * 100), gates: config.sim?.gates !== false,
      aiEnabled: a.enabled, aiProvider: a.provider, aiTier: a.tier, aiModel: a.model, aiDeptModels: { ...a.deptModels }, aiPrices: JSON.parse(JSON.stringify(a.prices)), aiRpm: a.rpm, aiDailyCalls: a.dailyCalls, aiMaxTokens: a.maxTokens, aiBugRounds: a.bugRounds, aiDeepQa: a.deepQa, aiThinking: a.thinking
    });
  }
  return DEFAULTS_OF.get(config);
}
function apply(config, v) {
  config.brandName = v.brandName; config.tagline = v.tagline; config.monthlyBudget = v.monthlyBudget;
  config.sim = config.sim || {}; config.sim.bugRate = v.bugRatePct / 100; config.sim.gates = v.gates;
  const a = normalizeAiConfig(config);
  a.enabled = v.aiEnabled; a.provider = v.aiProvider; a.tier = v.aiTier; a.model = v.aiModel; a.deptModels = { ...v.aiDeptModels }; a.prices = { ...JSON.parse(JSON.stringify(v.aiPrices)) };
  a.rpm = v.aiRpm; a.dailyCalls = v.aiDailyCalls; a.maxTokens = v.aiMaxTokens; a.bugRounds = v.aiBugRounds; a.deepQa = v.aiDeepQa; a.thinking = v.aiThinking;
  normalizeAiConfig(config);                  // bổ sung lại đơn giá mặc định nếu thiếu
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

export function createSettings({ db, config, sim, hub, hooks, ai = null }) {
  const defaults = capture(config);
  const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const del = db.prepare("DELETE FROM settings WHERE key LIKE 'cfg.%' OR key LIKE 'notify.%'");
  const values = () => { const a = normalizeAiConfig(config); return { brandName: config.brandName, tagline: config.tagline, monthlyBudget: Number(config.monthlyBudget) || 0, bugRatePct: Math.round((config.sim?.bugRate ?? 0.35) * 100), gates: config.sim?.gates !== false,
    aiEnabled: a.enabled, aiProvider: a.provider, aiTier: a.tier, aiModel: a.model, aiDeptModels: { ...a.deptModels }, aiPrices: JSON.parse(JSON.stringify(a.prices)), aiRpm: a.rpm, aiDailyCalls: a.dailyCalls, aiMaxTokens: a.maxTokens, aiBugRounds: a.bugRounds, aiDeepQa: a.deepQa, aiThinking: a.thinking }; };
  const notify = () => Object.fromEntries(Object.keys(NOTIFY_KINDS).map(k => [k, notifyEnabled(db, k)]));
  const current = () => ({ ...values(), aiStatus: ai ? ai.status() : null, currency: config.currency, notify: notify(), notifyLabels: NOTIFY_KINDS, defaults: { ...defaults, notify: Object.fromEntries(Object.keys(NOTIFY_KINDS).map(k => [k, true])) } });
  const changed = () => { sim?.setConfig({ bugRate: (config.sim?.bugRate ?? 0.35), gates: config.sim?.gates !== false }); hooks?.costCheck?.(); hub?.broadcast?.('settings', { time: Date.now() }); };

  function update(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Cần gửi các mục cần đổi.');
    const keys = Object.keys(input);
    if (!keys.length) bad('Chưa có mục nào để đổi.');
    const next = values(), flags = {}, wasAi = next.aiEnabled, prevProvider = next.aiProvider;
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
    if (next.aiEnabled && (!wasAi || next.aiProvider !== prevProvider) && !(ai && ai.hasKey(next.aiProvider))) bad('Chưa có khoá API của nhà cung cấp đã chọn nên chưa bật được AI thật. Hãy dán khoá ở mục AI thật trước.');
    db.exec('BEGIN');
    try {
      for (const k of keys) if (k !== 'notify') set.run(`cfg.${k}`, JSON.stringify(next[k]));
      for (const [nk, nv] of Object.entries(flags)) set.run(`notify.${nk}`, nv ? 'true' : 'false');
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    apply(config, next); changed();
    if (wasAi && !next.aiEnabled) { ai?.kill('Bạn đã tắt AI thật.'); sim?.cancelAiRuns('Bạn đã tắt AI thật.'); }
    return current();
  }
  function reset() { const wasAi = values().aiEnabled; del.run(); apply(config, defaults); changed(); if (wasAi && !values().aiEnabled) { ai?.kill('Đã khôi phục cài đặt mặc định (AI tắt).'); sim?.cancelAiRuns('Đã khôi phục cài đặt mặc định (AI tắt).'); } return current(); }
  return { current, update, reset };
}
