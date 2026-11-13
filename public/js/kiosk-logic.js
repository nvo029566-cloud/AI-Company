// Chế độ trình chiếu: phần tính toán thuần (không đụng DOM) để kiểm thử được.
export const SECONDS = { overview: 9, room: 10, follow: 14 };

// Kế hoạch một vòng "tham quan" cho camera: toàn cảnh, rồi theo dõi các dự án đang chạy, rồi các phòng đang bận nhất.
// Công ty đang rảnh thì luân phiên qua vài phòng (theo `cycle`) để màn hình không đứng yên.
export function planTour({ runs = [], rooms = [], cycle = 0, names = {} } = {}) {
  const nm = c => names[c] || c;
  const steps = [{ type: 'overview', seconds: SECONDS.overview, label: 'Toàn cảnh văn phòng' }];
  const dept = rooms.filter(r => r && r.code !== 'CEO' && r.code !== 'LNG');
  for (const r of runs.slice(0, 3)) steps.push({ type: 'follow', runId: r.id, seconds: SECONDS.follow, label: `Theo dõi dự án: ${String(r.title).slice(0, 60)}` });
  const busy = dept.filter(r => r.work > 0).sort((a, b) => b.work - a.work || String(a.code).localeCompare(String(b.code))).slice(0, 3);
  for (const r of busy) steps.push({ type: 'room', code: r.code, seconds: SECONDS.room, label: `Phòng ${nm(r.code)}: ${r.work} người đang làm` });
  if (!runs.length && !busy.length) {
    const all = [...dept].sort((a, b) => String(a.code).localeCompare(String(b.code)));
    for (let k = 0; k < 3 && all.length; k++) { const r = all[(cycle * 3 + k) % all.length]; steps.push({ type: 'room', code: r.code, seconds: SECONDS.room, label: `Phòng ${nm(r.code)}` }); }
    const spec = rooms.find(r => r.code === (cycle % 2 ? 'LNG' : 'CEO'));
    if (spec) steps.push({ type: 'room', code: spec.code, seconds: SECONDS.room, label: spec.code === 'CEO' ? 'Phòng CEO' : 'Phòng nghỉ' });
  }
  return steps;
}

// Dòng chữ chạy ở chân màn hình cho mỗi lần chuyển hồ sơ.
export function tickerLine(ev, names = {}) {
  const nm = c => (c === 'CEO' ? 'CEO' : names[c] || c);
  const clean = t => String(t ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const title = clean(ev.title).slice(0, 50);
  let t;
  if (ev.bug) t = `Phòng Kiểm thử trả lỗi "${clean(ev.bugTitle).slice(0, 50)}" về phòng ${nm(ev.to)}`;
  else if (ev.fixed) t = `Phòng ${nm(ev.from)} đã sửa xong, gửi lại phòng ${nm(ev.to)} kiểm tra`;
  else if (ev.support) t = `${nm(ev.to)} hỗ trợ dự án "${title}"`;
  else t = `${nm(ev.from)} chuyển hồ sơ "${title}" cho phòng ${nm(ev.to)}`;
  return t.slice(0, 110);
}
