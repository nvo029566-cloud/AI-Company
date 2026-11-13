import { api } from './api.js';
import { h, clear, icon, avatar, toast, money, strip, STATUS, roomHover } from './ui.js';
// Dòng phòng ở panel phải sáng lên khi rê chuột tới phòng đó trong cảnh 3D (và ngược lại).
roomHover.subscribe(c => document.querySelectorAll('#right .rrow').forEach(r => r.classList.toggle('hl', r.dataset.code === c)));
import { overviewPage, commandPage, peoplePage, soonPage, SOON_IDS } from './pages.js';
import { projectsPage, projectDetailPage, tasksPage, agentPage, bugsPage } from './pages5.js';
import { approvalsPage, costsPage, reportsPage, deploymentsPage } from './pages8.js';
import { knowledgePage, settingsPage, notificationsPage } from './pages9.js';
import { createBell, createAssistantPanel } from './shell9.js';
import { guidePage, scrollToGuide } from './pages10.js';
import { kioskPage } from './kiosk.js';

const NAV = [
  ['tong-quan', 'Tổng quan', 'overview'], ['phong-dieu-hanh', 'Phòng điều hành', 'command'], ['du-an', 'Dự án', 'projects'],
  ['nhan-su', 'Nhân sự', 'people'], ['cong-viec', 'Công việc', 'tasks'], ['loi', 'Lỗi', 'bugs'], ['trien-khai', 'Triển khai', 'deploy'],
  ['chi-phi-ai', 'Chi phí AI', 'cost'], ['phe-duyet', 'Phê duyệt', 'approvals'], ['bao-cao', 'Báo cáo', 'reports'],
  ['kien-thuc', 'Kiến thức', 'knowledge'], ['cai-dat', 'Cài đặt', 'settings']
];
const EXTRA_PAGES = [['huong-dan', 'Hướng dẫn sử dụng', 'info'], ['thong-bao', 'Thông báo', 'bell']];       // có trong ô tìm kiếm nhưng không chiếm chỗ ở thanh bên
const state = { config: null, overview: null, depts: [], agents: [], live: false, sim: { speed: 1, auto: false, runs: [], done: 0 } };
let bell = null, assist = null, navId = '';
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
function drawBadge() {      // số kế hoạch chờ duyệt cạnh Phòng điều hành, số lỗi chưa đóng cạnh Lỗi
  const o = state.overview || {};
  for (const [id, n, what, cls] of [['phe-duyet', o.approvals || 0, 'phiếu chờ duyệt', ''], ['loi', o.bugsActive || 0, 'lỗi chưa đóng', ' red']]) {
    const a = document.querySelector(`.nav a[data-id="${id}"]`);
    if (!a) continue;
    a.querySelector('.badge')?.remove();
    if (n > 0) a.append(h('span', { class: 'badge num' + cls, text: n, 'aria-label': `${n} ${what}` }));
  }
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
      ['Hôm nay tiêu bao nhiêu?', 'Phòng nào đang rảnh?'].map(t => h('button', { class: 'ex', type: 'button', text: `"${t}"`, onClick: e => assist.open(t, e.currentTarget) })),
      h('button', { class: 'ex open', type: 'button', text: 'Mở trợ lý', onClick: e => assist.open(undefined, e.currentTarget) }),
      h('div', { class: 'soon', text: 'Trả lời theo quy tắc, chưa phải AI.' })));
}
function markNav(id) {
  document.querySelectorAll('.nav a').forEach(a => a.getAttribute('data-id') === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
}

// ---------- lệnh nhanh (Ctrl+K), giao việc, đổi cấu hình ----------
const COMMANDS = () => [
  { label: 'Chế độ trình chiếu toàn màn hình', hint: 'văn phòng 3D cho màn hình treo tường', words: 'che do trinh chieu kiosk toan man hinh', run: () => { document.documentElement.requestFullscreen?.().catch(() => {}); location.hash = '#/kiosk'; } },
  { label: 'Chạy thử một việc', hint: 'tạo một việc mô phỏng', words: 'chay thu viec demo tao viec moi', run: () => api.simSpawn('web').then(() => toast('Đã giao một việc chạy thử.')).catch(e => toast(e.message)) },
  ...[1, 2, 4, 8].map(n => ({ label: `Tốc độ chạy ${n}x`, hint: 'cảnh làm việc', words: 'toc do nhanh cham', run: () => api.simSpeed(n).then(() => toast(`Tốc độ ${n}x.`)).catch(e => toast(e.message)) })),
  { label: 'Bật tự động tạo việc', hint: 'công ty tự nhận việc thử', words: 'tu dong bat', run: () => api.simAuto(true).then(() => toast('Đã bật tự động tạo việc.')).catch(e => toast(e.message)) },
  { label: 'Tắt tự động tạo việc', hint: '', words: 'tu dong tat', run: () => api.simAuto(false).then(() => toast('Đã tắt tự động tạo việc.')).catch(e => toast(e.message)) },
  { label: 'Dừng tất cả việc đang chạy', hint: 'huỷ mọi việc dở dang', words: 'dung tat ca xoa huy viec', run: () => { if (confirm('Dừng tất cả việc đang chạy? Các dự án đang chạy sẽ bị dừng.')) api.simClear().then(() => { toast('Đã dừng tất cả.'); refresh(); }).catch(e => toast(e.message)); } },
  { label: 'Đổi giao diện sáng hoặc tối', hint: '', words: 'giao dien sang toi theme dark', run: toggleTheme },
  { label: 'Bật hoặc tắt âm thanh', hint: '', words: 'am thanh sound mute', run: toggleSound },
  { label: 'Đánh dấu đã đọc hết thông báo', hint: '', words: 'thong bao da doc', run: () => api.notificationsRead({ all: true }).then(() => bell.load()).catch(e => toast(e.message)) },
  { label: 'Mở trợ lý', hint: 'hỏi về dữ liệu công ty', words: 'tro ly hoi', run: () => assist.open() }
];
async function createPlan(text) {
  try { const p = await api.projectCreate({ text }); toast('CTO đã lập kế hoạch. Mời bạn xem và duyệt.'); location.hash = `#/phong-dieu-hanh?kehoach=${p.id}`; }
  catch (e) { toast(e.message); }
}
// Cài đặt vừa đổi (từ trang Cài đặt hoặc từ thẻ khác): cập nhật tên, khẩu hiệu, ngân sách ở mọi nơi đang hiện.
function applyConfig(c) {
  const old = state.config.brandName;
  Object.assign(state.config, { brandName: c.brandName, tagline: c.tagline, monthlyBudget: c.monthlyBudget });
  renderSide(); markNav(navId); drawBadge();
  if (document.title.endsWith(` - ${old}`)) document.title = document.title.slice(0, -old.length) + c.brandName;
  refresh();
}

// ---------- thanh trên + tìm kiếm ----------
let soundBtn, themeBtn, livePill, apprPill, costPill, aiPill;
function renderTop() {
  const top = clear($('top'));
  const input = h('input', { id: 'q', type: 'search', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'results',
    placeholder: 'Đi tới hoặc ra lệnh: phòng, người, dự án', 'aria-label': 'Tìm kiếm' });
  const box = h('div', { id: 'results', class: 'results', role: 'listbox', hidden: true });
  initSearch(input, box, { commands: COMMANDS(), ask: q => assist.open(q, input), createPlan });
  soundBtn = h('button', { class: 'iconbtn', type: 'button', onClick: toggleSound });
  themeBtn = h('button', { class: 'iconbtn', type: 'button', onClick: toggleTheme });
  livePill = h('span', { class: 'pill rt', 'aria-live': 'polite' });
  apprPill = h('a', { class: 'pill warn', href: '#/phe-duyet' });
  costPill = h('a', { class: 'pill', href: '#/chi-phi-ai' });
  aiPill = h('a', { class: 'pill aipill', href: '#/cai-dat', title: 'AI thật đang bật: các dự án mới dùng mô hình AI thật' });
  top.append(
    h('div', { class: 'search' }, icon('search'), input, h('kbd', { text: 'Ctrl K' }), box),
    h('div', { class: 'spacer' }), aiPill, h('a', { class: 'iconbtn', href: '#/huong-dan', 'aria-label': 'Hướng dẫn sử dụng', title: 'Hướng dẫn' }, icon('info')), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Mở trợ lý', title: 'Trợ lý', onClick: e => assist.open(undefined, e.currentTarget) }, icon('spark')), bell.el, soundBtn, themeBtn, livePill, costPill, apprPill,
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
  const aiOn = !!state.overview?.ai?.active;
  aiPill.hidden = !aiOn;
  aiPill.textContent = aiOn ? (state.overview.ai.tier === 'paid' ? 'AI thật · trả tiền' : 'AI thật · miễn phí') : '';
  const lv = state.overview ? state.overview.costLevel : 'ok';      // cảnh báo ngân sách tháng: từ 80% (vàng) và từ 100% (đỏ)
  costPill.hidden = lv === 'ok';
  costPill.className = 'pill ' + (lv === 'over' ? 'bad' : 'warn');
  costPill.textContent = `Ngân sách tháng ${Math.round((state.overview?.costPct || 0) * 100)}%`;
}
function toggleSound() { store.set('sound', store.get('sound', 'on') === 'on' ? 'off' : 'on'); drawControls(); toast(store.get('sound', 'on') === 'on' ? 'Đã bật âm thanh' : 'Đã tắt âm thanh'); }
function toggleTheme() { const d = !isDark(); store.set('theme', d ? 'dark' : 'light'); document.documentElement.dataset.theme = d ? 'dark' : 'light'; drawControls(); }

function initSearch(input, box, deps) {
  let items = [], idx = -1, token = 0, timer;
  const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); idx = -1; };
  const paint = () => items.forEach((el, i) => el.classList.toggle('on', i === idx));
  const trunc = t => (t.length > 40 ? t.slice(0, 40) + '…' : t);
  async function run() {
    const raw = input.value.trim();
    if (!raw) return close();
    const my = ++token, q = strip(raw);
    const pages = [...NAV, ...EXTRA_PAGES].filter(([, label]) => strip(label).includes(q));
    const cmds = deps.commands.filter(c => strip(`${c.label} ${c.words || ''}`).includes(q));
    let ent = { departments: [], agents: [], projects: [], knowledge: [] };
    try { ent = { ...ent, ...(await api.search(raw)) }; } catch { /* chỉ hiện trang và lệnh */ }
    if (my !== token) return;
    clear(box); items = [];
    const sec = (title, arr) => { if (!arr.length) return; box.append(h('h4', { text: title })); arr.forEach(x => { box.append(x.el); items.push(x.el); }); };
    const act = (label, sub, fn) => ({ el: h('button', { class: 'opt', type: 'button', role: 'option', onClick: fn }, h('span', { text: label }), sub && h('small', { text: sub })) });
    const link = (href, ...kids) => ({ el: h('a', { class: 'opt', href, role: 'option' }, ...kids) });
    // Câu dài (từ ba chữ trở lên): đưa "hỏi trợ lý" và "giao cho CTO" lên đầu, Enter mặc định hỏi trợ lý (không làm thay đổi gì).
    const asks = [act(`Hỏi trợ lý: “${trunc(raw)}”`, 'trả lời từ dữ liệu thật', () => deps.ask(raw))];
    if (raw.length >= 10) asks.push(act(`Giao cho CTO: “${trunc(raw)}”`, 'lập kế hoạch, chờ bạn duyệt', () => deps.createPlan(raw)));
    const sentence = raw.split(/\s+/).length >= 3 && raw.length >= 10;
    if (sentence) sec('Hỏi hoặc giao việc', asks);
    sec('Lệnh', cmds.map(c => act(c.label, c.hint || '', () => c.run())));
    sec('Trang', pages.map(([id, label]) => link(`#/${id}`, h('span', { text: label }))));
    sec('Dự án', ent.projects.map(p => link(`#/du-an/${p.id}`, h('span', { text: p.title }), h('small', { text: p.statusLabel }))));
    sec('Kiến thức', ent.knowledge.map(k => link(`#/kien-thuc?q=${encodeURIComponent(k.title)}`, h('span', { text: k.title }), h('small', { text: k.kindLabel }))));
    sec('Phòng ban', ent.departments.map(d => link(`#/nhan-su?phong=${d.code}`, h('span', { class: 'code num', style: { background: d.color }, text: d.code }), h('span', { text: d.name }), h('small', { text: d.nameEn }))));
    sec('Nhân sự', ent.agents.map(a => link(`#/nhan-su?phong=${a.deptCode}`, avatar(a.name, a.deptColor), h('span', { text: a.name }), h('small', { text: a.title }))));
    if (!sentence) sec('Hỏi hoặc giao việc', asks);
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
  const k = state.depts.map(d => d.working).join(',') + '|' + state.overview.working + '|' + state.overview.approvals + '|' + (state.overview.bugsActive || 0) + '|' + state.overview.costLevel + '|' + (state.overview.pendingItems || []).map(p => p.key + p.title).join(',');
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
  const items = state.overview.pendingItems || [];
  r.append(h('div', { class: 'pending' }, h('h3', { text: 'Chờ bạn duyệt' }),
    state.overview.approvals ? h('p', { text: `${state.overview.approvals} phiếu đang chờ.` }) : h('p', { text: 'Chưa có gì cần bạn duyệt.' }),
    items.map(p => h('a', { class: 'pendrow ' + p.kind, href: p.type === 'plan' ? `#/phong-dieu-hanh?kehoach=${p.id}` : '#/phe-duyet' }, h('span', {}, h('i', { text: p.kindLabel }), p.title), h('small', { class: 'num', text: money(p.amount, state.config.currency || 'USD') }))),
    state.overview.approvals > items.length && h('a', { class: 'pendrow more', href: '#/phe-duyet', text: `và ${state.overview.approvals - items.length} phiếu nữa` })));
}

// ---------- thanh trạng thái dưới ----------
function renderStatus() {
  const o = state.overview, s = clear($('status'));
  const cell = (ic, label, value, cls) => h('div', { class: 'stat ' + (cls || '') }, h('span', { class: 'ic' }, icon(ic)), h('div', {}, h('small', { text: label }), h('b', { class: 'num', text: value })));
  s.append(
    cell('people', 'Nhân sự đang làm', `${o.working}`),
    cell('alert', 'Cần chú ý', `${o.attention}`, o.attention ? 'warn' : ''),
    cell('approvals', 'Chờ phê duyệt', `${o.approvals}`, o.approvals ? 'warn' : ''),
    cell('cost', 'Chi phí tháng', `${money(o.monthCost, state.config.currency)} / ${money(o.monthlyBudget, state.config.currency)}`, o.costLevel === 'over' ? 'bad' : (o.costLevel === 'warn' ? 'warn' : '')),
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
        h('dt', { text: 'Hồ sơ' }), h('dd', {}, h('a', { href: `#/nhan-su/${a.id}`, onClick: close, text: 'Xem việc và lịch sử làm việc' })),
        h('dt', { text: 'Mô hình AI' }), h('dd', { text: 'Chưa gán (chọn ở giai đoạn 10)' }))));
  document.addEventListener('keydown', onKey);
  closeBtn.focus();
}

// ---------- định tuyến ----------
function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const segs = path.split('/');
  const id = segs[0] || 'tong-quan', sub = segs[1] || undefined;
  const badSub = segs.length > 2 || (sub !== undefined && (!['du-an', 'nhan-su'].includes(id) || !/^\d+$/.test(sub)));     // du-an/12 và nhan-su/7 là các trang chi tiết
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  live?.destroy?.(); live = null;           // trang cũ dọn dẹp (ví dụ dừng vòng vẽ 3D)
  document.body.classList.toggle('kiosk', id === 'kiosk' && !badSub);       // chế độ trình chiếu: ẩn thanh bên, thanh trên và các bảng phụ
  const main = clear($('main'));
  const ctx = { state, query, openAgent, refresh, go: hash => { location.hash = hash; }, applyConfig };
  let page, title;
  const notFound = () => h('div', { class: 'card empty' }, h('p', { text: 'Không có trang này.' }), h('a', { class: 'btn', href: '#/tong-quan', text: 'Về Tổng quan' }));
  if (badSub) { page = notFound(); title = 'Không tìm thấy'; }
  else if (id === 'tong-quan') { page = overviewPage(ctx); title = 'Tổng quan'; }
  else if (id === 'phong-dieu-hanh') { page = commandPage(ctx); title = 'Phòng điều hành'; }
  else if (id === 'du-an') { page = sub ? projectDetailPage(ctx, sub) : projectsPage(ctx); title = sub ? 'Chi tiết dự án' : 'Dự án'; }
  else if (id === 'cong-viec') { page = tasksPage(ctx); title = 'Công việc'; }
  else if (id === 'loi') { page = bugsPage(ctx); title = 'Lỗi'; }
  else if (id === 'phe-duyet') { page = approvalsPage(ctx); title = 'Phê duyệt'; }
  else if (id === 'chi-phi-ai') { page = costsPage(ctx); title = 'Chi phí AI'; }
  else if (id === 'bao-cao') { page = reportsPage(ctx); title = 'Báo cáo'; }
  else if (id === 'trien-khai') { page = deploymentsPage(ctx); title = 'Triển khai'; }
  else if (id === 'nhan-su') { page = sub ? agentPage(ctx, sub) : peoplePage(ctx); title = sub ? 'Hồ sơ nhân sự' : 'Nhân sự'; }
  else if (id === 'kien-thuc') { page = knowledgePage(ctx); title = 'Kiến thức'; }
  else if (id === 'cai-dat') { page = settingsPage(ctx); title = 'Cài đặt'; }
  else if (id === 'kiosk') { page = kioskPage(ctx); title = 'Chế độ trình chiếu'; }
  else if (id === 'huong-dan') { page = guidePage(); title = 'Hướng dẫn'; setTimeout(() => scrollToGuide(query.muc), 0); }
  else if (id === 'thong-bao') { page = notificationsPage(ctx); title = 'Thông báo'; }
  else if (SOON_IDS.includes(id)) { page = soonPage(id); title = NAV.find(n => n[0] === id)[1]; }
  else { page = notFound(); title = 'Không tìm thấy'; }
  if (page && page.el) { live = page.live || null; page = page.el; }
  main.append(page);
  document.title = `${title} - ${state.config.brandName}`;
  navId = !badSub && NAV.some(n => n[0] === id) ? id : '';
  markNav(navId);
  main.scrollTop = 0;
  live?.update?.();
}

// ---------- thời gian thực ----------
function applyTick(snap) {
  state.sim = { speed: snap.speed, auto: snap.auto, runs: snap.runs, done: snap.done, agents: snap.agents };     // agents: ai đang bị trả lỗi, cảnh 3D đánh dấu đỏ
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
  es.addEventListener('bugs', () => { refresh().then(() => live?.bugs?.()); });
  es.addEventListener('approvals', () => { refresh().then(() => { live?.approvals?.(); live?.projects?.(); }); });
  es.addEventListener('deployments', () => { refresh().then(() => live?.projects?.()); });
  let costTimer = null;
  es.addEventListener('costs', () => { clearTimeout(costTimer); costTimer = setTimeout(() => refresh().then(() => live?.projects?.()), 500); });       // chi phí mới: cập nhật ô chi phí tháng, không dồn dập
  let aiTimer = null;
  es.addEventListener('ai', () => { clearTimeout(aiTimer); aiTimer = setTimeout(() => { live?.ai?.(); live?.projects?.(); }, 500); });       // lời gọi AI dồn dập: gom lại, không vẽ lại liên tục
  es.addEventListener('files', () => { live?.projects?.(); });
  es.addEventListener('notification', e => { const n = JSON.parse(e.data); bell.push(n); refresh().then(() => live?.notification?.()); });
  es.addEventListener('settings', () => { api.config().then(c => { if (c.brandName !== state.config.brandName || c.tagline !== state.config.tagline || c.monthlyBudget !== state.config.monthlyBudget) applyConfig(c); }).catch(() => {}); });
  es.addEventListener('finished', e => { toast(`Đã giao xong: ${JSON.parse(e.data).title}`); });       // CEO đã nhận hồ sơ cuối
  es.addEventListener('handoff', e => {
    const ev = JSON.parse(e.data);
    live?.handoff?.(ev);
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
  bell = createBell({ go: hash => { location.hash = hash; } }); assist = createAssistantPanel(); document.body.append(assist.el);
  renderSide(); renderTop(); renderRight(); renderStatus(); drawBadge(); bell.load();
  document.addEventListener('cty:read', () => bell.load());
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
