import { AiError } from './errors.js';
import { redact } from './secrets.js';

// Bộ gọi Gemini qua REST. Khoá gửi trong tiêu đề x-goog-api-key (không nằm trong địa chỉ URL nên không lọt vào nhật ký).
export const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const BLOCKED = new Set(['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY']);

// Chỉ gửi khoá tới Google (hoặc máy này, để kiểm thử): địa chỉ lạ trong cấu hình bị bỏ qua.
export function safeBaseUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname === 'generativelanguage.googleapis.com') return u.origin;
    if (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return u.origin;
  } catch { /* dùng mặc định */ }
  return DEFAULT_BASE_URL;
}

function retryDelaySeconds(data, headers) {
  const h = Number(headers?.get?.('retry-after'));
  if (Number.isFinite(h) && h > 0) return h;
  const d = (data?.error?.details || []).find(x => typeof x?.retryDelay === 'string');
  const m = d && /^([\d.]+)s$/.exec(d.retryDelay);
  return m ? Number(m[1]) : null;
}

export function createGemini({ fetchImpl = fetch, baseUrl = DEFAULT_BASE_URL, getKey }) {
  const root = safeBaseUrl(baseUrl);
  // thinking: mức suy nghĩ của mô hình (low, medium, high); 'auto' hoặc null thì không gửi. Mô hình không nhận thì tự gửi lại không kèm mức này.
  async function generate({ model, system, prompt, maxOutputTokens = 8192, temperature = 0.4, json = false, signal, timeoutMs = 120000, thinking = null }) {
    const key = getKey();
    if (!key) throw new AiError('auth', 'Chưa có khoá API.');
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens, temperature, ...(json ? { responseMimeType: 'application/json' } : {}), ...(thinking && thinking !== 'auto' ? { thinkingConfig: { thinkingLevel: thinking } } : {}) }
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    const t0 = Date.now();
    let res;
    try {
      res = await fetchImpl(`${root}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: sig
      });
    } catch (e) {
      if (signal?.aborted) throw new AiError('aborted', 'Đã dừng lời gọi AI.');
      if (sig.aborted) throw new AiError('timeout', `Mô hình không trả lời sau ${Math.round(timeoutMs / 1000)} giây.`);
      throw new AiError('network', `Không kết nối được tới Gemini (${redact(e.cause?.code || e.message, key).slice(0, 80)}). Hãy kiểm tra mạng.`);
    }
    let data = null;
    try { data = await res.json(); } catch { /* không phải JSON */ }
    if (!res.ok && res.status === 400 && body.generationConfig.thinkingConfig && /thinking/i.test(String(data?.error?.message || ''))) {
      return generate({ model, system, prompt, maxOutputTokens, temperature, json, signal, timeoutMs, thinking: null });
    }
    if (!res.ok) {
      const msg = redact(data?.error?.message || `HTTP ${res.status}`, key).slice(0, 300);
      if (res.status === 429) throw new AiError('quota', 'Đã hết hạn mức gọi tạm thời của Gemini (quá nhiều yêu cầu hoặc hết hạn mức ngày).', { status: 429, retryAfter: retryDelaySeconds(data, res.headers) });
      if (res.status >= 500) throw new AiError('server', `Máy chủ Gemini đang lỗi (${res.status}).`, { status: res.status, retryAfter: retryDelaySeconds(data, res.headers) });
      if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key|API_KEY/i.test(msg))) throw new AiError('auth', `Khoá API bị từ chối (${res.status}). Hãy kiểm tra lại khoá. ${msg}`, { status: res.status });
      if (res.status === 404) throw new AiError('model', `Không tìm thấy mô hình "${model}". Hãy kiểm tra tên mô hình ở Cài đặt.`, { status: 404 });
      throw new AiError('request', `Gemini từ chối yêu cầu (${res.status}): ${msg}`, { status: res.status });
    }
    const block = data?.promptFeedback?.blockReason;
    if (block) throw new AiError('blocked', `Gemini chặn yêu cầu này (${redact(block, key)}).`);
    const cand = data?.candidates?.[0];
    if (!cand) throw new AiError('badresponse', 'Gemini không trả về nội dung nào.');
    if (BLOCKED.has(cand.finishReason)) throw new AiError('blocked', `Gemini dừng vì lý do an toàn (${cand.finishReason}).`);
    const text = (cand.content?.parts || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
    const u = data.usageMetadata || {};
    // token "suy nghĩ" của mô hình cũng tính tiền như token đầu ra
    const tokensIn = Number(u.promptTokenCount) || 0, tokensOut = (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0);
    return { text, tokensIn, tokensOut, model, finishReason: cand.finishReason || 'STOP', truncated: cand.finishReason === 'MAX_TOKENS', ms: Date.now() - t0 };
  }
  return { name: 'gemini', generate };
}
