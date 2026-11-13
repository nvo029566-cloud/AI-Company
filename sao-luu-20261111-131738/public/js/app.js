import { api } from './api.js';
import { h, clear, icon, avatar, toast, money, strip, STATUS, roomHover } from './ui.js';
// Dòng phòng ở panel phải sáng lên khi rê chuột tới phòng đó trong cảnh 3D (và ngược lại).
roomHover.subscribe(c => document.querySelectorAll('#right .rrow').forEach(r => r.classList.toggle('hl', r.dataset.code === c)));
import { overviewPage, commandPage, peoplePage, soonPage, SOON_IDS } from './pages.js';

const NAV = [
  ['tong-quan', 'Tổng quan', 'overview'], ['phong-dieu-hanh', 'Phòng điều hành', 'command'], ['du-an', 'Dự án', 'projects'],
  ['nhan-su', 'Nhân sự', 'people'], ['cong-viec', 'Công việc', 'tasks'], ['loi', 'Lỗi', 'bugs'], ['trien-khai', 'Triển khai', 'deploy'],
  ['chi-phi-ai', 'Chi phí AI', 'cost'], ['phe-duyet', 'Phê duyệt', 'approvals'], ['bao-cao', 'Báo cáo', 'reports'],
  ['kien-thuc', 'Kiến thức', 'knowledge'], ['cai-dat', 'Cài đặt', 'settings']
];
const state = { config: null, overview: null, depts: [], agents: [], live: false, sim: { speed: 1, auto: false, runs: [], done: 0 } };
let live = null;     // trang hiện tại có thể nhận tin mới: { update(), handoff(ev) }
const $ = id => document.getElementById(id);
const store = {
  get: (k, d) => { try { return localStorage.getItem('cty.' + k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('cty.' + k, v); } catch { /* bỏ qua */ } }
};

// ---------- giao diện sáng / tối, âm thanh ----------
function applyTheme() {
  const saved = store.get('theme', null);
  const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
const isDark = () => document.documentElement.dataset.theme === 'dark';

// ---------- thanh bên ----------
function drawBadge() {      // số kế hoạch chờ duyệt hiện cạnh mục Phòng điều hành
  const a = document.querySelector('.nav a[data-id="phong-dieu-hanh"]');
  if (!a) return;
  a.querySelector('.badge')?.remove();
  const n = state.overview ? state.overview.approvals : 0;
  if (n > 0) a.append(h('span', { class: 'badge num', text: n, 'aria-label': `${n} kế hoạch chờ duyệt` }));
}
function renderSide() {
  const side = clear($('side'));
  side.append(
    h('div', { class: 'brand' }, h('img', { src: '/img/logo.svg', alt: '' }),
      h('div', {}, h('b', { text: state.config.brandName }), h('small', { text: state.config.tagline }))),
    h('nav', { class: 'nav', 'aria-label': 'Các trang chính' }, NAV.map(([id, label, ic]) =>
      h('a', { href: `#/${id}`, 'data-id': id }, icon(ic), h('span', { text: label })))),
    h('div', { class: 'assist' },
      h('b', {}, icon('spark'), `Trợ lý ${state.config.brandName}`),
      h('p', { text: 'Hỏi gì về công ty cũng được.' }),
      h('button', { class: 'ex', disabled: true, type: 'button', text: '"Hôm nay tiêu bao nhiêu?"' }),
      h('button', { class: 'ex', disabled: true, type: 'button', text: '"Phòng nào đang rảnh?"' }),
      h('div', { class: 'soon', text: 'Trợ lý sẽ trả lời được từ giai đoạn 9.' })));
}
function markNav(id) {
  document.querySelectorAll('.nav a').forEach(a => a.getAttribute('data-id') === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
}

// ---------- thanh trên + tìm kiếm ----------
let soundBtn, themeBtn, livePill, apprPill;
function renderTop() {
  const top = clear($('top'));
  const input = h('input', { id: 'q', type: 'search', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'results',
    placeholder: 'Đi tới hoặc ra lệnh: phòng, người, dự án', 'aria-label': 'Tìm kiếm' });
  const box = h('div', { id: 'results', class: 'results', role: 'listbox', hidden: true });
  initSearch(input, box);
  soundBtn = h('button', { class: 'iconbtn', type: 'button', onClick: toggleSound });
  themeBtn = h('button', { class: 'iconbtn', type: 'button', onClick: toggleTheme });
  livePill = h('span', { class: 'pill rt', 'aria-live': 'polite' });
  apprPill = h('a', { class: 'pill warn', href: '#/phong-dieu-hanh' });
  top.append(
    h('div', { class: 'search' }, icon('search'), input, h('kbd', { text: 'Ctrl K' }), box),
    h('div', { class: 'spacer' }), soundBtn, themeBtn, livePill, apprPill,
    h('div', { class: 'user' }, avatar('CEO', '#6d5ef0'), h('span', { text: 'CEO (bạn)' })));
  drawControls();
}
function drawControls() {
  const snd = store.get('sound', 'on') === 'on';
  clear(soundBtn).append(icon(snd ? 'sound' : 'mute'));
  soundBtn.setAttribute('aria-label', snd ? 'Tắt âm thanh' : 'Bật âm thanh'); soundBtn.title = soundBtn.getAttribute('aria-label');
  clear(themeBtn).append(icon(isDark() ? 'sun' : 'moon'));
  themeBtn.setAttribute('aria-label', isDark() ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'); themeBtn.title = themeBtn.getAttribute('aria-label');
  livePill.className = 'pill rt ' + (state.live ? 'ok' : 'bad');
  clear(livePill).append(h('i'), h('span', { text: state.live ? 'Trực tiếp' : 'Mất kết nối' }));
  const n = state.overview ? state.overview.approvals : 0;
  apprPill.hidden = n === 0;
  apprPill.textContent = `${n} chờ duyệt`;
}
function toggleSound() { store.set('sound', store.get('sound', 'on') === 'on' ? 'off' : 'on'); drawControls(); toast(store.get('sound', 'on') === 'on' ? 'Đã bật âm thanh' : 'Đã tắt âm thanh'); }
function toggleTheme() { const d = !isDark(); store.set('theme', d ? 'dark' : 'light'); document.documentElement.dataset.theme = d ? 'dark' : 'light'; drawControls(); }

function initSearch(input, box) {
  let items = [], idx = -1, token = 0, timer;
  const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); idx = -1; };
  const paint = () => [...box.querySelectorAll('a')].forEach((a, i) => a.classList.toggle('on', i === idx));
  async function run() {
    const raw = input.value.trim();
    if (!raw) return close();
    const my = ++token, q = strip(raw);
    const pages = NAV.filter(([, label]) => strip(label).includes(q));
    let ent = { departments: [], agents: [] };
    try { ent = await api.search(raw); } catch { /* chỉ hiện các trang */ }
    if (my !== token) return;
    clear(box); items = [];
    const sec = (title, arr) => { if (!arr.length) return; box.append(h('h4', { text: title })); arr.forEach(x => { box.append(x.el); items.push(x.el); }); };
    sec('Trang', pages.map(([id, label, ic]) => ({ el: h('a', { href: `#/${id}`, role: 'option' }, label) })));
    sec('Phòng ban', ent.departments.map(d => ({ el: h('a', { href: `#/nhan-su?phong=${d.code}`, role: 'option' }, h('span', { class: 'code num', style: { background: d.color }, text: d.code }), d.name, h('small', { text: d.nameEn })) })));
    sec('Nhân sự', ent.agents.map(a => ({ el: h('a', { href: `#/nhan-su?phong=${a.deptCode}`, role: 'option' }, avatar(a.name, a.deptColor), a.name, h('small', { text: a.title })) })));
    if (!items.length) box.append(h('div', { class: 'none', text: 'Không tìm thấy gì khớp. Thử gõ tên phòng hoặc tên người.' }));
    box.hidden = false; input.setAttribute('aria-expanded', 'true'); idx = -1;
    items.forEach(a => a.addEventListener('click', () => { input.value = ''; close(); }));
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; close(); input.blur(); }
    else if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); idx = (idx + 1) % items.length; paint(); }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; paint(); }
    else if (e.key === 'Enter') { const el = items[idx >= 0 ? idx : 0]; if (el) { e.preventDefault(); el.click(); input.value = ''; close(); input.blur(); } }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) close(); });
}

// ---------- panel phải: trạng thái phòng ban ----------
// Đường nhịp tim: phẳng khi rảnh, gợn sóng khi đang làm. Chuỗi SVG tĩnh trong mã.
function beatSvg(working) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="beat" viewBox="0 0 46 14" aria-hidden="true"><path d="${working ? 'M0 7 H10 L14 2 L20 12 L25 5 L29 7 H46' : 'M0 7 H46'}"/></svg>`;
  return t.content.firstChild;
}
let rightKey = '';
function renderRight(force) {
  const k = state.depts.map(d => d.working).join(',') + '|' + state.overview.working + '|' + state.overview.approvals + '|' + (state.overview.pendingPlans || []).map(p => p.id + p.title).join(',');
  if (!force && k === rightKey) return;        // tránh dựng lại mỗi giây làm nhịp tim bị giật
  rightKey = k; drawBadge(); drawControls();
  const r = clear($('right'));
  const working = state.depts.filter(d => d.working > 0), idle = state.depts.filter(d => d.working === 0);
  const row = d => {
    const lead = state.agents.find(a => a.deptCode === d.code && a.isLead);
    const dots = Array.from({ length: Math.min(d.total, 10) }, (_, i) => h('i', { class: i < d.working ? 'on' : '' }));
    return h('a', { class: 'rrow' + (d.working ? ' work' : '') + (roomHover.code === d.code ? ' hl' : ''), href: `#/nhan-su?phong=${d.code}`, 'data-code': d.code,
      onMouseenter: () => roomHover.set(d.code), onMouseleave: () => roomHover.set(null), onFocus: () => roomHover.set(d.code), onBlur: () => roomHover.set(null) },
      h('span', { class: 'rcode num', style: { background: d.color }, text: d.code }),
      h('div', { class: 'nm' }, h('b', { text: d.name }), h('span', { text: lead ? `${lead.title}, ${d.working ? 'đang làm' : 'rảnh'}` : '' })),
      beatSvg(d.working),
      h('span', { class: 'dots', 'aria-label': `${d.working} trên ${d.total} người đang làm` }, dots));
  };
  r.append(h('h3', { text: 'Trạng thái phòng ban' }), h('p', { class: 'sub num', text: `${state.overview.working} người đang làm` }));
  if (working.length) { r.append(h('h3', { text: 'Đang làm' })); working.forEach(d => r.append(row(d))); }
  r.append(h('h3', { style: { marginTop: '12px' }, text: `Rảnh (${idle.length} phòng)` }));
  idle.forEach(d => r.append(row(d)));
  const plans = state.overview.pendingPlans || [];
  r.append(h('div', { class: 'pending' }, h('h3', { text: 'Chờ bạn duyệt' }),
    state.overview.approvals ? h('p', { text: `${state.overview.approvals} kế hoạch đang chờ.` }) : h('p', { text: 'Chưa có kế hoạch nào cần bạn duyệt.' }),
    plans.map(p => h('a', { class: 'pendrow', href: `#/phong-dieu-hanh?kehoach=${p.id}` }, h('span', { text: p.title }), h('small', { class: 'num', text: money(p.estimate, state.config.currency || 'USD') }))),
    state.overview.approvals > plans.length && h('a', { class: 'pendrow more', href: '#/phong-dieu-hanh', text: `và ${state.overview.approvals - plans.length} kế hoạch nữa` })));
}

// ---------- thanh trạng thái dưới ----------
function renderStatus() {
  const o = state.overview, s = clear($('status'));
  const cell = (ic, label, value, cls) => h('div', { class: 'stat ' + (cls || '') }, h('span', { class: 'ic' }, icon(ic)), h('div', {}, h('small', { text: label }), h('b', { class: 'num', text: value })));
  s.append(
    cell('people', 'Nhân sự đang làm', `${o.working}`),
    cell('alert', 'Cần chú ý', `${o.attention}`, o.attention ? 'warn' : ''),
    cell('approvals', 'Chờ phê duyệt', `${o.approvals}`, o.approvals ? 'warn' : ''),
    cell('cost', 'Chi phí tháng', `${money(o.monthCost, state.config.currency)} / ${money(o.monthlyBudget, state.config.currency)}`),
    cell('wifi', 'Kết nối hệ thống', state.live ? 'Ổn định' : 'Mất kết nối', state.live ? 'good' : 'warn'));
}

// ---------- ngăn kéo chi tiết nhân sự ----------
function currentJob(a) {
  for (const r of state.sim.runs) {
    const it = r.items.find(i => i.agentId === a.id && i.state === 'working');
    if (it) return `${it.title}, trong "${r.title}" (${Math.round(it.progress * 100)}%)`;
  }
  return 'Không có việc nào lúc này';
}
let lastFocus = null;
function openAgent(a, from) {
  lastFocus = from || document.activeElement;
  const root = $('drawer-root');
  const close = () => { clear(root); document.removeEventListener('keydown', onKey); lastFocus?.focus?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const closeBtn = h('button', { class: 'iconbtn close', type: 'button', 'aria-label': 'Đóng', onClick: close }, icon('close'));
  clear(root).append(
    h('div', { class: 'scrim', onClick: close }),
    h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Chi tiết ${a.name}` },
      h('div', { class: 'head' }, avatar(a.name, a.deptColor, true), h('div', {}, h('h2', { text: a.name }), h('div', { class: 'num', text: a.title })), closeBtn),
      h('dl', { class: 'kv' },
        h('dt', { text: 'Phòng ban' }), h('dd', {}, h('a', { href: `#/nhan-su?phong=${a.deptCode}`, onClick: close, text: `${a.deptCode} ${a.deptName}` })),
        h('dt', { text: 'Vai trò' }), h('dd', { text: a.isLead ? 'Trưởng phòng' : 'Nhân viên' }),
        h('dt', { text: 'Trạng thái' }), h('dd', {}, h('span', { class: 'state ' + a.status, text: STATUS[a.status] })),
        h('dt', { text: 'Việc đang làm' }), h('dd', { text: currentJob(a) }),
        h('dt', { text: 'Mô hình AI' }), h('dd', { text: 'Chưa gán (chọn ở giai đoạn 10)' }))));
  document.addEventListener('keydown', onKey);
  closeBtn.focus();
}

// ---------- định tuyến ----------
function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const id = path || 'tong-quan';
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  live?.destroy?.(); live = null;           // trang cũ dọn dẹp (ví dụ dừng vòng vẽ 3D)
  const main = clear($('main'));
  const ctx = { state, query, openAgent, refresh, go: hash => { location.hash = hash; } };
  let page, title;
  if (id === 'tong-quan') { page = overviewPage(ctx); title = 'Tổng quan'; }
  else if (id === 'phong-dieu-hanh') { page = commandPage(ctx); title = 'Phòng điều hành'; }
  else if (id === 'nhan-su') { page = peoplePage(ctx); title = 'Nhân sự'; }
  else if (SOON_IDS.includes(id)) { page = soonPage(id); title = NAV.find(n => n[0] === id)[1]; }
  else { page = h('div', { class: 'card empty' }, h('p', { text: 'Không có trang này.' }), h('a', { class: 'btn', href: '#/tong-quan', text: 'Về Tổng quan' })); title = 'Không tìm thấy'; }
  if (page && page.el) { live = page.live || null; page = page.el; }
  main.append(page);
  document.title = `${title} - ${state.config.brandName}`;
  markNav(NAV.some(n => n[0] === id) ? id : '');
  main.scrollTop = 0;
  live?.update?.();
}

// ---------- thời gian thực ----------
function applyTick(snap) {
  state.sim = { speed: snap.speed, auto: snap.auto, runs: snap.runs, done: snap.done };
  for (const d of snap.depts) { const x = state.depts.find(y => y.code === d.code); if (x) x.working = d.working; }
  const st = new Map(snap.agents.map(a => [a.id, a.status]));
  for (const a of state.agents) if (st.has(a.id)) a.status = st.get(a.id);
  state.overview.working = snap.overview.working;
  state.overview.projects = snap.overview.projects;
  renderRight(); renderStatus();
  live?.update?.();
}
function connectLive() {
  const es = new EventSource('/api/events');
  es.addEventListener('hello', () => { state.live = true; drawControls(); renderStatus(); refresh(); });
  es.addEventListener('tick', e => applyTick(JSON.parse(e.data)));
  es.addEventListener('projects', () => { refresh().then(() => live?.projects?.()); });
  es.addEventListener('handoff', e => {
    const ev = JSON.parse(e.data);
    live?.handoff?.(ev);
    if (ev.delivered) toast(`Đã giao xong: ${ev.title}`);
  });
  es.onerror = () => { state.live = false; drawControls(); renderStatus(); };
}
async function refresh() {
  try {
    [state.overview, state.depts, state.agents, state.sim] = await Promise.all([api.overview(), api.departments(), api.agents(), api.sim()]);
    renderRight(true); renderStatus(); drawControls();
    live?.update?.();
  } catch (e) { /* lần sau sẽ thử lại khi kết nối trở lại */ }
}

// ---------- khởi động ----------
function fatal(msg) {
  clear($('main')).append(h('div', { class: 'card empty' }, icon('alert'), h('h2', { text: 'Chưa kết nối được' }), h('p', { text: msg }),
    h('button', { class: 'btn primary', type: 'button', onClick: () => location.reload() }, 'Thử lại')));
}
async function boot() {
  applyTheme();
  try {
    [state.config, state.overview, state.depts, state.agents, state.sim] = await Promise.all([api.config(), api.overview(), api.departments(), api.agents(), api.sim()]);
  } catch (e) { return fatal(e.message); }
  renderSide(); renderTop(); renderRight(); renderStatus(); drawBadge();
  window.addEventListener('hashchange', route);
  route();
  connectLive();
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('q').focus(); $('q').select(); }
    else if (e.key === '/' && !typing) { e.preventDefault(); $('q').focus(); }
  });
}
boot();
