// Khung cảnh bên ngoài toà nhà: đường vành đai, vỉa hè, quảng trường, bãi đỗ xe, các công trình, cây cối, đèn đường,
// cùng xe cộ và người đi bộ chuyển động. Thuần hình học (không DOM) nên kiểm thử được ngoài trình duyệt.
import { box, cyl, sph, quad, between, obox, mixc } from './shapes.js';
import { UV } from './textures.js';
import { drawPerson, makeLook } from './people.js';
import { W, D, Y0 } from './building.js';

// Vành đai đường: hình chữ nhật bo góc quanh toà nhà.
export const RING = { x0: -30, x1: 78, z0: -20, z1: 54, rw: 8 };
const MID = { x0: RING.x0 + RING.rw / 2, x1: RING.x1 - RING.rw / 2, z0: RING.z0 + RING.rw / 2, z1: RING.z1 - RING.rw / 2 };   // trục giữa đường
export const PARKING = { x0: 53, x1: 68, z0: 3, z1: 31 };
const CAR_COLORS = ['#d9534f', '#4a7bd0', '#e0b04a', '#f4f6f7', '#2f9e8a', '#3a444c', '#8a5cc7', '#d9822b'];

/* ---------- đồ vật ngoài trời ---------- */
export function tree(L, x, z, s = 1, kind = 0) {
  cyl(L, x, 0.9 * s, z, 0.14 * s, 1.8 * s, '#7a5a3c');
  const g = kind ? ['#3d8f5b', '#2f7d4d', '#4aa36a'] : ['#44b27c', '#38a06e', '#5cbf88'];
  sph(L, x, 2.5 * s, z, 1.15 * s, g[0], 0, 1, 1.05, 1); sph(L, x + 0.55 * s, 2.0 * s, z + 0.3 * s, 0.8 * s, g[1]);
  sph(L, x - 0.5 * s, 2.1 * s, z - 0.35 * s, 0.8 * s, g[2]); sph(L, x, 3.2 * s, z, 0.7 * s, g[0]);
}
export const LAMPS = [];                                   // vị trí các cột đèn (cho hiệu ứng phát sáng ban đêm)
export function lamp(L, x, z, h = 4.2) {
  LAMPS.push([x, z, h]);
  cyl(L, x, h / 2, z, 0.07, h, '#3a444c'); box(L, x, h, z, 0.5, 0.08, 0.2, '#3a444c');
  sph(L, x, h - 0.1, z, 0.16, '#fff3c4', 1, 1.4, 0.6, 1);                      // bóng đèn tự phát sáng: ban đêm sáng rõ
}
function bench(L, x, z, rot) { box(L, x, 0.45, z, 1.6, 0.08, 0.5, '#8f6838', 0, rot); box(L, x, 0.75, z - 0.2, 1.6, 0.4, 0.06, '#8f6838', 0, rot); [-0.7, 0.7].forEach(d => box(L, x + Math.cos(rot) * d, 0.22, z - Math.sin(rot) * d, 0.08, 0.44, 0.45, '#3a444c', 0, rot)); }
function bin(L, x, z) { cyl(L, x, 0.4, z, 0.22, 0.8, '#4a5560'); cyl(L, x, 0.82, z, 0.24, 0.05, '#2f3a42'); }
export function car(L, x, z, h, col, big = false) {
  const f = [Math.sin(h), 0, Math.cos(h)], s = [Math.cos(h), 0, -Math.sin(h)], up = [0, 1, 0];
  const len = big ? 8.5 : 4.2, wid = big ? 2.5 : 1.8, hh = big ? 2.4 : 0.7;
  const at = (a, b, y) => [x + f[0] * a + s[0] * b, y, z + f[2] * a + s[2] * b];
  obox(L, at(0, 0, 0.55), s, up, f, wid, hh, len, col);
  if (!big) { obox(L, at(-0.2, 0, 1.1), s, up, f, wid - 0.15, 0.55, len * 0.55, mixc(col, '#ffffff', 0.15)); obox(L, at(-0.2, 0, 1.12), s, up, f, wid - 0.1, 0.42, len * 0.5, '#2a3a4a'); }
  else { obox(L, at(len / 2 - 0.05, 0, 1.4), s, up, f, wid - 0.2, 1.0, 0.1, '#2a3a4a'); }
  for (const a of [len * 0.32, -len * 0.32]) for (const b of [-1, 1]) between(L, at(a, b * (wid / 2 - 0.05), 0.34), at(a, b * (wid / 2 + 0.18), 0.34), 0.34, '#1d2329');
  obox(L, at(len / 2, 0.5, 0.65), s, up, f, 0.3, 0.14, 0.04, '#fff8d0', 0.9); obox(L, at(len / 2, -0.5, 0.65), s, up, f, 0.3, 0.14, 0.04, '#fff8d0', 0.9);
  obox(L, at(-len / 2, 0.55, 0.65), s, up, f, 0.3, 0.14, 0.04, '#ff4d4d', 0.7); obox(L, at(-len / 2, -0.55, 0.65), s, up, f, 0.3, 0.14, 0.04, '#ff4d4d', 0.7);
}
function building(L, x, z, w, d, h, col, roof, facade) {               // công trình thấp: tường, mái, mặt tiền có hình
  box(L, x, h / 2, z, w, h, d, col); box(L, x, h + 0.15, z, w + 0.4, 0.3, d + 0.4, roof);
  if (facade) quad(L, x, h * 0.46, z + d / 2 + 0.02, Math.min(w - 0.6, 9), Math.min(h - 0.4, 4.4), 0, facade, 1);
  box(L, x, h + 0.55, z - d / 4, 1.2, 0.5, 1.0, '#9aa7b0');             // máy điều hoà trên mái
}
function tower(L, x, z, w, d, h, uv, base) {
  box(L, x, h / 2, z, w, h, d, base); box(L, x, h + 0.3, z, w + 0.6, 0.6, d + 0.6, '#6f7b86');
  quad(L, x, h / 2, z + d / 2 + 0.02, w, h, 0, uv, 1); quad(L, x, h / 2, z - d / 2 - 0.02, w, h, Math.PI, uv, 1);
  quad(L, x + w / 2 + 0.02, h / 2, z, d, h, Math.PI / 2, uv, 1); quad(L, x - w / 2 - 0.02, h / 2, z, d, h, -Math.PI / 2, uv, 1);
  cyl(L, x + w * 0.25, h + 1.6, z, 0.06, 2.4, '#5d6f7c'); sph(L, x + w * 0.25, h + 2.9, z, 0.15, '#ff4d4d', 1);
}

/* ---------- dựng phần tĩnh ---------- */
export function buildOutside(L) {
  const R = RING; LAMPS.length = 0;
  box(L, 24, -0.5, 10, 600, 1, 600, '#e3ebe4');                                         // nền cỏ
  // đường vành đai
  box(L, (R.x0 + R.x1) / 2, 0, R.z0 + R.rw / 2, R.x1 - R.x0, 0.04, R.rw, '#4a4f57');
  box(L, (R.x0 + R.x1) / 2, 0, R.z1 - R.rw / 2, R.x1 - R.x0, 0.04, R.rw, '#4a4f57');
  box(L, R.x0 + R.rw / 2, 0, (R.z0 + R.z1) / 2, R.rw, 0.04, R.z1 - R.z0 - 2 * R.rw, '#4a4f57');
  box(L, R.x1 - R.rw / 2, 0, (R.z0 + R.z1) / 2, R.rw, 0.04, R.z1 - R.z0 - 2 * R.rw, '#4a4f57');
  // vạch kẻ đường giữa
  for (let x = R.x0 + 2; x < R.x1 - 2; x += 3.2) { box(L, x, 0.025, MID.z0, 1.6, 0.012, 0.16, '#f2d36b'); if (x < 19.5 || x > 29.5) box(L, x, 0.025, MID.z1, 1.6, 0.012, 0.16, '#f2d36b'); }
  for (let z = R.z0 + R.rw + 1; z < R.z1 - R.rw - 1; z += 3.2) { box(L, MID.x0, 0.025, z, 0.16, 0.012, 1.6, '#f2d36b'); box(L, MID.x1, 0.025, z, 0.16, 0.012, 1.6, '#f2d36b'); }
  // vạch qua đường ngay trước lối vào
  for (let i = 0; i < 8; i++) box(L, 21 + i * 0.9, 0.027, MID.z1, 0.5, 0.012, R.rw - 1, '#ffffff');
  // vỉa hè sát mép trong của đường
  const sw = '#dfe3e6', ix0 = R.x0 + R.rw, ix1 = R.x1 - R.rw, iz0 = R.z0 + R.rw, iz1 = R.z1 - R.rw;
  box(L, (ix0 + ix1) / 2, 0.04, iz0 + 1, ix1 - ix0, 0.08, 2, sw); box(L, (ix0 + ix1) / 2, 0.04, iz1 - 1, ix1 - ix0, 0.08, 2, sw);
  box(L, ix0 + 1, 0.04, (iz0 + iz1) / 2, 2, 0.08, iz1 - iz0, sw); box(L, ix1 - 1, 0.04, (iz0 + iz1) / 2, 2, 0.08, iz1 - iz0, sw);
  // quảng trường trước toà nhà, bậc thềm, quầy lễ tân, biển hiệu, đài phun nước
  box(L, 24, 0.03, (D + 0.6 + iz1 - 2) / 2, 40, 0.06, iz1 - 2 - D - 0.6, '#ebeef0');
  box(L, 24, 0.1, D + 0.95, 6.4, 0.2, 0.7, '#e9edf0'); box(L, 24, 0.05, D + 1.55, 6.4, 0.1, 0.6, '#e1e6ea');
  box(L, 13, 0.52, D + 5.6, 6.8, 1.0, 0.35, '#1d2a3a'); quad(L, 13, 0.52, D + 5.78, 6.4, 0.9, 0, UV.sign, 1);
  box(L, 13, 0.55, D + 7.2, 4.2, 1.1, 1.0, '#d29a56'); for (let i = 0; i < 16; i++) box(L, 11.1 + i * 0.25, 0.55, D + 7.71, 0.06, 1.1, 0.02, '#b97e3c');
  box(L, 13, 1.13, D + 7.2, 4.4, 0.06, 1.1, '#f1ece2');
  cyl(L, 36, 0.25, 40, 2.6, 0.5, '#e6e9ec'); cyl(L, 36, 0.27, 40, 2.3, 0.5, '#7fc4f0', 0.3); cyl(L, 36, 0.9, 40, 0.18, 1.2, '#d9dde1'); sph(L, 36, 1.7, 40, 0.34, '#bfe3f7', 0.5); sph(L, 36, 2.0, 40, 0.2, '#bfe3f7', 0.5);
  [[5, D + 4.4], [43, D + 4.4]].forEach(([x, z]) => { box(L, x, 0.3, z, 4.2, 0.6, 0.9, '#e9e5dc'); for (let i = 0; i < 4; i++) sph(L, x - 1.5 + i, 0.95, z, 0.42, ['#2f8a5e', '#38a06e', '#287a53', '#44b27c'][i], 0, 1, 1.1, 1); });
  [[20.5, D + 3.2], [27.5, D + 3.2]].forEach(([x, z]) => { cyl(L, x, 3.5, z, 0.05, 7, '#b8c0c8'); box(L, x + 0.7, 6.4, z, 1.4, 0.8, 0.03, x < 24 ? '#35c29c' : '#6d5ef0'); });   // cột cờ
  bench(L, 6.5, 41, 0); bench(L, 40, 35.4, 0); bin(L, 11.5, 42.5); bin(L, 42, 38.5);
  // bãi đỗ xe phía đông: nền, vạch kẻ ô, trạm gác, ô tô đỗ
  box(L, (PARKING.x0 + PARKING.x1) / 2, 0.02, (PARKING.z0 + PARKING.z1) / 2, PARKING.x1 - PARKING.x0, 0.04, PARKING.z1 - PARKING.z0, '#50555d');
  for (let z = PARKING.z0; z <= PARKING.z1 + 0.01; z += 2.8) { box(L, PARKING.x0 + 2.6, 0.045, z, 5.2, 0.012, 0.1, '#e8ecef'); box(L, PARKING.x1 - 2.6, 0.045, z, 5.2, 0.012, 0.1, '#e8ecef'); }
  box(L, 50.8, 1.1, 2.0, 2.0, 2.2, 2.0, '#d9dde1'); box(L, 50.8, 2.3, 2.0, 2.4, 0.2, 2.4, '#6f7b86'); quad(L, 50.8, 1.3, 3.02, 1.4, 0.8, 0, null, 0.5, '#9fd0e8');
  let sd = 7; const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  for (let z = PARKING.z0 + 1.4; z < PARKING.z1; z += 2.8) { if (rnd() < 0.8) car(L, PARKING.x0 + 2.6, z, Math.PI / 2, CAR_COLORS[Math.floor(rnd() * 8)]); if (rnd() < 0.7) car(L, PARKING.x1 - 2.6, z, -Math.PI / 2, CAR_COLORS[Math.floor(rnd() * 8)]); }
  // công trình phía tây: quán cà phê, cửa hàng, nhà để xe đạp
  building(L, -14, 8, 11, 9, 4.2, '#e8dccb', '#9a5a45', UV.cafe); building(L, -14, 24, 11, 9, 4.2, '#d8e2ea', '#4a5a6a', UV.shop);
  for (let i = 0; i < 6; i++) box(L, -8.5 + (i % 3) * 0.7, 0.45, 12.8 + Math.floor(i / 3) * 0.9, 0.5, 0.9, 0.12, '#5d6f7c');
  [[-10.2, 14.4], [-10.2, 30.4]].forEach(([x, z]) => { cyl(L, x, 0.5, z, 0.5, 1.0, '#e6e1d6'); cyl(L, x, 1.7, z, 0.04, 1.4, '#3a444c'); cyl(L, x, 2.5, z, 1.1, 0.06, ['#d9534f', '#3b8a8d'][z > 20 ? 1 : 0]); });   // bàn dù ngoài trời
  // sân thể thao và công viên phía bắc
  box(L, 16, 0.03, -6, 16, 0.06, 8.4, '#2f6fa8');                                                                                              // mặt sân
  box(L, 16, 0.064, -6, 0.08, 0.008, 8.0, '#f4f6f7'); box(L, 16, 0.064, -10.0, 15.6, 0.008, 0.08, '#f4f6f7'); box(L, 16, 0.064, -2.0, 15.6, 0.008, 0.08, '#f4f6f7');   // vạch giữa và vạch biên
  box(L, 8.2, 0.064, -6, 0.08, 0.008, 8.0, '#f4f6f7'); box(L, 23.8, 0.064, -6, 0.08, 0.008, 8.0, '#f4f6f7');
  cyl(L, 16, 0.064, -6, 1.2, 0.008, '#f4f6f7'); cyl(L, 16, 0.068, -6, 1.08, 0.008, '#2f6fa8');                                                    // vòng tròn giữa sân
  [-8, 8].forEach(dx => { cyl(L, 16 + dx, 1.6, -6, 0.05, 3.2, '#5d6f7c'); box(L, 16 + dx, 3.1, -6, 0.1, 0.7, 1.1, '#f4f6f7'); });
  cyl(L, 38, 0.5, -6, 3.2, 1.0, '#cfa56b'); cyl(L, 38, 1.1, -6, 3.6, 0.3, '#b98a52'); [0, 1, 2, 3, 4, 5].forEach(i => cyl(L, 38 + Math.cos(i * 1.047) * 3.1, 1.6, -6 + Math.sin(i * 1.047) * 3.1, 0.12, 2.2, '#f1ece2'));   // vọng đình
  cyl(L, 52, 0.05, -5, 3.6, 0.1, '#7fc4f0', 0.25); cyl(L, 52, 0.02, -5, 4.0, 0.06, '#d9d2c5');                                                                    // ao nhỏ
  // cây cối dọc vỉa hè và trong công viên
  for (let x = R.x0 + 12; x < R.x1 - 10; x += 9) { tree(L, x, -9.4, 1 + (x % 3) * 0.1, (x / 9) & 1); if (!(x > 8 && x < 44)) tree(L, x, 44.4, 1, 1); }
  for (let z = -4; z < 44; z += 10) { tree(L, -20.6, z, 1.05, 1); tree(L, 68.6, z, 1.05, 0); }
  [[28, -4], [46, -3], [4, -3], [58, -6], [60, 36], [-2, 40]].forEach(([x, z], i) => tree(L, x, z, 1.2, i & 1));
  // đèn đường
  for (let x = R.x0 + 8; x < R.x1; x += 14) { lamp(L, x, -10.4); lamp(L, x, 44.6); }
  for (let z = 4; z < 44; z += 14) { lamp(L, -20.6 + 1, z); lamp(L, 68.6, z); }
  [[18, 38.4], [30, 38.6], [24, 43.4]].forEach(([x, z]) => lamp(L, x, z, 3.6));
  // trạm xe buýt
  box(L, 60, 2.7, 44.4, 4.6, 0.12, 1.8, '#6f7b86'); [-2, 2].forEach(d => box(L, 60 + d, 1.35, 43.6, 0.08, 2.7, 0.08, '#3a444c')); bench(L, 60, 44.6, 0);
  box(L, 60, 1.4, 43.5, 4.2, 2.3, 0.04, '#9fd0e8', 0.25);
  // các toà tháp phía xa: đường chân trời thành phố
  [[-84, 6, 14, 14, 40, UV.tower1], [-92, 44, 12, 12, 56, UV.tower2], [-80, -40, 14, 12, 34, UV.tower2], [132, 10, 14, 14, 46, UV.tower2],
    [138, 46, 12, 12, 36, UV.tower1], [126, -36, 14, 14, 62, UV.tower1], [14, -78, 16, 12, 44, UV.tower1], [70, -84, 14, 12, 32, UV.tower2],
    [-10, 108, 14, 14, 42, UV.tower2], [40, 116, 16, 14, 54, UV.tower1], [96, 110, 14, 14, 38, UV.tower2]].forEach(([x, z, w, d, h, uv], i) => tower(L, x, z, w, d, h, uv, ['#8da2b8', '#b9a99a', '#9fb0a6'][i % 3]));
  return {};
}

/* ---------- xe cộ và người đi bộ chuyển động ---------- */
// Quỹ đạo chữ nhật bo góc (r) đi theo chiều kim đồng hồ. s là quãng đường đã đi.
export function loopLength(rect, r) { return 2 * ((rect.x1 - rect.x0 - 2 * r) + (rect.z1 - rect.z0 - 2 * r)) + 2 * Math.PI * r; }
export function loopPos(rect, r, s) {
  const lx = rect.x1 - rect.x0 - 2 * r, lz = rect.z1 - rect.z0 - 2 * r, arc = Math.PI * r / 2, tot = 2 * (lx + lz) + 4 * arc;
  s = ((s % tot) + tot) % tot;
  const seg = [[lx, 'N'], [arc, 'NE'], [lz, 'E'], [arc, 'SE'], [lx, 'S'], [arc, 'SW'], [lz, 'W'], [arc, 'NW']];
  for (const [len, k] of seg) {
    if (s > len) { s -= len; continue; }
    const u = s / len;
    switch (k) {
      case 'N': return { x: rect.x0 + r + lx * u, z: rect.z0, h: Math.PI / 2 };
      case 'NE': { const a = -Math.PI / 2 + u * Math.PI / 2; return { x: rect.x1 - r + Math.cos(a) * r, z: rect.z0 + r + Math.sin(a) * r, h: Math.PI / 2 - u * Math.PI / 2 }; }
      case 'E': return { x: rect.x1, z: rect.z0 + r + lz * u, h: 0 };
      case 'SE': { const a = u * Math.PI / 2; return { x: rect.x1 - r + Math.cos(a) * r, z: rect.z1 - r + Math.sin(a) * r, h: -u * Math.PI / 2 }; }
      case 'S': return { x: rect.x1 - r - lx * u, z: rect.z1, h: -Math.PI / 2 };
      case 'SW': { const a = Math.PI / 2 + u * Math.PI / 2; return { x: rect.x0 + r + Math.cos(a) * r, z: rect.z1 - r + Math.sin(a) * r, h: -Math.PI / 2 - u * Math.PI / 2 }; }
      case 'W': return { x: rect.x0, z: rect.z1 - r - lz * u, h: Math.PI };
      default: { const a = Math.PI + u * Math.PI / 2; return { x: rect.x0 + r + Math.cos(a) * r, z: rect.z0 + r + Math.sin(a) * r, h: Math.PI - u * Math.PI / 2 }; }
    }
  }
  return { x: rect.x0, z: rect.z0, h: 0 };
}
const LANE_OUT = { x0: MID.x0 - 1.8, x1: MID.x1 + 1.8, z0: MID.z0 - 1.8, z1: MID.z1 + 1.8 };     // làn ngoài, đi chiều kim đồng hồ
const LANE_IN = { x0: MID.x0 + 1.8, x1: MID.x1 - 1.8, z0: MID.z0 + 1.8, z1: MID.z1 - 1.8 };      // làn trong, đi ngược chiều
export const TRAFFIC = {
  cars: [{ lane: 'out', at: 0, col: '#d9534f', v: 7.5 }, { lane: 'out', at: 120, col: '#4a7bd0', v: 7.5 }, { lane: 'out', at: 235, col: '#f4f6f7', v: 6.5, big: true },
    { lane: 'in', at: 40, col: '#e0b04a', v: 6.5 }, { lane: 'in', at: 160, col: '#2f9e8a', v: 7 }, { lane: 'in', at: 270, col: '#8a5cc7', v: 6 }],
  peds: [{ id: 301, v: 1.2, at: 0 }, { id: 302, v: 1.0, at: 25 }, { id: 303, v: 1.3, at: 50 }, { id: 304, v: 1.1, at: 75 }]
};
export const PED_RECT = { x0: 9, x1: 40, z0: 37.2, z1: 44 };            // đi vòng trên quảng trường, tránh bồn cây, cột cờ, đài phun nước, quầy lễ tân
// Đèn pha, chùm sáng và đèn hậu của xe (chỉ vẽ ban đêm, vào lớp phát sáng G với độ sáng k).
function carLights(G, x, z, h, k, big) {
  const f = [Math.sin(h), Math.cos(h)], s = [Math.cos(h), -Math.sin(h)], len = big ? 8.5 : 4.2, hw = big ? 0.9 : 0.55;
  for (const sd of [-1, 1]) {
    const hx = x + f[0] * len / 2 + s[0] * sd * hw * 0.9, hz = z + f[1] * len / 2 + s[1] * sd * hw * 0.9;
    sph(G, hx, 0.68, hz, 0.3, '#fff6cf', 0.55 * k);
    for (let i = 1; i <= 4; i++) sph(G, hx + f[0] * i * 1.7, 0.3, hz + f[1] * i * 1.7, 0.5 + i * 0.13, '#fff0b8', 0.1 * k * (1 - i * 0.16), 1, 0.22, 1);
    sph(G, x - f[0] * len / 2 + s[0] * sd * hw, 0.68, z - f[1] * len / 2 + s[1] * sd * hw, 0.2, '#ff4d4d', 0.6 * k);
  }
}
export function drawTraffic(L, t, G = null, k = 0) {
  const rOut = 6, rIn = 4;
  for (const c of TRAFFIC.cars) {
    const lane = c.lane === 'out' ? LANE_OUT : LANE_IN, r = c.lane === 'out' ? rOut : rIn;
    const tot = loopLength(lane, r);
    let s = c.at + c.v * t; if (c.lane === 'in') s = tot - (s % tot);                 // làn trong chạy ngược
    const p = loopPos(lane, r, s), h = c.lane === 'in' ? p.h + Math.PI : p.h;
    car(L, p.x, p.z, h, c.col, !!c.big);
    if (G && k > 0.04) carLights(G, p.x, p.z, h, k, !!c.big);
  }
  const tot = loopLength(PED_RECT, 2);
  for (const q of TRAFFIC.peds) {
    const p = loopPos(PED_RECT, 2, q.at + q.v * t);
    drawPerson(L, { x: p.x, y: 0.06, z: p.z, heading: p.h, pose: 'walk', sit: 0, walk: 1, t: t + q.id, work: false, look: makeLook(q.id, '#6d5ef0', false), speed: q.v * 1.4, act: null, actAmt: 0, hold: null });
  }
  return tot;
}