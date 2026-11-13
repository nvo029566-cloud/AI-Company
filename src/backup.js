import { mkdirSync, rmSync, cpSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SimError } from './sim.js';

// Sao lưu: một thư mục cho mỗi bản trong data/backups/<mã>/ gồm company.db (chụp nhất quán bằng VACUUM INTO), thư mục projects/ (tệp sản phẩm)
// và manifest.json. KHÔNG bao giờ chứa khoá API (khoá nằm ở data/ai-key.json, ngoài phạm vi sao lưu).
// Khôi phục không thay cơ sở dữ liệu đang chạy: nó đặt một lệnh chờ, và bước khôi phục thật diễn ra lúc khởi động lại, trước khi mở cơ sở dữ liệu.
const ID_RE = /^(truoc-khoi-phuc-)?\d{8}-\d{6}(-\d+)?$/;
export const KEEP = 10, KEEP_SAFETY = 3;
export const backupsDir = dataDir => path.join(dataDir, 'backups');
const pendingFile = dataDir => path.join(dataDir, 'restore-pending.json');

function sizeOf(dir) {
  let bytes = 0, files = 0;
  const walk = d => { for (const n of readdirSync(d)) { const f = path.join(d, n), st = statSync(f); if (st.isDirectory()) walk(f); else { bytes += st.size; files++; } } };
  if (existsSync(dir)) walk(dir);
  return { bytes, files };
}
const schemaCount = file => { const d = new DatabaseSync(file, { readOnly: true }); try { return d.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n; } finally { d.close(); } };
// Mở bản sao lưu chỉ để đọc và kiểm tra toàn vẹn; trả về số lần nâng cấp cấu trúc đã có trong nó.
function inspectDb(file) {
  let d;
  try {
    d = new DatabaseSync(file, { readOnly: true });
    const ok = d.prepare('PRAGMA integrity_check').get();
    if (!ok || Object.values(ok)[0] !== 'ok') throw new Error('integrity');
    return d.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n;
  } catch { throw new SimError(400, 'Bản sao lưu này bị hỏng hoặc không phải cơ sở dữ liệu của Công ty AI nên không dùng để khôi phục được.'); }
  finally { try { d?.close(); } catch { /* đã đóng */ } }
}

export function createBackups({ db, dataDir, version = '', now = Date.now, currentSchema = () => db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n }) {
  const root = backupsDir(dataDir);
  const dirOf = id => { if (typeof id !== 'string' || !ID_RE.test(id)) throw new SimError(404, 'Không có bản sao lưu này.'); const d = path.join(root, id); if (!existsSync(path.join(d, 'manifest.json'))) throw new SimError(404, 'Không có bản sao lưu này.'); return d; };
  const manifestOf = d => { try { return JSON.parse(readFileSync(path.join(d, 'manifest.json'), 'utf8')); } catch { return null; } };

  function create(reason = 'manual') {
    const t = new Date(now()).toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const base = (reason === 'before-restore' ? 'truoc-khoi-phuc-' : '') + `${t.slice(0, 8)}-${t.slice(8)}`;
    let id = base, n = 2;
    while (existsSync(path.join(root, id))) id = `${base}-${n++}`;
    const dir = path.join(root, id);
    mkdirSync(dir, { recursive: true });
    try {
      db.prepare('VACUUM INTO ?').run(path.join(dir, 'company.db'));
      const proj = path.join(dataDir, 'projects');
      if (existsSync(proj)) cpSync(proj, path.join(dir, 'projects'), { recursive: true });
      const p = sizeOf(path.join(dir, 'projects'));
      const manifest = {
        id, reason, createdAt: new Date(now()).toISOString(), version, schema: db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n,
        dbBytes: statSync(path.join(dir, 'company.db')).size, projects: db.prepare('SELECT COUNT(*) n FROM projects').get().n, files: p.files, fileBytes: p.bytes
      };
      writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
      prune();
      return manifest;
    } catch (e) { rmSync(dir, { recursive: true, force: true }); throw e instanceof SimError ? e : new SimError(500, 'Không sao lưu được: ' + String(e.code || e.message).slice(0, 80)); }
  }
  function list() {
    if (!existsSync(root)) return [];
    return readdirSync(root).filter(n => ID_RE.test(n)).map(n => manifestOf(path.join(root, n))).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id));
  }
  // Giữ 10 bản gần nhất (tự động và thủ công) và 3 bản an toàn trước lần khôi phục.
  function prune() {
    const all = list(), norm = all.filter(m => m.reason !== 'before-restore'), safe = all.filter(m => m.reason === 'before-restore');
    for (const m of [...norm.slice(KEEP), ...safe.slice(KEEP_SAFETY)]) rmSync(path.join(root, m.id), { recursive: true, force: true });
  }
  function remove(id) { rmSync(dirOf(id), { recursive: true, force: true }); const p = pending(); if (p?.id === id) cancelRestore(); return { ok: true }; }
  const pending = () => { try { const j = JSON.parse(readFileSync(pendingFile(dataDir), 'utf8')); return ID_RE.test(j.id) ? j : null; } catch { return null; } };
  function requestRestore(id) {
    const d = dirOf(id);
    const s = inspectDb(path.join(d, 'company.db'));
    if (s > currentSchema()) throw new SimError(400, 'Bản sao lưu này được tạo bởi một phiên bản mới hơn của ứng dụng. Hãy cập nhật ứng dụng trước (cap-nhat.bat) rồi khôi phục.');
    writeFileSync(pendingFile(dataDir), JSON.stringify({ id, requestedAt: new Date(now()).toISOString() }));
    return { pending: true, id };
  }
  function cancelRestore() { try { unlinkSync(pendingFile(dataDir)); } catch { /* không có thì thôi */ } return { pending: false }; }
  // Tự sao lưu nếu bản gần nhất đã cũ hơn maxAgeHours (mặc định 24 giờ).
  function maybeAuto(maxAgeHours = 24) {
    const last = list().filter(m => m.reason !== 'before-restore')[0];
    if (last && now() - Date.parse(last.createdAt) < maxAgeHours * 3600 * 1000) return null;
    return create('auto');
  }
  return { create, list, remove, requestRestore, cancelRestore, pending, maybeAuto, prune, dir: root };
}

// Gọi lúc khởi động, TRƯỚC khi mở cơ sở dữ liệu. Có lệnh chờ thì: chụp bản an toàn của dữ liệu hiện tại, rồi thay bằng bản sao lưu đã chọn.
// Lỗi giữa chừng không làm ứng dụng không khởi động được: lệnh chờ bị xoá để không lặp mãi, và bản an toàn vẫn còn.
export function applyPendingRestore({ dataDir, dbFile, now = Date.now, log = console.log }) {
  const pf = pendingFile(dataDir);
  if (!existsSync(pf)) return null;
  let req; try { req = JSON.parse(readFileSync(pf, 'utf8')); } catch { req = null; }
  const drop = () => { try { unlinkSync(pf); } catch { /* đã xoá */ } };
  if (!req || !ID_RE.test(String(req.id))) { drop(); return { ok: false, error: 'Lệnh khôi phục không hợp lệ.' }; }
  const src = path.join(backupsDir(dataDir), req.id);
  if (!existsSync(path.join(src, 'company.db'))) { drop(); return { ok: false, id: req.id, error: 'Không còn bản sao lưu này.' }; }
  try {
    inspectDb(path.join(src, 'company.db'));
    let safety = null;
    if (existsSync(dbFile)) {
      const t = new Date(now()).toISOString().replace(/[-:T]/g, '').slice(0, 14);
      safety = `truoc-khoi-phuc-${t.slice(0, 8)}-${t.slice(8)}`;
      const sd = path.join(backupsDir(dataDir), safety); mkdirSync(sd, { recursive: true });
      const cur = new DatabaseSync(dbFile);
      try { cur.prepare('VACUUM INTO ?').run(path.join(sd, 'company.db')); const n = schemaCount(path.join(sd, 'company.db')); writeFileSync(path.join(sd, 'manifest.json'), JSON.stringify({ id: safety, reason: 'before-restore', createdAt: new Date(now()).toISOString(), schema: n, dbBytes: statSync(path.join(sd, 'company.db')).size, projects: 0, files: 0, fileBytes: 0 })); }
      finally { cur.close(); }
      if (existsSync(path.join(dataDir, 'projects'))) cpSync(path.join(dataDir, 'projects'), path.join(sd, 'projects'), { recursive: true });
    }
    for (const ext of ['-wal', '-shm']) { try { unlinkSync(dbFile + ext); } catch { /* không có */ } }
    copyFileSync(path.join(src, 'company.db'), dbFile + '.restoring'); renameSync(dbFile + '.restoring', dbFile);
    rmSync(path.join(dataDir, 'projects'), { recursive: true, force: true });
    if (existsSync(path.join(src, 'projects'))) cpSync(path.join(src, 'projects'), path.join(dataDir, 'projects'), { recursive: true });
    drop();
    log(`Đã khôi phục dữ liệu từ bản sao lưu ${req.id}.${safety ? ` Dữ liệu trước đó được giữ ở ${safety}.` : ''}`);
    return { ok: true, id: req.id, safety };
  } catch (e) {
    drop();
    log('Khôi phục thất bại: ' + e.message);
    return { ok: false, id: req.id, error: e instanceof SimError ? e.message : 'Không khôi phục được: ' + String(e.code || e.message).slice(0, 80) };
  }
}
