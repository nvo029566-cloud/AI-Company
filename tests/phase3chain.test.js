// Chuỗi giao hồ sơ từ đầu đến cuối, đúng luồng của giao diện thật: bộ mô phỏng công việc phát sự kiện chuyển giao và ảnh chụp trạng thái;
// văn phòng 3D điều phối (người gửi tự mang lúc vắng, điều phối viên lúc bận) và cho người được mượn sang ngồi bàn trống.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createSim, PLANS } from '../src/sim.js';
import { COURIER_TITLES } from '../src/seed.js';
import { Layer } from '../public/js/gl/engine.js';
import { buildStatic, colliders } from '../public/js/gl/building.js';
import { createPeople, Director, applySim } from '../public/js/gl/behavior.js';
import { seeded } from '../public/js/gl/people.js';

const COL = colliders(), B = buildStatic(new Layer(512), {});
const hit = (x, z) => COL.find(c => x > c.x0 - 0.06 && x < c.x1 + 0.06 && z > c.z0 - 0.06 && z < c.z1 + 0.06);

function setup({ speed = 1, stage = [4, 6], seed = 3 } = {}) {
  const db = openDb(':memory:'), events = [];
  const hub = { broadcast: (e, d) => events.push([e, d]) };
  const sim = createSim({ db, hub, config: { sim: { stageSeconds: stage, autoDemo: false, maxAutoRuns: 8, borrowTravel: 4 } }, random: seeded(seed) });
  if (speed !== 1) sim.setSpeed(speed);
  const agents = db.prepare('SELECT a.id, a.name, a.title, a.is_lead AS isLead, d.code AS deptCode FROM agents a JOIN departments d ON d.id = a.dept_id').all()
    .map(a => ({ ...a, isLead: !!a.isLead, courier: COURIER_TITLES.includes(a.title) }));
  const people = createPeople(B, agents, {}, 7);
  const director = new Director({ people, slots: B.slots, rooms: B.rooms, rng: seeded(5), getSpeed: () => sim.snapshot().speed, ambient: false });
  return { sim, db, events, people, director, sent: [], handed: [], how: [], peakBorrowed: 0, peakWalkers: 0, lastHandedAt: 0, simDoneAt: -1 };
}
function run(ctx, maxVirtual = 4000) {
  const { sim, events, director, people } = ctx;
  let cursor = 0;
  for (let t = 0; t < maxVirtual; t += 0.25) {
    sim.tick(0.25);
    applySim(director, sim.snapshot());
    for (; cursor < events.length; cursor++) {
      const [type, ev] = events[cursor];
      if (type !== 'handoff' || ev.support) continue;
      ctx.sent.push(ev);
      ctx.how.push(director.dispatch({ senderId: ev.from === 'CEO' ? null : ev.agentId, fromCode: ev.from, toCode: ev.to }));
    }
    for (let i = 0; i < 5; i++) { director.update(0.05); for (const p of people) { const h = hit(p.P.x, p.P.z); if (h) throw new Error(`${p.ref.name} xuyên ${h.name} tại (${p.P.x.toFixed(2)}, ${p.P.z.toFixed(2)}) lúc ${t}s`); } }
    while (director.events.length) { ctx.handed.push(director.events.shift()); ctx.lastHandedAt = t; }
    if (ctx.simDoneAt < 0 && !sim.snapshot().runs.length) ctx.simDoneAt = t;
    ctx.peakWalkers = Math.max(ctx.peakWalkers, people.filter(p => p.mode !== 'seated' && !(p.mode === 'table' && p.borrowAt && !p.cur)).length);
    ctx.peakBorrowed = Math.max(ctx.peakBorrowed, people.filter(p => p.borrowAt).length);
    if (!sim.snapshot().runs.length && people.every(p => p.mode === 'seated' && !p.cur && !p.queue.length && !p.pending.length && !p.courierActive)) return t;
  }
  return -1;
}
const allHome = ctx => ctx.people.every(p => p.mode === 'seated' && Math.hypot(p.P.x - p.seat.x, p.P.z - p.seat.z) < 0.03 && p.P.hold === null && !p.borrowAt && p.chair.out < 0.05);

test('một việc web lúc vắng: người vừa làm xong tự mang hồ sơ đi, đúng thứ tự dây chuyền, CEO nhận hàng', () => {
  const ctx = setup();
  ctx.sim.spawn({ title: 'Thử chuỗi', kind: 'web' });
  assert.ok(run(ctx) > 0, 'phải chạy xong và mọi người về bàn');
  assert.deepEqual(ctx.sent.slice(0, 4).map(e => `${e.from}>${e.to}`), ['CEO>01', '01>02', '02>03', '03>05']);
  assert.equal(ctx.handed.length, ctx.sent.length, `gửi ${ctx.sent.length} hồ sơ, giao ${ctx.handed.length}`);
  assert.ok(ctx.how.every(h => h === 'sender'), 'lúc vắng thì người gửi tự mang: ' + ctx.how);
  const roomOf = new Map(ctx.people.map(p => [p.ref.id, p.room.code]));
  for (const e of ctx.sent) {
    const h = ctx.handed.find(x => x.room === e.to && x.from === (e.from === 'CEO' ? -1 : e.agentId));
    assert.ok(h, `hồ sơ ${e.from}>${e.to} không được giao đúng người`);
    assert.equal(roomOf.get(h.to), e.to);
  }
  const ceo = ctx.handed.filter(h => h.room === 'CEO'); assert.equal(ceo.length, 1);
  assert.ok(allHome(ctx), 'cuối cùng ai cũng về đúng bàn của mình');
});

test('nhiều việc cùng lúc (bận): điều phối viên mang hồ sơ, có người được mượn sang ngồi bàn trống, mọi hồ sơ vẫn được giao đúng người nhận', () => {
  const ctx = setup({ stage: [8, 18], seed: 1 });
  for (let i = 0; i < 8; i++) ctx.sim.spawn({ kind: ['web', 'mobile', 'exe', 'landing'][i % 4] });
  assert.ok(run(ctx, 9000) > 0, 'phải chạy xong và mọi người về bàn');
  const n = k => ctx.how.filter(h => h === k).length;
  assert.ok(n('courier') >= 15, `điều phối viên phải mang đáng kể: ${n('courier')}`);
  assert.ok(n('digital') > n('sender'), 'lúc bận phần lớn gửi điện tử');
  assert.equal(n(false), 0, 'không được bỏ rơi hồ sơ nào');
  assert.equal(ctx.handed.length, ctx.sent.length, `giao ${ctx.handed.length}/${ctx.sent.length}`);
  assert.ok(ctx.peakWalkers <= 12, `không được quá 12 người đi lại cùng lúc (đã thấy ${ctx.peakWalkers}; trước khi có điều phối là 19-21)`);
  assert.ok(ctx.lastHandedAt - ctx.simDoneAt <= 120, `hồ sơ không được trễ quá 120 giây so với công việc (trễ ${Math.round(ctx.lastHandedAt - ctx.simDoneAt)})`);
  const lead = new Map(); for (const p of ctx.people) if (!lead.has(p.room.code)) lead.set(p.room.code, p);   // trưởng phòng nhận = người đầu tiên của phòng
  const couriers = new Set(ctx.people.filter(p => p.courier).map(p => p.ref.id));
  for (const h of ctx.handed) assert.equal(h.to, lead.get(h.room).ref.id, 'người nhận phải là trưởng phòng nhận');
  assert.ok(ctx.handed.some(h => couriers.has(h.from)));
  assert.ok(ctx.handed.some(h => h.digital), 'phải có hồ sơ gửi điện tử khi quá tải');
  assert.ok(ctx.peakBorrowed >= 2, `phải có người được mượn sang phòng khác (${ctx.peakBorrowed})`);
  assert.ok(allHome(ctx));
  assert.equal(ctx.director.slotUse.size, 0, 'mọi bàn mượn phải được trả');
});

test('mọi loại sản phẩm ở tốc độ 4x: toàn bộ hồ sơ vẫn được giao, ai cũng về bàn', () => {
  for (const kind of Object.keys(PLANS)) {
    const ctx = setup({ speed: 4, stage: [3, 5] });
    ctx.sim.spawn({ kind }); ctx.sim.spawn({ kind });
    assert.ok(run(ctx, 6000) > 0, `${kind}: chưa xong`);
    assert.equal(ctx.handed.length, ctx.sent.length, `${kind}: ${ctx.sent.length} gửi, ${ctx.handed.length} giao`);
    assert.ok(allHome(ctx), `${kind}: chưa về bàn hết`);
  }
});