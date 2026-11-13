// Thiết kế "văn phòng không bị loạn": điều phối viên mang hồ sơ, mượn người ngồi bàn trống, hành vi đi dạo giảm theo tải.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS, COURIER_TITLES } from '../src/seed.js';
import { Layer } from '../public/js/gl/engine.js';
import { buildStatic, colliders, MEET_SEATS, PANTRIES, W, D } from '../public/js/gl/building.js';
import { createPeople, Director, route, applySim } from '../public/js/gl/behavior.js';
import { seeded } from '../public/js/gl/people.js';

const agents = AGENTS.map((a, i) => ({ id: i + 1, name: a.name, deptCode: a.dept, isLead: !!a.lead, courier: COURIER_TITLES.includes(a.title) }));
const SB = buildStatic(new Layer(512), {}), COL = colliders();
const world = (seed = 1, opts = {}) => {
  const people = createPeople(SB, agents, {}, 7);
  const d = new Director({ people, slots: SB.slots, rooms: SB.rooms, rng: seeded(seed), ambient: false, ...opts });
  return { people, d, by: n => people.find(p => p.ref.name === n), inRoom: c => people.filter(p => p.room.code === c) };
};
const hit = (x, z, m = 0.06) => COL.find(c => x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m);
function run(d, sec, hook) { for (let t = 0; t < sec; t += 0.05) { d.update(0.05); hook?.(t); } }
function runUntil(d, cond, max = 200) { for (let t = 0; t < max; t += 0.05) { d.update(0.05); if (cond()) return t; } return -1; }
const noWalls = (people, tag) => { for (const p of people) { const h = hit(p.P.x, p.P.z); assert.ok(!h, `${tag}: ${p.ref.name} xuyên ${h?.name} tại (${p.P.x.toFixed(2)}, ${p.P.z.toFixed(2)})`); } };

test('đường đi từ MỌI bàn (kể cả bàn trống để mượn) tới quầy cà phê, ghế họp, trưởng các phòng và bàn phòng khác đều không xuyên đồ đạc', () => {
  const { d, people } = world();
  const owners = SB.slots.map(s => d.makeSeatOwner(SB.rooms.find(r => r.code === s.room), s));
  const leads = people.filter(p => p.ref.isLead || p.ref.ceo), spot = q => ({ t: 'spot', R: q.room, xa: q.xa, z: q.seat.z, face: [q.seat.x, q.seat.z] });
  const check = (start, pts, name) => {
    let l = start;
    for (const p of pts) {
      assert.ok(p[0] > 0 && p[0] < W && p[1] > -0.5 && p[1] < D, `${name}: điểm ngoài toà nhà`);
      const len = Math.hypot(p[0] - l[0], p[1] - l[1]), n = Math.max(1, Math.ceil(len / 0.1));
      for (let i = 0; i <= n; i++) { const x = l[0] + (p[0] - l[0]) * i / n, z = l[1] + (p[1] - l[1]) * i / n, h = hit(x, z, 0.1); assert.ok(!h, `${name}: vướng ${h?.name} tại (${x.toFixed(2)}, ${z.toFixed(2)})`); }
      l = p;
    }
  };
  let routes = 0;
  for (const o of owners) {
    const here = { t: 'seat', p: o }, start = [o.seat.x, o.seat.z];
    const targets = [...PANTRIES.flatMap((P, k) => P.spots.map((_, i) => ({ pl: { t: 'pantry', k, i }, at: P.spots[i], n: `quầy ${k}.${i}` }))),
      ...MEET_SEATS.map((seat, i) => ({ pl: { t: 'chair', seat }, at: [seat.x, seat.z], n: `ghế họp ${i}` })),
      ...leads.map(q => ({ pl: spot(q), at: [q.xa, q.seat.z], n: `chỗ ${q.ref.name}` })),
      ...owners.filter((_, i) => i % 5 === 0).map(q => ({ pl: { t: 'seat', p: q }, at: [q.seat.x, q.seat.z], n: `bàn ${q.room.code}` }))];
    for (const t of targets) for (const off of [-0.28, 0.28]) {
      check(start, route(here, t.pl, off), `${o.room.code}.${o.slot.idx} → ${t.n}`);
      check(t.at, route(t.pl, here, off), `${t.n} → ${o.room.code}.${o.slot.idx}`);
      routes += 2;
    }
  }
  assert.ok(routes > 6000, `chỉ kiểm ${routes} tuyến`);
});

test('mượn người: ngồi đúng bàn trống, mỗi người một bàn, hết bàn thì ở yên, xong việc thì về và trả bàn', () => {
  const { d, by, inRoom } = world();
  const a = by('Bảo Long'), b = by('Mai Chi'), c = by('Gia Hân'), e = by('Việt Anh');       // bốn người của phòng Nghiên cứu
  const home = inRoom('06')[0], emptyOf = code => SB.slots.filter(s => s.room === code && s.idx >= inRoom(code).length);
  assert.equal(emptyOf('06').length, 3);
  for (const p of [a, b, c]) d.setBorrow(p, '06');
  assert.ok(runUntil(d, () => [a, b, c].every(p => p.mode === 'table' && !p.cur && !p.queue.length), 400) > 0, 'cả ba phải ngồi vào bàn mượn');
  const keys = [a, b, c].map(p => p.borrowKey); assert.equal(new Set(keys).size, 3, 'ba người phải ngồi ba bàn khác nhau');
  for (const p of [a, b, c]) {
    const sl = emptyOf('06').find(s => `06:${s.idx}` === p.borrowKey); assert.ok(sl, 'phải là bàn trống');
    assert.ok(Math.hypot(p.P.x - sl.x, p.P.z - (sl.z - 0.62)) < 0.03, `${p.ref.name} không ngồi đúng chỗ`); assert.ok(p.P.sit > 0.999);
    assert.equal(p.borrowAt, '06'); assert.equal(d.deskUser(sl, null), p);
  }
  assert.equal(home.mode, 'seated', 'người của phòng vẫn ngồi bàn nhà');
  d.setBorrow(e, '06'); run(d, 60);
  assert.equal(e.mode, 'seated'); assert.equal(e.borrowAt, null, 'hết bàn trống thì phải ở yên, không chen vào');
  d.setBorrow(e, null);
  d.setBorrow(a, null); noWalls(d.people, 'trả bàn');
  assert.ok(runUntil(d, () => a.mode === 'seated' && !a.cur && !a.queue.length, 400) > 0);
  assert.ok(Math.hypot(a.P.x - a.seat.x, a.P.z - a.seat.z) < 0.03); assert.equal(a.borrowAt, null); assert.ok(!d.slotUse.has(keys[0]), 'bàn phải được trả lại');
  assert.ok(a.chair.out < 0.05 && a.P.hold === null);
  d.setBorrow(e, '06'); assert.ok(runUntil(d, () => e.mode === 'table' && !e.cur, 400) > 0, 'bàn vừa trả phải mượn được');
  assert.equal(e.borrowKey, keys[0]);
});

test('mượn người: chuyển thẳng từ phòng này sang phòng khác, không xuyên đồ đạc, không bỏ sót bàn', () => {
  const { d, by } = world();
  const a = by('Phương Thảo'); d.setBorrow(a, '05');
  run(d, 150, () => noWalls([a], 'sang 05')); assert.equal(a.borrowAt, '05'); assert.ok(a.borrowKey.startsWith('05:'));
  const k1 = a.borrowKey; d.setBorrow(a, '12');
  run(d, 200, () => noWalls([a], 'sang 12')); assert.equal(a.borrowAt, '12'); assert.ok(a.borrowKey.startsWith('12:')); assert.ok(!d.slotUse.has(k1), 'bàn cũ phải được trả');
  d.setBorrow(a, null); run(d, 250); assert.equal(a.mode, 'seated'); assert.equal(d.slotUse.size, 0);
});

test('điều phối: lúc bận điều phối viên tới tận bàn người gửi nhận hồ sơ rồi giao đúng người nhận', () => {
  const { d, by } = world();
  d.load = { runs: 3, queued: 0, working: 3 };
  const sender = by('Đức Huy'), recv = by('Thùy Dương'), thuHa = by('Thu Hà'), dieuLinh = by('Diệu Linh');
  assert.equal(d.dispatch({ senderId: sender.ref.id, fromCode: '03', toCode: '05', color: '#e0526b', label: 'Bản yêu cầu' }), 'courier');
  let pickedAt = null, handed = null;
  const c = [thuHa, dieuLinh].find(x => x.courierActive); assert.ok(c);
  run(d, 150, () => {
    if (!pickedAt && c.carryLabel) pickedAt = [c.P.x, c.P.z];
    for (const ev of d.events.splice(0)) if (ev.type === 'handed') handed = ev;
  });
  assert.ok(pickedAt && Math.hypot(pickedAt[0] - sender.xa, pickedAt[1] - sender.seat.z) < 1.2, 'phải nhận hồ sơ tại bàn người gửi');
  assert.ok(handed && handed.from === c.ref.id && handed.to === recv.ref.id && handed.room === '05');
  assert.equal(c.mode, 'seated'); assert.equal(sender.mode, 'seated'); assert.equal(c.P.hold, null);
});

test('điều phối: hồ sơ trong hạn mức được nối chuyến liên tiếp (không quay về bàn giữa chừng) và chia cho cả hai điều phối viên; phần dư gửi điện tử', () => {
  const { d, inRoom } = world();
  d.load = { runs: 4, queued: 0, working: 4 };
  const plan = [['03', '05'], ['02', '03'], ['05', '06'], ['06', '10'], ['10', '11'], ['11', '12'], ['12', 'CEO'], ['01', '02']];
  const how = plan.map(([f, t]) => d.dispatch({ senderId: f === 'CEO' ? null : inRoom(f)[0].ref.id, fromCode: f, toCode: t, color: '#3b82f6', label: 'x' }));
  assert.equal(how.filter(h => h === 'courier').length, 6, 'mỗi điều phối viên nhận 3 chuyến');
  assert.equal(how.filter(h => h === 'digital').length, 2, 'hai hồ sơ dư phải gửi điện tử, không ai đi');
  const handed = [], couriers = d.couriers; assert.equal(couriers.length, 2);
  for (const ev of d.events.splice(0)) handed.push(ev);                       // hồ sơ điện tử được giao ngay
  assert.equal(handed.length, 2); assert.ok(handed.every(h => h.digital && h.at && h.dest && h.room));
  const everAway = new Map(couriers.map(c => [c, false])), seatedBetween = new Map(couriers.map(c => [c, 0]));
  run(d, 600, () => {
    for (const ev of d.events.splice(0)) handed.push(ev);
    for (const c of couriers) { if (c.mode !== 'seated') everAway.set(c, true); else if (everAway.get(c) && c.courierActive) seatedBetween.set(c, seatedBetween.get(c) + 1); }
    noWalls(d.people, 'điều phối');
  });
  assert.equal(handed.length, plan.length, `chỉ giao được ${handed.length}/${plan.length}`);
  assert.deepEqual(handed.map(h => h.room).sort(), plan.map(p => p[1]).sort());
  assert.equal(new Set(handed.filter(h => !h.digital).map(h => h.from)).size, 2, 'cả hai điều phối viên phải cùng làm');
  for (const c of couriers) { assert.equal(seatedBetween.get(c), 0, `${c.ref.name} đã quay về ngồi giữa lúc còn hồ sơ`); assert.equal(c.mode, 'seated'); assert.ok(!c.courierActive && !c.courierJobs.length); }
});

test('điều phối: chuyến chờ quá lâu thì chuyển sang gửi điện tử để hồ sơ không đến muộn so với công việc', () => {
  const { d, inRoom } = world();
  d.load = { runs: 4, queued: 0, working: 4 };
  d.couriers = d.couriers.slice(0, 1);                                         // chỉ một điều phối viên để các chuyến phải xếp hàng
  const plan = [['03', '05'], ['02', '03'], ['05', '06']];
  for (const [f, t] of plan) assert.equal(d.dispatch({ senderId: inRoom(f)[0].ref.id, fromCode: f, toCode: t, label: 'x' }), 'courier');
  const handed = []; run(d, 2, () => { for (const ev of d.events.splice(0)) handed.push(ev); });   // điều phối viên đứng dậy và nhận chuyến đầu
  assert.equal(d.couriers[0].courierJobs.length, 2);
  for (const j of d.couriers[0].courierJobs) j.t0 -= 100;                      // coi như hai chuyến sau đã chờ 100 giây
  run(d, 200, () => { for (const ev of d.events.splice(0)) handed.push(ev); });
  assert.equal(handed.length, 3);
  assert.equal(handed.filter(h => h.digital).length, 2, 'hai chuyến chờ quá lâu phải thành gửi điện tử');
  assert.equal(handed.find(h => !h.digital).room, '05', 'chuyến đã bắt đầu vẫn được mang tới nơi');
});

test('điều phối: lúc vắng người gửi tự mang; nếu người gửi còn đang làm việc thì điều phối viên đi thay', () => {
  const { d, by } = world();
  d.load = { runs: 1, queued: 0, working: 1 };
  const s = by('Ngọc Anh');
  assert.equal(d.dispatch({ senderId: s.ref.id, fromCode: '02', toCode: '03', label: 'x' }), 'sender');
  const t = by('Anh Tuấn'); t.P.work = true;
  assert.equal(d.dispatch({ senderId: t.ref.id, fromCode: '09', toCode: '10', label: 'x' }), 'courier');
  d.load = { runs: 0, queued: 0, working: 0 };
  assert.equal(d.dispatch({ senderId: null, fromCode: 'CEO', toCode: '01', label: 'x' }), 'sender', 'CEO tự đưa việc mới khi vắng');
  d.load = { runs: 4, queued: 0, working: 4 };
  d.couriers.forEach(c => { c.courierJobs.push({}, {}, {}); });                         // hai điều phối viên đã kín hàng chờ
  assert.equal(d.dispatch({ senderId: by('Đức Huy').ref.id, fromCode: '03', toCode: '05', label: 'x' }), 'digital', 'kín hàng chờ thì gửi điện tử, không ai đi thêm');
});

test('điều phối viên và người đang mượn bàn không đi họp, điều phối viên không đi dạo', () => {
  const { d, by } = world(5);
  d.ambient = true; by('Bảo Long').borrowWant = '06';
  const seen = new Set();
  for (let i = 0; i < 12; i++) { if (d.startMeeting()) { for (const m of d.meeting.members) seen.add(m); d.meeting = null; for (const p of d.people) { p.queue = []; p.cur = null; p.mode = 'seated'; p.script = null; } } }
  assert.ok(seen.size > 4);
  for (const m of seen) { assert.ok(!m.courier, 'điều phối viên không được vào họp'); assert.ok(!m.borrowWant && !m.borrowAt); }
});

test('tải cao thì văn phòng yên: số người đi dạo giảm mạnh, không họp, phòng đang bận thì người trong phòng ở yên', () => {
  const awaySeconds = load => {
    const { d, people } = world(9, { ambient: true }); d.load = { runs: load, queued: 0, working: load };
    let away = 0, meetings = 0; run(d, 500, t => { if (Math.round(t * 20) % 5 === 0) away += people.filter(p => !p.courier && p.mode !== 'seated').length * 0.25; });
    return { away, meeting: !!d.meeting };
  };
  const calm = awaySeconds(0), busy = awaySeconds(4);
  assert.ok(calm.away > 150, `lúc vắng phải có người đi lại (${calm.away})`);
  assert.ok(busy.away < calm.away * 0.35, `tải cao phải ít đi lại hơn: vắng ${calm.away.toFixed(0)}, bận ${busy.away.toFixed(0)}`);
  { const { d } = world(3, { ambient: true }); d.load = { runs: 2, queued: 0, working: 2 }; run(d, 300); assert.equal(d.meeting, null, 'từ 2 việc trở lên không được họp'); }
  const { d, people } = world(4, { ambient: true });
  d.busyRooms = new Set(['01', '02', '03', '05', '06', '07', '08', '09', '10', '11', '12', 'CEO']);                // chỉ phòng Nghiên cứu (04) rảnh
  const left = new Set(); run(d, 400, () => { for (const p of people) if (p.mode !== 'seated' && !p.courier) left.add(p.room.code); });
  assert.deepEqual([...left], ['04'].filter(c => left.has(c)), `người phòng bận không được rời bàn: ${[...left]}`);
});

test('applySim: đọc ảnh chụp của bộ mô phỏng → tải, phòng bận, ai làm gì, ai sang mượn bàn, đi đường thì chưa gõ phím', () => {
  const { d, by } = world();
  const bl = by('Bảo Long'), nam = by('Hoàng Nam');
  const snap = tr => ({ runs: [{ id: 7, title: 'Web thử', items: [
    { id: 1, dept: '06', state: 'working', agentId: bl.ref.id, borrowed: true, from: '04', travelling: tr, progress: 0.2, title: 'Lập trình giao diện' },
    { id: 2, dept: '07', state: 'working', agentId: nam.ref.id, borrowed: false, travelling: false, progress: 0.5, title: 'Lập trình máy chủ' },
    { id: 3, dept: '10', state: 'queued', agentId: null, borrowed: false } ] }, { id: 8, title: 'App', items: [{ id: 4, dept: '10', state: 'queued', agentId: null }] }] });
  const w = applySim(d, snap(true));
  assert.deepEqual(d.load, { runs: 2, queued: 2, working: 2 });
  assert.deepEqual([...d.busyRooms].sort(), ['06', '07', '10']);
  assert.equal(bl.borrowWant, '06'); assert.equal(bl.P.work, false, 'đang đi đường: chưa gõ phím'); assert.equal(bl.task.travelling, true); assert.equal(bl.task.from, '04');
  assert.equal(nam.borrowWant, null); assert.equal(nam.P.work, true); assert.equal(nam.task.runId, 7); assert.equal(w.size, 2);
  applySim(d, snap(false)); assert.equal(bl.P.work, true);
  applySim(d, { runs: [] }); assert.equal(bl.borrowWant, null); assert.equal(bl.P.work, false); assert.equal(bl.task, null); assert.equal(d.busyRooms.size, 0);
});