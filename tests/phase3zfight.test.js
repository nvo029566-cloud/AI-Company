// Chống nhấp nháy do hai mặt phẳng khác màu nằm trùng nhau (z-fighting): khi camera di chuyển, chúng giành nhau từng điểm ảnh.
// Quét toàn bộ khối hộp và mặt trên của trụ trong cảnh, tìm các cặp cùng hướng, cùng độ cao (sai số 4 mm), chồng nhau và khác màu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Layer } from '../public/js/gl/engine.js';
import { buildStatic, drawWalls, chair, chairColor, ROOM_DEFS, SEAT_BACK } from '../public/js/gl/building.js';
import { buildOutside } from '../public/js/gl/world.js';
import { box } from '../public/js/gl/shapes.js';
import { findZFights } from './helpers/zfight.js';

const FLOOR_TOP = 0.381;                               // mặt sàn các phòng ở độ cao 0,38
const describe = r => r.map(f => `${f.a} x ${f.b} mặt ${f.ax === 2 ? 'ngang' : f.ax === 1 ? 'x' : 'z'}${f.dir > 0 ? '+' : '-'} @${f.y.toFixed(3)} (${f.area.toFixed(3)} m²)`).join('\n  ');

test('cảnh tĩnh (toà nhà, đồ đạc, đường, công trình): không có hai mặt khác màu trùng nhau', () => {
  const L = new Layer(512); buildStatic(L, {}); buildOutside(L);
  assert.ok(L.box.n > 2000, 'cảnh phải có đủ khối để phép quét có ý nghĩa');
  const r = findZFights(L, { minY: FLOOR_TOP });
  assert.equal(r.length, 0, `${r.length} cặp trùng mặt:\n  ${describe(r.slice(0, 12))}`);
});

test('sàn: sàn hành lang không phủ chồng lên sàn các phòng', () => {
  const L = new Layer(512); buildStatic(L, {});
  const top = 0.38, floors = [];                       // mặt sàn nằm ở độ cao FL
  for (let i = 0; i < L.box.n; i++) {
    const o = i * 24, d = L.box.data;
    if (Math.abs(d[o + 13] + d[o + 5] / 2 - top) < 1e-4 && d[o + 5] > 0.07 && d[o + 5] < 0.09) floors.push({ x0: d[o + 12] - d[o] / 2, x1: d[o + 12] + d[o] / 2, z0: d[o + 14] - d[o + 10] / 2, z1: d[o + 14] + d[o + 10] / 2 });
  }
  assert.ok(floors.length >= ROOM_DEFS.length + 2, `chỉ thấy ${floors.length} mảng sàn`);
  for (let i = 0; i < floors.length; i++) for (let j = i + 1; j < floors.length; j++) {
    const a = floors[i], b = floors[j], w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    assert.ok(w <= 1e-6 || h <= 1e-6, `hai mảng sàn chồng nhau ${w.toFixed(2)} x ${h.toFixed(2)} m tại (${Math.max(a.x0, b.x0).toFixed(1)}, ${Math.max(a.z0, b.z0).toFixed(1)})`);
  }
});

test('phần động (tường ở cả hai trạng thái, ghế) không trùng mặt với cảnh tĩnh', () => {
  for (const f of [1, 0]) {
    const L = new Layer(512), B = buildStatic(L, {}); buildOutside(L);
    B.walls.forEach(w => { w.f = f; });
    drawWalls(L, B.walls);
    for (const s of B.slots) { const def = ROOM_DEFS.find(d => d.code === s.room); chair(L, s.x, s.z - SEAT_BACK, chairColor(def, s.idx)); }
    const r = findZFights(L, { minY: FLOOR_TOP });
    assert.equal(r.length, 0, `tường f=${f}: ${r.length} cặp trùng mặt:\n  ${describe(r.slice(0, 12))}`);
  }
});

test('bộ dò có hiệu lực: phát hiện hai sàn khác màu chồng nhau, và bỏ qua hai sàn cùng màu', () => {
  const A = new Layer(64); box(A, 0, 0.34, 0, 10, 0.08, 10, '#dfe3e8'); box(A, 0, 0.34, 0, 4, 0.08, 4, '#dfb97c');
  assert.equal(findZFights(A).length, 1, 'phải thấy 1 cặp trùng mặt');
  const B = new Layer(64); box(B, 0, 0.34, 0, 10, 0.08, 10, '#dfe3e8'); box(B, 0, 0.34, 0, 4, 0.08, 4, '#dfe3e8');
  assert.equal(findZFights(B).length, 0, 'cùng màu thì không nhấp nháy');
  const C = new Layer(64); box(C, 0, 0.34, 0, 10, 0.08, 10, '#dfe3e8'); box(C, 0, 0.36, 0, 4, 0.08, 4, '#dfb97c');   // cao hơn 2 cm: tách bạch
  assert.equal(findZFights(C).length, 0, 'cách nhau 2 cm thì không trùng');
});