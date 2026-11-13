import { h, clear, money } from './ui.js';
import { officeView } from './pages.js';
import { planTour, tickerLine } from './kiosk-logic.js';

// Chế độ trình chiếu: văn phòng 3D toàn màn hình cho màn hình treo tường. Chỉ xem, không thao tác được gì với dữ liệu.
// Camera tự đi tham quan; Esc thoát, Dấu cách tạm dừng, Mũi tên phải sang cảnh kế, F bật tắt toàn màn hình.
// Chi phí mặc định KHÔNG hiện (màn hình treo công khai); thêm ?chiphi=1 vào địa chỉ nếu bạn muốn hiện.
export function kioskPage(ctx) {
  const { state } = ctx;
  const showCost = ctx.query.chiphi === '1';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const names = Object.fromEntries(state.depts.map(d => [d.code, d.name]));
  const ov = officeView(ctx, { kiosk: true });
  const clock = h('div', { class: 'kclock num' }), date = h('div', { class: 'kdate' }), stats = h('div', { class: 'kstats' }), step = h('div', { class: 'kstep', 'aria-live': 'off' });
  const ticker = h('div', { class: 'kticker', 'aria-hidden': 'true' });
  const pauseBtn = h('button', { class: 'kbtn', type: 'button', onClick: () => togglePause() }, 'Tạm dừng');
  const exitBtn = h('button', { class: 'kbtn', type: 'button', onClick: () => leave() }, 'Thoát (Esc)');
  const hud = h('div', { class: 'khud' },
    h('div', { class: 'ktop' }, h('div', { class: 'kbrand' }, h('b', { text: state.config.brandName }), h('span', { text: state.config.tagline || '' })), h('div', { class: 'kright' }, clock, date)),
    h('div', { class: 'kbottom' }, h('div', { class: 'kleft' }, stats, step), ticker), h('div', { class: 'kctl' }, pauseBtn, exitBtn));
  const el = h('div', { class: 'kiosk', role: 'region', 'aria-label': 'Chế độ trình chiếu văn phòng. Nhấn Esc để thoát.' }, ov.el, hud);

  let paused = false, cycle = 0, plan = [], idx = 0, timer = 0, idleTimer = 0, wasFs = false, dead = false;
  const office = () => ov.get();
  function apply(s) {
    const o = office(); if (!o) return;
    if (s.type === 'follow') o.follow?.(s.runId); else { o.follow?.(null); o.zoom?.(s.type === 'room' ? s.code : null); }
  }
  function run() {
    clearTimeout(timer); if (dead || paused) return;
    if (idx >= plan.length) { plan = planTour({ runs: state.sim.runs, rooms: office()?.rooms?.() || [], cycle: cycle++, names }); idx = 0; }
    const s = plan[idx++]; apply(s); step.textContent = s.label;
    timer = setTimeout(run, s.seconds * 1000 * (reduce ? 2 : 1));
  }
  function togglePause(force) {
    paused = force ?? !paused; pauseBtn.textContent = paused ? 'Tiếp tục' : 'Tạm dừng'; pauseBtn.setAttribute('aria-pressed', String(paused));
    if (paused) { clearTimeout(timer); step.textContent = 'Đã tạm dừng. Kéo chuột để tự xoay.'; } else run();
  }
  function leave() { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); ctx.go('#/tong-quan?xem=3d'); }
  function toggleFs() { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); else document.documentElement.requestFullscreen?.().catch(() => {}); }
  const onKey = e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); leave(); }
    else if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); paused = false; pauseBtn.textContent = 'Tạm dừng'; run(); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFs(); }
  };
  const onFs = () => { if (document.fullscreenElement) wasFs = true; else if (wasFs && !dead) leave(); };         // thoát toàn màn hình (Esc của trình duyệt) thì thoát luôn chế độ trình chiếu
  const onMove = () => { el.classList.add('active'); clearTimeout(idleTimer); idleTimer = setTimeout(() => el.classList.remove('active'), 3000); };
  addEventListener('keydown', onKey, true); document.addEventListener('fullscreenchange', onFs); el.addEventListener('mousemove', onMove); el.addEventListener('pointerdown', onMove);
  const tick = setInterval(paintClock, 1000);
  function paintClock() {
    const d = new Date();
    clock.textContent = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    date.textContent = d.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' });
  }
  function paintStats() {
    const o = state.overview; if (!o) return;
    const parts = [`${o.projects} việc đang chạy`, `${o.working} người đang làm`];
    if (o.approvals) parts.push(`${o.approvals} việc chờ duyệt`);
    if (o.bugsActive) parts.push(`${o.bugsActive} lỗi đang xử lý`);
    if (showCost) parts.push(`Chi phí tháng ${money(o.monthCost, state.config.currency || 'USD')}`);
    stats.textContent = parts.join('  ·  ');
  }
  const lines = [];
  function addLine(text) {
    lines.unshift(text); lines.length = Math.min(lines.length, 3);
    clear(ticker); lines.forEach((t, i) => ticker.append(h('div', { class: 'kline' + (i === 0 ? ' new' : ''), text: t })));
  }
  paintClock(); paintStats(); onMove();
  setTimeout(() => { if (!dead) run(); }, 1500);
  return {
    el,
    live: {
      update() { ov.sync(); paintStats(); },
      handoff(ev) { ov.handoff(ev); addLine(tickerLine(ev, names)); },
      destroy() { dead = true; clearTimeout(timer); clearTimeout(idleTimer); clearInterval(tick); removeEventListener('keydown', onKey, true); document.removeEventListener('fullscreenchange', onFs); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); ov.destroy(); }
    }
  };
}
