import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/app.js';
import { checkFrontend } from './src/checkfront.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(dir, 'config.json'), 'utf8'));
const port = Number(process.env.PORT) || config.port || 3000;

// Báo ngay nếu các tệp giao diện không khớp nhau (thường do chép thiếu hoặc chưa ghi đè tệp): lúc đó trang sẽ trắng.
const fc = checkFrontend(path.join(dir, 'public'));
if (!fc.ok) {
  console.warn('\n⚠ CẢNH BÁO: các tệp giao diện đang không khớp nhau, trang web sẽ bị trắng:');
  for (const i of fc.issues.slice(0, 8)) console.warn('  - ' + i.text);
  console.warn('  Hãy chép đè các tệp được nhắc ở trên bằng bản mới nhất, mở lại start.bat rồi nhấn Ctrl + F5.\n');
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
});
process.on('SIGINT', () => { app.close(); process.exit(0); });