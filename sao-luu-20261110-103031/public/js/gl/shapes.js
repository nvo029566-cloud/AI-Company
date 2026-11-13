// Dựng hình từ các khối cơ bản. Mọi hàm ghi vào một "lớp" (Layer) gồm các lô: box, cyl (trụ), sph (cầu), quad (tấm có hình).
import { mat4, v3 } from './math.js';

const cache = new Map();
export function rgb(c) {
  if (Array.isArray(c)) return c;
  let v = cache.get(c);
  if (!v) { const h = c.replace('#', ''); v = [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; cache.set(c, v); }
  return v;
}
export const mixc = (a, b, t) => { const A = rgb(a), B = rgb(b); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; };
export const shadec = (c, f) => { const A = rgb(c); return [Math.min(1, A[0] * f), Math.min(1, A[1] * f), Math.min(1, A[2] * f)]; };

const M = mat4.create();
const NOUV = [0, 0, 0, 0];

// Hộp tâm (cx,cy,cz), kích thước (sx,sy,sz), xoay quanh trục dọc rotY. e = độ tự phát sáng (0..1).
export function box(L, cx, cy, cz, sx, sy, sz, col, e = 0, rotY = 0) {
  mat4.trs(M, cx, cy, cz, rotY, sx, sy, sz);
  const c = rgb(col); L.box.add(M, c[0], c[1], c[2], e, NOUV);
}
// Trụ đứng bán kính r, cao h, tâm (cx,cy,cz). rz khác r thì thành elip.
export function cyl(L, cx, cy, cz, r, h, col, e = 0, rz = r) {
  mat4.trs(M, cx, cy, cz, 0, r * 2, h, rz * 2);
  const c = rgb(col); L.cyl.add(M, c[0], c[1], c[2], e, NOUV);
}
export function sph(L, cx, cy, cz, r, col, e = 0, sx = 1, sy = 1, sz = 1) {
  mat4.trs(M, cx, cy, cz, 0, r * 2 * sx, r * 2 * sy, r * 2 * sz);
  const c = rgb(col); L.sph.add(M, c[0], c[1], c[2], e, NOUV);
}
// Tấm phẳng w x h, mặt trước nhìn về hướng +z sau khi xoay rotY. uv = [u0,v0,w,h] trong ảnh ghép.
export function quad(L, cx, cy, cz, w, h, rotY, uv, e = 1, col = '#ffffff') {
  mat4.trs(M, cx, cy, cz, rotY, w, h, 1);
  const c = rgb(col); L.quad.add(M, c[0], c[1], c[2], e, uv || NOUV);
}
// Trụ nối hai điểm a, b (dùng cho tay, chân).
export function between(L, a, b, r, col, e = 0) {
  const d = v3.sub(b, a), len = v3.len(d);
  if (len < 1e-6) return;
  const y = v3.scale(d, 1 / len), helper = Math.abs(y[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
  const x = v3.norm(v3.cross(helper, y)), z = v3.cross(x, y);
  mat4.fromBasis(M, v3.scale(x, r * 2), d, v3.scale(z, r * 2), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
  const c = rgb(col); L.cyl.add(M, c[0], c[1], c[2], e, NOUV);
}
// Hộp định hướng tuỳ ý: ba trục đơn vị ax, ay, az, kích thước (sx,sy,sz), tâm p.
export function obox(L, p, ax, ay, az, sx, sy, sz, col, e = 0) {
  mat4.fromBasis(M, v3.scale(ax, sx), v3.scale(ay, sy), v3.scale(az, sz), p);
  const c = rgb(col); L.box.add(M, c[0], c[1], c[2], e, NOUV);
}