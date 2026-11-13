// Lỗi khi gọi AI. kind giúp quyết định thử lại hay dừng hẳn.
export class AiError extends Error {
  constructor(kind, message, { status = null, retryAfter = null } = {}) {
    super(message);
    this.name = 'AiError'; this.kind = kind; this.status = status; this.retryAfter = retryAfter;
  }
}
// Chỉ các lỗi tạm thời mới thử lại: hết hạn mức tạm thời, máy chủ nhà cung cấp lỗi, mất mạng, quá thời gian.
export const retryable = e => e instanceof AiError && ['quota', 'server', 'network', 'timeout'].includes(e.kind);
