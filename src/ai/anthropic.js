import { AiError } from './errors.js';
import { redact } from './secrets.js';
import { postJson, retryAfterOf } from './http.js';
import { safeProviderUrl, PROVIDERS } from './providers.js';

// Anthropic (Claude) qua Messages API. Không có chế độ JSON riêng nên chỉ dẫn yêu cầu JSON và bộ đọc JSON của công ty tự tách phần JSON ra.
export const ANTHROPIC_VERSION = '2023-06-01';
export function createAnthropic({ fetchImpl = fetch, baseUrl, getKey }) {
  const root = safeProviderUrl(baseUrl, 'anthropic'), label = PROVIDERS.anthropic.label;
  async function generate({ model, system, prompt, maxOutputTokens = 8192, signal, timeoutMs = 120000 }) {
    const key = getKey();
    if (!key) throw new AiError('auth', 'Chưa có khoá API của Anthropic.');
    const body = { model, max_tokens: maxOutputTokens, messages: [{ role: 'user', content: prompt }], ...(system ? { system } : {}) };
    const { res, data, ms } = await postJson({ fetchImpl, url: `${root}/v1/messages`, headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION }, body, signal, timeoutMs, key, label });
    if (!res.ok) {
      const msg = redact(data?.error?.message || `HTTP ${res.status}`, key).slice(0, 300);
      if (res.status === 400 && /credit balance/i.test(msg)) throw new AiError('billing', 'Tài khoản Anthropic đã hết số dư. Hãy nạp thêm credit rồi thử lại.', { status: 400 });
      if (res.status === 429) throw new AiError('quota', 'Anthropic báo quá nhiều yêu cầu (hết hạn mức tốc độ tạm thời).', { status: 429, retryAfter: retryAfterOf(res) });
      if (res.status >= 500 || res.status === 529) throw new AiError('server', `Máy chủ Anthropic đang quá tải hoặc lỗi (${res.status}).`, { status: res.status, retryAfter: retryAfterOf(res) });
      if (res.status === 401 || res.status === 403) throw new AiError('auth', `Khoá API Anthropic bị từ chối (${res.status}). Hãy kiểm tra lại khoá. ${msg}`, { status: res.status });
      if (res.status === 404) throw new AiError('model', `Không tìm thấy mô hình "${model}" của Anthropic. Hãy kiểm tra tên mô hình ở Cài đặt.`, { status: 404 });
      throw new AiError('request', `Anthropic từ chối yêu cầu (${res.status}): ${msg}`, { status: res.status });
    }
    if (!Array.isArray(data?.content)) throw new AiError('badresponse', 'Anthropic không trả về nội dung nào.');
    if (data.stop_reason === 'refusal') throw new AiError('blocked', 'Claude từ chối trả lời yêu cầu này.');
    const text = data.content.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text).join('');
    const u = data.usage || {};
    return { text, tokensIn: (Number(u.input_tokens) || 0) + (Number(u.cache_read_input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0), tokensOut: Number(u.output_tokens) || 0, model, finishReason: data.stop_reason || 'end_turn', truncated: data.stop_reason === 'max_tokens', ms };
  }
  return { name: 'anthropic', generate };
}
