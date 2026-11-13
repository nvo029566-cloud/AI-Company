// Gọi máy chủ. Mọi hàm trả về dữ liệu JSON hoặc ném lỗi có thông báo tiếng Việt.
async function get(path) {
  let res;
  try { res = await fetch(path, { headers: { Accept: 'application/json' } }); }
  catch { throw new Error('Không kết nối được máy chủ. Hãy kiểm tra cửa sổ đang chạy "node server.js".'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}
async function post(path, body = {}) {
  let res;
  try { res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new Error('Không kết nối được máy chủ. Hãy kiểm tra cửa sổ đang chạy "node server.js".'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}
export const api = {
  sim: () => get('/api/sim'),
  simSpawn: (kind, title) => post('/api/sim/spawn', { kind, title }),
  simSpeed: speed => post('/api/sim/speed', { speed }),
  simAuto: on => post('/api/sim/auto', { on }),
  simClear: () => post('/api/sim/clear'),
  simDelivered: (runId, from, to) => post('/api/sim/delivered', { runId, from, to }),
  simViewer: () => post('/api/sim/viewer'),
  simArrived: agentId => post('/api/sim/arrived', { agentId }),
  config: () => get('/api/config'),
  overview: () => get('/api/overview'),
  departments: () => get('/api/departments'),
  agents: dept => get('/api/agents' + (dept ? `?dept=${encodeURIComponent(dept)}` : '')),
  search: q => get('/api/search?q=' + encodeURIComponent(q))
};
