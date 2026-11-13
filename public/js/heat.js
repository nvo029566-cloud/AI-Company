// Bản đồ nhiệt: hàm thuần (không đụng DOM) để cả cảnh 3D, thanh công cụ và kiểm thử dùng chung.
export const HEAT_METRICS = [['busy', 'Đang bận'], ['tasks', 'Việc xong'], ['cost', 'Chi phí'], ['bugs', 'Lỗi']];
const STOPS = [[0, [59, 130, 246]], [0.5, [250, 204, 21]], [1, [239, 68, 68]]];       // xanh (ít) → vàng → đỏ (nhiều)
const hex2 = n => Math.round(n).toString(16).padStart(2, '0');
export function heatColor(v) {
  const x = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  for (let i = 1; i < STOPS.length; i++) {
    const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i];
    if (x <= b) { const t = (x - a) / (b - a); return '#' + [0, 1, 2].map(k => hex2(ca[k] + (cb[k] - ca[k]) * t)).join(''); }
  }
  return '#ef4444';
}
// Chữ hiện trên thẻ phòng. Không dựa vào màu một mình: người khó phân biệt màu vẫn đọc được số.
export function heatLabel(metric, item, fmtMoney = n => '$' + Number(n).toFixed(2)) {
  if (!item) return '';
  if (metric === 'busy') return `${item.work}/${item.total}`;
  if (metric === 'cost') return fmtMoney(item.raw);
  if (metric === 'bugs') return `${item.raw} lỗi`;
  return `${item.raw} việc`;
}
// Đang bận: số người đang làm trên tổng số người của phòng (lấy trực tiếp từ cảnh, không cần máy chủ).
export function busyItems(rooms) {
  return rooms.filter(r => r.code !== 'CEO' && r.code !== 'LNG').map(r => ({ code: r.code, work: r.work || 0, total: r.total || 0, raw: r.work || 0, value: r.total ? Math.min(1, (r.work || 0) / r.total) : 0 }));
}
export const toHeatMap = (metric, items, fmtMoney) => Object.fromEntries(items.map(i => [i.code, { v: i.value, label: heatLabel(metric, i, fmtMoney) }]));
