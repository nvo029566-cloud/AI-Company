// Chỉ dẫn cho từng phòng. Mọi phòng trả về JSON theo một mẫu duy nhất để máy kiểm tra được và ghi tệp an toàn.
export const MAX_CONTEXT_CHARS = 36000;

export const ROLE = {
  '01': 'Giám đốc kỹ thuật (CTO)', '02': 'Quản lý sản phẩm', '03': 'Chuyên viên phân tích nghiệp vụ', '05': 'Nhà thiết kế giao diện',
  '06': 'Lập trình viên giao diện', '07': 'Lập trình viên máy chủ', '08': 'Lập trình viên di động', '09': 'Lập trình viên web',
  '10': 'Kỹ sư kiểm thử', '11': 'Kỹ sư an ninh', '12': 'Kỹ sư vận hành'
};
export const PRODUCT = {
  web: 'một ứng dụng web chạy bằng cách mở index.html (HTML, CSS, JavaScript thuần, không thư viện ngoài, lưu dữ liệu bằng localStorage)',
  landing: 'một trang đích tĩnh (index.html và style.css, JavaScript thuần nếu cần)',
  exe: 'một chương trình dòng lệnh bằng Node.js, không dùng thư viện ngoài (chưa đóng gói thành .exe)',
  mobile: 'một ứng dụng web cho điện thoại dạng PWA đơn giản (index.html, style.css, app.js, manifest.json)'
};
// Việc của từng phòng: tài liệu hay mã nguồn, tệp cần viết. Phòng có trong "depends" phải chờ phòng kia xong rồi mới bắt đầu (để mã khớp với nhau).
export const TASKS = {
  '01': { docs: ['docs/01-ke-hoach-ky-thuat.md'], goal: 'Viết kế hoạch kỹ thuật: mục tiêu, các tính năng chính, kiến trúc, bố cục tệp của sản phẩm, rủi ro, và việc giao cho từng phòng.' },
  '02': { docs: ['docs/02-pham-vi-san-pham.md'], goal: 'Chốt phạm vi sản phẩm: việc làm ngay, việc để sau, tiêu chí hoàn thành.' },
  '03': { docs: ['docs/03-yeu-cau-chi-tiet.md'], goal: 'Viết yêu cầu chi tiết: người dùng, các tình huống sử dụng, quy tắc nghiệp vụ, thông báo lỗi.' },
  '05': { docs: ['docs/05-thiet-ke-giao-dien.md'], goal: 'Thiết kế giao diện bằng chữ: bố cục các màn hình, màu sắc, chữ, trạng thái của từng thành phần, và tên (id) các thành phần quan trọng.' },
  '11': { docs: ['docs/11-ra-soat-an-ninh.md'], goal: 'Đọc kỹ mã nguồn và liệt kê rủi ro an ninh (nhập liệu, lưu trữ, XSS, quyền truy cập) kèm cách khắc phục. Không sửa mã.' },
  '12': { docs: ['docs/12-huong-dan-chay.md', 'README.md'], goal: 'Viết hướng dẫn chạy sản phẩm từng bước cho người không rành kỹ thuật, và README ngắn.' },
  files: {
    web: { '06': ['index.html', 'style.css'], '07': ['server/server.js'], '09': ['app.js'] },
    landing: { '06': ['index.html', 'style.css'], '09': ['app.js'] },
    exe: { '07': ['src/core.js'], '06': ['main.js'] },
    mobile: { '08': ['index.html', 'style.css', 'app.js', 'manifest.json'], '07': ['server/server.js'] }
  },
  codeGoal: {
    web: { '06': 'Viết index.html (có <!doctype html>, tiêu đề, gọi style.css và app.js) và style.css: toàn bộ giao diện theo thiết kế, dùng đúng các id đã nêu.', '07': 'Viết server/server.js: máy chủ Node.js (chỉ module có sẵn) phục vụ các tệp của dự án ở cổng 3000 trên 127.0.0.1, chặn đường dẫn có "..".', '09': 'Viết app.js: toàn bộ logic phía trình duyệt, khớp chính xác các id trong index.html, lưu bằng localStorage, kiểm tra dữ liệu nhập, không dùng innerHTML với dữ liệu người dùng.' },
    landing: { '06': 'Viết index.html (có <!doctype html>) và style.css cho trang đích, hợp màn hình điện thoại.', '09': 'Viết app.js: xử lý form liên hệ (kiểm tra dữ liệu nhập), cuộn mượt, menu cho điện thoại; khớp id trong index.html.' },
    exe: { '07': 'Viết src/core.js: toàn bộ logic nghiệp vụ dưới dạng hàm CommonJS (module.exports), lưu dữ liệu vào tệp JSON cạnh chương trình.', '06': 'Viết main.js: giao diện dòng lệnh (readline, menu số), gọi các hàm trong src/core.js bằng require, khớp đúng tên hàm đã có.' },
    mobile: { '08': 'Viết index.html, style.css, app.js, manifest.json: ứng dụng cho điện thoại, thao tác bằng ngón tay, lưu bằng localStorage.', '07': 'Viết server/server.js: máy chủ Node.js (chỉ module có sẵn) phục vụ các tệp ở cổng 3000 trên 127.0.0.1, chặn đường dẫn có "..".' }
  },
  depends: { web: { '09': ['06'] }, landing: { '09': ['06'] }, exe: { '06': ['07'] }, mobile: { '07': ['08'] } }
};

const FORMAT = 'Chỉ trả về MỘT đối tượng JSON hợp lệ, không có chữ nào ngoài JSON, theo mẫu: {"summary":"tóm tắt tiếng Việt dưới 500 ký tự","files":[{"path":"đường/dẫn/tệp.ext","content":"toàn bộ nội dung tệp"}]}. Đường dẫn là tương đối, chỉ gồm chữ, số, dấu gạch, chấm; không bắt đầu bằng dấu chấm; không dùng "..".';
const SAFETY = 'Không viết mã chạy lệnh hệ thống, không đọc hay ghi tệp ngoài thư mục dự án, không tải tài nguyên từ mạng, không chứa khoá API hay mật khẩu. Không bịa thông tin; điều chưa rõ thì nêu là giả định.';

export function systemPrompt({ dept, kind, rules = [] }) {
  const lines = [`Bạn là ${ROLE[dept]} của một công ty phần mềm nhỏ. Sản phẩm đang làm là ${PRODUCT[kind] || PRODUCT.web}. Viết tiếng Việt; tên biến và hàm trong mã dùng tiếng Anh, chú thích tiếng Việt.`, FORMAT, SAFETY];
  if (rules.length) lines.push('Quy tắc của công ty (bắt buộc tuân theo):\n' + rules.map(r => `- ${r.title}: ${String(r.body).replace(/\s+/g, ' ').slice(0, 240)}`).join('\n'));
  return lines.join('\n\n');
}

const clip = (t, n) => (t.length > n ? t.slice(0, n) + '\n…(đã cắt bớt)' : t);

// Gộp tóm tắt các phòng trước và nội dung tệp liên quan, trong giới hạn MAX_CONTEXT_CHARS.
export function contextBlock({ summaries, files, priority = [] }) {
  let budget = MAX_CONTEXT_CHARS;
  const out = [];
  if (summaries.length) {
    const s = summaries.map(x => `- Phòng ${x.dept}: ${clip(x.summary, 700)}`).join('\n');
    out.push('Tóm tắt công việc các phòng trước:\n' + s); budget -= s.length;
  }
  const ordered = [...files].sort((a, b) => (priority.includes(b.deptCode) ? 1 : 0) - (priority.includes(a.deptCode) ? 1 : 0) || a.path.localeCompare(b.path));
  for (const f of ordered) {
    if (budget < 1500) { out.push(`(còn ${files.length - out.filter(x => x.startsWith('Tệp ')).length} tệp không đưa vào do giới hạn độ dài)`); break; }
    const body = clip(f.content, Math.min(priority.includes(f.deptCode) ? 14000 : 6000, budget - 200));
    out.push(`Tệp ${f.path} (phòng ${f.deptCode}):\n\`\`\`\n${body}\n\`\`\``); budget -= body.length + 60;
  }
  return out.join('\n\n');
}

export function workPrompt({ dept, kind, request, context }) {
  const t = TASKS[dept];
  const code = TASKS.files[kind]?.[dept];
  const goal = code ? TASKS.codeGoal[kind][dept] : t.goal;
  const outs = code || t.docs;
  return `Yêu cầu gốc của khách hàng:\n"""\n${request}\n"""\n\n${context ? context + '\n\n' : ''}Nhiệm vụ của phòng bạn: ${goal}\nCác tệp cần tạo (đúng các đường dẫn này): ${outs.join(', ')}.\nHãy viết đầy đủ, dùng được ngay, ngắn gọn, không để chỗ trống kiểu "...".`;
}

export function fixPrompt({ dept, kind, request, bug, context }) {
  return `Yêu cầu gốc của khách hàng:\n"""\n${request}\n"""\n\nPhòng Kiểm thử báo một lỗi thuộc phần việc của bạn:\n- Lỗi: ${bug.title}\n- Chi tiết: ${bug.detail || '(không có)'}\n- Tệp liên quan: ${bug.file || '(chưa rõ)'}\n\n${context}\n\nNhiệm vụ: sửa lỗi này. Trả về TOÀN BỘ nội dung mới của mọi tệp bạn sửa (đúng đường dẫn cũ), không đổi những gì không liên quan. Trong "summary" nói rõ đã sửa gì. Sản phẩm: ${PRODUCT[kind] || PRODUCT.web}.`;
}

export function reviewPrompt({ request, context, found, focus = 'logic', limit = 3 }) {
  const task = focus === 'coverage'
    ? `Nhiệm vụ: đối chiếu TỪNG tính năng trong yêu cầu gốc và các tài liệu yêu cầu, thiết kế với mã, tìm tối đa ${limit} lỗi THẬT, quan trọng: tính năng còn thiếu hoặc làm sai so với yêu cầu. Đừng bịa lỗi; không có thì để mảng rỗng.`
    : `Nhiệm vụ: đọc mã và tìm tối đa ${limit} lỗi THẬT, quan trọng, chưa nằm trong danh sách trên (lỗi logic, id không khớp giữa HTML và JavaScript, xử lý thiếu trường hợp lỗi, dữ liệu nhập không được kiểm tra). Đừng bịa lỗi; không có thì để mảng rỗng.`;
  return `Yêu cầu gốc của khách hàng:\n"""\n${request}\n"""\n\n${context}\n\nCác vấn đề kiểm tra tự động đã tìm thấy: ${found.length ? found.map(f => f.title).join('; ') : 'không có'}.\n\n${task} Trả về JSON: {"summary":"nhận xét chung dưới 500 ký tự","findings":[{"title":"tiêu đề dưới 100 ký tự","severity":"low|medium|high","file":"đường dẫn tệp có lỗi","detail":"mô tả ngắn cách thấy lỗi"}]}. Không trả "files".`;
}

// Kiểm lại bằng AI (chế độ kiểm thử sâu): các lỗi đã báo trước đó đã được sửa thật chưa?
export function verifyPrompt({ request, context, bugs, found }) {
  return `Yêu cầu gốc của khách hàng:\n\"\"\"\n${request}\n\"\"\"\n\n${context}\n\nCác lỗi đã được báo và đã có người sửa:\n${bugs.map((b, i) => `${i + 1}. ${b.title}${b.file ? ` (tệp ${b.file})` : ''}${b.detail ? `: ${b.detail}` : ''}`).join('\n')}\n\nKiểm tra tự động hiện còn thấy: ${found.length ? found.map(f => f.title).join('; ') : 'không có gì'}.\n\nNhiệm vụ: đọc mã MỚI và cho biết lỗi nào trong danh sách trên VẪN CHƯA được sửa, hoặc việc sửa làm phát sinh lỗi mới (tối đa 4). Đừng bịa; đã sửa hết thì để mảng rỗng. Trả về JSON: {"summary":"nhận xét dưới 500 ký tự","findings":[{"title":"tiêu đề dưới 100 ký tự","severity":"low|medium|high","file":"đường dẫn tệp","detail":"mô tả ngắn"}]}. Không trả "files".`;
}
