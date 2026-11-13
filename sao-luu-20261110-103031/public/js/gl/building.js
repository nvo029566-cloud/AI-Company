// Toà nhà văn phòng 3 hàng: 14 phòng (12 phòng ban, phòng CEO, phòng nghỉ), hai hành lang ngang, hai hành lang dọc,
// đồ đạc, vách ngăn. Thuần hình học: không dùng DOM, nên kiểm thử được ngoài trình duyệt.
//
//   hàng 0 (z 0..9)    : 01 Điều hành | 02 | 03 | 04 Nghiên cứu
//   hành lang C1 (z 9..12)
//   hàng 1 (z 12..21)  : CEO | 05 | 06 | 07 | 08
//   hành lang C2 (z 21..24)
//   hàng 2 (z 24..33)  : 12 | 11 | 10 | 09 | Phòng nghỉ
//   hành lang dọc V1 (x 14..17) và V2 (x 31..34) nối C1 với C2.
// Dây chuyền công việc đi vòng: CEO -> 01 -> 02 -> 03 -> 05 -> 06/07/08/09 -> 10 -> 11 -> 12 -> CEO.
import { box, cyl, sph, quad, mixc } from './shapes.js';
import { UV } from './textures.js';

export const W = 48, RD = 9, CW = 3, ROW_Z = [0, 12, 24], D = 33;
export const CORR_Z = [10.5, 22.5];       // trục giữa hai hành lang ngang
export const V_X = [15.5, 32.5];          // trục giữa hai hành lang dọc
export const Y0 = 0.3, FL = Y0 + 0.08, WALL_H = 3.0, WT = 0.25, LOW_H = 1.1;
export const DOOR_W = 1.5, DOOR_DX = 0.85;   // hàng 2: cửa hở ở tường bắc, mép trái phòng tới 1,5; điểm đi qua ở 0,85
export const SEAT_BACK = 0.62;               // người ngồi cách tâm bàn về phía bắc
const CHAIRS = ['#6aa6d6', '#5bb7a0', '#f0955b', '#e57fa8', '#7b8bd6', '#8fa0ab'];
const WOOD = '#dfb97c', WOOD_D = '#b98a52', WHITE = '#eceff2', CAP = '#b9c1c9';

// kind: office = phòng thường, dev = phòng lập trình, server = có tủ máy chủ, meeting, library, ceo, lounge
export const ROOM_DEFS = [
  { code: '01', row: 0, x: 0, w: 14, kind: 'meeting' },
  { code: '02', row: 0, x: 17, w: 7, kind: 'office', board: 'chart' },
  { code: '03', row: 0, x: 24, w: 7, kind: 'office', board: 'table' },
  { code: '04', row: 0, x: 34, w: 14, kind: 'library' },
  { code: 'CEO', row: 1, x: 0, w: 14, kind: 'ceo' },
  { code: '05', row: 1, x: 17, w: 7, kind: 'office', board: 'chart' },
  { code: '06', row: 1, x: 24, w: 7, kind: 'dev', board: 'code' },
  { code: '07', row: 1, x: 34, w: 7, kind: 'server', board: 'code2' },
  { code: '08', row: 1, x: 41, w: 7, kind: 'dev', board: 'code' },
  { code: '12', row: 2, x: 0, w: 7, kind: 'server', board: 'code' },
  { code: '11', row: 2, x: 7, w: 7, kind: 'server', board: 'code2' },
  { code: '10', row: 2, x: 17, w: 7, kind: 'dev', board: 'code' },
  { code: '09', row: 2, x: 24, w: 7, kind: 'dev', board: 'code2' },
  { code: 'LNG', row: 2, x: 34, w: 14, kind: 'lounge' }
];
export const ROOM_NAME = { CEO: 'CEO (bạn)', LNG: 'Phòng nghỉ' };
export const corrOf = row => row === 0 ? 0 : 1;      // hàng nào ra hành lang nào: hàng 0 -> C1; hàng 1 và 2 -> C2

export function roomBox(def) {
  const z0 = ROW_Z[def.row];
  return { code: def.code, def, x0: def.x, z0, w: def.w, d: RD, cx: def.x + def.w / 2, cz: z0 + RD / 2 };
}
// Vị trí bàn (toạ độ cục bộ trong phòng): người ngồi phía bắc bàn, quay mặt về phía nam.
export function localSlots(def) {
  if (def.kind === 'lounge') return [];
  if (def.kind === 'meeting') return [[10.4, 2.5], [10.4, 6.1]];
  if (def.kind === 'ceo') return [[7, 2.6]];
  if (def.kind === 'library') { const o = []; for (const z of [2.6, 5.2, 7.7]) for (const x of [2.4, 5.4, 8.4, 11.4]) o.push([x, z]); return o; }
  const o = []; for (const z of [2.5, 6.1]) for (const x of [1.9, 5.1]) o.push([x, z]);
  return o;
}

// Quầy cà phê ở hai hành lang: gắn vào tường, người đứng uống ở phía hành lang và quay mặt về quầy (hướng nam).
export const PANTRIES = [
  { id: 0, x: 24, z: 11.4, corr: 0, face: 0, spots: [[23.0, 10.65], [24.0, 10.65], [25.0, 10.65]] },
  { id: 1, x: 20.5, z: 23.45, corr: 1, face: 0, spots: [[19.6, 22.75], [20.5, 22.75], [21.4, 22.75]] }
];
export const MEET = { room: '01', x: 4.2, z: 5.2, len: 6, chairs: 3 };   // bàn họp ở phòng 01
const MEET_AISLE = 8.5;
export const MEET_SEATS = [];
for (let i = 0; i < MEET.chairs; i++) {
  const px = MEET.x - MEET.len / 2 + 0.9 + i * ((MEET.len - 1.8) / (MEET.chairs - 1)), zn = MEET.z - 1.15, zs = MEET.z + 1.15;
  MEET_SEATS.push({ x: px, z: zn, h: 0, approach: [[px + 1.05, zn], [px + 1.05, 3.1], [MEET_AISLE, 3.1], [MEET_AISLE, 9.5]] });
  MEET_SEATS.push({ x: px, z: zs, h: Math.PI, approach: [[px + 1.05, zs], [px + 1.05, 7.3], [MEET_AISLE, 7.3], [MEET_AISLE, 9.5]] });
}
// Lối đi giữa hai dãy bàn mà người đứng dậy sẽ bước sang (x cục bộ trong phòng).
export function aisleOf(def, lx) {
  if (def.kind === 'meeting') return MEET_AISLE;
  if (def.kind === 'ceo') return 11.8;
  if (def.kind === 'library') return [3.9, 6.9, 9.9, 12.65].reduce((a, b) => Math.abs(b - lx) < Math.abs(a - lx) ? b : a);
  return def.w / 2;
}
export function chairColor(def, i) { return CHAIRS[(def.code.charCodeAt(0) + i * 5) % CHAIRS.length]; }

/* ---------- đồ vật ---------- */
export function chair(L, x, z, col, face = 1) {  // face = 1: quay mặt về nam (+z)
  box(L, x, FL + 0.46, z, 0.5, 0.07, 0.5, col);
  box(L, x, FL + 0.8, z - 0.27 * face, 0.5, 0.58, 0.06, mixc(col, '#000000', 0.12));
  cyl(L, x, FL + 0.26, z, 0.035, 0.4, '#2e3a42');
  box(L, x, FL + 0.06, z, 0.62, 0.04, 0.07, '#2e3a42'); box(L, x, FL + 0.06, z, 0.07, 0.04, 0.62, '#2e3a42');
}
function desk(L, x, z) {
  const top = FL + 0.74;
  box(L, x, top - 0.025, z, 1.5, 0.05, 0.75, WOOD);
  box(L, x - 0.69, FL + 0.36, z, 0.04, 0.72, 0.66, '#2f3640'); box(L, x + 0.69, FL + 0.36, z, 0.04, 0.72, 0.66, '#2f3640');
  box(L, x + 0.46, FL + 0.31, z + 0.02, 0.4, 0.55, 0.62, '#eef0f2');           // hộc tủ
  box(L, x - 0.08, top + 0.012, z - 0.2, 0.44, 0.024, 0.14, '#f4f6f7');       // bàn phím
  box(L, x + 0.3, top + 0.012, z - 0.2, 0.07, 0.024, 0.11, '#dfe4e8');        // chuột
  cyl(L, x - 0.62, top + 0.05, z - 0.08, 0.04, 0.1, '#ffffff'); cyl(L, x - 0.62, top + 0.098, z - 0.08, 0.034, 0.006, '#6b4a2f');   // cốc cà phê
  box(L, x + 0.52, top + 0.007, z - 0.12, 0.2, 0.014, 0.15, '#f8f8f6', 0, 0.3);   // sổ tay
  box(L, x, top + 0.011, z + 0.13, 0.2, 0.022, 0.14, '#222b33'); box(L, x, top + 0.15, z + 0.13, 0.05, 0.28, 0.04, '#222b33');
  box(L, x, top + 0.34, z + 0.13, 0.62, 0.38, 0.04, '#171c22');                 // thân màn hình (mặt hình và đèn báo vẽ ở phần động)
  // đồ dùng nhỏ trên bàn: đèn bàn, chậu cây mini, chồng giấy, ống bút
  cyl(L, x - 0.6, top + 0.012, z + 0.2, 0.06, 0.024, '#2a323a'); cyl(L, x - 0.6, top + 0.17, z + 0.2, 0.012, 0.3, '#2a323a'); sph(L, x - 0.56, top + 0.33, z + 0.19, 0.06, '#f4d35e', 0.55, 1, 0.6, 1);
  cyl(L, x + 0.6, top + 0.04, z + 0.22, 0.05, 0.08, '#e3ddd0'); sph(L, x + 0.6, top + 0.12, z + 0.22, 0.07, '#44b27c', 0, 1, 1.1, 1);
  box(L, x + 0.22, top + 0.02, z + 0.2, 0.2, 0.03, 0.15, '#f5f5f0'); cyl(L, x + 0.4, top + 0.06, z + 0.26, 0.03, 0.12, '#4a7bd0');
}
function plant(L, x, z, s = 1) {
  cyl(L, x, FL + 0.2 * s, z, 0.22 * s, 0.4 * s, '#e3ddd0');
  cyl(L, x, FL + 0.4 * s, z, 0.2 * s, 0.03, '#4a3a2c');
  const g = ['#2f8a5e', '#38a06e', '#287a53', '#44b27c'];
  [[0, 0.75, 0, 0.3], [0.17, 0.62, 0.05, 0.22], [-0.16, 0.66, -0.06, 0.24], [0.04, 0.95, 0.04, 0.2], [-0.06, 0.58, 0.16, 0.2]].forEach(([dx, dy, dz, r], i) =>
    sph(L, x + dx * s, FL + dy * s + 0.1, z + dz * s, r * s, g[i % 4], 0, 1, 1.15, 1));
}
function rack(L, x, z) {                       // tủ máy chủ, mặt trước quay về nam
  box(L, x, FL + 1.0, z, 0.8, 2.0, 0.9, '#1b2128'); box(L, x, FL + 1.0, z + 0.451, 0.7, 1.85, 0.01, '#10151a');
  const c = ['#5cf2c4', '#4cc9f0', '#ffb347', '#5cf2c4'];
  for (let i = 0; i < 9; i++) { box(L, x - 0.12, FL + 0.2 + i * 0.19, z + 0.46, 0.34, 0.035, 0.012, '#2a323a'); box(L, x + 0.22, FL + 0.2 + i * 0.19, z + 0.46, 0.04, 0.04, 0.014, c[i % 4], 1); }
}
function shelf(L, cx, cz, len, face) {         // kệ sách: khung rỗng (lưng, hai bên, các tầng) để thấy sách; face 'S' nhìn về nam, 'W' về tây, 'E' về đông
  const rot = face === 'S' ? 0 : Math.PI / 2, sg = face === 'E' ? -1 : 1;
  const px = (u, v) => face === 'S' ? [cx + u, cz + v] : [cx - sg * v, cz + u];
  const part = (u, v, y, a, h, d, col) => { const [x, z] = px(u, v); box(L, x, FL + y, z, a, h, d, col, 0, rot); };
  part(0, -0.2, 1.05, len - 0.08, 2.1, 0.04, '#6b4e2b');                                  // tấm lưng (lùi vào 1 cm để không trùng mặt sau)
  part(-len / 2 + 0.02, 0, 1.05, 0.04, 2.1, 0.46, WOOD_D); part(len / 2 - 0.02, 0, 1.05, 0.04, 2.1, 0.46, WOOD_D);
  for (let k = 0; k < 5; k++) part(0, 0, 0.015 + k * 0.52, len, 0.03, 0.46, WOOD_D);       // 4 tầng + nắp
  const cols = ['#c0564b', '#4a7bd0', '#e0b04a', '#2f9e8a', '#8a5cc7', '#d9822b', '#e9e4da', '#5d6f7c'];
  let seed = Math.floor(cx * 31 + cz * 17 + len * 7);
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let k = 0; k < 4; k++) {
    let u = -len / 2 + 0.09;
    while (u < len / 2 - 0.16) {
      const w = 0.05 + rnd() * 0.07, h = 0.26 + rnd() * 0.14;
      part(u + w / 2, 0.02, 0.03 + k * 0.52 + h / 2, w, h, 0.26, cols[Math.floor(rnd() * cols.length)]);
      u += w + 0.012;
    }
  }
}
function confTable(L, x, z, len, chairs, col = '#8a97a3') {      // bàn họp dài, mặt giữa xanh đậm, giấy và cốc, ghế hai bên
  const top = FL + 0.76;
  box(L, x, top - 0.04, z, len, 0.08, 1.3, WOOD); box(L, x, top + 0.002, z, len - 0.45, 0.012, 0.9, '#3b5a66');
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(L, x + a * (len / 2 - 0.2), FL + 0.36, z + b * 0.5, 0.1, 0.72, 0.1, '#6f5a3c'));
  const n = Math.floor(len / 1.6);
  for (let i = 0; i < n; i++) {
    const px = x - len / 2 + 0.9 + i * ((len - 1.8) / Math.max(1, n - 1));
    box(L, px, top + 0.012, z - 0.28, 0.3, 0.008, 0.22, '#f4f4f1'); box(L, px + 0.2, top + 0.012, z + 0.28, 0.3, 0.008, 0.22, '#f4f4f1', 0, 0.2);
    cyl(L, px + 0.38, top + 0.05, z - 0.1, 0.04, 0.09, '#ffffff');
  }
  for (let i = 0; i < chairs; i++) {
    const px = x - len / 2 + 0.9 + i * ((len - 1.8) / Math.max(1, chairs - 1));
    chair(L, px, z - 1.15, col, -1); chair(L, px, z + 1.15, col, 1);
  }
}
function cabinet(L, x, z) { box(L, x, FL + 0.65, z, 0.8, 1.3, 0.5, '#9aa7b0'); for (let i = 0; i < 3; i++) { box(L, x, FL + 0.25 + i * 0.4, z + 0.255, 0.7, 0.34, 0.01, '#b6c1c8'); box(L, x, FL + 0.28 + i * 0.4, z + 0.265, 0.18, 0.025, 0.01, '#4a5560'); } }
function printer(L, x, z) { box(L, x, FL + 0.35, z, 0.8, 0.7, 0.6, '#d9dde1'); box(L, x, FL + 0.82, z, 0.7, 0.25, 0.5, '#eef0f2'); box(L, x, FL + 0.95, z + 0.1, 0.5, 0.02, 0.3, '#f4f4f0'); box(L, x + 0.25, FL + 0.84, z + 0.26, 0.08, 0.04, 0.01, '#5cf2c4', 1); }
function boardEast(L, x, z) {                   // bảng trắng di động, mặt quay về đông (vào phòng)
  box(L, x, FL + 1.15, z, 0.06, 1.5, 1.5, '#f4f6f8'); box(L, x, FL + 0.1, z, 0.3, 0.06, 1.4, '#6b7680');
  box(L, x, FL + 0.45, z, 0.05, 0.7, 0.05, '#6b7680'); quad(L, x + 0.034, FL + 1.15, z, 1.4, 1.4, Math.PI / 2, UV.chart, 1);
}
function cooler(L, x, z) { box(L, x, FL + 0.45, z, 0.4, 0.9, 0.4, '#f1f4f6'); cyl(L, x, FL + 1.12, z, 0.15, 0.36, '#7fc4f0'); box(L, x, FL + 0.85, z + 0.205, 0.1, 0.06, 0.01, '#4cc9f0', 1); }
function sofa(L, x, z, w, col) {                // các chi tiết nhô ra vài cm để không trùng mặt phẳng với đế ghế
  box(L, x, FL + 0.22, z, w, 0.44, 0.9, col);
  box(L, x, FL + 0.62, z - 0.38, w - 0.02, 0.5, 0.2, mixc(col, '#000000', 0.12));
  box(L, x - w / 2 + 0.09, FL + 0.4, z, 0.22, 0.3, 0.94, mixc(col, '#000000', 0.18)); box(L, x + w / 2 - 0.09, FL + 0.4, z, 0.22, 0.3, 0.94, mixc(col, '#000000', 0.18));
}
function coffeeTable(L, x, z, w, d) { box(L, x, FL + 0.38, z, w, 0.05, d, '#c9a56b'); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(L, x + a * (w / 2 - 0.08), FL + 0.18, z + b * (d / 2 - 0.08), 0.05, 0.36, 0.05, '#4a3a2c')); cyl(L, x, FL + 0.44, z, 0.05, 0.07, '#ffffff'); }
function vending(L, x, z) { box(L, x, FL + 0.95, z, 0.9, 1.9, 0.8, '#b33a3a'); box(L, x, FL + 1.1, z + 0.405, 0.7, 1.2, 0.01, '#1a2a38'); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) box(L, x - 0.22 + j * 0.22, FL + 0.7 + i * 0.28, z + 0.412, 0.14, 0.2, 0.01, ['#f4d35e', '#5cf2c4', '#ff9e7a', '#7cb8ff'][(i + j) % 4], 0.8); }
function pingpong(L, x, z) { box(L, x, FL + 0.76, z, 2.7, 0.05, 1.5, '#2f7d5b'); box(L, x, FL + 0.79, z, 0.04, 0.01, 1.5, '#f4f4f0'); box(L, x, FL + 0.85, z, 0.03, 0.14, 1.5, '#e8ecef'); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(L, x + a * 1.2, FL + 0.37, z + b * 0.6, 0.08, 0.74, 0.08, '#2e3a42')); sph(L, x + 0.6, FL + 0.82, z + 0.2, 0.02, '#ffffff'); }
function bar(L, x, z, len) { box(L, x, FL + 0.5, z, len, 1.0, 0.7, '#6f5a3c'); box(L, x, FL + 1.02, z, len + 0.1, 0.05, 0.8, '#e6e1d6'); box(L, x - len / 2 + 0.6, FL + 1.3, z, 0.45, 0.5, 0.4, '#2a2f36'); box(L, x - len / 2 + 0.6, FL + 1.25, z + 0.21, 0.1, 0.12, 0.02, '#d9d2c5'); for (let i = 0; i < 3; i++) { const sx = x + len / 2 - 0.7 - i * 0.7; cyl(L, sx, FL + 0.38, z + 0.85, 0.2, 0.05, '#4a7bd0'); cyl(L, sx, FL + 0.2, z + 0.85, 0.03, 0.4, '#2e3a42'); } }
function beanbag(L, x, z, col) { sph(L, x, FL + 0.28, z, 0.42, col, 0, 1, 0.75, 1); }
function credenza(L, x, z, len) { box(L, x, FL + 0.4, z, len, 0.8, 0.5, '#8f6838'); for (let i = 0; i < 3; i++) box(L, x - len / 3 + i * len / 3, FL + 0.4, z + 0.255, len / 3 - 0.1, 0.7, 0.01, '#a77c47'); cyl(L, x - len / 4, FL + 0.95, z, 0.06, 0.2, '#5d6f7c'); }
function coatRack(L, x, z) { cyl(L, x, FL + 0.9, z, 0.025, 1.8, '#3a444c'); box(L, x, FL + 0.03, z, 0.5, 0.06, 0.5, '#3a444c'); for (let i = 0; i < 3; i++) between3(L, x, FL + 1.6, z, i); }
function between3(L, x, y, z, i) { const a = i * 2.1; sph(L, x + Math.cos(a) * 0.14, y, z + Math.sin(a) * 0.14, 0.035, '#8a97a3'); }
function globe(L, x, z) { cyl(L, x, FL + 0.55, z, 0.03, 1.1, '#3a444c'); box(L, x, FL + 0.03, z, 0.4, 0.06, 0.4, '#3a444c'); sph(L, x, FL + 1.25, z, 0.28, '#3b82b8'); sph(L, x + 0.05, FL + 1.28, z + 0.05, 0.22, '#5bb77a', 0, 1, 0.9, 1); }
function trophyCase(L, x, z, len) {             // tủ trưng bày cúp dọc theo trục z, mặt kính quay về tây
  box(L, x, FL + 0.55, z, 0.5, 1.1, len, '#3a444c'); box(L, x - 0.255, FL + 0.6, z, 0.01, 0.9, len - 0.1, '#9fd0e8', 0.35);
  for (let i = 0; i < 4; i++) cyl(L, x - 0.05, FL + 1.18, z - len / 2 + 0.5 + i * (len - 1) / 3, 0.07, 0.16, '#e8c14a', 0.4);
}
function pantryCounter(L, P) {                  // quầy cà phê gắn tường ở hành lang
  const px = P.x, pz = P.z;
  box(L, px, FL + 0.45, pz, 2.8, 0.9, 0.55, '#e6e1d6'); box(L, px, FL + 0.92, pz, 2.9, 0.05, 0.62, '#b98a52');
  box(L, px - 0.7, FL + 1.15, pz, 0.38, 0.42, 0.34, '#7b2d2d'); box(L, px - 0.7, FL + 1.02, pz - 0.18, 0.1, 0.12, 0.03, '#d9d2c5');
  box(L, px - 0.7, FL + 1.38, pz, 0.3, 0.04, 0.26, '#2a2f36'); box(L, px - 0.7, FL + 1.2, pz - 0.175, 0.05, 0.05, 0.01, '#5cf2c4', 1);
  box(L, px + 0.8, FL + 1.35, pz, 0.38, 0.95, 0.38, '#f1f4f6'); cyl(L, px + 0.8, FL + 1.98, pz, 0.15, 0.3, '#7fc4f0');
  for (let i = 0; i < 4; i++) cyl(L, px + 0.05 + i * 0.16, FL + 0.99, pz, 0.04, 0.09, i % 2 ? '#ffffff' : '#e9d9c4');
  box(L, px, FL + 0.018, pz - 0.75, 2.6, 0.01, 0.9, '#cfd6dc');
}

/* ---------- danh sách đồ vật cố định theo từng phòng (một nguồn dữ liệu cho cả vẽ và vật cản) ---------- */
function itemsFor(def) {
  const w = def.w, I = [], add = (t, x, z, ww, dd, extra = {}) => I.push({ t, x, z, w: ww, d: dd, ...extra });
  const plantAt = (x, z) => add('plant', x, z, 0.5, 0.5);
  switch (def.kind) {
    case 'meeting':
      add('conf', 4.2, 5.2, 6, 1.3, { chairs: 3 }); add('rug', 4.2, 5.2, 7.6, 3.8, { block: false, col: '#5f7f93' });
      add('credenza', 4.2, 0.55, 2.8, 0.5); add('coat', 13.3, 0.7, 0.5, 0.5); add('boardS', 12.9, 4.4, 1.5, 0.4);
      plantAt(0.8, 8.2); plantAt(13.2, 8.2); add('globe', 12.8, 1.0, 0.5, 0.5);
      break;
    case 'ceo':
      add('conf', 7, 6.6, 5, 1.3, { chairs: 3 }); add('rug', 7, 6.6, 6.6, 3.6, { block: false, col: '#7a6aa8' });
      add('sofa', 2.3, 7.4, 2.2, 0.9, { col: '#6d5ef0' }); add('coffeeTable', 2.3, 5.9, 1.1, 0.6);
      add('trophy', 13.5, 5, 0.5, 4.2); plantAt(0.8, 1.4); plantAt(13.0, 8.2); add('globe', 12.6, 1.0, 0.5, 0.5);
      break;
    case 'library':
      add('shelfS', 7, 0.38, 12, 0.46); add('shelfW', 13.6, 5.4, 0.46, 6.5); add('shelfE', 0.4, 5.4, 0.46, 6.5);
      plantAt(1.0, 8.3); add('globe', 13.0, 8.2, 0.5, 0.5);
      break;
    case 'lounge':
      add('rug', 3.6, 4.6, 6.4, 3.8, { block: false, col: '#c9728f' }); add('rug', 9.5, 5.8, 4.2, 2.6, { block: false, col: '#4a7bd0' });
      add('bar', 9.5, 0.7, 4.4, 0.7); add('sofa', 3.6, 6.0, 2.6, 0.9, { col: '#e57fa8' }); add('coffeeTable', 3.6, 4.4, 1.2, 0.6);
      add('armchair', 1.4, 4.4, 0.9, 0.9, { col: '#f0955b' }); add('armchair', 5.8, 4.4, 0.9, 0.9, { col: '#5bb7a0' });
      add('vending', 13.2, 1.0, 0.9, 0.8); add('pingpong', 9.5, 5.8, 2.7, 1.5);
      add('beanbag', 1.6, 8.0, 0.8, 0.8, { col: '#7b8bd6' }); add('beanbag', 2.8, 7.9, 0.8, 0.8, { col: '#f4d35e' });
      plantAt(13.1, 8.2); plantAt(0.8, 1.4); plantAt(6.8, 8.3);
      break;
    default: {
      plantAt(w - 0.7, 8.2);
      if (def.kind === 'server') { add('rack', w - 0.7, 0.7, 0.8, 0.9); add('rack', w - 1.65, 0.7, 0.8, 0.9); }
      else if (def.kind === 'office') { plantAt(0.7, 8.2); add('boardE', 0.45, 4.4, 0.35, 1.5); add('printer', w - 0.7, 4.4, 0.8, 0.6); add('cabinet', w - 0.7, 0.5, 0.8, 0.5); }
      else { add('cooler', 0.5, 4.4, 0.45, 0.45); add('cabinet', w - 0.7, 0.5, 0.8, 0.5); plantAt(0.7, 8.2); }
    }
  }
  return I.map(it => ({ block: true, ...it }));
}
function drawItem(L, it, x0, z0) {
  const x = x0 + it.x, z = z0 + it.z;
  switch (it.t) {
    case 'plant': return plant(L, x, z);
    case 'rack': return rack(L, x, z);
    case 'conf': return confTable(L, x, z, it.w, it.chairs);
    case 'rug': return box(L, x, FL + 0.022, z, it.w, 0.012, it.d, it.col);
    case 'credenza': return credenza(L, x, z, it.w);
    case 'coat': return coatRack(L, x, z);
    case 'boardS': return box(L, x, FL + 0.9, z, 1.4, 1.5, 0.06, '#f4f6f8'), quad(L, x, FL + 0.95, z + 0.034, 1.3, 1.3, 0, UV.table, 1);
    case 'boardE': return boardEast(L, x, z);
    case 'globe': return globe(L, x, z);
    case 'sofa': return sofa(L, x, z, it.w, it.col);
    case 'armchair': return sofa(L, x, z, it.w, it.col);
    case 'coffeeTable': return coffeeTable(L, x, z, it.w, it.d);
    case 'trophy': return trophyCase(L, x, z, it.d);   // dọc theo trục z
    case 'shelfS': return shelf(L, x, z, it.w, 'S');
    case 'shelfW': return shelf(L, x, z, it.d, 'W');
    case 'shelfE': return shelf(L, x, z, it.d, 'E');
    case 'bar': return bar(L, x, z, it.w);
    case 'vending': return vending(L, x, z);
    case 'pingpong': return pingpong(L, x, z);
    case 'beanbag': return beanbag(L, x, z, it.col);
    case 'cabinet': return cabinet(L, x, z);
    case 'printer': return printer(L, x, z);
    case 'cooler': return cooler(L, x, z);
  }
}

// Dựng toàn bộ phần tĩnh bên trong toà nhà. opts.colors: màu phòng ban theo mã; opts.occupied: số bàn có người ngồi theo phòng.
export function buildStatic(L, opts = {}) {
  const colors = opts.colors || {}, rooms = [], slots = [], walls = [], sconces = [];
  box(L, W / 2, Y0 / 2, D / 2, W + 1.2, Y0, D + 1.2, '#f3f5f7');             // nền toà nhà
  box(L, W / 2, 0.07, D / 2, W + 1.5, 0.14, D + 1.5, '#d3d9df');
  const byRow = [0, 1, 2].map(r => ROOM_DEFS.filter(d => d.row === r));
  // Sàn hành lang: các mảng RIÊNG, không phủ dưới sàn phòng. Nếu phủ chồng lên thì hai mặt sàn khác màu nằm cùng một độ cao
  // và giành nhau từng điểm ảnh (nháy chớp khi camera di chuyển).
  const slab = (x0, x1, z0, z1) => box(L, (x0 + x1) / 2, FL - 0.04, (z0 + z1) / 2, x1 - x0, 0.08, z1 - z0, '#dfe3e8');
  slab(0, W, RD, ROW_Z[1]); slab(0, W, ROW_Z[1] + RD, ROW_Z[2]);                // hai hành lang ngang
  byRow.forEach((list, r) => {                                                   // hành lang dọc: các khoảng hở giữa các phòng trong từng hàng
    let end = 0;
    for (const d of [...list].sort((a, b) => a.x - b.x)) { if (d.x > end + 1e-9) slab(end, d.x, ROW_Z[r], ROW_Z[r] + RD); end = d.x + d.w; }
    if (end < W - 1e-9) slab(end, W, ROW_Z[r], ROW_Z[r] + RD);
  });
  // vạch giữa hành lang
  for (const zc of CORR_Z) for (let x = 1; x < W - 0.5; x += 1.6) box(L, x + 0.4, FL + 0.006, zc, 0.8, 0.012, 0.07, '#f2d36b');
  for (const xv of V_X) for (let z = 1; z < D - 0.5; z += 1.6) if (!CORR_Z.some(c => Math.abs(z + 0.4 - c) < 1.6)) box(L, xv, FL + 0.006, z + 0.4, 0.07, 0.012, 0.8, '#f2d36b');

  ROOM_DEFS.forEach(def => {
    const R = roomBox(def); rooms.push(R);
    const { x0, z0, w, d, cx, cz } = R, accent = colors[def.code] || '#6d5ef0';
    const heavy = def.kind === 'meeting' || def.kind === 'ceo', lounge = def.kind === 'lounge';
    box(L, cx, FL - 0.04, cz, w, 0.08, d, lounge ? '#e8d3a8' : WOOD);                   // sàn gỗ
    if (!lounge) {
      box(L, cx, FL + 0.01, cz + 0.2, w - 1.4, 0.02, d - 1.8, heavy ? '#4a7580' : '#3b8a8d');   // thảm
      const rx = (w - 1.4) / 2 - 0.15, rz = (d - 1.8) / 2 - 0.15;
      cyl(L, cx, FL + 0.05, cz + 0.2, rx - 0.14, 0.02, heavy ? '#4a7580' : '#3b8a8d', 0, rz - 0.14);   // phần giữa của vòng sáng
      R.ring = { x: cx, y: FL + 0.035, z: cz + 0.2, rx, rz };
    } else R.ring = null;
    box(L, cx, FL + 0.03, z0 + d - 0.14, w - 1.2, 0.02, 0.16, accent);                   // vạch màu nhận diện phòng ở mép trước

    // vách bên: giữa hai phòng liền kề là vách cao (do phòng phía đông sở hữu); cạnh hành lang dọc hoặc ngoài rìa thì vách thấp / tường động
    const west = byRow[def.row].find(r => r.x + r.w === def.x), eastNb = byRow[def.row].find(r => r.x === def.x + def.w);
    if (def.x === 0) walls.push({ id: 'W' + def.code, cx: -WT / 2, cz, sx: WT, sz: d, n: [-1, 0], f: 1, att: [] });
    else if (west) {
      box(L, def.x, Y0 + WALL_H / 2, cz, WT, WALL_H, d, WHITE); box(L, def.x, Y0 + WALL_H + 0.035, cz, WT + 0.05, 0.07, d + 0.05, CAP); R.tallWest = true;
      for (const z of [z0 + 2.3, z0 + 6.7]) for (const side of [-1, 1]) {      // đèn tường hai mặt vách: sáng cả ngày lẫn đêm, ban đêm có quầng sáng
        const bx = def.x + side * (WT / 2 + 0.07);
        box(L, bx, Y0 + 2.1, z, 0.14, 0.26, 0.22, '#fff1c9', 1); box(L, def.x + side * (WT / 2 + 0.02), Y0 + 1.94, z, 0.05, 0.05, 0.12, '#3a444c');
        sconces.push({ x: def.x + side * (WT / 2 + 0.14), y: Y0 + 2.1, z, side, px: def.x + side * (WT / 2 + 0.02) });
      }
    }
    else { box(L, def.x, Y0 + LOW_H / 2, cz, WT, LOW_H, d, WHITE); box(L, def.x, Y0 + LOW_H + 0.03, cz, WT + 0.05, 0.06, d + 0.05, CAP); }
    if (def.x + w === W) walls.push({ id: 'E' + def.code, cx: W + WT / 2, cz, sx: WT, sz: d, n: [1, 0], f: 1, att: [] });
    else if (!eastNb) { box(L, def.x + w, Y0 + LOW_H / 2, cz, WT, LOW_H, d, WHITE); box(L, def.x + w, Y0 + LOW_H + 0.03, cz, WT + 0.05, 0.06, d + 0.05, CAP); }
    if (R.tallWest) {                                                                     // tranh treo trên vách cao
      const pu = [UV.poster1, UV.poster2, UV.poster3][(def.code.charCodeAt(def.code.length - 1)) % 3];
      quad(L, def.x + WT / 2 + 0.01, Y0 + 1.85, z0 + 4.6, 0.95, 1.2, Math.PI / 2, pu, 1);
    }

    // tường bắc (động: hạ thấp khi camera ở phía sau). Hàng 2 chừa cửa ở mép trái để đi ra hành lang C2.
    const door = def.row === 2 ? DOOR_W : 0;
    const px0 = x0 + door, px1 = x0 + w + WT / 2, pcx = (px0 + px1) / 2, pw = px1 - px0;
    const att = [{ t: 'strip', x: pcx, y: Y0 + WALL_H - 0.12, z: z0 + 0.04, w: pw - 0.6 }];
    att.push({ t: 'quad', x: Math.min(px1 - 0.6, pcx + pw / 2 - 0.6), y: Y0 + 2.55, z: z0 + 0.03, w: 0.42, h: 0.42, uv: UV.clock });
    const sc = def.kind === 'meeting' ? [['dash', x0 + 4.2, 3.0, 1.7], ['code', x0 + 10.4, 3.4, 1.9]]
      : def.kind === 'ceo' ? [['dash', pcx, 3.4, 2.0]]
      : def.kind === 'lounge' ? [['dash', x0 + 5, 4.2, 2.2]]
      : def.kind === 'library' ? []
      : [[def.board, pcx, Math.min(3.4, pw - 1.4), 1.9]];
    sc.forEach(([u, x, ww, hh]) => att.push({ t: 'quad', x, y: Y0 + 1.75, z: z0 + 0.03, w: ww, h: hh, uv: UV[u] }));
    walls.push({ id: 'N' + def.code, cx: pcx, cz: z0 - WT / 2, sx: pw, sz: WT, n: [0, -1], f: 1, att });

    // bàn ghế (ghế của người ngồi vẽ ở phần động)
    localSlots(def).forEach(([lx, lz], i) => {
      const x = x0 + lx, z = z0 + lz;
      desk(L, x, z);
      if (i >= (opts.occupied?.[def.code] || 0)) chair(L, x, z - SEAT_BACK, chairColor(def, i));
      slots.push({ room: def.code, idx: i, x, z });
    });
    itemsFor(def).forEach(it => drawItem(L, it, x0, z0));
  });

  PANTRIES.forEach(P => pantryCounter(L, P));
  return { rooms, slots, walls, sconces };
}

// Các vật cản trên mặt sàn (hình chữ nhật trục x, z) để kiểm tra đường đi không xuyên qua đồ đạc.
export function colliders() {
  const out = [], R = (name, x0, x1, z0, z1) => out.push({ name, x0, x1, z0, z1 });
  const byRow = [0, 1, 2].map(r => ROOM_DEFS.filter(d => d.row === r));
  ROOM_DEFS.forEach(def => {
    const b = roomBox(def), { x0, z0, w, d } = b;
    const west = byRow[def.row].find(r => r.x + r.w === def.x), eastNb = byRow[def.row].find(r => r.x === def.x + def.w);
    if (def.x === 0) R('tường tây ' + def.code, -WT, 0, z0, z0 + d); else R('vách ' + def.code, def.x - WT / 2, def.x + WT / 2, z0, z0 + d);
    if (def.x + w === W) R('tường đông ' + def.code, W, W + WT, z0, z0 + d); else if (!eastNb) R('vách đông ' + def.code, def.x + w - WT / 2, def.x + w + WT / 2, z0, z0 + d);
    void west;
    const door = def.row === 2 ? DOOR_W : 0;
    R('tường bắc ' + def.code, x0 + door, x0 + w + WT / 2, z0 - WT, z0);
    localSlots(def).forEach(([lx, lz]) => R(`bàn ${def.code}`, x0 + lx - 0.75, x0 + lx + 0.75, z0 + lz - 0.375, z0 + lz + 0.375));
    itemsFor(def).forEach(it => {
      if (!it.block) return;
      const hw = it.t === 'plant' || it.t === 'globe' || it.t === 'coat' ? 0.25 : it.w / 2, hd = it.t === 'plant' || it.t === 'globe' || it.t === 'coat' ? 0.25 : it.d / 2;
      R(it.t + ' ' + def.code, x0 + it.x - hw, x0 + it.x + hw, z0 + it.z - hd, z0 + it.z + hd);
    });
  });
  PANTRIES.forEach(P => R('quầy cà phê ' + P.id, P.x - 1.45, P.x + 1.45, P.z - 0.31, P.z + 0.31));
  return out;
}

// Phần tường thay đổi theo góc nhìn: f = 1 cao đủ, f = 0 hạ thấp để không che khi nhìn từ phía sau.
export function drawWalls(L, walls) {
  for (const wl of walls) {
    const h = 0.5 + (WALL_H - 0.5) * wl.f, y = Y0 + h / 2;
    box(L, wl.cx, y, wl.cz, wl.sx, h, wl.sz, WHITE);
    box(L, wl.cx, Y0 + h + 0.035, wl.cz, wl.sx + 0.05, 0.07, wl.sz + 0.05, CAP);
    if (wl.f < 0.7) continue;
    for (const a of wl.att) {
      if (a.t === 'strip') box(L, a.x, a.y, a.z, a.w, 0.05, 0.03, '#fff6dc', 1);
      else quad(L, a.x, a.y, a.z, a.w, a.h, 0, a.uv, 1);
    }
  }
}