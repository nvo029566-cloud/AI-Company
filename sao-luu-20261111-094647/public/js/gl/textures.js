// Ảnh ghép (atlas) cho màn hình trên tường, bảng trắng, biển hiệu. Vẽ bằng canvas 2D rồi đưa lên GPU.
const SW = 1024, SH = 1536, INSET = 2;
const T = (x, y, w, h) => [(x + INSET) / SW, (y + INSET) / SH, (w - INSET * 2) / SW, (h - INSET * 2) / SH];
export const UV = {
  code: T(0, 0, 512, 288), code2: T(512, 0, 512, 288),
  chart: T(0, 288, 512, 288), table: T(512, 288, 512, 288),
  dash: T(0, 576, 512, 288), sign: T(512, 576, 512, 288),
  mini: T(0, 864, 256, 144), mini2: T(256, 864, 256, 144),
  poster1: T(512, 864, 128, 144), poster2: T(640, 864, 128, 144), poster3: T(768, 864, 128, 144), clock: T(896, 864, 128, 144),
  tower1: T(0, 1008, 256, 512), tower2: T(256, 1008, 256, 512), shop: T(512, 1008, 512, 256), cafe: T(512, 1264, 512, 256)
};

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
  g.fillStyle = '#35c29c'; g.fillRect(x + 30, y + h / 2 - 60, 8, 120);
  g.fillStyle = '#ffffff'; g.font = `800 64px ${FONT}`; g.textBaseline = 'middle'; g.fillText(brand.toUpperCase(), x + 62, y + h / 2 - 12);
  g.fillStyle = '#8fa6c4'; g.font = `600 26px ${FONT}`; g.fillText('Văn phòng AI', x + 66, y + h / 2 + 48);
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

export function paintAtlas(canvas, brand = 'Công ty AI') {
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
  return canvas;
}
