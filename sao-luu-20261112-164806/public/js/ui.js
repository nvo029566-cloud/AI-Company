// Công cụ dựng giao diện. Dữ liệu luôn được chèn bằng textContent, không dùng innerHTML với dữ liệu.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = c => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(add);
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}
export const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  command: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.9.2 5 2.5 5 5.8"/>',
  tasks: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  bugs: '<rect x="8" y="8" width="8" height="11" rx="4"/><path d="M12 8V5M8 12H4M16 12h4M8.5 17l-3 2M15.5 17l3 2M9 5l1.5 1.5M15 5l-1.5 1.5"/>',
  deploy: '<path d="M5 15c-1.5 1.5-2 4-2 4s2.5-.5 4-2"/><path d="M14 4c3.5-.5 6 0 6 0s.5 2.5 0 6c-1.3 1.8-3.5 3.5-6 5l-5-5c1.5-2.5 3.2-4.7 5-6z"/><circle cx="15" cy="9" r="1.5"/>',
  cost: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.5-1-1.5-1.5-2.8-1.5-1.6 0-2.7.8-2.7 2 0 3 5.7 1.4 5.7 4.3 0 1.2-1.2 2-2.9 2-1.3 0-2.5-.6-3-1.8M12 6v1.7M12 16.3V18"/>',
  approvals: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  reports: '<path d="M4 20V4M4 20h16"/><rect x="7.5" y="11" width="3" height="6" rx=".8"/><rect x="13" y="7" width="3" height="10" rx=".8"/>',
  knowledge: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  sound: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M18.8 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="m17 9.5 4 5M21 9.5l-4 5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.1"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17v.1"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  wifi: '<path d="M5 12a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0"/><circle cx="12" cy="19" r="1"/>'
};
export function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;   // chuỗi tĩnh trong mã, không chứa dữ liệu người dùng
  return t.content.firstChild;
}

export const strip = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
export const initials = name => name.trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase();
export const money = (n, cur = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(n);
export const STATUS = { idle: 'Rảnh', working: 'Đang làm', reviewing: 'Đang kiểm', blocked: 'Bị chặn' };

export function avatar(name, color, large) {
  return h('span', { class: 'avatar' + (large ? ' lg' : ''), style: { background: color }, 'aria-hidden': 'true', text: initials(name) });
}
export function toast(msg) {
  const box = document.getElementById('toast');
  const el = h('div', { text: msg });
  box.append(el);
  setTimeout(() => el.remove(), 3200);
}

// Phòng đang được rê chuột tới, dùng chung giữa danh sách phòng bên phải và cảnh 3D: rê ở bên này thì bên kia sáng lên.
export const roomHover = (() => {
  let code = null; const subs = new Set();
  return {
    get code() { return code; },
    set(c) { c = c || null; if (c === code) return; code = c; subs.forEach(f => f(c)); },
    subscribe(f) { subs.add(f); f(code); return () => subs.delete(f); }
  };
})();
