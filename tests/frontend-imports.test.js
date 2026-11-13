// Các tệp giao diện phải khớp nhau: tệp nào "import" một tên thì tệp kia phải "export" đúng tên đó. Nếu chép thiếu hoặc chưa ghi đè
// một tệp thì trình duyệt không nạp nổi và cả trang trắng xoá; bộ kiểm tra này chỉ ra tệp nào lệch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFrontend, parseModule } from '../src/checkfront.js';
import { createApp } from '../src/app.js';

const here = path.dirname(fileURLToPath(import.meta.url)), PUBLIC = path.join(here, '..', 'public');
function tree(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'cty-fe-'));
  for (const [rel, src] of Object.entries(files)) { const f = path.join(root, 'js', rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, src); }
  return root;
}

test('toàn bộ giao diện trong dự án khớp nhau (không tệp nào thiếu, không tên nào lệch)', () => {
  const r = checkFrontend(PUBLIC);
  assert.ok(r.files >= 15, `chỉ thấy ${r.files} tệp`);
  assert.deepEqual(r.issues.map(i => i.text), []);
});

test('phát hiện tệp cũ thiếu tên được nhập', () => {
  const root = tree({ 'a.js': "import { x, y } from './b.js';", 'b.js': 'export const x = 1;' });
  const r = checkFrontend(root);
  assert.equal(r.ok, false);
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].kind, 'missing-export'); assert.equal(r.issues[0].name, 'y');
  assert.match(r.issues[0].text, /b\.js/);
});

test('phát hiện tệp bị chép thiếu hoàn toàn', () => {
  const r = checkFrontend(tree({ 'a.js': "import { x } from './gl/b.js';" }));
  assert.equal(r.issues.length, 1); assert.equal(r.issues[0].kind, 'missing-file');
});

test('hiểu đủ các kiểu khai báo xuất: nhiều tên một dòng, nhiều dòng, phân rã, đổi tên, hàm, lớp', () => {
  const m = parseModule("export const W = 48, RD = 9, ROW_Z = [0, 12, 24],\n  D = 33;\nexport const { a, b: c } = o;\nexport function f() {}\nexport async function g() {}\nexport class K {}\nexport { x as y, z };\nexport const s = 'a,b;c', q = 1\n// export const bi_bo_qua = 1\n");
  for (const n of ['W', 'RD', 'ROW_Z', 'D', 'a', 'c', 'f', 'g', 'K', 'y', 'z', 's', 'q']) assert.ok(m.exports.has(n), `thiếu ${n}`);
  assert.ok(!m.exports.has('bi_bo_qua'), 'chú thích không được tính');
});

test('hiểu import có đổi tên và import nhiều dòng; bỏ qua thư viện ngoài', () => {
  const root = tree({
    'a.js': "import {\n  p,\n  q as r\n} from './b.js';\nimport * as all from './b.js';\nimport thuVien from 'thu-vien-ngoai';",
    'b.js': 'export const p = 1, q = 2;'
  });
  assert.equal(checkFrontend(root).ok, true);
});

test('đường dẫn /api/frontend-check báo đúng tình trạng', async () => {
  const PORT = 3993;
  const app = createApp({ dbFile: ':memory:', config: { brandName: 'T', tagline: 't', currency: 'USD', monthlyBudget: 100 }, port: PORT });
  await new Promise(r => app.server.listen(PORT, '127.0.0.1', r));
  try {
    const j = await (await fetch(`http://127.0.0.1:${PORT}/api/frontend-check`)).json();
    assert.equal(j.ok, true); assert.ok(j.files >= 15); assert.deepEqual(j.issues, []);
  } finally { app.close(); }
});

test('trang chính nạp đoạn báo lỗi trước mô-đun chính, và đoạn báo lỗi là tệp riêng (chính sách bảo mật không cho mã nhúng)', () => {
  const html = readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const g = html.indexOf('/js/boot-guard.js'), m = html.indexOf('/js/app.js');
  assert.ok(g > 0 && m > g, 'boot-guard phải đứng trước app.js');
  assert.ok(!/<script(?![^>]*src=)[^>]*>/.test(html), 'không được dùng script nhúng trong trang');
});