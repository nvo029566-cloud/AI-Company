import { AiError } from './errors.js';
import { redact } from './secrets.js';
import { postJson, retryAfterOf } from './http.js';
import { safeProviderUrl, PROVIDERS } from './providers.js';

// OpenAI qua Chat Completions. Không gửi temperature (các mô hình mới chỉ nhận giá trị mặc định) và dùng max_completion_tokens.
export function createOpenAI({ fetchImpl = fetch, baseUrl, getKey }) {
  const root = safeProviderUrl(baseUrl, 'openai'), label = PROVIDERS.openai.label;
  async function generate({ model, system, prompt, maxOutputTokens = 8192, json = false, signal, timeoutMs = 120000 }) {
    const key = getKey();
    if (!key) throw new AiError('auth', 'Chưa có khoá API của OpenAI.');
    const body = { model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }], max_completion_tokens: maxOutputTokens, ...(json ? { response_format: { type: 'json_object' } } : {}) };
    const { res, data, ms } = await postJson({ fetchImpl, url: `${root}/v1/chat/completions`, headers: { Authorization: `Bearer ${key}` }, body, signal, timeoutMs, key, label });
    if (!res.ok) {
      const msg = redact(data?.error?.message || `HTTP ${res.status}`, key).slice(0, 300), code = data?.error?.code;
      if (res.status === 429 && code === 'insufficient_quota') throw new AiError('billing', 'Tài khoản OpenAI đã hết số dư hoặc hạn mức chi tiêu. Hãy nạp thêm hoặc tăng hạn mức rồi thử lại.', { status: 429 });
      if (res.status === 429) throw new AiError('quota', 'OpenAI báo quá nhiều yêu cầu (hết hạn mức tốc độ tạm thời).', { status: 429, retryAfter: retryAfterOf(res) });
      if (res.status >= 500 || res.status === 408) throw new AiError('server', `Máy chủ OpenAI đang lỗi (${res.status}).`, { status: res.status, retryAfter: retryAfterOf(res) });
      if (res.status === 401 || res.status === 403) throw new AiError('auth', `Khoá API OpenAI bị từ chối (${res.status}). Hãy kiểm tra lại khoá. ${msg}`, { status: res.status });
      if (res.status === 404 || code === 'model_not_found') throw new AiError('model', `Không tìm thấy mô hình "${model}" của OpenAI, hoặc tài khoản chưa được dùng. Hãy kiểm tra tên mô hình ở Cài đặt.`, { status: res.status });
      throw new AiError('request', `OpenAI từ chối yêu cầu (${res.status}): ${msg}`, { status: res.status });
    }
    const choice = data?.choices?.[0];
    if (!choice) throw new AiError('badresponse', 'OpenAI không trả về nội dung nào.');
    if (choice.finish_reason === 'content_filter' || choice.message?.refusal) throw new AiError('blocked', 'OpenAI từ chối trả lời yêu cầu này (bộ lọc nội dung).');
    const text = typeof choice.message?.content === 'string' ? choice.message.content : '';
    const u = data.usage || {};
    return { text, tokensIn: Number(u.prompt_tokens) || 0, tokensOut: Number(u.completion_tokens) || 0, model, finishReason: choice.finish_reason || 'stop', truncated: choice.finish_reason === 'length', ms };
  }
  return { name: 'openai', generate };
}
