import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPARTMENTS, AGENTS } from '../src/seed.js';
import { mat4, v3 } from '../public/js/gl/math.js';
import { buildMeshes, Layer } from '../public/js/gl/engine.js';
import { between } from '../public/js/gl/shapes.js';
import { buildStatic, drawWalls, ROOM_DEFS, localSlots, roomBox, W, D, RD, WALL_H, V_X } from '../public/js/gl/building.js';
import { drawPerson, makeLook } from '../public/js/gl/people.js';

const near = (a, b, e = 1e-4) => Math.abs(a - b) < e;

test('hình cơ bản: mặt trước quay ra ngoài, pháp tuyến đơn vị, chỉ số hợp lệ', () => {
  for (const [name, g] of Object.entries(buildMeshes())) {
    const n = g.pos.length / 3;
    for (const i of g.idx) assert.ok(i < n, `${name}: chỉ số vượt đỉnh`);
    for (let i = 0; i < n; i++) assert.ok(near(Math.hypot(g.nor[i * 3], g.nor[i * 3 + 1], g.nor[i * 3 + 2]), 1, 1e-3), `${name}: pháp tuyến không đơn vị`);
    for (let i = 0; i < g.idx.length; i += 3) {
      const [a, b, c] = [g.idx[i] * 3, g.idx[i + 1] * 3, g.idx[i + 2] * 3];
      const nn = v3.cross([g.pos[b] - g.pos[a], g.pos[b + 1] - g.pos[a + 1], g.pos[b + 2] - g.pos[a + 2]], [g.pos[c] - g.pos[a], g.pos[c + 1] - g.pos[a + 1], g.pos[c + 2] - g.pos[a + 2]]);
      if (v3.len(nn) < 1e-9) continue;                 // tam giác suy biến ở cực cầu
      assert.ok(v3.dot(nn, [g.nor[a] + g.nor[b] + g.nor[c], g.nor[a + 1] + g.nor[b + 1] + g.nor[c + 1], g.nor[a + 2] + g.nor[b + 2] + g.nor[c + 2]]) > 0, `${name}: tam giác ngược mặt`);
    }
  }
});

test('toán ma trận: nghịch đảo, phép chiếu và lookAt nhất quán', () => {
  const proj = mat4.perspective(mat4.create(), 0.56, 1.6, 0.4, 400), view = mat4.lookAt(mat4.create(), [30, 40, 50], [26, 0, 10], [0, 1, 0]);
  const vp = mat4.mul(mat4.create(), proj, view), inv = mat4.invert(mat4.create(), vp), id = mat4.mul(mat4.create(), vp, inv);
  for (let i = 0; i < 16; i++) assert.ok(near(id[i], i % 5 === 0 ? 1 : 0, 1e-3), `phần tử ${i}`);
  const c = mat4.transform(vp, [26, 0, 10]);                       // điểm nhìn tới phải nằm giữa màn hình
  assert.ok(near(c[0] / c[3], 0, 1e-4) && near(c[1] / c[3], 0, 1e-4) && c[3] > 0);
  const behind = mat4.transform(vp, [32, 60, 70]);                 // điểm nằm sau lưng camera (xa hơn mắt, cùng hướng) phải có w < 0
  assert.ok(behind[3] < 0, 'điểm sau camera phải có w âm để nhãn không hiện nhầm');
  const front = mat4.transform(vp, [20, 2, 5]);
  assert.ok(front[3] > 0);
  const t = mat4.trs(mat4.create(), 1, 2, 3, Math.PI / 2, 2, 3, 4), p = mat4.transform(t, [1, 0, 0]);
  assert.ok(near(p[0], 1, 1e-5) && near(p[1], 2, 1e-5) && near(p[2], 1, 1e-5), 'xoay 90 độ quanh trục dọc, kéo giãn x');
});

test('trụ nối hai điểm: hai đầu trụ trùng đúng hai điểm', () => {
  const L = new Layer(8), a = [1, 0.5, 2], b = [3, 2, 1];
  between(L, a, b, 0.07, '#ffffff');
  const m = L.cyl.data.subarray(0, 16);
  const top = mat4.transform(m, [0, 0.5, 0]), bot = mat4.transform(m, [0, -0.5, 0]);
  for (let i = 0; i < 3; i++) { assert.ok(near(top[i], b[i], 1e-5)); assert.ok(near(bot[i], a[i], 1e-5)); }
  const side = mat4.transform(m, [0.5, 0, 0]); // bán kính đúng 0.07
  const mid = mat4.transform(m, [0, 0, 0]);
  assert.ok(near(Math.hypot(side[0] - mid[0], side[1] - mid[1], side[2] - mid[2]), 0.07, 1e-5));
});

test('bố cục toà nhà: đủ 14 phòng nằm trong nền, không đè lên nhau, ba hàng có chung hai hành lang dọc', () => {
  assert.equal(ROOM_DEFS.length, 14);
  const codes = new Set(ROOM_DEFS.map(r => r.code));
  for (const d of DEPARTMENTS) assert.ok(codes.has(d.code), `thiếu phòng ${d.code}`);
  assert.ok(codes.has('CEO') && codes.has('LNG'));
  assert.deepEqual([...new Set(ROOM_DEFS.map(r => r.row))].sort(), [0, 1, 2]);
  const rooms = ROOM_DEFS.map(roomBox);
  for (const r of rooms) assert.ok(r.x0 >= 0 && r.x0 + r.w <= W + 1e-9 && r.z0 >= 0 && r.z0 + r.d <= D, `${r.code} nằm ngoài nền`);
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    assert.ok(a.x0 + a.w <= b.x0 + 1e-9 || b.x0 + b.w <= a.x0 + 1e-9 || a.z0 + a.d <= b.z0 || b.z0 + b.d <= a.z0, `${a.code} chồng ${b.code}`);
  }
  for (const row of [0, 1, 2]) {                                // mỗi hàng: phủ kín bề ngang trừ đúng hai khe hành lang dọc
    const list = ROOM_DEFS.filter(r => r.row === row).sort((a, b) => a.x - b.x);
    const gaps = []; let end = 0;
    for (const r of list) { if (r.x > end + 1e-9) gaps.push([end, r.x]); end = r.x + r.w; }
    assert.equal(end, W, `hàng ${row} không phủ tới mép`);
    assert.deepEqual(gaps.map(g => (g[0] + g[1]) / 2), V_X, `hàng ${row}: khe hành lang dọc lệch`);
  }
});

test('chỗ ngồi: đủ cho từng phòng ban, nằm trong phòng, không chồng nhau', () => {
  for (const def of ROOM_DEFS) {
    const slots = localSlots(def);
    if (def.code !== 'CEO' && def.code !== 'LNG') assert.ok(slots.length >= AGENTS.filter(a => a.dept === def.code).length, `phòng ${def.code} thiếu bàn`);
    for (const [x, z] of slots) {
      assert.ok(x >= 0.9 && x <= def.w - 0.9, `phòng ${def.code}: bàn lệch ngang (${x})`);
      assert.ok(z >= 1.6 && z <= RD - 0.7, `phòng ${def.code}: bàn lệch dọc (${z})`);
    }
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
      const dx = Math.abs(slots[i][0] - slots[j][0]), dz = Math.abs(slots[i][1] - slots[j][1]);
      assert.ok(dx >= 1.6 || dz >= 1.4, `phòng ${def.code}: bàn ${i} và ${j} chồng nhau`);
    }
  }
  const total = ROOM_DEFS.filter(r => r.code !== 'CEO' && r.code !== 'LNG').reduce((n, r) => n + localSlots(r).length, 0);
  assert.ok(total >= 26);
});

test('dựng cảnh tĩnh: số bàn khớp, không có số lỗi trong ma trận', () => {
  const L = new Layer(512), B = buildStatic(L, {});
  assert.equal(B.rooms.length, 14);
  assert.equal(B.slots.length, ROOM_DEFS.reduce((n, r) => n + localSlots(r).length, 0));
  for (const name of ['box', 'cyl', 'sph', 'quad']) {
    const b = L[name];
    for (let i = 0; i < b.n * 24; i++) assert.ok(Number.isFinite(b.data[i]), `${name}: số không hợp lệ ở ${i}`);
  }
  assert.ok(L.box.n > 1500);
  const wallIds = B.walls.map(w => w.id);
  assert.equal(new Set(wallIds).size, wallIds.length, 'mã tường trùng nhau');
  assert.equal(B.walls.filter(w => w.n[1] === -1).length, 14, 'mỗi phòng có một tường bắc');
});

test('tường động: hạ thấp thì thấp đi và ẩn màn hình gắn tường', () => {
  const B = buildStatic(new Layer(512), {});
  const up = new Layer(64), down = new Layer(64);
  B.walls.forEach(w => { w.f = 1; }); drawWalls(up, B.walls);
  B.walls.forEach(w => { w.f = 0; }); drawWalls(down, B.walls);
  assert.ok(up.quad.n > 0 && down.quad.n === 0, 'màn hình phải ẩn khi tường hạ');
  const topY = l => { let m = 0; for (let i = 0; i < l.box.n; i++) m = Math.max(m, l.box.data[i * 24 + 13] + l.box.data[i * 24 + 5] / 2); return m; };
  assert.ok(topY(down) < topY(up) - 1.5, 'tường hạ phải thấp hơn rõ');
  assert.ok(topY(up) <= 0.3 + WALL_H + 0.1);
});

test('nhân vật: ba tư thế đều dựng được, nằm gọn quanh vị trí đứng', () => {
  for (const pose of ['sit', 'stand', 'walk']) for (const work of [false, true]) {
    const L = new Layer(64);
    drawPerson(L, { x: 10, y: 0.38, z: 5, heading: 0.7, pose, t: 3.3, work, look: makeLook(7, '#6d5ef0', false), speed: 1.4 });
    const n = L.box.n + L.cyl.n + L.sph.n;
    assert.ok(n >= 18, `${pose}: quá ít bộ phận (${n})`);
    for (const name of ['box', 'cyl', 'sph']) for (let i = 0; i < L[name].n; i++) {
      const o = i * 24, x = L[name].data[o + 12], y = L[name].data[o + 13], z = L[name].data[o + 14];
      assert.ok([x, y, z].every(Number.isFinite), `${pose}: toạ độ hỏng`);
      assert.ok(Math.abs(x - 10) < 1.3 && Math.abs(z - 5) < 1.3, `${pose}: bộ phận ${name} rơi xa người (${x.toFixed(2)}, ${z.toFixed(2)})`);
      assert.ok(y > 0.2 && y < 2.2, `${pose}: bộ phận ${name} lệch độ cao (${y.toFixed(2)})`);
    }
  }
});

test('ngoại hình cố định theo từng người, khác nhau giữa các người', () => {
  assert.deepEqual(makeLook(5, '#336699', false), makeLook(5, '#336699', false));
  const set = new Set(AGENTS.map((_, i) => JSON.stringify(makeLook(i + 1, '#336699', false))));
  assert.ok(set.size >= 20, `chỉ ${set.size} kiểu khác nhau trên ${AGENTS.length} người`);
  assert.equal(makeLook(-1, '#000000', true).lead, true);
});