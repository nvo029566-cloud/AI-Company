// Mặt trời theo giờ (ý 6): hướng, độ ấm của ánh sáng. Giờ tính từ 0 đến 24.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function sunDir(hour) {
  const f = clamp((hour - 6) / 12, 0, 1);                            // 0 lúc 6h sáng, 1 lúc 18h
  const v = [0.8 - 1.6 * f, 0.35 + 0.65 * Math.sin(Math.PI * f), 0.45];   // sáng ở phía đông (x dương), chiều ở phía tây
  const n = Math.hypot(...v); return v.map(c => c / n);
}
// 0 lúc trưa, lên tới 1 lúc bình minh/hoàng hôn: ánh sáng ngả vàng cam.
export const sunWarmth = hour => clamp((Math.abs(hour - 12) - 3) / 3, 0, 1);
export const isDaylight = hour => hour >= 6 && hour <= 18;
// Bóng mây trôi trên mặt đất ngoài toà nhà: vị trí theo thời gian, gió thổi dọc trục x.
export function cloudPos(i, t, cover = 0.5) {
  const seed = (i * 97 + 13) % 101, speed = 0.9 + (seed % 7) * 0.12, span = 160;
  return { x: ((seed * 3.1 + t * speed) % span) - 56, z: -26 + ((seed * 1.7) % 110), rx: 7 + (seed % 5) * 1.6, rz: 4 + (seed % 4) * 1.3, a: 0.06 + 0.1 * cover };
}
