import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db.js';

const PORT = 3991;
const config = { brandName: 'Thử nghiệm', tagline: 't', currency: 'USD', monthlyBudget: 100 };
const app = createApp({ dbFile: ':memory:', config, port: PORT });
await new Promise(r => app.server.listen(PORT, '127.0.0.1', r));
test.after(() => app.close());

const get = async p => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }; };
const raw = (p, headers = {}) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p, headers, setHost: false }, res => {
    let data = ''; res.on('data', d => data += d); res.on('end', () => resolve({ status: res.statusCode, data }));
  }).on('error', reject);
});

test('dữ liệu gốc: 12 phòng, 26 agent, đúng số người từng phòng', async () => {
  const depts = (await get('/api/departments')).body;
  assert.equal(depts.length, 12);
  const expect = { '01': 2, '02': 1, '03': 1, '04': 10, '05': 1, '06': 1, '07': 1, '08': 1, '09': 4, '10': 1, '11': 2, '12': 1 };
  for (const d of depts) assert.equal(d.total, expect[d.code], `phòng ${d.code}`);
  assert.equal(depts.reduce((s, d) => s + d.total, 0), 26);
  assert.equal((await get('/api/agents')).body.length, 26);
});

test('mỗi phòng có đúng một trưởng phòng', async () => {
  const agents = (await get('/api/agents')).body;
  for (let i = 1; i <= 12; i++) {
    const code = String(i).padStart(2, '0');
    assert.equal(agents.filter(a => a.deptCode === code && a.isLead).length, 1, `phòng ${code}`);
  }
});

test('tổng quan và sức khỏe hệ thống', async () => {
  const ov = (await get('/api/overview')).body;
  assert.deepEqual([ov.agents, ov.departments, ov.laptops, ov.working, ov.approvals], [26, 12, 1, 0, 0]);
  const h = (await get('/api/health')).body;
  assert.equal(h.ok, true);
});

test('chi tiết phòng, lọc theo phòng, 404', async () => {
  const web = (await get('/api/departments/09')).body;
  assert.equal(web.agents.length, 4);
  assert.equal((await get('/api/departments/web')).body.code, '09');
  assert.equal((await get('/api/agents?dept=04')).body.length, 10);
  assert.equal((await get('/api/departments/99')).status, 404);
  assert.equal((await get('/api/agents/9999')).status, 404);
});

test('tìm kiếm không phân biệt dấu', async () => {
  const a = (await get('/api/search?q=' + encodeURIComponent('dieu hanh'))).body;
  assert.ok(a.departments.some(d => d.code === '01'));
  const b = (await get('/api/search?q=' + encodeURIComponent('Minh Quân'))).body;
  assert.ok(b.agents.some(x => x.name === 'Minh Quân'));
  const c = (await get('/api/search?q=')).body;
  assert.deepEqual(c, { departments: [], agents: [] });
});

test('chỉ các thao tác mô phỏng được ghi: đường dẫn khác bị chặn', async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/agents`, { method: 'POST', body: '{}', headers: { Origin: `http://127.0.0.1:${PORT}`, 'Content-Type': 'application/json' } });
  assert.equal(r.status, 405);
  const d = await fetch(`http://127.0.0.1:${PORT}/api/agents/1`, { method: 'DELETE' });
  assert.equal(d.status, 405);
});

test('an toàn: chặn Host lạ và thoát khỏi thư mục public', async () => {
  assert.equal((await raw('/api/health', { Host: 'evil.example.com' })).status, 403);
  const t = await raw('/..%2f..%2fserver.js', { Host: `127.0.0.1:${PORT}` });
  assert.notEqual(t.status, 200);
  assert.ok(!t.data.includes('createApp'));
  const h = await get('/api/health');
  assert.match(h.headers.get('content-security-policy'), /default-src 'self'/);
});

test('kênh thời gian thực gửi sự kiện hello', async () => {
  const got = await new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/events' }, res => {
      assert.match(res.headers['content-type'], /text\/event-stream/);
      res.once('data', d => { if (String(d).includes('retry')) res.once('data', x => { resolve(String(x)); req.destroy(); }); else { resolve(String(d)); req.destroy(); } });
    });
    req.on('error', e => (e.code === 'ECONNRESET' ? null : reject(e)));
    setTimeout(() => reject(new Error('quá thời gian')), 3000);
  });
  assert.match(got, /event: hello/);
});

test('migration chạy lại không nhân đôi dữ liệu', () => {
  migrate(app.db); migrate(app.db);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM agents').get().n, 26);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, 2);   // 1 = dữ liệu gốc, 2 = bộ máy mô phỏng
});