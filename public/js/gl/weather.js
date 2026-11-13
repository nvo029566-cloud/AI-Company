// Thời tiết và giao thông ngoài toà nhà (ý 7). Thuần tính toán, kiểm thử được.
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const WEATHER_MODES = ['auto', 'clear', 'rain', 'fog'];
// Chế độ tự động: mỗi ngày một thời tiết cố định (theo ngày), khoảng 18% ngày mưa, 12% ngày có sương buổi sáng.
export function weatherFor(dateKey, hour, mode = 'auto') {
  const base = { kind: 'clear', rain: 0, fog: 0, dark: 0, cover: 0.35 };
  if (mode === 'clear') return base;
  if (mode === 'rain') return { kind: 'rain', rain: 0.8, fog: 0.15, dark: 0.28, cover: 0.9 };
  if (mode === 'fog') return { kind: 'fog', rain: 0, fog: 0.8, dark: 0.1, cover: 0.7 };
  const h = hash(String(dateKey)), r = (h % 100) / 100, k = ((h >>> 8) % 100) / 100;
  if (r < 0.18) return { kind: 'rain', rain: 0.45 + 0.4 * k, fog: 0.1, dark: 0.15 + 0.15 * k, cover: 0.85 };
  if (r < 0.30 && hour < 10) return { kind: 'fog', rain: 0, fog: 0.5 + 0.3 * k, dark: 0.08, cover: 0.7 };
  return { ...base, cover: 0.2 + 0.5 * k };
}
// Mật độ xe: giờ cao điểm (7–9h, 17–19h) đông nhất, ban đêm vắng.
export function trafficDensity(hour) {
  if ((hour >= 7 && hour < 9.5) || (hour >= 17 && hour < 19.5)) return 1;
  if (hour >= 9.5 && hour < 17) return 0.55;
  if (hour >= 19.5 && hour < 23) return 0.4;
  return 0.12;
}
export const carCount = (density, max = 11) => Math.max(3, Math.min(max, Math.round(3 + density * 8)));
