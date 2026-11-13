// Ảnh ghép (atlas) cho màn hình trên tường, bảng trắng, biển hiệu. Vẽ bằng canvas 2D rồi đưa lên GPU.
const SW = 1024, SH = 2368, INSET = 2;      // 1536 -> 1792: dải biển tên 14 phòng (4×4 biển 256×64); 1792 -> 2368: dải màn hình động của 14 phòng (4×4 màn 256×144)
const T = (x, y, w, h) => [(x + INSET) / SW, (y + INSET) / SH, (w - INSET * 2) / SW, (h - INSET * 2) / SH];
export const UV = {
  code: T(0, 0, 512, 288), code2: T(512, 0, 512, 288),
  chart: T(0, 288, 512, 288), table: T(512, 288, 512, 288),
  dash: T(0, 576, 512, 288), sign: T(512, 576, 512, 288),
  mini: T(0, 864, 256, 144), mini2: T(256, 864, 256, 144),
  poster1: T(512, 864, 128, 144), poster2: T(640, 864, 128, 144), poster3: T(768, 864, 128, 144), clock: T(896, 864, 128, 144),
  tower1: T(0, 1008, 256, 512), tower2: T(256, 1008, 256, 512), shop: T(512, 1008, 512, 256), cafe: T(512, 1264, 512, 256)
};

// Biển tên phòng thứ i (theo thứ tự ROOM_DEFS): 256×64 ở dải cuối của atlas.
export const SIGN_COLS = 4, SIGN_Y = 1536;
export const signUV = i => T(256 * (i % SIGN_COLS), SIGN_Y + 64 * Math.floor(i / SIGN_COLS), 256, 64);
// Màn hình động của phòng thứ i (ý 1, 2): 256×144 ở dải cuối của atlas, được vẽ lại khi dữ liệu đổi.
export const SCREEN_W = 256, SCREEN_H = 144, SCREEN_Y = 1792;
export const screenRect = i => ({ x: SCREEN_W * (i % 4), y: SCREEN_Y + SCREEN_H * Math.floor(i / 4), w: SCREEN_W, h: SCREEN_H });
export const screenUV = i => { const r = screenRect(i); return T(r.x, r.y, r.w, r.h); };
export function paintScreen(g, x, y, w, h, m, t = 0) {
  const fit = (text, max, size, weight = 700, family = FONT) => { let s = size; g.font = `${weight} ${s}px ${family}`; while (g.measureText(text).width > max && s > 9) { s -= 1; g.font = `${weight} ${s}px ${family}`; } return text; };
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#0d1826'; g.fillRect(x, y, w, h); g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillStyle = m.color || '#6d5ef0'; g.fillRect(x, y, w, 24);                                     // thanh tiêu đề theo màu phòng
  g.fillStyle = '#fff'; g.fillText(fit(`${m.code === 'CEO' ? '★' : m.code === 'LNG' ? '☕' : m.code}  ${m.name || ''}`, w - 40, 15, 800), x + 8, y + 13);
  g.fillStyle = m.mode === 'working' || m.mode === 'new' ? '#5cf2c4' : '#8aa0b0'; g.beginPath(); g.arc(x + w - 14, y + 12, 4.5, 0, 7); g.fill();   // chấm "trực tuyến"
  const bar = (yy, pct, color) => { g.fillStyle = '#22344a'; g.fillRect(x + 8, yy, w - 52, 9); g.fillStyle = color; g.fillRect(x + 8, yy, (w - 52) * Math.min(1, pct / 100), 9); g.fillStyle = '#e8f1f8'; g.textAlign = 'right'; g.font = `800 12px ${FONT}`; g.fillText(`${pct}%`, x + w - 8, yy + 5); g.textAlign = 'left'; };
  if (m.mode === 'new') {                                                                           // hồ sơ mới tới tay: nháy
    const pu = 0.5 + 0.5 * Math.sin(t * 9); g.fillStyle = `rgba(255,213,74,${0.14 + 0.26 * pu})`; g.fillRect(x, y + 24, w, h - 24);
    g.textAlign = 'center'; g.fillStyle = '#ffd54a'; g.font = `800 23px ${FONT}`; g.fillText('📥 HỒ SƠ MỚI', x + w / 2, y + 62);
    g.fillStyle = '#fff'; g.fillText(fit(m.flash?.title || '', w - 24, 14, 700), x + w / 2, y + 92);
    g.fillStyle = '#b8c8d6'; g.font = `600 12px ${FONT}`; g.fillText(m.flash?.from ? `Từ phòng ${m.flash.from}` : '', x + w / 2, y + 116);
  } else if (m.mode === 'working') {
    const small = !!m.overview;
    m.rows.forEach((r, i) => {
      const yy = y + 32 + i * (small ? 36 : 50);
      g.fillStyle = r.color || '#fff'; g.fillRect(x + 8, yy + 1, 4, small ? 24 : 32);
      g.fillStyle = '#fff'; g.fillText(fit(r.title, w - 30, small ? 12 : 14, 800), x + 17, yy + 7);
      g.fillStyle = r.borrowed ? '#ffd479' : '#9fb3c8'; g.fillText(fit(r.sub || '', w - 30, 11, 600), x + 17, yy + (small ? 20 : 22));
      if (!small) bar(yy + 31, r.pct, r.color || '#5cf2c4');
    });
    g.fillStyle = '#9fb3c8'; g.textAlign = 'left'; g.font = `600 11px ${FONT}`;
    if (m.overview) g.fillText(`${m.total} dự án đang chạy · ${m.done || 0} đã xong`, x + 8, y + h - 9);
    let bx = x + w - 8; g.textAlign = 'right';
    if (m.queued) { g.fillStyle = '#ffb347'; g.font = `800 12px ${FONT}`; g.fillText(`⏳ ${m.queued} chờ`, bx, y + h - 9); bx -= 60; }
    if (m.incoming) { g.fillStyle = '#7fb4ff'; g.font = `800 12px ${FONT}`; g.fillText(`📥 ${m.incoming}`, bx, y + h - 9); }
  } else if (m.mode === 'queued') {
    g.textAlign = 'center'; g.fillStyle = '#ffb347'; g.font = `800 20px ${FONT}`; g.fillText(`⏳ ${m.queued} việc đang chờ`, x + w / 2, y + 68);
    g.fillStyle = '#9fb3c8'; g.font = `600 12px ${FONT}`; g.fillText('Chưa có người rảnh nhận việc', x + w / 2, y + 96);
  } else if (m.mode === 'incoming') {
    g.textAlign = 'center'; g.fillStyle = '#7fb4ff'; g.font = `800 18px ${FONT}`; g.fillText('📥 Đang chờ hồ sơ' + '.'.repeat(1 + Math.floor(t * 2) % 3), x + w / 2, y + 68);
    g.fillStyle = '#9fb3c8'; g.font = `600 12px ${FONT}`; g.fillText('Hồ sơ của phòng trước đang được mang tới', x + w / 2, y + 96);
  } else {
    g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 1; i < 6; i++) g.fillRect(x, y + 24 + i * 20, w, 1);
    g.textAlign = 'center'; g.fillStyle = '#7f93a5'; g.font = `700 17px ${FONT}`; g.fillText('Đang rảnh', x + w / 2, y + 72);
    if (m.clock) { g.fillStyle = '#4f6578'; g.font = `700 22px ${MONO}`; g.fillText(m.clock, x + w / 2, y + 108); }
  }
  g.restore();
}
function roomSign(g, x, y, w, h, s) {
  g.fillStyle = '#1b2430'; g.fillRect(x, y, w, h);
  g.fillStyle = s.color || '#6d5ef0'; g.fillRect(x, y, 66, h);                                   // khối màu nhận diện phòng + số phòng
  g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x + 66, y, 3, h);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 ${String(s.code).length > 2 ? 24 : 34}px ${FONT}`; g.fillText(s.code === 'CEO' ? '★' : s.code === 'LNG' ? '☕' : String(s.code), x + 33, y + h / 2 + 1);
  g.textAlign = 'left';
  let fs = 27; g.font = `800 ${fs}px ${FONT}`;
  while (g.measureText(s.name).width > w - 66 - 22 && fs > 14) { fs -= 1; g.font = `800 ${fs}px ${FONT}`; }
  g.fillStyle = '#f4f8fb'; g.fillText(s.name, x + 82, y + (s.sub ? 23 : h / 2 + 1));
  if (s.sub) { g.fillStyle = '#9fb3c8'; g.font = `600 14px ${FONT}`; g.fillText(s.sub, x + 82, y + 47); }
}
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const FONT = '"Segoe UI",system-ui,sans-serif', MONO = 'Consolas,"Courier New",monospace';

function codeScreen(g, x, y, w, h, seed, title) {
  const r = rng(seed);
  g.fillStyle = '#0f1b2d'; g.fillRect(x, y, w, h);
  g.fillStyle = '#16263d'; g.fillRect(x, y, w, 26);
  ['#ff6b6b', '#ffd54a', '#4cd3b5'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(x + 16 + i * 16, y + 13, 4.5, 0, 7); g.fill(); });
  g.fillStyle = '#8fa6c4'; g.font = `600 13px ${MONO}`; g.textBaseline = 'middle'; g.fillText(title, x + 76, y + 14);
  g.fillStyle = '#3ddc97'; g.font = `700 11px ${FONT}`; g.textAlign = 'right'; g.fillText('ACTIVE', x + w - 14, y + 14); g.textAlign = 'left';
  g.fillStyle = '#12223a'; g.fillRect(x, y + 26, 120, h - 26);                         // cây thư mục
  g.fillStyle = '#6f87a8'; g.font = `12px ${MONO}`;
  ['workspace/', ' src/', ' components/', ' services/', ' tests/', ' package.json'].forEach((t, i) => g.fillText(t, x + 10, y + 46 + i * 18));
  const cols = ['#7ee0a0', '#ffd479', '#7cb8ff', '#e8eef7', '#c792ea', '#ff9e7a'];
  for (let i = 0; i < 12; i++) {                                                       // các dòng mã
    const indent = Math.floor(r() * 3) * 22, len = 60 + r() * 220, c = cols[Math.floor(r() * cols.length)];
    g.fillStyle = '#4a5f80'; g.font = `11px ${MONO}`; g.fillText(String(i + 1).padStart(2, '0'), x + 132, y + 48 + i * 18);
    g.fillStyle = c; g.fillRect(x + 158 + indent, y + 43 + i * 18, len, 8);
    if (r() > 0.45) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x + 164 + indent + len, y + 43 + i * 18, 20 + r() * 60, 8); }
  }
}
function chartBoard(g, x, y, w, h, seed) {
  const r = rng(seed);
  g.fillStyle = '#f4f7f9'; g.fillRect(x, y, w, h);
  g.fillStyle = '#dfe6ec'; g.fillRect(x, y, w, 30);
  g.fillStyle = '#4a5a68'; g.font = `700 14px ${FONT}`; g.textBaseline = 'middle'; g.fillText('Tiến độ tuần', x + 14, y + 16);
  g.strokeStyle = '#d3dce4'; g.lineWidth = 1;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x + 24, y + 56 + i * 38); g.lineTo(x + w - 20, y + 56 + i * 38); g.stroke(); }
  [['#2f9e8a', 0], ['#6d5ef0', 1]].forEach(([c, k]) => {
    g.strokeStyle = c; g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath();
    let v = 150 + k * 20;
    for (let i = 0; i <= 8; i++) { v = Math.max(70, Math.min(230, v + (r() - 0.5) * 70)); const px = x + 30 + i * ((w - 60) / 8); i ? g.lineTo(px, y + v + 40) : g.moveTo(px, y + v + 40); }
    g.stroke();
  });
}
function tableBoard(g, x, y, w, h, seed) {
  const r = rng(seed);
  g.fillStyle = '#f4f7f9'; g.fillRect(x, y, w, h);
  g.fillStyle = '#dfe6ec'; g.fillRect(x, y, w, 30);
  g.fillStyle = '#4a5a68'; g.font = `700 14px ${FONT}`; g.textBaseline = 'middle'; g.fillText('Yêu cầu và ưu tiên', x + 14, y + 16);
  const cols = ['#2f9e8a', '#6d5ef0', '#d9822b', '#e0526b'];
  for (let row = 0; row < 5; row++) for (let c = 0; c < 4; c++) {
    const px = x + 20 + c * 120, py = y + 46 + row * 46;
    g.strokeStyle = '#cfd8e0'; g.strokeRect(px, py, 112, 38);
    g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(px + 8, py + 10, 20 + r() * 70, 8);
    g.fillStyle = '#9aa8b5'; g.fillRect(px + 8, py + 24, 30 + r() * 50, 5);
  }
}
function dashScreen(g, x, y, w, h, seed) {
  const r = rng(seed);
  g.fillStyle = '#0e1626'; g.fillRect(x, y, w, h);
  g.fillStyle = '#16263d'; g.fillRect(x, y, w, 28);
  g.fillStyle = '#8fa6c4'; g.font = `700 13px ${FONT}`; g.textBaseline = 'middle'; g.fillText('Bảng điều khiển', x + 14, y + 15);
  for (let i = 0; i < 9; i++) {
    const bh = 40 + r() * 150; g.fillStyle = i % 3 === 0 ? '#6d5ef0' : '#2fb99a'; g.fillRect(x + 30 + i * 28, y + h - 24 - bh, 18, bh);
  }
  [0, 1, 2].forEach(i => { g.strokeStyle = ['#3ddc97', '#ffd479', '#7cb8ff'][i]; g.lineWidth = 8; g.beginPath(); g.arc(x + 330 + (i % 2) * 90, y + 90 + Math.floor(i / 2) * 100, 34, 0, Math.PI * (0.8 + r() * 1.1)); g.stroke(); });
}
function sign(g, x, y, w, h, brand) {
  g.fillStyle = '#1d2a3a'; g.fillRect(x, y, w, h);
  // logo: khối lập phương ba mặt (tím, xanh ngọc, xanh dương), cùng biểu tượng với thanh bên của ứng dụng
  const cx = x + 74, cy = y + h / 2, R = 46, face = (c, pts) => { g.fillStyle = c; g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(cx + a * R, cy + b * R) : g.moveTo(cx + a * R, cy + b * R)); g.closePath(); g.fill(); };
  face('#7c6df5', [[0, -1], [0.87, -0.5], [0, 0], [-0.87, -0.5]]); face('#35c29c', [[-0.87, -0.5], [0, 0], [0, 1], [-0.87, 0.5]]); face('#3b82f6', [[0.87, -0.5], [0.87, 0.5], [0, 1], [0, 0]]);
  g.fillStyle = '#ffffff'; g.font = `800 60px ${FONT}`; g.textBaseline = 'middle'; g.fillText(brand.toUpperCase(), x + 142, y + h / 2 - 12);
  g.fillStyle = '#8fa6c4'; g.font = `600 26px ${FONT}`; g.fillText('Văn phòng AI', x + 146, y + h / 2 + 48);
}
function mini(g, x, y, w, h, seed, c0) {
  const r = rng(seed);
  g.fillStyle = c0; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(x, y, w, 14);
  const cols = ['#a8f0c6', '#ffe08a', '#bfe0ff', '#ffffff'];
  for (let i = 0; i < 8; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x + 12 + Math.floor(r() * 3) * 14, y + 24 + i * 14, 30 + r() * 120, 6); }
}


function poster(g, x, y, w, h, kind) {
  g.fillStyle = '#f4f1ea'; g.fillRect(x, y, w, h);
  g.fillStyle = '#2b3945'; g.fillRect(x + 6, y + 6, w - 12, h - 12);
  if (kind === 0) { g.fillStyle = '#35c29c'; g.beginPath(); g.arc(x + w / 2, y + h * 0.42, 34, 0, 7); g.fill(); g.fillStyle = '#ffd479'; g.fillRect(x + 20, y + h * 0.72, w - 40, 8); g.fillStyle = '#8fa6c4'; g.fillRect(x + 20, y + h * 0.82, w - 70, 6); }
  else if (kind === 1) { ['#e0526b', '#6d5ef0', '#35c29c', '#ffd479'].forEach((c, i) => { g.fillStyle = c; g.fillRect(x + 16 + i * 24, y + 90 - (i % 3) * 22 - 20, 18, 30 + (i % 3) * 22); }); g.fillStyle = '#8fa6c4'; g.fillRect(x + 16, y + 112, w - 32, 6); }
  else { g.strokeStyle = '#ffd479'; g.lineWidth = 6; g.beginPath(); g.moveTo(x + 16, y + 100); g.lineTo(x + 46, y + 60); g.lineTo(x + 74, y + 84); g.lineTo(x + 108, y + 32); g.stroke(); g.fillStyle = '#7cb8ff'; g.fillRect(x + 16, y + 116, w - 32, 6); }
}
function clockFace(g, x, y, w, h) {
  g.fillStyle = '#808080'; g.fillRect(x, y, w, h);
  g.fillStyle = '#f7f8f9'; g.beginPath(); g.arc(x + w / 2, y + h / 2, 56, 0, 7); g.fill();
  g.strokeStyle = '#2b3945'; g.lineWidth = 5; g.beginPath(); g.arc(x + w / 2, y + h / 2, 56, 0, 7); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.moveTo(x + w / 2, y + h / 2); g.lineTo(x + w / 2 + 6, y + h / 2 - 34); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.moveTo(x + w / 2, y + h / 2); g.lineTo(x + w / 2 + 30, y + h / 2 + 12); g.stroke();
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(x + w / 2 + Math.cos(a) * 48, y + h / 2 + Math.sin(a) * 48); g.lineTo(x + w / 2 + Math.cos(a) * 54, y + h / 2 + Math.sin(a) * 54); g.stroke(); }
}
function tower(g, x, y, w, h, seed, base) {
  const r = rng(seed);
  g.fillStyle = base; g.fillRect(x, y, w, h);
  const cols = 6, rows = 16, cw = (w - 16) / cols, rh = (h - 16) / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const lit = r() < 0.34;
    g.fillStyle = lit ? '#ffe9a8' : (r() < 0.5 ? '#41566d' : '#33465b');
    g.fillRect(x + 8 + i * cw + 3, y + 8 + j * rh + 3, cw - 6, rh - 6);
  }
  g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x, y, w, 8);
}
function shopFront(g, x, y, w, h, awning, name) {
  g.fillStyle = '#efe9dd'; g.fillRect(x, y, w, h);
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#ffffff' : awning; g.fillRect(x + i * (w / 16), y, w / 16, 54); }
  g.fillStyle = '#2b3945'; g.fillRect(x + 20, y + 70, w * 0.56, h - 90);
  g.fillStyle = '#9fd0e8'; g.fillRect(x + 28, y + 78, w * 0.56 - 16, h - 106);
  g.fillStyle = '#6f5a3c'; g.fillRect(x + w * 0.66, y + 70, w * 0.26, h - 70);
  g.fillStyle = '#2b3945'; g.font = `800 34px ${FONT}`; g.textBaseline = 'middle'; g.fillText(name, x + 36, y + 110);
}

export function paintAtlas(canvas, brand = 'Công ty AI', signs = []) {
  canvas.width = SW; canvas.height = SH;
  const g = canvas.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, SW, SH);
  codeScreen(g, 0, 0, 512, 288, 11, 'AI / CODE'); codeScreen(g, 512, 0, 512, 288, 29, 'AI / TEST');
  chartBoard(g, 0, 288, 512, 288, 5); tableBoard(g, 512, 288, 512, 288, 7);
  dashScreen(g, 0, 576, 512, 288, 3); sign(g, 512, 576, 512, 288, brand);
  mini(g, 0, 864, 256, 144, 2, '#1b4a72'); mini(g, 256, 864, 256, 144, 9, '#1d5b4a');
  poster(g, 512, 864, 128, 144, 0); poster(g, 640, 864, 128, 144, 1); poster(g, 768, 864, 128, 144, 2); clockFace(g, 896, 864, 128, 144);
  tower(g, 0, 1008, 256, 512, 5, '#8da2b8'); tower(g, 256, 1008, 256, 512, 17, '#b9a99a');
  shopFront(g, 512, 1008, 512, 256, '#d9534f', 'MINI MART'); shopFront(g, 512, 1264, 512, 256, '#3b8a8d', 'CAFE 24H');
  signs.slice(0, 16).forEach((s, i) => roomSign(g, 256 * (i % SIGN_COLS), SIGN_Y + 64 * Math.floor(i / SIGN_COLS), 256, 64, s));   // biển tên phòng
  signs.slice(0, 16).forEach((s, i) => { const r = screenRect(i); paintScreen(g, r.x, r.y, r.w, r.h, { mode: 'idle', code: s.code, name: s.name, color: s.color, rows: [], queued: 0, incoming: 0 }, 0); });   // màn hình lúc đầu: rảnh
  return canvas;
}
