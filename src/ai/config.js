import { safeBaseUrl } from './gemini.js';

// Cấu hình AI nằm trong config.ai. Giá trị mặc định an toàn: TẮT, bậc miễn phí, tốc độ thấp.
export const DEFAULT_MODEL = 'gemini-3.8-flash';
// Đơn giá USD cho một triệu token, lấy từ các trang tổng hợp giá (tháng 10/2026), CHƯA phải trang chính thức: bạn tự kiểm tra và sửa ở Cài đặt.
export const DEFAULT_PRICES = {
  'gemini-3.8-flash': { in: 0.75, out: 3.75 }, 'gemini-3.5-flash': { in: 1.5, out: 9 }, 'gemini-3.1-flash-lite': { in: 0.25, out: 1.5 },
  'gemini-3.1-pro-preview': { in: 2, out: 12 }, 'gemini-4-argon': { in: 4, out: 20 }
};
export const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,59}$/;
export const DEPT_CODES = ['01', '02', '03', '05', '06', '07', '08', '09', '10', '11', '12'];
const intIn = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
const validPrice = p => p && typeof p === 'object' && Number.isFinite(p.in) && Number.isFinite(p.out) && p.in >= 0 && p.out >= 0 && p.in <= 1000 && p.out <= 1000;

export function normalizeAiConfig(config) {
  const a = config.ai = config.ai && typeof config.ai === 'object' && !Array.isArray(config.ai) ? config.ai : {};
  a.enabled = a.enabled === true;
  a.tier = a.tier === 'paid' ? 'paid' : 'free';
  a.provider = ['gemini', 'openai', 'anthropic'].includes(a.provider) ? a.provider : 'gemini';
  a.model = typeof a.model === 'string' && MODEL_RE.test(a.model) ? a.model : DEFAULT_MODEL;
  const dm = {};
  if (a.deptModels && typeof a.deptModels === 'object') for (const [k, v] of Object.entries(a.deptModels)) if (DEPT_CODES.includes(k) && typeof v === 'string' && MODEL_RE.test(v)) dm[k] = v;
  a.deptModels = dm;
  const prices = { ...DEFAULT_PRICES };
  if (a.prices && typeof a.prices === 'object') for (const [k, v] of Object.entries(a.prices)) if (MODEL_RE.test(k) && validPrice(v)) prices[k] = { in: v.in, out: v.out };
  a.prices = prices;
  a.rpm = intIn(a.rpm, 1, 600, 10);
  a.dailyCalls = intIn(a.dailyCalls, 1, 5000, 300);
  a.maxTokens = intIn(a.maxTokens, 256, 65536, 12000);
  a.bugRounds = intIn(a.bugRounds, 1, 5, 1);          // số vòng sửa lỗi tối đa của dự án AI thật
  a.thinking = ['auto', 'low', 'medium', 'high'].includes(a.thinking) ? a.thinking : 'low';       // mức suy nghĩ của Gemini: thấp cho nhanh
  a.deepQa = a.deepQa === true;                        // kiểm thử sâu: AI rà soát hai lượt và kiểm lại bằng AI
  a.baseUrl = safeBaseUrl(a.baseUrl);
  return a;
}
export const validPriceEntry = validPrice;
