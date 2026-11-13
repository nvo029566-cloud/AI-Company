import { mkdirSync, writeFileSync, readFileSync, lstatSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

// Tệp sản phẩm do agent tạo ra. Mọi đường dẫn do AI đưa ra đều bị coi là không đáng tin:
// chỉ cho ghi tệp chữ có đuôi cho phép, bên trong thư mục của đúng dự án, không tệp ẩn, không thoát lên thư mục cha, không tên đặc biệt của Windows.
export const ALLOWED_EXT = new Set(['.md', '.txt', '.html', '.htm', '.css', '.js', '.json', '.svg', '.py', '.csv', '.xml', '.yml', '.yaml', '.sql', '.ts']);
export const LIMITS = { fileBytes: 200 * 1024, callFiles: 12, callBytes: 600 * 1024, projectFiles: 60, projectBytes: 4 * 1024 * 1024, readBytes: 200 * 1024 };
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const SEG_RE = /^[\p{L}\p{N}_ -][\p{L}\p{N}._ -]*$/u;

export function sanitizePath(p) {
  if (typeof p !== 'string') return { error: 'đường dẫn phải là chữ' };
  let s = p.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (!s) return { error: 'đường dẫn rỗng' };
  if (s.length > 100) return { error: 'đường dẫn quá dài' };
  if (s.startsWith('/') || /^[a-zA-Z]:/.test(s) || s.includes(':')) return { error: 'đường dẫn tuyệt đối hoặc có dấu hai chấm' };
  const segs = s.split('/');
  if (segs.length > 5) return { error: 'thư mục lồng quá sâu' };
  for (const seg of segs) {
    if (seg === '' || seg === '.' || seg === '..') return { error: 'đường dẫn có đoạn rỗng hoặc ".."' };
    if (seg.startsWith('.')) return { error: 'tệp ẩn không được phép' };
    if (/[. ]$/.test(seg)) return { error: 'tên kết thúc bằng dấu chấm hoặc khoảng trắng' };
    if (!SEG_RE.test(seg)) return { error: 'tên có ký tự không được phép' };
    if (RESERVED.test(seg.split('.')[0])) return { error: 'tên đặc biệt của hệ điều hành' };
  }
  const ext = path.posix.extname(s).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return { error: `đuôi tệp "${ext || '(không có)'}" không được phép` };
  return { path: s };
}

export const projectDir = (root, projectId) => path.join(root, 'projects', String(projectId));
const inside = (dir, target) => target === dir || target.startsWith(dir + path.sep);

// Ghi một loạt tệp cho một dự án. Trả về { written, rejected } và không bao giờ ném lỗi vì một tệp xấu.
export function writeProjectFiles({ db, root, projectId, deptCode, files }) {
  const written = [], rejected = [];
  const dir = path.resolve(projectDir(root, projectId));
  const list = Array.isArray(files) ? files : [];
  const used = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(size), 0) b FROM project_files WHERE project_id = ?').get(projectId);
  let count = used.n, bytes = used.b, callBytes = 0, accepted = 0;
  const getOne = db.prepare('SELECT size FROM project_files WHERE project_id = ? AND path = ?');
  const upsert = db.prepare(`INSERT INTO project_files (project_id, path, dept_code, size) VALUES (?,?,?,?)
    ON CONFLICT(project_id, path) DO UPDATE SET dept_code = excluded.dept_code, size = excluded.size, version = version + 1, updated_at = datetime('now')`);
  for (const f of list) {
    const name = typeof f?.path === 'string' ? f.path.slice(0, 100) : '(không tên)';
    if (accepted >= LIMITS.callFiles) { rejected.push({ path: name, reason: `vượt ${LIMITS.callFiles} tệp mỗi lần` }); continue; }
    const sp = sanitizePath(f?.path);
    if (sp.error) { rejected.push({ path: name, reason: sp.error }); continue; }
    if (typeof f.content !== 'string') { rejected.push({ path: sp.path, reason: 'nội dung phải là chữ' }); continue; }
    const content = f.content.replace(/\u0000/g, '');
    const size = Buffer.byteLength(content, 'utf8');
    if (size > LIMITS.fileBytes) { rejected.push({ path: sp.path, reason: 'tệp quá lớn' }); continue; }
    const prev = getOne.get(projectId, sp.path);
    const addBytes = size - (prev ? prev.size : 0);
    if (callBytes + size > LIMITS.callBytes) { rejected.push({ path: sp.path, reason: 'tổng dung lượng một lần quá lớn' }); continue; }
    if (!prev && count >= LIMITS.projectFiles) { rejected.push({ path: sp.path, reason: `dự án đã đủ ${LIMITS.projectFiles} tệp` }); continue; }
    if (bytes + addBytes > LIMITS.projectBytes) { rejected.push({ path: sp.path, reason: 'dự án đã hết dung lượng cho phép' }); continue; }
    const target = path.resolve(dir, sp.path);
    if (!inside(dir, target) || target === dir) { rejected.push({ path: sp.path, reason: 'nằm ngoài thư mục dự án' }); continue; }
    try {
      if (existsSync(target) && (lstatSync(target).isSymbolicLink() || lstatSync(target).isDirectory())) { rejected.push({ path: sp.path, reason: 'trùng với thư mục hoặc liên kết' }); continue; }
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content, 'utf8');
    } catch (e) { rejected.push({ path: sp.path, reason: 'không ghi được: ' + String(e.code || e.message).slice(0, 40) }); continue; }
    upsert.run(projectId, sp.path, deptCode, size);
    if (!prev) count++;
    bytes += addBytes; callBytes += size; accepted++;
    written.push({ path: sp.path, size });
  }
  return { written, rejected };
}

export const listFiles = (db, projectId) => db.prepare('SELECT path, dept_code AS deptCode, size, version, updated_at AS updatedAt FROM project_files WHERE project_id = ? ORDER BY path').all(projectId);

// Đọc một tệp: chỉ các tệp đã ghi nhận trong cơ sở dữ liệu mới đọc được, nên không thể dùng để đọc tệp tuỳ ý trên ổ đĩa.
export function readProjectFile({ db, root, projectId, rel, maxBytes = LIMITS.readBytes }) {
  const sp = sanitizePath(rel);
  if (sp.error) return null;
  const row = db.prepare('SELECT path, dept_code AS deptCode, size, version, updated_at AS updatedAt FROM project_files WHERE project_id = ? AND path = ?').get(projectId, sp.path);
  if (!row) return null;
  const dir = path.resolve(projectDir(root, projectId)), target = path.resolve(dir, row.path);
  if (!inside(dir, target) || !existsSync(target) || lstatSync(target).isSymbolicLink() || !statSync(target).isFile()) return null;
  let content = readFileSync(target, 'utf8'), truncated = false;
  if (Buffer.byteLength(content, 'utf8') > maxBytes) { content = Buffer.from(content, 'utf8').subarray(0, maxBytes).toString('utf8'); truncated = true; }
  return { ...row, content, truncated };
}
