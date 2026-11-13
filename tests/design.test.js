// Các quy tắc thiết kế ràng buộc giữa máy chủ (số người, giới hạn mượn) và sơ đồ toà nhà (số bàn).
import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS, COURIER_TITLES } from '../src/seed.js';
import { BORROW_CAP, MAX_BORROWED } from '../src/sim.js';
import { ROOM_DEFS, localSlots } from '../public/js/gl/building.js';

test('giới hạn mượn người của mỗi phòng không vượt số bàn trống trong sơ đồ toà nhà', () => {
  for (const [code, cap] of Object.entries(BORROW_CAP)) {
    const def = ROOM_DEFS.find(r => r.code === code), home = AGENTS.filter(a => a.dept === code).length;
    assert.ok(def, `phòng ${code} không có trong sơ đồ`);
    assert.ok(cap <= localSlots(def).length - home, `phòng ${code}: cho mượn ${cap} người nhưng chỉ còn ${localSlots(def).length - home} bàn trống`);
  }
  assert.ok(MAX_BORROWED <= 4);
  for (const code of ['01', '09']) assert.ok(!BORROW_CAP[code], `phòng ${code} kín bàn, không được mượn người vào`);
});

test('đúng hai điều phối viên, mỗi người một phòng, không ai là trưởng phòng', () => {
  const c = AGENTS.filter(a => COURIER_TITLES.includes(a.title));
  assert.equal(c.length, 2);
  assert.deepEqual(c.map(a => a.dept).sort(), ['01', '04']);
  assert.ok(c.every(a => !a.lead));
  assert.equal(AGENTS.length, 26);
});