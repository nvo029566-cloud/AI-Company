// Đơn giá giả định dùng chung cho bộ lập kế hoạch (ước tính) và bộ mô phỏng (chi phí ghi nhận).
// Chi phí thật chỉ có từ giai đoạn 10, khi agent AI chạy thật và có số token thật.
export const BASE_COST = { '01': 0.30, '02': 0.25, '03': 0.45, '04': 0.25, '05': 0.60, '06': 1.10, '07': 1.20, '08': 1.30, '09': 0.90, '10': 0.70, '11': 0.50, '12': 0.30 };
export const BUDGET_FACTOR = 1.15;          // ngân sách một dự án = ước tính kế hoạch × 1,15
export const TOKEN_PRICE = 0.004;           // USD cho 1000 token (giả định)
export const MODEL_NAME = 'Mô phỏng';       // chưa có mô hình AI thật
export const WARN_AT = 0.8;                 // dùng tới 80% ngân sách thì cảnh báo
export const round2 = n => Math.round(n * 100) / 100;
