const GEMINI_URL = 'https://generativelanguage.googleapis.com';       // khai báo thẳng ở đây để không tạo vòng nhập khẩu với gemini.js

// Danh sách nhà cung cấp AI được hỗ trợ. Mỗi nhà một khoá riêng. Khoá chỉ được gửi tới đúng địa chỉ của nhà đó (hoặc máy này khi kiểm thử).
export const PROVIDERS = {
  gemini: { label: 'Gemini (Google)', host: 'generativelanguage.googleapis.com', url: GEMINI_URL, env: 'GEMINI_API_KEY', keyUrl: 'https://aistudio.google.com/apikey', freeTier: true },
  openai: { label: 'OpenAI', host: 'api.openai.com', url: 'https://api.openai.com', env: 'OPENAI_API_KEY', keyUrl: 'https://platform.openai.com/api-keys', freeTier: false },
  anthropic: { label: 'Anthropic (Claude)', host: 'api.anthropic.com', url: 'https://api.anthropic.com', env: 'ANTHROPIC_API_KEY', keyUrl: 'https://console.anthropic.com/settings/keys', freeTier: false }
};
export const PROVIDER_IDS = Object.keys(PROVIDERS);
export const isProvider = p => typeof p === 'string' && Object.hasOwn(PROVIDERS, p);

export function safeProviderUrl(url, provider) {
  const P = PROVIDERS[provider];
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname === P.host) return u.origin;
    if (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return u.origin;
  } catch { /* dùng mặc định */ }
  return P.url;
}

// Mô hình có thể ghi "nhà:tên" (ví dụ openai:gpt-x) hoặc chỉ "tên" (dùng nhà cung cấp mặc định).
export function resolveModel(spec, defaultProvider = 'gemini') {
  const m = /^(gemini|openai|anthropic):(.+)$/.exec(String(spec));
  const provider = m ? m[1] : defaultProvider, model = m ? m[2] : String(spec);
  return { provider, model, canon: provider === 'gemini' ? model : `${provider}:${model}` };
}
