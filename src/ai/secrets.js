import { readFileSync, writeFileSync, mkdirSync, unlinkSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { SimError } from '../sim.js';
import { PROVIDERS, isProvider } from './providers.js';

// Nơi cất khoá API trên máy bạn. Khoá nằm trong MỘT tệp riêng (data/ai-key.json), không nằm trong cơ sở dữ liệu,
// không có trong bản sao lưu, không bao giờ được gửi ra giao diện (chỉ 4 ký tự cuối để nhận ra) và không được ghi vào nhật ký.
// Lưu ở dạng chữ thường như tệp .env: ai đọc được ổ đĩa của bạn thì đọc được khoá. Có thể dùng biến môi trường GEMINI_API_KEY thay thế.
const KEY_RE = /^[\x21-\x7e]{16,256}$/;

export function createSecrets({ file = null, env = process.env } = {}) {
  let mem = null;
  // Dạng tệp: { key: khoá Gemini (giữ nguyên dạng cũ), keys: { openai, anthropic }, savedAt }.
  const stored = () => {
    if (!file) return mem;
    try { const j = JSON.parse(readFileSync(file, 'utf8')); return j && typeof j === 'object' ? j : null; } catch { return null; }
  };
  const pick = (s, p) => { const v = p === 'gemini' ? s?.key : s?.keys?.[p]; return typeof v === 'string' && v ? v : null; };
  const fromEnv = p => { const k = String(env[PROVIDERS[p].env] || '').trim(); return KEY_RE.test(k) ? k : null; };
  const check = p => { if (!isProvider(p)) throw new SimError(400, 'Nhà cung cấp AI không hợp lệ.'); return p; };
  const write = s => {
    if (!s || (!s.key && !Object.values(s.keys || {}).some(Boolean))) { mem = null; if (file) { try { unlinkSync(file); } catch { /* chưa có thì thôi */ } } return; }
    if (!file) { mem = s; return; }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...s, savedAt: new Date().toISOString() }), { encoding: 'utf8', mode: 0o600 });
    try { chmodSync(file, 0o600); } catch { /* Windows không hỗ trợ */ }
  };
  return {
    get(p = 'gemini') { check(p); return pick(stored(), p) ?? fromEnv(p); },
    source(p = 'gemini') { check(p); return pick(stored(), p) ? 'file' : (fromEnv(p) ? 'env' : null); },
    last4(p = 'gemini') { const k = this.get(p); return k ? k.slice(-4) : null; },
    set(key, p = 'gemini') {
      check(p);
      const k = typeof key === 'string' ? key.trim() : '';
      if (!KEY_RE.test(k)) throw new SimError(400, 'Khoá API không hợp lệ: phải dài 16 đến 256 ký tự, không có khoảng trắng.');
      const s = { ...(stored() || {}) };
      if (p === 'gemini') s.key = k; else s.keys = { ...(s.keys || {}), [p]: k };
      write(s);
    },
    remove(p = 'gemini') {
      check(p);
      const s = { ...(stored() || {}) };
      if (p === 'gemini') delete s.key; else s.keys = { ...(s.keys || {}), [p]: undefined };
      write(s);
    }
  };
}
// Xoá khoá khỏi mọi đoạn chữ sắp hiển thị hoặc ghi lại (thông báo lỗi, nhật ký).
export const redact = (text, key) => { let t = String(text ?? ''); if (key) t = t.split(key).join('***'); return t.replace(/AIza[\w-]{20,}/g, '***').replace(/sk-[\w-]{20,}/g, '***'); };
