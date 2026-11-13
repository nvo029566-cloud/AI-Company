// Kiểm tra các tệp giao diện (public/js) có khớp nhau không: mọi dòng "import { ... } from './x.js'" phải trỏ tới tệp có thật
// và tệp đó phải xuất đúng những tên được nhập. Khi chép thiếu hoặc chưa ghi đè một tệp thì trình duyệt sẽ không nạp nổi
// và cả trang trắng xoá; kiểm tra này chỉ ra chính xác tệp nào lệch.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const f = path.join(dir, name);
    if (statSync(f).isDirectory()) out.push(...walk(f)); else if (name.endsWith('.js')) out.push(f);
  }
  return out;
}
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const nameOf = part => part.trim().split(/\s+as\s+/)[0].trim();
const exportedAs = part => part.trim().split(/\s+as\s+/).pop().trim();


// Đọc mọi tên trong một câu khai báo "const a = 1, b = [2, 3], { c, d } = x;" bắt đầu từ vị trí i: tách theo dấu phẩy ở ngoài cùng.
function declaredNames(code, i) {
  const names = []; let depth = 0, expectName = true, quote = '', last = '';
  for (; i < code.length; i++) {
    const ch = code[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (expectName && depth === 0) {
      if (/\s/.test(ch)) continue;
      if (ch === '{' || ch === '[') {                                          // dạng phân rã: lấy các tên trong ngoặc
        let j = i + 1, d = 1; while (j < code.length && d) { if ('{['.includes(code[j])) d++; else if ('}]'.includes(code[j])) d--; j++; }
        for (const part of code.slice(i + 1, j - 1).split(',')) { const n = part.split(':').pop().split('=')[0].trim(); if (/^[\w$]+$/.test(n)) names.push(n); }
        i = j - 1; expectName = false; continue;
      }
      const m = /^[\w$]+/.exec(code.slice(i, i + 80));
      if (m) { names.push(m[0]); i += m[0].length - 1; expectName = false; continue; }
    }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) expectName = true;
    else if (ch === ';' && depth === 0) break;
    else if (ch === '\n' && depth === 0) {                                     // không có dấu chấm phẩy: hết câu nếu dòng chưa bị bỏ lửng
      const next = /\S/.exec(code.slice(i + 1)); const nx = next ? next[0] : '';
      if (!',=+-*/&|?:.([{'.includes(last) && !',=+-*/&|?:.'.includes(nx)) break;
    }
    if (!/\s/.test(ch)) last = ch;
  }
  return names;
}

export function parseModule(src) {
  const code = stripComments(src), imports = [], exports = new Set();
  for (const m of code.matchAll(/import\s*(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s*as\s+[\w$]+)?\s*from\s*['"]([^'"]+)['"]/g)) {
    const names = m[2] ? m[2].split(',').map(nameOf).filter(Boolean) : [];
    if (m[1]) names.push('default');
    imports.push({ from: m[3], names });
  }
  for (const m of code.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) imports.push({ from: m[1], names: [] });
  for (const m of code.matchAll(/export\s+(?:async\s+)?function\s*\*?\s*([\w$]+)/g)) exports.add(m[1]);
  for (const m of code.matchAll(/export\s+class\s+([\w$]+)/g)) exports.add(m[1]);
  for (const m of code.matchAll(/export\s+(?:const|let|var)\s/g)) for (const n of declaredNames(code, m.index + m[0].length)) exports.add(n);
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(',').filter(x => x.trim()).forEach(p => exports.add(exportedAs(p)));
  if (/export\s+default\b/.test(code)) exports.add('default');
  return { imports, exports, star: /export\s*\*\s*from/.test(code) };
}

export function checkFrontend(publicDir) {
  const issues = [], cache = new Map();
  const load = f => { if (!cache.has(f)) cache.set(f, existsSync(f) ? parseModule(readFileSync(f, 'utf8')) : null); return cache.get(f); };
  const rel = f => path.relative(publicDir, f).split(path.sep).join('/');
  const jsDir = path.join(publicDir, 'js');
  if (!existsSync(jsDir)) return { ok: false, files: 0, issues: [{ kind: 'missing-file', file: 'js', from: 'js', text: 'Không thấy thư mục public/js. Có thể bạn đã chép sai chỗ.' }] };
  const files = walk(jsDir);
  for (const file of files) {
    const mod = load(file);
    for (const imp of mod.imports) {
      if (!imp.from.startsWith('.') && !imp.from.startsWith('/')) continue;                       // thư viện ngoài: không có trong dự án này
      const target = imp.from.startsWith('/') ? path.join(publicDir, imp.from) : path.resolve(path.dirname(file), imp.from);
      const dep = load(target);
      if (!dep) { issues.push({ kind: 'missing-file', file: rel(file), from: imp.from, text: `${rel(file)} cần tệp ${rel(target)} nhưng tệp này không có (bạn đã chép thiếu tệp này).` }); continue; }
      if (dep.star) continue;
      for (const n of imp.names) if (!dep.exports.has(n)) issues.push({ kind: 'missing-export', file: rel(file), from: imp.from, name: n, text: `${rel(file)} cần "${n}" từ ${rel(target)}, nhưng tệp ${path.basename(target)} trên máy bạn không có tên này (thường là bản cũ: hãy chép đè tệp ${path.basename(target)} bản mới).` });
    }
  }
  return { ok: issues.length === 0, files: files.length, issues };
}