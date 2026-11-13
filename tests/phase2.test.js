import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';
import { createSim, PLANS } from '../src/sim.js';

const fast = { sim: { stageSeconds: [1, 1], autoDemo: false, maxAutoRuns: 3 } };
const make = (random = () => 0.5, config = fast) => {
  const db = openDb(':memory:');
  const events = [];
  const hub = { broadcast: (e, d) => events.push([e, d]) };
  const sim = createSim({ db, hub, config, random });
  return { db, events, sim };
};
const runAll = (sim, max = 2000) => { let n = 0; while (sim.snapshot().runs.length && n++ < max) sim.tick(0.25); return n; };
const handoffs = ev => ev.filter(e => e[0] === 'handoff').map(e => `${e[1].from}>${e[1].to}`);

test('một lượt web đi đúng thứ tự dây chuyền, song song rồi hợp lại', () => {
  const { sim, events } = make();
  sim.spawn({ title: 'Thử', kind: 'web' });
  assert.ok(runAll(sim) < 2000, 'phải chạy xong');
  const h = handoffs(events);
  assert.deepEqual(h.slice(0, 4), ['CEO>01', '01>02', '02>03', '03>05']);
  assert.deepEqual(new Set(h.slice(4, 7)), new Set(['05>06', '05>07', '05>09']));
  assert.deepEqual(new Set(h.slice(7, 10)), new Set(['06>10', '07>10', '09>10']));
  assert.deepEqual(h.slice(10), ['10>11', '11>12', '12>CEO']);
  assert.equal(sim.snapshot().done, 1);
});

test('mọi loại sản phẩm đều chạy xong và agent trở về rảnh', () => {
  for (const kind of Object.keys(PLANS)) {
    const { sim, db } = make();
    sim.spawn({ kind });
    runAll(sim);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM agents WHERE status <> 'idle'").get().n, 0, kind);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM work_items WHERE state <> 'done'").get().n, 0, kind);
  }
});

test('phòng Kiểm thử hiện trạng thái "reviewing" khi đang làm', () => {
  const { sim, db } = make();
  sim.spawn({ kind: 'landing' });
  let seen = false;
  for (let i = 0; i < 400 && sim.snapshot().runs.length; i++) {
    sim.tick(0.25);
    if (db.prepare("SELECT COUNT(*) n FROM agents a JOIN departments d ON d.id=a.dept_id WHERE d.code='10' AND a.status='reviewing'").get().n) seen = true;
  }
  assert.ok(seen);
});

test('không phòng nào làm quá số người; việc dư xếp hàng và vẫn xong hết', () => {
  const { sim } = make();
  for (let i = 0; i < 5; i++) sim.spawn({ kind: 'web' });
  let maxQa = 0, maxWeb = 0;
  for (let i = 0; i < 4000 && sim.snapshot().runs.length; i++) {
    sim.tick(0.25);
    const d = Object.fromEntries(sim.snapshot().depts.map(x => [x.code, x]));
    maxQa = Math.max(maxQa, d['10'].working); maxWeb = Math.max(maxWeb, d['09'].working);
    for (const x of Object.values(d)) assert.ok(x.working <= x.total);
  }
  assert.equal(maxQa, 1);                       // phòng Kiểm thử chỉ có 1 người
  assert.ok(maxWeb >= 1 && maxWeb <= 4);
  assert.equal(sim.snapshot().done, 5);
});

test('phòng Nghiên cứu được gọi hỗ trợ nhưng không chặn dây chuyền', () => {
  const { sim, events } = make(() => 0.1);     // random thấp => luôn gọi hỗ trợ
  sim.spawn({ kind: 'web' });
  runAll(sim);
  const support = events.filter(e => e[0] === 'handoff' && e[1].support);
  assert.ok(support.length >= 1);
  assert.ok(support.every(e => e[1].to === '04'));
  assert.equal(sim.snapshot().done, 1);
});

test('tốc độ nhân lên và chỉ nhận giá trị hợp lệ', () => {
  const a = make(), b = make();
  b.sim.setSpeed(4);
  a.sim.spawn({ kind: 'web' }); b.sim.spawn({ kind: 'web' });
  const na = runAll(a.sim), nb = runAll(b.sim);
  assert.ok(nb * 3 < na, `tốc độ 4x phải nhanh hơn rõ: ${na} vs ${nb}`);
  assert.throws(() => b.sim.setSpeed(3), /Tốc độ/);
});

test('kiểm tra đầu vào: loại sai, quá nhiều việc cùng lúc, tiêu đề dài bị cắt', () => {
  const { sim } = make();
  assert.throws(() => sim.spawn({ kind: 'abc' }), e => e.status === 400);
  const r = sim.spawn({ title: 'x'.repeat(200) });
  assert.equal(r.title.length, 80);
  for (let i = 0; i < 7; i++) sim.spawn({});
  assert.throws(() => sim.spawn({}), e => e.status === 409);
});

test('dừng tất cả: huỷ việc, trả agent về rảnh', () => {
  const { sim, db } = make();
  sim.spawn({}); sim.spawn({}); sim.tick(0.25);
  sim.clear();
  assert.equal(sim.snapshot().runs.length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM agents WHERE status <> 'idle'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM runs WHERE state='cancelled'").get().n, 2);
});

test('khởi động lại: việc dang dở bị huỷ, agent về rảnh, cài đặt được giữ', () => {
  const { sim, db } = make();
  sim.setSpeed(2); sim.setAuto(true);
  sim.spawn({}); sim.tick(0.25);
  const sim2 = createSim({ db, hub: null, config: fast });
  const s = sim2.snapshot();
  assert.equal(s.runs.length, 0);
  assert.equal(s.speed, 2);
  assert.equal(s.auto, true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM agents WHERE status <> 'idle'").get().n, 0);
});

test('chế độ tự động tự tạo việc nhưng không vượt giới hạn', () => {
  const { sim } = make(Math.random, { sim: { stageSeconds: [30, 30], autoDemo: true, maxAutoRuns: 2 } });
  for (let i = 0; i < 300; i++) sim.tick(1);
  assert.equal(sim.snapshot().runs.length, 2);
});

// ---- qua HTTP ----
const PORT = 3992;
const app = createApp({ dbFile: ':memory:', config: { brandName: 'T', tagline: 't', currency: 'USD', monthlyBudget: 100, ...fast }, port: PORT });
await new Promise(r => app.server.listen(PORT, '127.0.0.1', r));
test.after(() => app.close());
const base = `http://127.0.0.1:${PORT}`;
const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { Origin: base, 'Content-Type': 'application/json', ...headers } });

test('POST: thiếu hoặc sai Origin bị chặn 403', async () => {
  assert.equal((await fetch(base + '/api/sim/spawn', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })).status, 403);
  assert.equal((await post('/api/sim/spawn', {}, { Origin: 'http://evil.example.com' })).status, 403);
  assert.equal((await post('/api/sim/spawn', {}, { Origin: 'http://localhost:9999' })).status, 403);
  assert.equal(app.sim.snapshot().runs.length, 0);
});

test('POST: sai kiểu nội dung 415, JSON hỏng 400, quá lớn 413', async () => {
  assert.equal((await post('/api/sim/spawn', '{}', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('/api/sim/spawn', '{hỏng')).status, 400);
  assert.equal((await post('/api/sim/spawn', JSON.stringify({ title: 'a'.repeat(40000) }))).status, 413);
});

test('POST /api/sim/spawn tạo việc, GET /api/sim và /api/overview phản ánh đúng', async () => {
  const r = await post('/api/sim/spawn', { title: 'Web thử nghiệm', kind: 'web' });
  assert.equal(r.status, 200);
  const s = await (await fetch(base + '/api/sim')).json();
  assert.equal(s.runs.length, 1);
  assert.equal(s.runs[0].title, 'Web thử nghiệm');
  assert.equal(s.runs[0].stages.length, PLANS.web.length);
  const ov = await (await fetch(base + '/api/overview')).json();
  assert.equal(ov.projects, 1);
  assert.equal(ov.working, s.overview.working);
  assert.ok(ov.working >= 1);
  const dept = await (await fetch(base + '/api/departments/01')).json();
  assert.equal(dept.working, 1);
  assert.equal((await post('/api/sim/spawn', { kind: 'khong-co' })).status, 400);
  assert.equal((await post('/api/sim/speed', { speed: 4 })).status, 200);
  assert.equal((await post('/api/sim/speed', { speed: 7 })).status, 400);
  assert.equal((await post('/api/sim/auto', { on: true })).status, 200);
  assert.equal((await post('/api/sim/auto', { on: false })).status, 200);
  assert.equal((await post('/api/sim/clear', {})).status, 200);
  assert.equal((await (await fetch(base + '/api/sim')).json()).runs.length, 0);
});

test('SSE nhận được sự kiện handoff và tick khi có việc mới', async () => {
  const got = [];
  await new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/events' }, res => {
      let buf = '';
      res.on('data', c => {
        buf += c;
        for (const m of buf.matchAll(/event: (\w+)/g)) if (!got.includes(m[1])) got.push(m[1]);
        if (buf.includes('event: hello') && !buf.includes('event: tick') && !res._sent) { res._sent = true; post('/api/sim/spawn', {}); }
        if (got.includes('handoff') && got.includes('tick')) { req.destroy(); resolve(); }
      });
    });
    req.on('error', e => (e.code === 'ECONNRESET' ? resolve() : reject(e)));
    setTimeout(() => { req.destroy(); reject(new Error('quá thời gian, nhận được: ' + got)); }, 3000);
  });
  assert.ok(got.includes('handoff') && got.includes('tick'));
  app.sim.clear();
});

test('sự kiện chuyển giao mang mã người gửi (người vừa làm xong ở phòng đó)', () => {
  const { sim, events, db } = make();
  sim.spawn({ kind: 'web' });
  runAll(sim);
  const hs = events.filter(e => e[0] === 'handoff').map(e => e[1]);
  assert.equal(hs[0].agentId, undefined);                              // CEO giao cho phòng đầu: chưa có người gửi (CEO tự đi)
  const done = db.prepare("SELECT d.code, w.agent_id FROM work_items w JOIN departments d ON d.id = w.dept_id WHERE w.support = 0").all();
  const byDept = Object.fromEntries(done.map(r => [r.code, r.agent_id]));
  for (const h of hs.slice(1)) { assert.ok(Number.isInteger(h.agentId), `${h.from}>${h.to} thiếu agentId`); assert.equal(h.agentId, byDept[h.from], `${h.from}>${h.to}: sai người gửi`); }
  assert.ok(hs.at(-1).delivered && Number.isInteger(hs.at(-1).agentId));
});

// ---- điều phối viên và mượn người ----
import { BORROW_CAP, MAX_BORROWED } from '../src/sim.js';
import { seeded } from '../public/js/gl/people.js';
const realistic = { sim: { stageSeconds: [8, 18], autoDemo: false, maxAutoRuns: 8, borrowTravel: 4 } };   // giai đoạn dài ngắn khác nhau như thực tế: mới có phòng bị quá tải
const courierIds = db => new Set(db.prepare("SELECT id FROM agents WHERE title IN ('Trợ lý điều hành','Nhà nghiên cứu tài liệu kỹ thuật')").all().map(r => r.id));

test('điều phối viên (Thu Hà, Diệu Linh) không bao giờ nhận việc chuyên môn', () => {
  const { sim, db } = make();
  for (let i = 0; i < 5; i++) sim.spawn({ kind: 'web' });
  runAll(sim, 6000);
  const c = courierIds(db); assert.equal(c.size, 2);
  const used = db.prepare('SELECT DISTINCT agent_id FROM work_items WHERE agent_id IS NOT NULL').all().map(r => r.agent_id);
  assert.ok(used.length > 5);
  assert.deepEqual(used.filter(id => c.has(id)), []);
});

test('mượn người: đúng điều kiện, không vượt giới hạn từng phòng và toàn công ty, không ai làm hai việc một lúc', () => {
  const { sim, db } = make(seeded(1), realistic);
  const lead = new Set(db.prepare('SELECT id FROM agents WHERE is_lead = 1').all().map(r => r.id)), cour = courierIds(db);
  for (let i = 0; i < 8; i++) sim.spawn({ kind: ['web', 'mobile', 'exe', 'landing'][i % 4] });
  let everBorrowed = 0, maxTotal = 0;
  for (let n = 0; n < 12000 && sim.snapshot().runs.length; n++) {
    sim.tick(0.25);
    const items = sim.snapshot().runs.flatMap(r => r.items).filter(i => i.state === 'working');
    const agents = items.map(i => i.agentId); assert.equal(new Set(agents).size, agents.length, 'một người làm hai việc cùng lúc');
    const borrowed = items.filter(i => i.borrowed); maxTotal = Math.max(maxTotal, borrowed.length); everBorrowed += borrowed.length ? 1 : 0;
    const perDept = {};
    for (const b of borrowed) {
      perDept[b.dept] = (perDept[b.dept] || 0) + 1;
      assert.ok(BORROW_CAP[b.dept], `không được mượn người vào phòng ${b.dept}`);
      assert.notEqual(b.from, b.dept); assert.ok(!lead.has(b.agentId), 'không mượn trưởng phòng'); assert.ok(!cour.has(b.agentId), 'không mượn điều phối viên');
      assert.ok(!b.support, 'việc hỗ trợ không mượn người');
    }
    for (const [d, c] of Object.entries(perDept)) assert.ok(c <= BORROW_CAP[d], `phòng ${d} mượn ${c} người, giới hạn ${BORROW_CAP[d]}`);
    assert.ok(borrowed.length <= MAX_BORROWED);
  }
  assert.ok(everBorrowed > 40, `dưới tải cao phải có mượn người (chỉ ${everBorrowed} nhịp)`);
  assert.ok(maxTotal >= 2 && maxTotal <= MAX_BORROWED);
  assert.equal(sim.snapshot().done, 8);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM agents WHERE status <> 'idle'").get().n, 0);
});

test('khi chỉ có một việc thì không ai bị mượn (không cần)', () => {
  const { sim } = make();
  sim.spawn({ kind: 'web' });
  for (let n = 0; n < 3000 && sim.snapshot().runs.length; n++) { sim.tick(0.25); assert.ok(sim.snapshot().runs.flatMap(r => r.items).every(i => !i.borrowed)); }
});

test('người mượn cần thời gian đi sang: trong lúc đó chưa tính tiến độ', () => {
  const { sim } = make(seeded(7), realistic);
  for (let i = 0; i < 6; i++) sim.spawn({ kind: ['web', 'mobile'][i % 2] });
  const seen = new Map();
  for (let n = 0; n < 12000 && sim.snapshot().runs.length; n++) {
    sim.tick(0.25);
    for (const it of sim.snapshot().runs.flatMap(r => r.items)) {
      if (!it.borrowed || it.state !== 'working') continue;
      const s = seen.get(it.id) || { t: 0, started: false }; seen.set(it.id, s);
      if (it.travelling) { assert.equal(it.progress, 0, 'đang đi đường thì chưa có tiến độ'); s.t += 0.25; } else s.started = true;
    }
  }
  assert.ok(seen.size >= 1);
  for (const s of seen.values()) { assert.ok(s.started); assert.ok(s.t >= 3.5 && s.t <= 4.25, `đi đường ${s.t} giây, mong đợi khoảng 4`); }
});

test('/api/agents đánh dấu đúng hai điều phối viên', async () => {
  const list = await (await fetch(base + '/api/agents')).json();
  assert.deepEqual(list.filter(a => a.courier).map(a => a.name).sort(), ['Diệu Linh', 'Thu Hà']);
  assert.equal(list.length, 26);
});