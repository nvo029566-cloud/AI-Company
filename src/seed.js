// Dữ liệu gốc: 12 phòng ban và 26 agent, theo dây chuyền trong video mẫu.
// lane: 'pipeline' = đứng trên dây chuyền chính, 'parallel' = chạy song song ở giai đoạn lập trình, 'support' = hỗ trợ ngoài dây chuyền.
export const DEPARTMENTS = [
  { code: '01', slug: 'dieu-hanh', name: 'Điều hành', nameEn: 'Command Center', lane: 'pipeline', color: '#6d5ef0', role: 'Giám đốc kỹ thuật nhận việc, chia nhỏ và điều phối các phòng' },
  { code: '02', slug: 'san-pham', name: 'Sản phẩm', nameEn: 'Product', lane: 'pipeline', color: '#3b82f6', role: 'Quản lý sản phẩm, chốt phạm vi và thứ tự ưu tiên' },
  { code: '03', slug: 'phan-tich', name: 'Phân tích', nameEn: 'Business Analysis', lane: 'pipeline', color: '#0ea5e9', role: 'Phân tích nghiệp vụ, viết yêu cầu chi tiết' },
  { code: '04', slug: 'nghien-cuu', name: 'Nghiên cứu', nameEn: 'R&D', lane: 'support', color: '#8b5cf6', role: 'Nghiên cứu công nghệ và giải pháp khi cần' },
  { code: '05', slug: 'thiet-ke', name: 'Thiết kế', nameEn: 'UI/UX Design', lane: 'pipeline', color: '#ec4899', role: 'Thiết kế giao diện và trải nghiệm người dùng' },
  { code: '06', slug: 'giao-dien', name: 'Giao diện', nameEn: 'Frontend', lane: 'parallel', color: '#14b8a6', role: 'Lập trình giao diện người dùng' },
  { code: '07', slug: 'may-chu', name: 'Máy chủ', nameEn: 'Backend', lane: 'parallel', color: '#f59e0b', role: 'Lập trình phía máy chủ và cơ sở dữ liệu' },
  { code: '08', slug: 'di-dong', name: 'Di động', nameEn: 'Mobile', lane: 'parallel', color: '#f97316', role: 'Lập trình ứng dụng di động' },
  { code: '09', slug: 'web', name: 'Web', nameEn: 'Web Development', lane: 'parallel', color: '#10b981', role: 'Phát triển sản phẩm web hoàn chỉnh' },
  { code: '10', slug: 'kiem-thu', name: 'Kiểm thử', nameEn: 'QA & Testing', lane: 'pipeline', color: '#ef4444', role: 'Chạy kiểm thử, tìm lỗi và trả lỗi về đúng người' },
  { code: '11', slug: 'an-ninh', name: 'An ninh', nameEn: 'Security', lane: 'pipeline', color: '#64748b', role: 'Rà soát an ninh trước khi phát hành' },
  { code: '12', slug: 'van-hanh', name: 'Vận hành', nameEn: 'DevOps', lane: 'pipeline', color: '#0891b2', role: 'Triển khai và vận hành sản phẩm' }
];

// dept = mã phòng. Tổng cộng đúng 26 người.
export const AGENTS = [
  { dept: '01', name: 'Minh Quân', title: 'Giám đốc kỹ thuật (CTO)', lead: true },
  { dept: '01', name: 'Thu Hà', title: 'Trợ lý điều hành' },
  { dept: '02', name: 'Ngọc Anh', title: 'Quản lý sản phẩm', lead: true },
  { dept: '03', name: 'Đức Huy', title: 'Chuyên viên phân tích nghiệp vụ', lead: true },
  { dept: '04', name: 'Khánh Linh', title: 'Nhà nghiên cứu trí tuệ nhân tạo', lead: true },
  { dept: '04', name: 'Bảo Long', title: 'Nhà nghiên cứu bảo mật' },
  { dept: '04', name: 'Phương Thảo', title: 'Nhà nghiên cứu hiệu năng' },
  { dept: '04', name: 'Tuấn Kiệt', title: 'Nhà nghiên cứu trải nghiệm người dùng' },
  { dept: '04', name: 'Mai Chi', title: 'Nhà nghiên cứu dữ liệu' },
  { dept: '04', name: 'Hải Đăng', title: 'Nhà nghiên cứu ứng dụng di động' },
  { dept: '04', name: 'Gia Hân', title: 'Nhà nghiên cứu hạ tầng đám mây' },
  { dept: '04', name: 'Việt Anh', title: 'Nhà nghiên cứu đo lường chất lượng' },
  { dept: '04', name: 'Thanh Tùng', title: 'Nhà nghiên cứu công cụ lập trình' },
  { dept: '04', name: 'Diệu Linh', title: 'Nhà nghiên cứu tài liệu kỹ thuật' },
  { dept: '05', name: 'Thùy Dương', title: 'Thiết kế giao diện và trải nghiệm', lead: true },
  { dept: '06', name: 'Quang Vinh', title: 'Lập trình viên giao diện', lead: true },
  { dept: '07', name: 'Hoàng Nam', title: 'Lập trình viên máy chủ', lead: true },
  { dept: '08', name: 'Khánh Vy', title: 'Lập trình viên di động', lead: true },
  { dept: '09', name: 'Anh Tuấn', title: 'Trưởng nhóm phát triển web', lead: true },
  { dept: '09', name: 'Bích Ngọc', title: 'Lập trình viên web' },
  { dept: '09', name: 'Công Minh', title: 'Lập trình viên web' },
  { dept: '09', name: 'Lan Phương', title: 'Lập trình viên web' },
  { dept: '10', name: 'Trung Kiên', title: 'Kỹ sư kiểm thử', lead: true },
  { dept: '11', name: 'Xuân Bách', title: 'Kỹ sư an ninh', lead: true },
  { dept: '11', name: 'Thanh Hương', title: 'Chuyên viên rà soát an ninh' },
  { dept: '12', name: 'Văn Toàn', title: 'Kỹ sư vận hành', lead: true }
];

// Điều phối viên: chuyên mang hồ sơ giữa các phòng khi văn phòng bận, không nhận việc chuyên môn (nhận diện theo chức danh).
export const COURIER_TITLES = ['Trợ lý điều hành', 'Nhà nghiên cứu tài liệu kỹ thuật'];
