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
const qs = params => { const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null)).toString(); return q ? '?' + q : ''; };
export const api = {
  sim: () => get('/api/sim'),
  simSpawn: (kind, title) => post('/api/sim/spawn', { kind, title }),
  simSpeed: speed => post('/api/sim/speed', { speed }),
  simAuto: on => post('/api/sim/auto', { on }),
  simClear: () => post('/api/sim/clear'),
  simDelivered: (runId, from, to, bugId) => post('/api/sim/delivered', bugId == null ? { runId, from, to } : { runId, from, to, bugId }),
  simViewer: () => post('/api/sim/viewer'),
  simArrived: agentId => post('/api/sim/arrived', { agentId }),
  projects: () => get('/api/projects'),
  project: id => get(`/api/projects/${id}`),
  projectCreate: body => post('/api/projects', body),
  projectApprove: (id, confirmOverBudget) => post(`/api/projects/${id}/approve`, confirmOverBudget ? { confirmOverBudget: true } : {}),
  projectReject: id => post(`/api/projects/${id}/reject`),
  tasks: params => get('/api/tasks' + (() => { const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null)).toString(); return q ? '?' + q : ''; })()),
  agent: id => get(`/api/agents/${id}`),
  bugs: params => get('/api/bugs' + (() => { const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null)).toString(); return q ? '?' + q : ''; })()),
  bugSummary: () => get('/api/bugs/summary'),
  heatmap: (metric, period) => get(`/api/heatmap?metric=${encodeURIComponent(metric)}&period=${encodeURIComponent(period)}`),
  aiStatus: () => get('/api/ai/status'),
  aiKeySave: (key, provider) => post('/api/ai/key', { key, provider }),
  aiKeyDelete: provider => post('/api/ai/key/delete', { provider }),
  aiTest: (provider, model) => post('/api/ai/test', { provider, model }),
  aiKill: () => post('/api/ai/kill'),
  projectFile: (id, path) => get(`/api/projects/${id}/file?path=${encodeURIComponent(path)}`),
  backups: () => get('/api/backups'),
  backupCreate: () => post('/api/backups'),
  backupDelete: id => post(`/api/backups/${encodeURIComponent(id)}/delete`),
  backupRestore: id => post(`/api/backups/${encodeURIComponent(id)}/restore`),
  backupCancel: () => post('/api/backups/cancel-restore'),
  system: () => get('/api/system'),
  settings: () => get('/api/settings'),
  settingsSave: body => post('/api/settings', body),
  settingsReset: () => post('/api/settings/reset'),
  notifications: params => get('/api/notifications' + qs(params)),
  notificationsRead: body => post('/api/notifications/read', body),
  knowledge: params => get('/api/knowledge' + qs(params)),
  knowledgeTags: () => get('/api/knowledge/tags'),
  knowledgeCreate: body => post('/api/knowledge', body),
  knowledgeUpdate: (id, body) => post(`/api/knowledge/${id}/update`, body),
  knowledgeDelete: id => post(`/api/knowledge/${id}/delete`),
  assistant: question => post('/api/assistant', { question }),
  approvals: status => get('/api/approvals?status=' + encodeURIComponent(status || 'all')),
  approvalApprove: id => post(`/api/approvals/${id}/approve`),
  approvalReject: id => post(`/api/approvals/${id}/reject`),
  costSummary: () => get('/api/costs/summary'),
  costs: params => get('/api/costs' + (() => { const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null)).toString(); return q ? '?' + q : ''; })()),
  deployments: () => get('/api/deployments'),
  reportCompany: period => get('/api/reports/company?period=' + encodeURIComponent(period || '7')),
  reportProject: id => get(`/api/reports/project/${id}`),
  config: () => get('/api/config'),
  overview: () => get('/api/overview'),
  departments: () => get('/api/departments'),
  agents: dept => get('/api/agents' + (dept ? `?dept=${encodeURIComponent(dept)}` : '')),
  search: q => get('/api/search?q=' + encodeURIComponent(q))
};
