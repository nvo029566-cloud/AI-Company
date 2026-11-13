// Nội dung màn hình trong phòng (ý 1 và 2): dữ liệu thật từ bộ mô phỏng. Thuần tính toán, kiểm thử được ngoài trình duyệt.
// Kết quả là đối tượng JSON đơn giản; so sánh chuỗi JSON để biết có cần vẽ lại màn hình hay không.
const clamp01 = v => Math.min(1, Math.max(0, v));

// runs: danh sách lượt chạy từ bộ mô phỏng. flash: { title, from } khi hồ sơ vừa tới tay trưởng phòng (màn hình nháy "Hồ sơ mới").
export function screenModel({ code, name, color, runs = [], flash = null, projColor = () => '#6d5ef0', done = 0, clock = '' }) {
  const m = { code, name, color, mode: 'idle', rows: [], queued: 0, incoming: 0, total: runs.length, done, clock };
  if (code === 'CEO' || code === '01') {                      // phòng điều hành và CEO: tổng quan mọi dự án đang chạy
    m.rows = runs.slice(0, 3).map(r => ({ title: r.title, sub: `Bước ${Math.min(r.stage + 1, r.total)}/${r.total}`, pct: Math.round(clamp01(r.stage / Math.max(1, r.total)) * 100), color: projColor(r.id) }));
    m.overview = true;
  }
  const items = [];
  for (const r of runs) for (const it of r.items || []) if (it.dept === code) items.push({ r, it });
  const working = items.filter(x => x.it.state === 'working').sort((a, b) => b.it.progress - a.it.progress);
  m.queued = items.filter(x => x.it.state === 'queued' && !x.it.inTransit).length;
  m.incoming = items.filter(x => x.it.state === 'queued' && x.it.inTransit).length;
  if (!m.overview) m.rows = working.slice(0, 2).map(({ r, it }) => ({ title: r.title, sub: it.travelling ? 'Người hỗ trợ đang tới…' : it.title, pct: it.travelling ? 0 : Math.round(clamp01(it.progress) * 100), color: projColor(r.id), borrowed: !!it.borrowed }));
  m.working = working.length;
  if (flash) { m.mode = 'new'; m.flash = { title: flash.title || '', from: flash.from || '' }; }
  else if (m.overview) m.mode = runs.length ? 'working' : 'idle';
  else if (working.length) m.mode = 'working';
  else if (m.queued) m.mode = 'queued';
  else if (m.incoming) m.mode = 'incoming';
  return m;
}
export const modelKey = m => JSON.stringify(m);
// Màn hình nháy lúc có hồ sơ mới cần vẽ lại thường xuyên (để hiệu ứng nhấp nháy chạy); các chế độ khác chỉ vẽ khi dữ liệu đổi.
export const animated = m => m.mode === 'new' || m.mode === 'incoming' || (m.mode === 'idle' && !!m.clock);
