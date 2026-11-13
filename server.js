import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/app.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(dir, 'config.json'), 'utf8'));
const port = Number(process.env.PORT) || config.port || 3000;

// Báo ngay nếu các tệp giao diện không khớp nhau (thường do chép thiếu hoặc chưa ghi đè tệp): lúc đó trang sẽ trắng.
// Đây chỉ là công cụ phụ: nếu chính nó bị hỏng thì chỉ cảnh báo, máy chủ vẫn khởi động.
try {
  const { checkFrontend } = await import('./src/checkfront.js');
  const fc = checkFrontend(path.join(dir, 'public'));
  if (!fc.ok) {
    console.warn('\n⚠ CẢNH BÁO: các tệp giao diện đang không khớp nhau, trang web sẽ bị trắng:');
    for (const i of fc.issues.slice(0, 8)) console.warn('  - ' + i.text);
    console.warn('  Cách sửa nhanh nhất: chạy cap-nhat.bat (hoặc: node cap-nhat.mjs) trong thư mục này, rồi mở lại start.bat và nhấn Ctrl + F5.\n');
  }
} catch (e) {
  console.warn('\n⚠ Không chạy được bộ kiểm tra giao diện (' + e.message + ').');
  console.warn('  Tệp src/checkfront.js có thể bị chép sai. Hãy chạy cap-nhat.bat (hoặc: node cap-nhat.mjs) để cập nhật đúng tất cả các tệp.\n');
}

const app = createApp({ dbFile: path.join(dir, 'data', 'company.db'), config, port });
app.server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Cổng ${port} đang được dùng. Đổi "port" trong config.json hoặc đặt biến PORT.` : e);
  process.exit(1);
});
// Chỉ lắng nghe trên máy này, không mở ra mạng.
app.server.listen(port, '127.0.0.1', () => {
  console.log(`${config.brandName} đang chạy tại http://localhost:${port}`);
  console.log('Nhấn Ctrl+C để dừng.');
  app.sim.start();
  // Tự sao lưu mỗi ngày (kiểm tra lại mỗi 6 giờ). Lỗi sao lưu không bao giờ làm sập ứng dụng.
  const auto = () => { try { const m = app.backups?.maybeAuto(); if (m) console.log(`Đã tự sao lưu dữ liệu: ${m.id}`); } catch (e) { console.warn('Tự sao lưu thất bại: ' + e.message); } };
  auto(); setInterval(auto, 6 * 3600 * 1000).unref();
});
process.on('SIGINT', () => { app.close(); process.exit(0); });
