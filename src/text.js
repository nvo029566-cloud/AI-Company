// Chuẩn hoá chữ tiếng Việt để tìm kiếm không phân biệt dấu và hoa thường.
export const strip = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
export const tokens = s => strip(s).split(/[^a-z0-9]+/).filter(Boolean);
