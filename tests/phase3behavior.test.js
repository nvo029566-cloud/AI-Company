import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPARTMENTS, AGENTS, COURIER_TITLES } from '../src/seed.js';
import { Layer } from '../public/js/gl/engine.js';
import { buildStatic, colliders, ROOM_DEFS, MEET_SEATS, PANTRIES, W, D, CORR_Z } from '../public/js/gl/building.js';
import { createPeople, Director, route, pathLength, applySim } from '../public/js/gl/behavior.js';
import { seeded } from '../public/js/gl/people.js';

const agents = AGENTS.map((a, i) => ({ id: i + 1, name: a.name, deptCode: a.dept, isLead: !!a.lead, courier: COURIER_TITLES.includes(a.title) }));
const world = () => { const B = buildStatic(new Layer(512), {}); return { B, people: createPeople(B, agents, {}, 7) }; };
const COL = colliders();
const SB = buildStatic(new Layer(512), {});                 // sơ đồ dùng chung (bàn, phòng) cho các Director trong bài kiểm thử
class TestDirector extends Director { constructor(o) { super({ slots: SB.slots, rooms: SB.rooms, ...o }); } }
const hit = (x, z, m = 0.1) => COL.find(c => x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m);
function firstHit(start, pts) {
  let l = start;
  for (const p of pts) {
    const len = Math.hypot(p[0] - l[0], p[1] - l[1]), n = Math.max(1, Math.ceil(len / 0.1));
    for (let i = 0; i <= n; i++) { const x = l[0] + (p[0] - l[0]) * i / n, z = l[1] + (p[1] - l[1]) * i / n, h = hit(x, z); if (h) return `${h.name} tại (${x.toFixed(2)}, ${z.toFixed(2)})`; }
    l = p;
  }
  return null;
}
const spotOf = q => ({ t: 'spot', R: q.room, xa: q.xa, z: q.seat.z, face: [q.seat.x, q.seat.z] });

test('có đủ người và mọi chỗ ngồi, chỗ đứng đều không nằm trong vật cản', () => {
  const { people } = world();
  assert.equal(people.length, 27);
  for (const p of people) {
    assert.ok(!hit(p.seat.x, p.seat.z, 0.05), `${p.ref.name}: chỗ ngồi nằm trong ${hit(p.seat.x, p.seat.z, 0.05)?.name}`);
    assert.ok(!hit(p.xa, p.seat.z, 0.1), `${p.ref.name}: lối đi cạnh bàn bị chắn`);
  }
  for (const s of MEET_SEATS) assert.ok(!hit(s.x, s.z, 0.05), 'ghế họp nằm trong vật cản');
  for (const P of PANTRIES) for (const [x, z] of P.spots) assert.ok(!hit(x, z, 0.1), `chỗ đứng quầy cà phê ${P.id} bị chắn`);
});

test('đường từ mọi bàn tới quầy cà phê, ghế họp và chỗ trưởng các phòng đều không xuyên đồ đạc', () => {
  const { people } = world();
  let routes = 0;
  const leads = people.filter(p => p.ref.isLead || p.ref.ceo);
  for (const p of people) {
    const here = { t: 'seat', p }, start = [p.seat.x, p.seat.z];
    const targets = [
      ...PANTRIES.flatMap((P, k) => P.spots.map((_, i) => ({ name: `quầy ${k}.${i}`, pl: { t: 'pantry', k, i } }))),
      ...MEET_SEATS.map((seat, i) => ({ name: 'ghế họp ' + i, pl: { t: 'chair', seat } })),
      ...leads.filter(q => q !== p).map(q => ({ name: 'chỗ ' + q.ref.name, pl: spotOf(q) }))
    ];
    for (const t of targets) {
      for (const off of [-0.28, 0, 0.28]) {
        const there = route(here, t.pl, off), back = route(t.pl, here, off);
        const bad = firstHit(start, there) || firstHit(typeof t.pl === 'object' ? (t.pl.t === 'pantry' ? PANTRIES[t.pl.k].spots[t.pl.i] : t.pl.t === 'chair' ? [t.pl.seat.x, t.pl.seat.z] : [t.pl.xa, t.pl.z]) : start, back);
        assert.equal(bad, null, `${p.ref.name} → ${t.name} (lệch ${off}): vướng ${bad}`);
        for (const [x, z] of [...there, ...back]) assert.ok(x > 0 && x < W && z > -0.5 && z < D, `${p.ref.name} → ${t.name}: điểm ngoài toà nhà (${x}, ${z})`);
        routes++;
      }
    }
  }
  assert.ok(routes > 1500, `chỉ kiểm ${routes} tuyến`);
});

test('đi qua cửa: từ phòng hàng 2 ra hành lang phải qua đúng khe cửa ở tường bắc', () => {
  const { people } = world();
  const p = people.find(q => q.room.code === '09');             // hàng 2: tường bắc ở z = 24, cửa hở ở mép trái
  const pts = route({ t: 'seat', p }, { t: 'pantry', k: 1, i: 0 }, 0);
  const door = pts.filter(q => Math.abs(q[1] - (p.room.z0 - 0.5)) < 1e-6);
  assert.ok(door.length >= 1 && door[0][0] > p.room.x0 + 0.2 && door[0][0] < p.room.x0 + 1.5, `điểm qua cửa ở ${door[0]?.[0]}`);
  assert.ok(pathLength([p.seat.x, p.seat.z], pts) < 90);
});

test('đi giữa hai hành lang: từ phòng hàng 0 xuống phòng hàng 2 phải đi qua một hành lang dọc', () => {
  const { people } = world();
  const a = people.find(q => q.room.code === '02'), b = people.find(q => q.room.code === '10');
  const pts = route({ t: 'seat', p: a }, { t: 'seat', p: b }, 0);
  const viaV = pts.some(q => Math.abs(q[0] - 15.5) < 0.6 || Math.abs(q[0] - 32.5) < 0.6);
  assert.ok(viaV, 'phải đi qua hành lang dọc');
  assert.ok(pts.some(q => Math.abs(q[1] - CORR_Z[0]) < 0.4) && pts.some(q => Math.abs(q[1] - CORR_Z[1]) < 0.4), 'phải qua cả hai hành lang ngang');
  assert.equal(firstHit([a.seat.x, a.seat.z], pts), null);
});

function runDirector(seed, secs, speed = 1, hook) {
  const { people } = world();
  const d = new TestDirector({ people, rng: seeded(seed), getSpeed: () => speed });
  const kinds = {};
  for (let t = 0; t < secs; t += 0.05) {
    d.update(0.05);
    for (const p of people) if (p.script) kinds[p.script.kind] = (kinds[p.script.kind] || 0) + 0;
    hook?.(d, people, t);
  }
  return { d, people, kinds };
}

test('mô phỏng 10 phút: không ai xuyên đồ đạc, không ra ngoài toà nhà, đủ loại hành động, không kẹt', () => {
  const seen = new Set(), streak = new Map(); let maxAway = 0, maxPantry = 0;
  const { people, d } = runDirector(11, 600, 1, (dir, ps, t) => {
    if (Math.round(t * 20) % 5) return;                          // mỗi 0,25 giây
    let away = 0;
    for (const p of ps) {
      const P = p.P;
      assert.ok(Number.isFinite(P.x) && Number.isFinite(P.z) && Number.isFinite(P.heading), `${p.ref.name}: toạ độ hỏng`);
      assert.ok(P.x > 0 && P.x < W && P.z > -0.2 && P.z < D, `${p.ref.name} ra ngoài toà nhà (${P.x.toFixed(1)}, ${P.z.toFixed(1)}) lúc ${t.toFixed(0)}s`);
      assert.ok(P.sit >= -1e-9 && P.sit <= 1 + 1e-9 && P.walk >= -1e-9 && P.walk <= 1 + 1e-9, `${p.ref.name}: hệ số tư thế ngoài 0..1`);
      const h = hit(P.x, P.z, 0.06); assert.ok(!h, `${p.ref.name} xuyên ${h?.name} tại (${P.x.toFixed(2)}, ${P.z.toFixed(2)}) lúc ${t.toFixed(0)}s, bước ${p.cur?.k}`);
      if (p.script) seen.add(p.script.kind);
      if (p.mode !== 'seated') { away++; streak.set(p, (streak.get(p) || 0) + 0.25); assert.ok(streak.get(p) < 150, `${p.ref.name} vắng mặt quá lâu (${streak.get(p)}s), bước ${p.cur?.k}`); } else streak.set(p, 0);
    }
    maxAway = Math.max(maxAway, away); maxPantry = Math.max(maxPantry, dir.pantryTaken.size);
  });
  for (const k of ['coffee', 'chat', 'stretch', 'wander', 'meeting', 'micro']) assert.ok(seen.has(k), `chưa thấy hành động "${k}" (đã thấy: ${[...seen]})`);
  assert.ok(maxAway <= d.maxAway + 6, `quá nhiều người cùng rời bàn: ${maxAway}`);
  assert.ok(maxPantry <= 6);
});

test('mỗi chỗ ở quầy cà phê chỉ một người, họp không trùng ghế', () => {
  const { people } = world();
  const d = new TestDirector({ people, rng: seeded(5), ambient: false });
  assert.ok(d.startMeeting());
  const members = [...d.meeting.members];
  const seats = new Set();
  for (let t = 0; t < 150; t += 0.05) {
    d.update(0.05);
    for (const p of people) if (p.mode === 'table') { const k = `${p.P.x.toFixed(2)},${p.P.z.toFixed(2)}`; if (!seats.has(k)) seats.add(k); }
    const at = new Map();
    for (const p of people) if (p.mode === 'table') { const k = `${p.P.x.toFixed(1)},${p.P.z.toFixed(1)}`; assert.ok(!at.has(k), 'hai người cùng ngồi một ghế họp'); at.set(k, p); }
  }
  assert.ok(seats.size >= 3 && seats.size <= 6, `số ghế họp đã dùng: ${seats.size}`);
  assert.equal(d.meeting, null, 'họp phải kết thúc');
  for (const p of members) { assert.equal(p.mode, 'seated', `${p.ref.name} chưa về bàn sau họp`); assert.ok(Math.hypot(p.P.x - p.seat.x, p.P.z - p.seat.z) < 0.03); }
});

test('giao hồ sơ: người gửi đi tới chỗ trưởng phòng nhận, đưa đúng một lần rồi về bàn', () => {
  const { people } = world();
  const d = new TestDirector({ people, rng: seeded(3), ambient: false });
  const sender = people.find(p => p.room.code === '03'), recv = people.find(p => p.room.code === '05');
  assert.ok(d.errand({ agentId: sender.ref.id, toCode: '05' }));
  let handedAt = null, held = false, away = false;
  for (let t = 0; t < 120; t += 0.05) {
    d.update(0.05);
    if (sender.P.hold === 'folder') held = true;
    if (sender.mode !== 'seated') away = true;
    const ev = d.events.shift(); if (ev) { assert.equal(ev.type, 'handed'); assert.equal(ev.to, recv.ref.id); assert.ok(handedAt === null, 'đưa hai lần'); handedAt = t; }
  }
  assert.ok(held && away && handedAt !== null, 'hồ sơ phải được cầm đi và giao');
  assert.equal(sender.mode, 'seated'); assert.ok(sender.P.hold === null || (sender.P.hold === 'cup' && sender.script?.kind === 'micro'), 'không được còn cầm hồ sơ: ' + sender.P.hold);
  assert.ok(Math.hypot(sender.P.x - sender.seat.x, sender.P.z - sender.seat.z) < 0.02);
  assert.equal(d.events.length, 0);
});

test('CEO giao việc mới cho phòng Điều hành và nhận hàng từ phòng Vận hành', () => {
  const { people } = world();
  const d = new TestDirector({ people, rng: seeded(9), ambient: false });
  assert.ok(d.errand({ agentId: null, toCode: '01' }));
  assert.ok(d.errand({ agentId: people.find(p => p.room.code === '12').ref.id, toCode: 'CEO' }));
  const got = [];
  for (let t = 0; t < 150; t += 0.05) { d.update(0.05); while (d.events.length) got.push(d.events.shift()); }
  assert.equal(got.length, 2);
  assert.deepEqual(got.map(g => g.room).sort(), ['01', 'CEO']);
});

test('nhiều hồ sơ cùng lúc: người gửi làm lần lượt, ai cũng về bàn', () => {
  const { people } = world();
  const d = new TestDirector({ people, rng: seeded(21), ambient: false });
  const s = people.find(p => p.room.code === '06');
  for (const code of ['07', '09', '10']) d.errand({ agentId: s.ref.id, toCode: code });
  const got = [];
  for (let t = 0; t < 400; t += 0.05) { d.update(0.05); while (d.events.length) got.push(d.events.shift()); }
  assert.equal(got.length, 3);
  assert.equal(s.mode, 'seated');
});

test('có việc thì về bàn: người đang đi cà phê hay họp bị gọi về, không vứt dở giữa đường', () => {
  const { people } = world();
  const d = new TestDirector({ people, rng: seeded(2), ambient: false });
  const p = people.find(q => q.room.code === '04' && !q.ref.isLead);
  assert.ok(d.coffee(p));
  let t = 0; for (; t < 8; t += 0.05) d.update(0.05);
  assert.notEqual(p.mode, 'seated', 'phải đang đi cà phê');
  p.P.work = true;
  let back = null;
  for (; t < 80; t += 0.05) { d.update(0.05); if (back === null && p.mode === 'seated' && !p.cur && !p.queue.length) back = t; }
  assert.ok(back !== null && back < 70, `về bàn lúc ${back}`);
  assert.ok(![...d.pantryTaken.values()].includes(p), 'phải nhả chỗ ở quầy cà phê');
  assert.ok(p.P.hold === null || (p.P.hold === 'cup' && p.script?.kind === 'micro'));
});

test('tốc độ mô phỏng cao thì người đi nhanh hơn', () => {
  const time = speed => {
    const { people } = world(); const d = new TestDirector({ people, rng: seeded(4), getSpeed: () => speed, ambient: false });
    d.errand({ agentId: people.find(p => p.room.code === '02').ref.id, toCode: '12' });
    for (let t = 0; t < 200; t += 0.05) { d.update(0.05); if (d.events.length) return t; }
    return 999;
  };
  const slow = time(1), fast = time(4);
  assert.ok(fast < slow * 0.6, `1x: ${slow.toFixed(1)}s, 4x: ${fast.toFixed(1)}s`);
});

test('gọi tất cả về: sau một lúc ai cũng ngồi đúng chỗ, tay không, ghế vào chỗ', () => {
  const { people } = world();
  const d = new TestDirector({ people, rng: seeded(8) });
  for (let t = 0; t < 200; t += 0.05) d.update(0.05);
  d.recallAll(300);
  for (let t = 0; t < 150; t += 0.05) d.update(0.05);
  for (const p of people) {
    assert.equal(p.mode, 'seated', `${p.ref.name} chưa ngồi`);
    assert.ok(Math.hypot(p.P.x - p.seat.x, p.P.z - p.seat.z) < 0.03, `${p.ref.name} không ở đúng chỗ`);
    assert.ok(p.P.sit > 0.999 && p.chair.out < 0.01, `${p.ref.name}: ngồi ${p.P.sit}, ghế ${p.chair.out}`);
    assert.ok(p.P.hold === null || (p.P.hold === 'cup' && p.script?.kind === 'micro'), `${p.ref.name} còn cầm ${p.P.hold}`);
  }
});

test('bước thời gian lớn (khung hình giật) vẫn không làm hỏng trạng thái', () => {
  const { people } = world();
  const d = new TestDirector({ people, rng: seeded(6) });
  for (let t = 0; t < 300; t += 0.1) { d.update(0.1); for (const p of people) { assert.ok(Number.isFinite(p.P.x + p.P.z), 'toạ độ hỏng'); assert.ok(!hit(p.P.x, p.P.z, 0.0), `${p.ref.name} xuyên ${hit(p.P.x, p.P.z, 0)?.name}`); } }
});

test('mỗi người chỉ nhận tối đa 3 chuyến giao hồ sơ chờ, chuyến thừa bị bỏ', () => {
  const { people } = world();
  const d = new TestDirector({ people, rng: seeded(12), ambient: false });
  const s = people.find(p => p.room.code === '06');
  const ok = ['07', '08', '09', '10', '11', '12'].map(c => d.errand({ agentId: s.ref.id, toCode: c }));
  assert.deepEqual(ok, [true, true, true, false, false, false]);
});