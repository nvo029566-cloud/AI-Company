import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Kiểm tra tĩnh THẬT trên các tệp sản phẩm: chỉ đọc và phân tích cú pháp, KHÔNG BAO GIỜ chạy mã do AI viết.
// (vm.Script chỉ biên dịch để bắt lỗi cú pháp, không thực thi.)
const SEV = { high: 0, medium: 1, low: 2 };
const BALANCE = ['div', 'span', 'a', 'button', 'form', 'section', 'main', 'header', 'footer', 'nav', 'ul', 'ol', 'table', 'script', 'style'];

const strip = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, m => m.replace(/>[\s\S]*<\/script>/i, '></script>')).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, m => m.replace(/>[\s\S]*<\/style>/i, '></style>'));

export function runChecks({ root, files, kind }) {
  const findings = [];
  const dir = path.resolve(root);
  const have = new Set(files.map(f => f.path));
  const htmlIds = new Set(), codeIds = new Set(), jsFiles = [];            // id có trong HTML, id mà mã JavaScript tự tạo ra, và các tệp JavaScript để đối chiếu cuối cùng
  const deptOf = new Map(files.map(f => [f.path, f.deptCode]));
  const add = (severity, title, detail, file) => findings.push({ severity, title: title.slice(0, 120), detail: detail.slice(0, 400), file: file || null, dept: file ? deptOf.get(file) || null : null });
  for (const f of files) {
    const full = path.resolve(dir, f.path);
    if (!full.startsWith(dir + path.sep) || !existsSync(full)) { add('high', `Tệp ghi nhận nhưng không còn trên ổ đĩa: ${f.path}`, 'Tệp đã bị xoá hoặc di chuyển.', f.path); continue; }
    let src; try { src = readFileSync(full, 'utf8'); } catch { continue; }
    const ext = path.posix.extname(f.path).toLowerCase();
    if (src.trim().length === 0) { add('medium', `Tệp rỗng: ${f.path}`, 'Tệp không có nội dung.', f.path); continue; }
    if (ext === '.js') {
      jsFiles.push({ f, src });
      for (const m of src.matchAll(/\bid\s*=\s*\\?["']([\w-]+)\\?["']|\.id\s*=\s*["']([\w-]+)["']|setAttribute\(\s*["']id["']\s*,\s*["']([\w-]+)["']/g)) codeIds.add(m[1] || m[2] || m[3]);
      if (/\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(/.test(src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''))) add('medium', `Dùng eval, new Function hoặc document.write trong ${f.path}`, 'Các hàm này chạy chữ như mã nên dễ bị chèn mã độc và khó kiểm soát.', f.path);
      if (/\.listen\(\s*[\w.]+\s*\)|["']0\.0\.0\.0["']/.test(src)) add('medium', `Máy chủ trong ${f.path} mở ra toàn mạng`, 'Nên chỉ lắng nghe trên 127.0.0.1 để người khác trong mạng không truy cập được.', f.path);
      try { new vm.Script(src, { filename: f.path }); }
      catch (e) { if (!/import|export|await/i.test(String(e.message))) add('high', `Lỗi cú pháp JavaScript trong ${f.path}`, String(e.message), f.path); }
    } else if (ext === '.json') {
      let j; try { j = JSON.parse(src); } catch (e) { add('high', `JSON không hợp lệ: ${f.path}`, String(e.message), f.path); }
      if (j && path.posix.basename(f.path) === 'manifest.json' && (!j.name || !j.start_url)) add('medium', `manifest.json thiếu name hoặc start_url`, 'Ứng dụng dạng PWA cần cả hai trường này để cài được lên điện thoại.', f.path);
    } else if (ext === '.css') {
      const o = (src.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{/g) || []).length, c = (src.replace(/\/\*[\s\S]*?\*\//g, '').match(/\}/g) || []).length;
      if (o !== c) add('medium', `Ngoặc nhọn CSS không khớp trong ${f.path}`, `Có ${o} dấu { và ${c} dấu }.`, f.path);
    } else if (ext === '.html' || ext === '.htm') {
      const h = strip(src);
      const seen = new Map();
      for (const m of h.matchAll(/\sid\s*=\s*["']([\w-]+)["']/gi)) { seen.set(m[1], (seen.get(m[1]) || 0) + 1); htmlIds.add(m[1]); }
      for (const [id, n] of seen) if (n > 1) add('medium', `id "${id}" bị trùng ${n} lần trong ${f.path}`, 'Mỗi id chỉ được dùng một lần, nếu không JavaScript sẽ chỉ thấy phần tử đầu tiên.', f.path);
      const noAlt = (h.match(/<img\b(?![^>]*\balt\s*=)[^>]*>/gi) || []).length;
      if (noAlt) add('low', `${noAlt} thẻ <img> thiếu thuộc tính alt trong ${f.path}`, 'Người dùng đọc màn hình và công cụ tìm kiếm cần chữ mô tả ảnh.', f.path);
      if (!/<!doctype html/i.test(src)) add('low', `Thiếu khai báo <!doctype html> trong ${f.path}`, 'Trình duyệt sẽ chạy ở chế độ tương thích cũ.', f.path);
      for (const tag of BALANCE) {
        const o = (h.match(new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi')) || []).filter(m => !/\/>$/.test(m)).length, c = (h.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
        if (o !== c) add('medium', `Thẻ <${tag}> mở ${o} lần nhưng đóng ${c} lần trong ${f.path}`, 'Các thẻ không khớp nhau có thể làm vỡ bố cục.', f.path);
      }
      const base = path.posix.dirname(f.path);
      for (const m of h.matchAll(/\b(?:src|href)\s*=\s*["']([^"'#?]+)[^"']*["']/gi)) {
        const ref = m[1].trim();
        if (!ref || /^(https?:|\/\/|data:|mailto:|tel:|javascript:|#)/i.test(ref)) continue;
        const target = path.posix.normalize(path.posix.join(base, ref));
        if (!have.has(target) && /\.(js|css|json|png|svg|jpg|jpeg|webp|ico|html)$/i.test(target)) add('medium', `Tệp được tham chiếu nhưng không có: ${ref}`, `${f.path} gọi tới "${ref}" nhưng dự án không có tệp này.`, f.path);
      }
    }
  }
  // Đối chiếu chéo: mã JavaScript tìm phần tử theo id mà không tệp HTML nào có (lỗi hay gặp khi hai phòng viết song song).
  if (htmlIds.size) for (const { f, src } of jsFiles) {
    const missing = new Set();
    for (const m of src.matchAll(/getElementById\(\s*["']([\w-]+)["']\s*\)|querySelector(?:All)?\(\s*["']#([\w-]+)["']\s*\)/g)) { const id = m[1] || m[2]; if (!htmlIds.has(id) && !codeIds.has(id)) missing.add(id); }
    if (missing.size) add('medium', `${f.path} tìm phần tử #${[...missing][0]} nhưng HTML không có${missing.size > 1 ? ` (và ${missing.size - 1} id khác)` : ''}`, `Các id thiếu: ${[...missing].slice(0, 6).join(', ')}. Có thể giao diện và mã đang dùng hai tên khác nhau.`, f.path);
  }
  if (['web', 'landing', 'mobile'].includes(kind) && !have.has('index.html')) add('high', 'Thiếu tệp index.html', 'Sản phẩm dạng trang web cần có index.html ở thư mục gốc để mở được.', null);
  findings.sort((a, b) => SEV[a.severity] - SEV[b.severity] || String(a.file).localeCompare(String(b.file)));
  return findings.slice(0, 12);
}
