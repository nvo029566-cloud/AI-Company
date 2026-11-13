// Thẻ tên phòng nổi trên cảnh 3D: mức chi tiết theo khoảng cách, cỡ chữ giới hạn, và tránh chồng chữ.
// Thuần tính toán (không dùng DOM) nên kiểm thử được ngoài trình duyệt.

// Mức chi tiết: xa chỉ cần số + tên ngắn, gần thêm tên tiếng Anh, đang chọn một phòng thì luôn đủ.
export const lodOf = (dist, focused = false) => focused ? 'near' : dist >= 60 ? 'far' : dist >= 34 ? 'mid' : 'near';

// Cỡ thẻ theo khoảng cách, có giới hạn: không nhỏ quá khi xa (đọc được), không to quá khi gần (không che cảnh).
export const tagScale = dist => Math.min(1.12, Math.max(0.88, 40 / Math.max(1, dist)));

// Ước lượng bề rộng thẻ (điểm ảnh) mà không cần đo DOM: chip số phòng + tên + số người + việc chờ.
export function estWidth({ code = '', name = '', en = '', work = 0, badge = '', lod = 'far', mini = false }) {
  const chip = 14 + Math.max(1, String(code).length) * 7.2 + 5;
  if (mini) return chip + (work > 0 ? 24 : 0) + 8;
  const text = name.length * 6.7 + (lod === 'near' && en ? (en.length + 3) * 6.1 : 0);
  return 9 + chip + 6 + text + (work > 0 ? 23 : 0) + (badge ? 6 + badge.length * 7 + 10 : 0) + 8;
}

const hit = (a, b, m) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;

// items: [{ id, x, y, w, h, miniW, prio, force }]  (x, y = điểm neo: giữa đáy thẻ trên màn hình)
// blocked: các hình chữ nhật đã bị chiếm (nhãn hồ sơ đang mang...). Trả về Map id -> { mode: 'full' | 'mini', dx, dy, rect, crowded }.
// Thẻ ưu tiên cao đặt trước; thẻ sau thử: đủ chữ -> đẩy lên cao hơn -> thu còn số phòng -> đẩy lên / sang bên.
// KHÔNG BAO GIỜ ẩn hẳn: nếu chật quá thì để dạng thu gọn ở chỗ ít bị đè nhất (crowded = true) để vẫn biết đó là phòng nào.
export function layoutTags(items, blocked = []) {
  const order = [...items].sort((a, b) => (b.force ? 1 : 0) - (a.force ? 1 : 0) || b.prio - a.prio || (a.id < b.id ? -1 : 1));
  const placed = [...blocked], out = new Map();
  const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  for (const it of order) {
    const step = it.h + 4;
    const tries = [];
    for (const dy of [0, -step, -2 * step]) tries.push({ mode: 'full', w: it.w, dx: 0, dy });
    const mw = it.miniW + 4;
    for (const dy of [0, -step, -2 * step, -3 * step]) for (const dx of [0, mw, -mw, 2 * mw, -2 * mw]) tries.push({ mode: 'mini', w: it.miniW, dx, dy });
    let res = null, best = null;
    for (const t of tries) {
      const rect = { x: it.x + t.dx - t.w / 2, y: it.y + t.dy - it.h, w: t.w, h: it.h };
      const hits = placed.filter(p => hit(p, rect, 3));
      if (!hits.length) { res = { mode: t.mode, dx: t.dx, dy: t.dy, rect, crowded: false }; break; }
      const cost = hits.reduce((n, p) => n + area(p, rect), 0) + (t.mode === 'full' ? 1e6 : 0);
      if (t.mode === 'mini' && (!best || cost < best.cost)) best = { cost, res: { mode: 'mini', dx: t.dx, dy: t.dy, rect, crowded: true } };
    }
    if (!res) res = it.force ? { mode: 'full', dx: 0, dy: 0, rect: { x: it.x - it.w / 2, y: it.y - it.h, w: it.w, h: it.h }, crowded: true } : best.res;
    placed.push(res.rect);
    out.set(it.id, res);
  }
  return out;
}

// Ưu tiên hiển thị: đang chọn / rê chuột > đang làm > việc chờ > đang chờ hồ sơ > còn lại.
export const tagPriority = ({ focus = false, hover = false, work = 0, queued = 0, incoming = 0, special = false }) =>
  (focus || hover ? 1000 : 0) + (work > 0 ? 100 + work : 0) + (queued > 0 ? 60 : 0) + (incoming > 0 ? 30 : 0) + (special ? 20 : 0);
