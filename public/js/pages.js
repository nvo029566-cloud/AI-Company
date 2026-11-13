import { h, clear, icon, avatar, toast, STATUS, strip, money, roomHover } from './ui.js';
import { api } from './api.js';
import { mapView } from './map2d.js';
import { createOffice3D } from './office3d.js';
import { createOfficeGL, glSupported } from './office_gl.js';
import { HEAT_METRICS, busyItems, toHeatMap } from './heat.js';

// ---------- Tổng quan ----------
const KINDS = [['web', 'Ứng dụng web'], ['exe', 'Phần mềm máy tính (.exe)'], ['landing', 'Trang đích'], ['mobile', 'Ứng dụng di động']];

export function overviewPage(ctx) {
  const { state } = ctx;
  const tab = ctx.query.xem === 'phong' ? 'phong' : (ctx.query.xem === '3d' ? '3d' : '2d');
  const ds = Object.fromEntries(state.depts.map(d => [d.code, d]));
  const sub = h('p', { class: 'num' });
  const guard = fn => async () => { try { await fn(); } catch (e) { toast(e.message); } };

  // --- thanh điều khiển mô phỏng ---
  const kind = h('select', { 'aria-label': 'Loại sản phẩm chạy thử' }, KINDS.map(([v, t]) => h('option', { value: v, text: t })));
  const spawn = h('button', { class: 'btn primary', type: 'button', onClick: guard(() => api.simSpawn(kind.value)) }, icon('spark'), 'Chạy thử một việc');
  const auto = h('input', { type: 'checkbox', id: 'sim-auto', onChange: guard(() => api.simAuto(auto.checked)) });
  const speed = h('select', { 'aria-label': 'Tốc độ mô phỏng', onChange: guard(() => api.simSpeed(Number(speed.value))) },
    [1, 2, 4, 8].map(v => h('option', { value: v, text: `Tốc độ ${v}x` })));
  const stop = h('button', { class: 'btn', type: 'button', onClick: guard(() => api.simClear()) }, 'Dừng tất cả');
  const bar = h('div', { class: 'card simbar' },
    h('div', { class: 'ctl' }, kind, spawn),
    h('label', { class: 'switch', for: 'sim-auto' }, auto, h('span', { class: 'track' }), 'Tự động tạo việc'),
    h('div', { class: 'ctl' }, speed, stop),
    h('p', { class: 'hint', text: 'Việc ở đây luôn là mô phỏng để xem công ty vận hành, không tốn tiền. Dự án thật giao ở Phòng điều hành sẽ dùng AI thật nếu bạn bật trong Cài đặt.' }));

  // --- danh sách việc đang chạy ---
  const runsBox = h('div', { class: 'runs' });
  function drawRuns() {
    const runs = state.sim.runs;
    clear(runsBox);
    if (!runs.length) {
      return runsBox.append(h('div', { class: 'card empty small', text: 'Chưa có việc nào đang chạy. Bấm "Chạy thử một việc" để xem dây chuyền hoạt động.' }));
    }
    for (const r of runs) {
      const cur = r.items.filter(i => !i.support && r.stage < r.total);
      const part = cur.length ? cur.reduce((n, i) => n + i.progress, 0) / Math.max(1, r.stages[r.stage]?.depts.length || 1) : 0;
      const pct = Math.min(100, Math.round(((r.stage + part) / r.total) * 100));
      const who = r.items.filter(i => i.state === 'working').map(i => {
        const a = state.agents.find(x => x.id === i.agentId);
        return `${a ? a.name : 'Một nhân viên'}: ${i.title.toLowerCase()}`;
      });
      const queued = r.items.filter(i => i.state === 'queued' && !i.support).length;
      runsBox.append(h('article', { class: 'card run' },
        h('header', {}, h('b', { text: r.title }), h('span', { class: 'tag', text: r.kindLabel }), h('span', { class: 'pct num', text: `${pct}%` })),
        h('div', { class: 'chips', role: 'list' }, r.stages.map(st => h('span', { class: 'chip ' + st.state, role: 'listitem' }, st.depts.map(c => ds[c]?.name || c).join(' + ')))),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': `Tiến độ ${r.title}` }, h('i', { style: { width: pct + '%' } })),
        h('p', { class: 'who', text: who.length ? who.join('; ') : (queued ? 'Đang xếp hàng chờ người rảnh' : 'Đang chuyển giao') })));
    }
  }

  // --- các tab ---
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Cách xem' },
    h('button', { role: 'tab', 'aria-selected': String(tab === '2d'), type: 'button', onClick: () => ctx.go('#/tong-quan') }, 'Sơ đồ 2D'),
    h('button', { role: 'tab', 'aria-selected': String(tab === '3d'), type: 'button', onClick: () => ctx.go('#/tong-quan?xem=3d') }, 'Văn phòng 3D'),
    h('button', { role: 'tab', 'aria-selected': String(tab === 'phong'), type: 'button', onClick: () => ctx.go('#/tong-quan?xem=phong') }, 'Danh sách phòng'));

  let map = null, office = null, cards = [];
  let body;
  if (tab === '2d') { map = mapView(ctx); body = map.el; }
  else if (tab === '3d') { office = officeView(ctx); body = office.el; }
  else { cards = state.depts.map(d => deptCard(d, state)); body = h('div', { class: 'grid' }, cards.map(c => c.el)); }

  const el = h('div', {},
    h('div', { class: 'pagehead' },
      h('div', {}, h('div', { class: 'kicker', text: 'Tổng quan' }), h('h1', { text: `Văn phòng ${state.config.brandName}` }), sub),
      h('div', { class: 'actions' }, tab === '3d' && h('button', { class: 'btn', type: 'button', title: 'Văn phòng 3D toàn màn hình cho màn hình treo tường', onClick: () => { document.documentElement.requestFullscreen?.().catch(() => {}); ctx.go('#/kiosk'); } }, 'Chế độ trình chiếu'), h('a', { class: 'btn', href: '#/phong-dieu-hanh' }, 'Giao việc mới'))),
    bar, tabs, body,
    h('h2', { class: 'section-title', text: 'Việc đang chạy' }), runsBox);

  function update() {
    const o = state.overview;
    sub.textContent = `${o.projects} việc đang chạy, ${o.working} nhân viên đang làm việc`;
    auto.checked = !!state.sim.auto;
    speed.value = String(state.sim.speed);
    stop.disabled = state.sim.runs.length === 0;
    map?.update();
    office?.sync();
    cards.forEach(c => c.update());
    drawRuns();
  }
  update();
  return { el, live: { update, handoff: ev => { map?.handoff(ev); office?.handoff(ev); }, destroy: () => office?.destroy() } };
}

// Khung văn phòng 3D: ưu tiên bản WebGL (xoay 360 độ); máy không hỗ trợ thì dùng bản vẽ phẳng.
export function officeView(ctx, { kiosk = false } = {}) {
  const { state } = ctx;
  const back = h('button', { class: 'ofbtn', type: 'button', hidden: true, onClick: () => office.zoom(null) }, 'Toàn cảnh (Esc)');
  const where = h('span', { class: 'where' });
  const modes = [['auto', 'Tự động'], ['day', 'Ngày'], ['night', 'Đêm']];
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Ánh sáng' }, modes.map(([v, t]) =>
    h('button', { type: 'button', 'data-m': v, onClick: () => { office.setLight(v); paintSeg(); } }, t)));
  const shade = h('button', { class: 'ofbtn plain', type: 'button', hidden: true, 'aria-pressed': 'true', onClick: () => { office.setShadows(!office.getShadows()); paintSeg(); } });
  const hint = h('div', { class: 'ofhint' });
  const paintSeg = () => {
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === office.getLight())));
    if (office.setShadows) { shade.hidden = false; shade.textContent = office.getShadows() ? 'Bóng: bật' : 'Bóng: tắt'; shade.setAttribute('aria-pressed', String(office.getShadows())); }
  };
  // Bảng cài đặt cảnh 3D: chất lượng, thời tiết, âm thanh, chuyển động, hỗ trợ màu, FPS; chụp ảnh và quay video.
  const SET_ROWS = [['quality', 'Chất lượng', [['auto', 'Tự động'], ['low', 'Thấp'], ['mid', 'Vừa'], ['high', 'Cao']]], ['weather', 'Thời tiết', [['auto', 'Tự động'], ['clear', 'Nắng'], ['rain', 'Mưa'], ['fog', 'Sương']]],
    ['sound', 'Âm thanh', [['off', 'Tắt'], ['on', 'Bật']]], ['motion', 'Chuyển động', [['auto', 'Bình thường'], ['reduce', 'Giảm']]], ['cb', 'Màu thân thiện', [['off', 'Tắt'], ['on', 'Bật']]], ['fps', 'Hiện FPS', [['off', 'Tắt'], ['on', 'Bật']]]];
  const download = (blob, name) => { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  const live = h('p', { class: 'glset-live num' });
  const shotBtn = h('button', { type: 'button', class: 'ofbtn', onClick: () => office.capture().then(b => { download(b, 'van-phong-ai.png'); toast('Đã lưu ảnh (chỉ gồm hình 3D, không gồm chữ nổi).'); }).catch(e => toast(e.message)) }, '📷 Chụp ảnh');
  const recBtn = h('button', { type: 'button', class: 'ofbtn', onClick: () => { toast('Đang quay 8 giây…'); recBtn.disabled = true; office.record(8).then(b => { download(b, 'van-phong-ai.webm'); toast('Đã lưu video (định dạng WebM).'); }).catch(e => toast(e.message)).finally(() => { recBtn.disabled = false; }); } }, '🎥 Quay 8 giây');
  const panel = h('div', { class: 'glset', hidden: true, role: 'dialog', 'aria-label': 'Cài đặt cảnh 3D' },
    SET_ROWS.map(([k, label, opts]) => h('div', { class: 'glset-row', 'data-k': k }, h('span', { text: label }), h('div', { class: 'seg', role: 'group', 'aria-label': label }, opts.map(([v, t]) =>
      h('button', { type: 'button', 'data-v': v, onClick: () => { office.setSetting(k, v); paintPanel(); } }, t))))),
    h('div', { class: 'glset-act' }, shotBtn, recBtn), live,
    h('p', { class: 'glset-tip', text: 'Phím tắt: gõ hai số để tới phòng (05, 12), C = phòng CEO, L = phòng nghỉ, Esc = toàn cảnh. Bấm vào tên dự án ở góc dưới trái để camera đi theo hồ sơ.' }));
  let liveTimer = 0;
  const paintPanel = () => {
    if (!office?.getSetting) return;
    panel.querySelectorAll('.glset-row').forEach(r => r.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(office.getSetting(r.dataset.k) === b.dataset.v))));
    const p = office.perf?.(); if (p) live.textContent = `FPS ${Math.round(p.fps)} · độ nét ${Math.round(p.scale * 100)}% · bóng ${office.getShadows?.() ? 'bật' : 'tắt'} · hiệu ứng ${['tối thiểu', 'vừa', 'đầy đủ'][p.fx] || ''}`;
  };
  const gear = h('button', { class: 'ofbtn plain', type: 'button', 'aria-expanded': 'false', onClick: () => { panel.hidden = !panel.hidden; gear.setAttribute('aria-expanded', String(!panel.hidden)); paintPanel(); clearInterval(liveTimer); if (!panel.hidden) liveTimer = setInterval(paintPanel, 700); } }, '⚙ Cài đặt cảnh');
  // ---- bản đồ nhiệt: tô màu sàn từng phòng theo mức bận, việc xong, chi phí hoặc lỗi ----
  const store = { get: () => { try { return JSON.parse(localStorage.getItem('heat3d') || '{}'); } catch { return {}; } }, set: v => { try { localStorage.setItem('heat3d', JSON.stringify(v)); } catch { /* bỏ qua */ } } };
  const saved = store.get();
  let heatMetric = ['off', ...HEAT_METRICS.map(m => m[0])].includes(saved.metric) && !kiosk ? saved.metric : 'off', heatPeriod = ['7', '30', 'all'].includes(saved.period) ? saved.period : '7', heatSeq = 0, heatTimer = 0;
  const heatSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Bản đồ nhiệt' }, h('span', { class: 'seglabel', text: 'Nhiệt:' }),
    [['off', 'Tắt'], ...HEAT_METRICS].map(([v, t]) => h('button', { type: 'button', 'data-hm': v, onClick: () => { heatMetric = v; store.set({ metric: v, period: heatPeriod }); applyHeat(); } }, t)));
  const heatNote = h('span', { class: 'heatnote', 'aria-live': 'polite' });
  const periodSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Khoảng thời gian' }, [['7', '7 ngày'], ['30', '30 ngày'], ['all', 'Tất cả']].map(([v, t]) =>
    h('button', { type: 'button', 'data-hp': v, onClick: () => { heatPeriod = v; store.set({ metric: heatMetric, period: v }); applyHeat(); } }, t)));
  const heatBar = h('div', { class: 'heatbar', hidden: true }, h('span', { text: 'Ít' }), h('i', { class: 'heatramp', 'aria-hidden': 'true' }), h('span', { text: 'Nhiều' }), periodSeg, heatNote);
  const fmtMoney = n => money(n, state.config.currency || 'USD');
  async function applyHeat() {
    heatSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hm === heatMetric)));
    periodSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hp === heatPeriod)));
    if (!office?.setHeat) return;
    const seq = ++heatSeq;
    if (heatMetric === 'off') { office.setHeat(null); heatBar.hidden = true; return; }
    heatBar.hidden = false; periodSeg.hidden = heatMetric === 'busy';
    if (heatMetric === 'busy') {
      const items = busyItems(office.rooms());
      office.setHeat(toHeatMap('busy', items));
      const top = items.reduce((a, b) => (b.value > a.value ? b : a), { value: 0 });
      heatNote.textContent = `Số người đang làm trên tổng số người của phòng. ${top.value > 0 ? `Bận nhất: phòng ${top.code} (${top.work}/${top.total}).` : 'Hiện chưa có ai đang làm việc.'}`;
      return;
    }
    try {
      const d = await api.heatmap(heatMetric, heatPeriod);
      if (seq !== heatSeq) return;                                                // đã đổi sang thước đo khác trong lúc chờ
      office.setHeat(toHeatMap(heatMetric, d.items, fmtMoney));
      const top = d.items.find(i => i.value === 1 && d.max > 0);
      const name = { tasks: 'số việc đã xong', cost: 'chi phí', bugs: 'số lỗi' }[heatMetric], span = { 7: '7 ngày qua', 30: '30 ngày qua', all: 'từ đầu đến nay' }[heatPeriod];
      heatNote.textContent = d.max > 0 ? `Theo ${name}, ${span}. Cao nhất: phòng ${top.code} (${heatMetric === 'cost' ? fmtMoney(top.raw) : top.raw}).` : `Chưa có ${name} nào trong ${span}.`;
    } catch (e) { if (seq === heatSeq) { toast(e.message); heatNote.textContent = e.message; } }
  }
  const heatTick = () => { if (heatMetric === 'busy' && office?.hasHeat) applyHeat(); };
  const el = h('div', { class: 'office3d' }, h('div', { class: 'ofbar' }, seg, heatSeg, where, shade, gear, back), heatBar, panel, hint);
  const common = {
    depts: () => state.depts, agents: () => state.agents, sim: () => state.sim,
    stats: () => ({ agents: state.agents.length, depts: state.depts.length, laptops: state.overview.laptops }),
    brand: () => state.config.brandName,
    hover: roomHover,                                                                   // rê chuột vào phòng: sáng lên cả ở cảnh 3D lẫn danh sách bên phải
    onDelivered: d => { api.simDelivered(d.runId, d.from, d.to, d.bugId).catch(() => {}); },     // hồ sơ đã tới tay người nhận: cho phép phòng kế tiếp bắt đầu làm
    onArrived: id => { api.simArrived(id).catch(() => {}); },                           // người được mượn đã ngồi vào bàn: bắt đầu tính tiến độ
    onViewer: () => { api.simViewer().catch(() => {}); },                               // cảnh 3D đang mở: máy chủ chờ hồ sơ thay vì tự thả sớm
    onPerf: kind => { toast(kind === 'scale' ? 'Máy đang chạy chậm nên đã giảm độ nét hình 3D.' : 'Máy vẫn chậm nên đã tắt bóng đổ. Bấm "Bóng" để bật lại nếu muốn.'); paintSeg(); },
    onPickAgent: ref => { if (kiosk) return; ref.ceo ? ctx.go('#/phong-dieu-hanh') : ctx.openAgent(ref, el); },       // trình chiếu: chỉ xem
    onFollow: id => { back.hidden = !id; where.textContent = id ? 'Camera đang đi theo một dự án (bấm Esc để dừng)' : ''; },
    onZoom: room => {
      back.hidden = !room;
      where.textContent = room ? (room.ceo ? 'Phòng CEO' : room.lounge ? 'Phòng nghỉ' : `${room.code} ${room.name}, ${room.total} người`) : '';
    }
  };
  let office = null;
  function useFlat() {                                   // bản vẽ phẳng dự phòng
    el.querySelector('canvas.office-cv')?.remove();
    const cv = h('canvas', { class: 'office-cv', role: 'img', tabindex: 0,
      'aria-label': 'Văn phòng 3D của công ty. Muốn đọc dạng chữ, hãy mở tab Sơ đồ 2D hoặc Danh sách phòng.' });
    el.prepend(cv);
    office = createOffice3D(cv, common);
    shade.hidden = true; gear.hidden = true; heatSeg.hidden = true; heatBar.hidden = true;
    hint.textContent = 'Máy này chưa dùng được 3D đầy đủ nên đang hiện bản đơn giản. Bấm vào phòng để phóng to, bấm vào nhân viên để xem chi tiết.';
  }
  if (glSupported()) {
    try {
      office = createOfficeGL(el, { ...common, onFail: () => { try { office.destroy(); } catch { /* bỏ qua */ } useFlat(); paintSeg(); toast('Mất kết nối đồ họa, đã chuyển sang bản đơn giản.'); } });
      hint.textContent = 'Kéo chuột để xoay, cuộn để zoom, giữ Shift hoặc chuột phải để di chuyển. Bấm vào phòng để phóng to, bấm vào nhân viên để xem chi tiết.';
    } catch (e) { console.warn('WebGL không khởi tạo được, dùng bản đơn giản:', e.message); office = null; }
  }
  if (!office) useFlat();
  paintSeg();
  applyHeat();
  heatTimer = setInterval(() => { if (heatMetric !== 'off' && heatMetric !== 'busy') applyHeat(); }, 20000);       // thước đo lấy từ máy chủ: làm mới thỉnh thoảng
  return { el, get: () => office, sync: () => { office.sync(); heatTick(); }, handoff: ev => office.handoff(ev), destroy: () => { clearInterval(liveTimer); clearInterval(heatTimer); office.destroy(); } };
}

function deptCard(d, state) {
  const lead = state.agents.find(a => a.deptCode === d.code && a.isLead);
  const st = h('span', { class: 'state' });
  const el = h('a', { class: 'card dept', href: `#/nhan-su?phong=${d.code}`, 'aria-label': `Phòng ${d.name}, ${d.total} người` },
    h('div', { class: 'row' },
      h('span', { class: 'code num', style: { background: d.color }, text: d.code }),
      h('div', {}, h('h3', { text: d.name }), h('div', { class: 'en', text: d.nameEn }))),
    h('p', { text: d.role }),
    lead && h('div', { class: 'lead', text: `Trưởng phòng: ${lead.name}` }),
    h('div', { class: 'foot' }, h('span', { class: 'num', text: `${d.total} người` }), st));
  const update = () => { const idle = d.working === 0; st.className = 'state' + (idle ? '' : ' working'); st.textContent = idle ? 'Rảnh' : `${d.working} đang làm`; };
  update();
  return { el, update };
}

// ---------- Phòng điều hành ----------
const EXAMPLES = [
  { kind: 'web', label: 'Ứng dụng web', text: 'Làm web đặt bàn cho quán cà phê. Khách chọn giờ và số người, chủ quán xem lịch đặt theo ngày.' },
  { kind: 'exe', label: 'Phần mềm máy tính (.exe)', text: 'Phần mềm máy tính quản lý kho gồm: nhập, xuất, theo dõi mã hàng, in phiếu.' },
  { kind: 'landing', label: 'Trang đích', text: 'Landing page giới thiệu xưởng gỗ Minh Phát, có form nhận báo giá.' },
  { kind: 'mobile', label: 'Ứng dụng di động', text: 'App theo dõi chi tiêu hàng ngày, có đăng nhập, thống kê theo tháng và nhắc nhở cuối ngày.' }
];
const CMD_MIN = 10, CMD_MAX = 2000;          // phải khớp với LIMITS trong src/planner.js
const draft = { text: '', kind: 'web', replaceId: null, replaceTitle: '' };   // giữ nội dung đang gõ khi chuyển qua lại giữa các màn
const fmtTime = s => { const d = new Date(String(s).replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); };

const phaseNote = pr => pr && pr.gate ? `Chờ bạn duyệt: ${pr.gate === 'release' ? 'cho phép phát hành' : 'chi phí vượt ngân sách'}` : (pr && pr.delivering ? 'Đang giao hồ sơ cho CEO' : (pr && pr.bugRound ? 'Kiểm thử tìm ra lỗi, đang sửa' : null));

export function commandPage(ctx) {
  const { state } = ctx;
  const ds = Object.fromEntries(state.depts.map(d => [d.code, d]));
  const cur = () => (state.config && state.config.currency) || 'USD';
  const root = h('div', { class: 'cmd' });
  const recentBox = h('div', { class: 'recent' });
  let mode = 'compose', plan = null, recent = [], alive = true, sending = false, reloading = false, rejectTimer = null, setProgress = null;

  // ----- yêu cầu gần đây -----
  function drawRecent() {
    clear(recentBox);
    if (!recent || !recent.length) return;
    recentBox.append(h('h3', { text: 'Yêu cầu gần đây' }),
      ...recent.slice(0, 5).map(p => h('button', { class: 'prow', type: 'button', onClick: () => openProject(p.id) },
        h('span', { class: 'ptext' }, h('b', { text: p.title }), h('small', { text: `${p.kindLabel} · ${fmtTime(p.createdAt)}` })),
        h('span', { class: 'pstat ' + p.status, text: p.statusLabel }),
        h('span', { class: 'num pcost', text: money(p.estimate, cur()) }))));
  }
  async function loadRecent() { try { recent = await api.projects(); } catch { recent = []; } if (alive) drawRecent(); }
  async function openProject(id) {
    try { showPlan(await api.project(id)); } catch (e) { toast(e.message); }
  }

  // ----- màn viết yêu cầu -----
  function showCompose() {
    mode = 'compose'; plan = null; setProgress = null;
    const ta = h('textarea', { id: 'cmd-text', maxlength: String(CMD_MAX), placeholder: 'Mô tả điều bạn muốn, bằng tiếng Việt như nhắn tin cho nhân viên.', 'aria-label': 'Nội dung yêu cầu giao cho CTO', 'aria-describedby': 'cmd-hint' });
    ta.value = draft.text;
    const sel = h('select', { id: 'cmd-kind', 'aria-label': 'Loại sản phẩm' }, KINDS.map(([v, l]) => h('option', { value: v, text: l })));
    sel.value = draft.kind;
    const count = h('span', { class: 'count num' });
    const err = h('div', { class: 'cmderr', role: 'alert', hidden: true });
    const send = h('button', { class: 'btn primary', type: 'button', id: 'cmd-send' }, 'Gửi cho CTO');
    const sync = () => { draft.text = ta.value; draft.kind = sel.value; count.textContent = `${ta.value.length}/${CMD_MAX}`; send.disabled = sending || ta.value.trim().length < CMD_MIN; };
    async function submit() {
      if (send.disabled) return;
      sending = true; sync(); send.textContent = 'CTO đang lập kế hoạch…'; err.hidden = true;
      try {
        const p = await api.projectCreate({ text: ta.value, kind: sel.value });
        if (draft.replaceId) { try { await api.projectReject(draft.replaceId); toast('Đã thay kế hoạch cũ bằng kế hoạch mới.'); } catch { /* kế hoạch cũ đã được xử lý ở nơi khác */ } }
        draft.text = ''; draft.replaceId = null; draft.replaceTitle = '';
        ctx.refresh && ctx.refresh(); loadRecent();
        if (alive) showPlan(p);
      } catch (e) { err.textContent = e.message; err.hidden = false; }
      finally { sending = false; if (alive && mode === 'compose') { send.textContent = 'Gửi cho CTO'; sync(); } }
    }
    ta.addEventListener('input', sync); sel.addEventListener('change', sync);
    ta.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); } });
    send.addEventListener('click', submit);
    const parts = [
      h('div', { class: 'pagehead' }, h('div', {},
        h('div', { class: 'kicker', text: 'CEO và CTO' }), h('h1', { text: 'Phòng điều hành', tabindex: '-1' }),
        h('p', { text: 'Nói với CTO bằng lời. Kế hoạch chỉ chạy khi bạn duyệt.' }))),
      h('div', { class: 'mid' },
        h('small', { text: 'Bắt đầu một dự án' }), h('h2', { text: 'Mô tả thứ bạn muốn công ty làm' }),
        h('p', { text: 'CTO sẽ chia yêu cầu thành việc cho từng phòng, báo ước tính chi phí rồi chờ bạn duyệt. Chưa duyệt thì chưa tốn đồng nào.' })),
      h('div', { class: 'examples' }, EXAMPLES.map(e =>
        h('button', { class: 'example', type: 'button', onClick: () => { ta.value = e.text; sel.value = e.kind; sync(); ta.focus(); } },
          h('b', { text: e.label }), h('span', { text: e.text })))),
      recentBox,
      draft.replaceId && h('div', { class: 'replacing' }, h('span', { text: `Đang sửa kế hoạch "${draft.replaceTitle}". Kế hoạch cũ sẽ được thay khi bạn gửi.` }),
        h('button', { class: 'btn', type: 'button', onClick: () => { draft.replaceId = null; draft.replaceTitle = ''; showCompose(); } }, 'Huỷ sửa')),
      h('div', { class: 'composer' }, ta, err,
        h('div', { class: 'bar' }, sel,
          h('span', { class: 'hint', id: 'cmd-hint', text: 'Gõ ít nhất 10 ký tự. Nhấn Ctrl+Enter để gửi. Gửi xong bạn sẽ thấy kế hoạch để duyệt.' }), count, send))
    ];
    clear(root).append(...parts.filter(Boolean));     // Element.append không tự bỏ giá trị rỗng và không trải phẳng mảng
    sync(); drawRecent();
  }

  // ----- màn kế hoạch -----
  function showPlan(p) {
    mode = 'plan'; plan = p; setProgress = null; clearTimeout(rejectTimer);
    clear(root).append(planView(p));
    const m = document.getElementById('main'); if (m) m.scrollTop = 0;
    const t = root.querySelector('h1'); if (t) t.focus({ preventScroll: true });
  }
  async function reloadPlan() {
    if (reloading || !plan) return;
    reloading = true;
    try {
      const p = await api.project(plan.id);
      if (!alive || mode !== 'plan' || !plan || p.id !== plan.id) return;
      if (p.status !== plan.status) showPlan(p);
      else { plan = p; if (p.progress && setProgress) setProgress(p.progress.stage, p.progress.total, 0, phaseNote(p.progress)); }
    } catch { /* thử lại ở lần sau */ } finally { reloading = false; }
  }

  function planView(p) {
    const pl = p.plan, errBox = h('div', { class: 'cmderr', role: 'alert', hidden: true });
    const fail = e => { errBox.textContent = e.message; errBox.hidden = false; reloadPlan(); };
    const stages = pl.stages.map(st => h('section', { class: 'pstage', 'aria-label': `Chặng ${st.index}` },
      h('header', {}, h('b', { text: `Chặng ${st.index}` }), st.parallel && h('span', { class: 'tag', text: 'làm song song' })),
      st.tasks.map(t => {
        const d = ds[t.dept];
        return h('div', { class: 'ptask' },
          h('span', { class: 'dchip', style: { background: d ? d.color : '#667087' }, title: d ? d.name : t.dept, text: t.dept }),
          h('div', { class: 'tbody' }, h('b', { text: `${d ? d.name : t.dept}: ${t.title.split(': ')[0]}` }), h('small', { text: t.detail })),
          h('span', { class: 'num pcost', text: money(t.cost, cur()) }));
      })));
    const e = pl.estimate;
    const cost = h('div', { class: 'costcard' },
      h('div', {}, h('small', { text: 'Ước tính chi phí' }), h('div', { class: 'big num', text: money(e.expected, cur()) }),
        h('small', { class: 'num', text: `Khoảng ${money(e.low, cur())} đến ${money(e.high, cur())}` })),
      p.budget && h('div', { class: 'bud' + (p.budget.over ? ' over' : '') },
        h('small', { text: 'Ngân sách tháng còn lại' }), h('b', { class: 'num', text: `${money(p.budget.remaining, cur())} / ${money(p.budget.monthly, cur())}` }),
        p.budget.over && h('span', { class: 'overtxt', text: 'Kế hoạch này vượt phần còn lại.' })),
      h('p', { class: 'assume', text: pl.assumptions }));

    // khu thao tác theo trạng thái
    let actions;
    if (p.status === 'awaiting') {
      const over = !!(p.budget && p.budget.over);
      const okBtn = h('button', { class: 'btn primary' + (over ? ' warnbtn' : ''), type: 'button', id: 'plan-approve' }, over ? 'Duyệt dù vượt ngân sách' : 'Duyệt và chạy');
      okBtn.addEventListener('click', async () => {
        okBtn.disabled = true; errBox.hidden = true;
        try { const np = await api.projectApprove(p.id, over); toast('Đã duyệt. Công ty bắt đầu làm việc.'); ctx.refresh && ctx.refresh(); loadRecent(); if (alive) showPlan(np); }
        catch (x) { okBtn.disabled = false; fail(x); }
      });
      const editBtn = h('button', { class: 'btn', type: 'button', onClick: () => { draft.text = p.request; draft.kind = p.kind; draft.replaceId = p.id; draft.replaceTitle = p.title; showCompose(); } }, 'Sửa và gửi lại');
      const rejBtn = h('button', { class: 'btn', type: 'button', id: 'plan-reject' }, 'Từ chối');
      let armed = false;
      rejBtn.addEventListener('click', async () => {
        if (!armed) { armed = true; rejBtn.textContent = 'Bấm lần nữa để từ chối'; rejBtn.classList.add('danger'); rejectTimer = setTimeout(() => { armed = false; rejBtn.textContent = 'Từ chối'; rejBtn.classList.remove('danger'); }, 4000); return; }
        clearTimeout(rejectTimer); rejBtn.disabled = true;
        try { const np = await api.projectReject(p.id); toast('Đã từ chối kế hoạch.'); ctx.refresh && ctx.refresh(); loadRecent(); if (alive) showPlan(np); }
        catch (x) { rejBtn.disabled = false; fail(x); }
      });
      actions = h('div', { class: 'pactions sticky' }, okBtn, editBtn, rejBtn, h('span', { class: 'hint', text: over ? 'Bạn cần xác nhận vượt ngân sách mới chạy được.' : 'Bấm duyệt thì các phòng mới bắt đầu làm.' }));
    } else if (p.status === 'running') {
      const txt = h('b', { class: 'num' }), bar = h('i'), box = h('div', { class: 'pbar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, bar);
      setProgress = (stage, total, partial, note) => {
        const pct = Math.max(2, Math.min(100, Math.round(((stage + (partial || 0)) / total) * 100)));
        txt.textContent = note || `Đang ở chặng ${Math.min(stage + 1, total)} trên ${total}`;
        bar.style.width = pct + '%'; box.setAttribute('aria-valuenow', String(pct));
      };
      if (p.progress) setProgress(p.progress.stage, p.progress.total, 0, phaseNote(p.progress)); else setProgress(0, pl.stages.length, 0);
      actions = h('div', { class: 'prun' }, h('div', { class: 'prunhead' }, h('span', { class: 'okdot' }), txt), box,
        h('div', { class: 'pactions' }, h('a', { class: 'btn primary', href: '#/tong-quan?xem=3d', text: 'Xem trong văn phòng 3D' })));
    } else {
      const msg = { done: `Đã giao xong lúc ${fmtTime(p.finishedAt)}.`, rejected: 'Bạn đã từ chối kế hoạch này. Chưa có việc nào được giao và chưa tốn đồng nào.', cancelled: 'Dự án bị dừng giữa chừng (bấm xoá việc hoặc máy chủ khởi động lại).' }[p.status];
      actions = h('div', { class: 'pactions' }, h('span', { class: 'hint', text: msg }),
        h('button', { class: 'btn', type: 'button', onClick: () => { draft.text = p.request; draft.kind = p.kind; draft.replaceId = null; showCompose(); loadRecent(); } }, 'Gửi lại yêu cầu này'));
    }

    return h('div', { class: 'planview' },
      h('div', { class: 'pagehead' },
        h('div', {}, h('div', { class: 'kicker', text: `${p.kindLabel} · gửi lúc ${fmtTime(p.createdAt)}` }), h('h1', { text: p.title, tabindex: '-1' }), h('p', { text: pl.summary })),
        h('div', { class: 'actions' }, h('span', { class: 'pstat ' + p.status, text: p.statusLabel }),
          h('button', { class: 'btn', type: 'button', onClick: () => { draft.replaceId = null; showCompose(); loadRecent(); } }, 'Yêu cầu mới'))),
      p.status !== 'awaiting' && actions,          // đang chạy, đã xong, đã từ chối: trạng thái nằm ngay đầu trang cho dễ thấy
      h('div', { class: 'reqbox' }, h('small', { text: 'Yêu cầu của bạn' }), h('p', { text: p.request })),
      pl.notes.map(n => h('div', { class: 'pnote' }, icon('alert'), h('span', { text: n }))),
      cost, h('div', { class: 'pstages' }, stages), errBox, p.status === 'awaiting' && actions);
  }

  const q = ctx.query && ctx.query.kehoach;
  showCompose(); loadRecent();
  if (q && /^\d+$/.test(q)) openProject(Number(q));
  return {
    el: root,
    live: {
      update() {
        if (mode !== 'plan' || !plan || plan.status !== 'running') return;
        const r = state.sim.runs.find(x => x.projectId === plan.id);
        if (!r) { reloadPlan(); return; }          // hết chạy: xem đã xong hay bị dừng
        const its = r.items.filter(i => !i.support);
        const part = its.length ? its.reduce((a, i) => a + i.progress, 0) / its.length : 0;
        if (setProgress) setProgress(r.stage, r.total, Math.min(0.99, part), phaseNote({ gate: r.gate ? r.gate.kind : null, delivering: r.delivering, bugRound: r.items.some(i => i.kind === 'fix' || i.kind === 'retest') }));
      },
      projects() { loadRecent(); if (mode === 'plan' && plan) reloadPlan(); },
      destroy() { alive = false; clearTimeout(rejectTimer); }
    }
  };
}

// ---------- Nhân sự ----------
export function peoplePage(ctx) {
  const { state, query } = ctx;
  const ds = Object.fromEntries(state.depts.map(d => [d.code, d]));
  const search = h('input', { type: 'search', placeholder: 'Tìm tên hoặc chức danh', 'aria-label': 'Tìm nhân sự' });
  const sel = h('select', { 'aria-label': 'Lọc theo phòng' },
    h('option', { value: '', text: 'Tất cả phòng ban' }),
    state.depts.map(d => h('option', { value: d.code, text: `${d.code} ${d.name}` })));
  if (query.phong && ds[query.phong]) sel.value = query.phong;
  const list = h('div', {});
  const count = h('p', { class: 'num' });
  function draw() {
    const q = strip(search.value.trim()), code = sel.value;
    const rows = state.agents.filter(a => (!code || a.deptCode === code) && (!q || strip(`${a.name} ${a.title} ${a.deptName}`).includes(q)));
    count.textContent = `${rows.length} trên ${state.agents.length} nhân sự`;
    clear(list);
    if (!rows.length) return list.append(h('div', { class: 'card empty', text: 'Không có ai khớp với tìm kiếm. Hãy bỏ bớt từ khóa hoặc chọn "Tất cả phòng ban".' }));
    for (const d of state.depts) {
      const mine = rows.filter(a => a.deptCode === d.code);
      if (!mine.length) continue;
      list.append(h('section', { class: 'card group' },
        h('header', {}, h('span', { class: 'code num', style: { background: d.color }, text: d.code }), d.name, h('small', { class: 'num', text: `${mine.length} người` })),
        mine.map(a => h('button', { class: 'person', type: 'button', 'data-id': a.id, onClick: e => ctx.openAgent(a, e.currentTarget) },
          avatar(a.name, d.color),
          h('div', { class: 'who' }, h('b', {}, a.name, a.isLead && h('span', { class: 'tag', text: 'Trưởng phòng' })), h('span', { text: a.title })),
          h('span', { class: 'state ' + a.status, text: STATUS[a.status] })))));
    }
  }
  search.addEventListener('input', draw); sel.addEventListener('change', draw);
  draw();
  // Cập nhật trạng thái tại chỗ khi có tin mới, không dựng lại danh sách (giữ nguyên cuộn và tiêu điểm).
  const update = () => {
    const byId = new Map(state.agents.map(a => [String(a.id), a]));
    list.querySelectorAll('.person').forEach(btn => {
      const a = byId.get(btn.dataset.id), st = btn.querySelector('.state');
      if (a && st) { st.className = 'state ' + a.status; st.textContent = STATUS[a.status]; }
    });
  };
  const el = h('div', {},
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'kicker', text: 'Nhân sự' }), h('h1', { text: 'Đội ngũ AI' }), count)),
    h('div', { class: 'toolbar' }, search, sel), list);
  return { el, live: { update } };
}

// ---------- Các trang làm ở giai đoạn sau ----------
const SOON = {
};
export function soonPage(id) {
  const s = SOON[id];
  return h('div', {},
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'kicker', text: s.title }), h('h1', { text: s.title }))),
    h('div', { class: 'card soonpage' },
      h('span', { class: 'phase', text: `Làm ở giai đoạn ${s.phase}` }),
      h('h2', { text: `${s.title} chưa có dữ liệu` }),
      h('p', { text: s.text }),
      h('ul', {}, s.items.map(t => h('li', { text: t })))));
}
export const SOON_IDS = Object.keys(SOON);
