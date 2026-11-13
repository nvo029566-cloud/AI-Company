import { PLANS, STAGE_LABEL, KIND_LABEL, SimError } from './sim.js';

// CTO lập kế hoạch. Giai đoạn này CTO là bộ quy tắc, chưa gọi AI thật (giai đoạn 10 mới thay).
// Hàm makePlan là hàm thuần: cùng yêu cầu thì ra cùng kế hoạch, không đọc cơ sở dữ liệu.

export const LIMITS = { textMin: 10, textMax: 2000, titleMax: 80 };
const strip = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

// Đơn giá giả định cho mỗi phòng (USD, ở độ phức tạp 1.0). Số thật sẽ lấy từ lượng token ở giai đoạn 10.
export const BASE_COST = { '01': 0.30, '02': 0.25, '03': 0.45, '05': 0.60, '06': 1.10, '07': 1.20, '08': 1.30, '09': 0.90, '10': 0.70, '11': 0.50, '12': 0.30 };
export const RANGE = { low: 0.8, high: 1.35 };    // khoảng ước tính quanh con số kỳ vọng

// Chức năng nhận ra từ lời mô tả; extra = chi phí thêm (USD) cho phòng tương ứng nếu phòng đó có trong kế hoạch.
export const FEATURES = [
  { id: 'login', label: 'Đăng nhập và tài khoản', re: /dang nhap|dang ky|tai khoan|thanh vien|mat khau/, extra: { '07': 0.30, '11': 0.25 }, serverSide: true },
  { id: 'payment', label: 'Thanh toán và đặt hàng', re: /thanh toan|momo|vnpay|zalopay|gio hang|dat hang|mua hang|hoa don/, extra: { '07': 0.45, '11': 0.35, '06': 0.20 }, serverSide: true },
  { id: 'booking', label: 'Đặt lịch hoặc đặt chỗ', re: /dat lich|dat ban|dat phong|dat cho|lich hen|dat san/, extra: { '07': 0.30, '06': 0.20 } },
  { id: 'admin', label: 'Trang quản trị', re: /quan tri|admin|dashboard|bang dieu khien|chu quan xem|chu cua hang xem/, extra: { '06': 0.30, '07': 0.25 }, serverSide: true },
  { id: 'report', label: 'Báo cáo và thống kê', re: /bao cao|thong ke|bieu do|xuat excel|xuat file|in phieu/, extra: { '06': 0.20, '07': 0.20 } },
  { id: 'notify', label: 'Thông báo (email, tin nhắn)', re: /thong bao|email|zalo|sms|nhac lich|nhac nho/, extra: { '07': 0.20 } },
  { id: 'search', label: 'Tìm kiếm và lọc', re: /tim kiem|bo loc|loc theo|sap xep/, extra: { '06': 0.15, '07': 0.15 } },
  { id: 'data', label: 'Quản lý dữ liệu (kho, đơn hàng, khách hàng)', re: /ton kho|kho hang|quan ly kho|don hang|khach hang|nhap xuat|ma hang|theo doi/, extra: { '07': 0.30 }, serverSide: true },
  { id: 'lang', label: 'Nhiều ngôn ngữ', re: /da ngon ngu|tieng anh|song ngu|hai ngon ngu/, extra: { '06': 0.15, '03': 0.10 } },
  { id: 'offline', label: 'Dùng không cần mạng', re: /khong can mang|offline|ngoai tuyen/, extra: { '07': 0.30, '06': 0.20 } }
];

const round2 = n => Math.round(n * 100) / 100;

export function validateRequest(input = {}) {
  const kind = input.kind == null || input.kind === '' ? 'web' : String(input.kind);
  if (!PLANS[kind]) throw new SimError(400, 'Loại sản phẩm không hợp lệ.');
  if (typeof input.text !== 'string') throw new SimError(400, 'Hãy mô tả điều bạn muốn công ty làm.');
  const text = input.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim();
  if (text.length < LIMITS.textMin) throw new SimError(400, `Mô tả quá ngắn. Hãy viết ít nhất ${LIMITS.textMin} ký tự để CTO hiểu bạn cần gì.`);
  if (text.length > LIMITS.textMax) throw new SimError(400, `Mô tả quá dài (tối đa ${LIMITS.textMax} ký tự). Hãy rút gọn hoặc chia thành nhiều dự án.`);
  let title = typeof input.title === 'string' ? input.title.replace(/\s+/g, ' ').trim() : '';
  if (!title) title = deriveTitle(text);
  if (title.length > LIMITS.titleMax) title = title.slice(0, LIMITS.titleMax - 1).trimEnd() + '…';
  return { text, kind, title };
}

// Tên dự án lấy từ câu đầu của lời mô tả, cắt gọn ở ranh giới từ.
export function deriveTitle(text) {
  let t = String(text).split(/[\n.!?]/)[0].replace(/\s+/g, ' ').trim();
  const comma = t.indexOf(',');          // câu dài thì lấy tới dấu phẩy đầu tiên nếu phần đầu đủ nghĩa
  if (comma >= 18 && t.length > 40) t = t.slice(0, comma);
  t = t.replace(/^(hãy|làm ơn|xin|giúp tôi|giúp mình|tôi muốn|mình muốn|tôi cần|mình cần|làm giúp)\s+/i, '');
  if (t.length > 60) { t = t.slice(0, 60); const k = t.lastIndexOf(' '); if (k > 30) t = t.slice(0, k); t = t.trimEnd() + '…'; }
  if (!t) t = 'Dự án mới';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function detectFeatures(text) {
  const t = strip(text);
  return FEATURES.filter(f => f.re.test(t));
}

function detailFor(code, ctx) {
  const { kind, features, n } = ctx;
  const has = id => features.some(f => f.id === id);
  const names = ids => features.filter(f => ids.includes(f.id)).map(f => f.label.toLowerCase());
  switch (code) {
    case '01': return `CTO chia yêu cầu thành ${n.stages} chặng và giao cho ${n.depts} phòng.`;
    case '02': return features.length ? `Chốt phạm vi: ${features.map(f => f.label.toLowerCase()).join(', ')}.` : 'Chốt phạm vi bản cơ bản, chưa có chức năng đặc biệt.';
    case '03': return features.length ? `Viết yêu cầu chi tiết và tiêu chí nghiệm thu cho ${features.length} nhóm chức năng.` : 'Viết yêu cầu chi tiết và tiêu chí nghiệm thu.';
    case '05': return kind === 'landing' ? 'Thiết kế một trang cuộn, hợp điện thoại và máy tính.' : kind === 'exe' ? 'Thiết kế cửa sổ và các màn hình chính của phần mềm.' : 'Thiết kế các màn hình chính cho điện thoại và máy tính.';
    case '06': return has('admin') || has('report') ? 'Lập trình giao diện, gồm cả màn hình quản trị và báo cáo.' : 'Lập trình giao diện theo bản thiết kế.';
    case '07': { const f = names(['login', 'payment', 'booking', 'data', 'notify', 'offline']); return f.length ? `Máy chủ và cơ sở dữ liệu cho: ${f.join(', ')}.` : 'Máy chủ và cơ sở dữ liệu ở mức cơ bản.'; }
    case '08': return 'Lập trình ứng dụng cho điện thoại.';
    case '09': return 'Dựng trang web hoàn chỉnh, tối ưu tốc độ tải.';
    case '10': return `Chạy kiểm thử ${Math.max(3, features.length + 3)} luồng chính.`;
    case '11': return has('login') || has('payment') ? 'Rà soát an ninh, ưu tiên đăng nhập và thanh toán.' : 'Rà soát an ninh cơ bản.';
    case '12': return kind === 'exe' ? 'Đóng gói bộ cài .exe và kiểm tra cài đặt.' : kind === 'mobile' ? 'Đóng gói và chuẩn bị bản phát hành.' : 'Đóng gói và triển khai bản chạy.';
    default: return '';
  }
}

export function makePlan(input) {
  const { text, kind, title } = validateRequest(input);
  const features = detectFeatures(text);
  const notes = [];
  if (kind === 'landing') {
    for (const f of features.filter(x => x.serverSide)) notes.push(`Trang đích không có máy chủ riêng nên "${f.label.toLowerCase()}" khó làm trọn. Nên làm ở một ứng dụng web.`);
  }
  const stagesRaw = PLANS[kind];
  const deptCount = stagesRaw.reduce((a, s) => a + s.length, 0);
  const complexity = round2(1 + Math.min(0.6, features.length * 0.08) + (text.length > 400 ? 0.1 : 0));
  const ctx = { kind, features, n: { stages: stagesRaw.length, depts: deptCount } };
  const stages = stagesRaw.map((codes, i) => ({
    index: i + 1,
    parallel: codes.length > 1,
    tasks: codes.map(code => {
      const extra = features.reduce((a, f) => a + (f.extra[code] || 0), 0);
      return { dept: code, title: `${STAGE_LABEL[code]}: ${title}`, detail: detailFor(code, ctx), cost: round2((BASE_COST[code] || 0.4) * complexity + extra) };
    })
  }));
  const expected = round2(stages.reduce((a, s) => a + s.tasks.reduce((b, t) => b + t.cost, 0), 0));
  const estimate = { low: round2(expected * RANGE.low), expected, high: round2(expected * RANGE.high) };
  const featText = features.length ? `Nhận ra ${features.length} nhóm chức năng: ${features.map(f => f.label.toLowerCase()).join(', ')}.` : 'Chưa nhận ra chức năng đặc biệt, CTO làm theo bản cơ bản.';
  return {
    title, kind, kindLabel: KIND_LABEL[kind],
    summary: `${KIND_LABEL[kind]} gồm ${stages.length} chặng, ${deptCount} phòng tham gia. ${featText}`,
    features: features.map(f => ({ id: f.id, label: f.label })),
    notes, complexity, stages, depts: stagesRaw.flat(), estimate,
    assumptions: 'Chi phí là ước tính theo đơn giá giả định cho từng phòng và độ phức tạp của yêu cầu. Bản hiện tại chạy mô phỏng, chưa gọi AI thật nên chưa tốn tiền thật.'
  };
}
