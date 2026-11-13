import { AiError } from './errors.js';
import { redact } from './secrets.js';

// Gửi một yêu cầu JSON và đổi mọi sự cố mạng thành AiError có phân loại. Dùng chung cho OpenAI và Anthropic.
export async function postJson({ fetchImpl, url, headers, body, signal, timeoutMs, key, label }) {
  const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  const t0 = Date.now();
  let res;
  try { res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: sig }); }
  catch (e) {
    if (signal?.aborted) throw new AiError('aborted', 'Đã dừng lời gọi AI.');
    if (sig.aborted) throw new AiError('timeout', `Mô hình không trả lời sau ${Math.round(timeoutMs / 1000)} giây.`);
    throw new AiError('network', `Không kết nối được tới ${label} (${redact(e.cause?.code || e.message, key).slice(0, 80)}). Hãy kiểm tra mạng.`);
  }
  let data = null;
  try { data = await res.json(); } catch { /* không phải JSON */ }
  return { res, data, ms: Date.now() - t0 };
}
export const retryAfterOf = res => { const s = Number(res.headers?.get?.('retry-after')), ms = Number(res.headers?.get?.('retry-after-ms')); return Number.isFinite(s) && s > 0 ? s : (Number.isFinite(ms) && ms > 0 ? ms / 1000 : null); };
