import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApi } from './api.js';
import { createHub } from './events.js';
import { createSim, SimError } from './sim.js';
import { createNotifier } from './notify.js';
import { createKnowledge } from './knowledge.js';
import { applyOverrides } from './settings.js';
import { createSecrets } from './ai/secrets.js';
import { createAi } from './ai/service.js';
import { mkdirSync, statSync, existsSync } from 'node:fs';
import { createBackups, applyPendingRestore } from './backup.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const VERSION = '1.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY'
};

export function createApp({ dbFile, config, port, fetchImpl = fetch }) {
  const realDb = dbFile !== ':memory:';
  const restore = realDb ? applyPendingRestore({ dataDir: path.dirname(path.resolve(dbFile)), dbFile: path.resolve(dbFile) }) : null;      // khôi phục đã hẹn từ lần trước, làm TRƯỚC khi mở cơ sở dữ liệu
  const db = openDb(dbFile);
  const hub = createHub();
  applyOverrides(db, config);                                // cài đặt đã lưu trong giao diện ghi đè lên config.json
  const notifier = createNotifier({ db, hub, config });
  const knowledge = createKnowledge({ db });
  const hooks = { push: n => notifier.push(n), costCheck: () => notifier.costCheck(), projectDone: id => knowledge.lessonForProject(id) };
  const dataDir = dbFile === ':memory:' ? mkdtempSync(path.join(tmpdir(), 'cty-data-')) : path.dirname(path.resolve(dbFile));
  mkdirSync(dataDir, { recursive: true });
  const backups = realDb ? createBackups({ db, dataDir, version: VERSION }) : null;
  if (restore) db.prepare("INSERT INTO settings (key, value) VALUES ('system.lastRestore', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ ...restore, at: new Date().toISOString() }));
  const secrets = createSecrets({ file: dbFile === ':memory:' ? null : path.join(dataDir, 'ai-key.json') });
  const ai = createAi({ db, config, secrets, hub, dataDir, fetchImpl, getRules: () => knowledge.list({ kind: 'rule', limit: 8 }) });
  const sim = createSim({ db, hub, config, hooks, ai });
  const api = createApi({ db, config, version: VERSION, sim, hub, notifier, knowledge, ai, backups, system: { dataDir: realDb ? dataDir : null, dbFile: realDb ? path.resolve(dbFile) : null } });
  const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  const allowedOrigins = new Set([...allowedHosts].map(h => `http://${h}`));
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  async function readJson(req, limit = 16384) {
    let size = 0; const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw new SimError(413, 'Nội dung gửi lên quá lớn.');
      chunks.push(c);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text) return {};
    try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : {}; }
    catch { throw new SimError(400, 'JSON không hợp lệ.'); }
  }

  const server = http.createServer(async (req, res) => {
    try {
      // Chặn tấn công DNS rebinding: chỉ nhận yêu cầu gửi tới localhost.
      if (port && !allowedHosts.has(req.headers.host || '')) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Địa chỉ không được phép.');
      }
      const url = new URL(req.url, 'http://localhost');
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);

      if (url.pathname === '/api/events') {
        if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
        return hub.add(req, res);
      }
      if (url.pathname === '/api/frontend-check' && req.method === 'GET') {                                                      // kiểm tra các tệp giao diện có khớp nhau không
        try { const { checkFrontend } = await import('./checkfront.js'); return json(res, 200, checkFrontend(PUBLIC)); }
        catch (e) { return json(res, 200, { ok: false, files: 0, issues: [{ kind: 'checker-broken', text: 'Tệp src/checkfront.js bị chép sai (' + e.message + ').' }] }); }
      }
      if (url.pathname.startsWith('/api/')) {
        let body;
        if (req.method === 'POST') {
          // Chống trang web lạ gửi lệnh tới máy chủ cục bộ: bắt buộc đúng Origin và kiểu JSON.
          if (!allowedOrigins.has(req.headers.origin || '')) return json(res, 403, { error: 'Nguồn gửi không được phép.' });
          if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Cần gửi dạng application/json.' });
          body = await readJson(req);
        } else if (req.method !== 'GET') {
          return json(res, 405, { error: 'Phương thức không được hỗ trợ.' });
        }
        const out = await api(req.method, url, body);
        if (!out) return json(res, req.method === 'POST' ? 405 : 404, { error: req.method === 'POST' ? 'Không có thao tác này.' : 'Không có đường dẫn này.' });
        return json(res, out.status, out.body);
      }
      return serveStatic(url.pathname, res);
    } catch (e) {
      if (e instanceof SimError && !res.headersSent) return json(res, e.status, { error: e.message });
      console.error('[lỗi]', e);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Lỗi máy chủ.' }));
    }
  });

  async function serveStatic(pathname, res) {
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || !path.extname(rel)) rel = '/index.html';   // giao diện một trang: mọi đường dẫn không có đuôi đều về index
    const file = path.resolve(PUBLIC, '.' + rel);
    if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Không tìm thấy.');
    }
  }

  return {
    server, db, hub, sim, ai, backups,
    close() { sim.stop(); hub.close(); server.closeAllConnections?.(); server.close(); db.close(); }
  };
}
