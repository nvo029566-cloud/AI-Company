import { h, clear, icon, avatar, toast, STATUS, strip, money } from './ui.js';
import { api } from './api.js';
import { mapView } from './map2d.js';
import { createOffice3D } from './office3d.js';
import { createOfficeGL, glSupported } from './office_gl.js';

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
    h('p', { class: 'hint', text: 'Đây là mô phỏng để xem công ty vận hành, chưa dùng AI thật (có từ giai đoạn 10) nên không tốn tiền.' }));

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
      h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/phong-dieu-hanh' }, 'Giao việc mới'))),
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
function officeView(ctx) {
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
  const el = h('div', { class: 'office3d' }, h('div', { class: 'ofbar' }, seg, where, shade, back), hint);
  const common = {
    depts: () => state.depts, agents: () => state.agents, sim: () => state.sim,
    stats: () => ({ agents: state.agents.length, depts: state.depts.length, laptops: state.overview.laptops }),
    brand: () => state.config.brandName,
    onDelivered: d => { api.simDelivered(d.runId, d.from, d.to).catch(() => {}); },     // hồ sơ đã tới tay người nhận: cho phép phòng kế tiếp bắt đầu làm
    onArrived: id => { api.simArrived(id).catch(() => {}); },                           // người được mượn đã ngồi vào bàn: bắt đầu tính tiến độ
    onViewer: () => { api.simViewer().catch(() => {}); },                               // cảnh 3D đang mở: máy chủ chờ hồ sơ thay vì tự thả sớm
    onPerf: kind => { toast(kind === 'scale' ? 'Máy đang chạy chậm nên đã giảm độ nét hình 3D.' : 'Máy vẫn chậm nên đã tắt bóng đổ. Bấm "Bóng" để bật lại nếu muốn.'); paintSeg(); },
    onPickAgent: ref => ref.ceo ? ctx.go('#/phong-dieu-hanh') : ctx.openAgent(ref, el),
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
    shade.hidden = true;
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
  el._office = () => office;                           // móc cho kiểm thử
  return { el, sync: () => office.sync(), handoff: ev => office.handoff(ev), destroy: () => office.destroy() };
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
  { kind: 'landing', label: 'Trang đích', text: 'Landing page giới thiệu xưởng gỗ Minh Phát, có form nhận báo giá.' }
];
export function commandPage(ctx) {
  const ta = h('textarea', { id: 'cmd-text', placeholder: 'Mô tả điều bạn muốn, bằng tiếng Việt như nhắn tin cho nhân viên.', 'aria-label': 'Nội dung yêu cầu giao cho CTO' });
  const sel = h('select', { id: 'cmd-kind', 'aria-label': 'Loại sản phẩm' },
    h('option', { value: 'web', text: 'Ứng dụng web' }), h('option', { value: 'exe', text: 'Phần mềm máy tính (.exe)' }), h('option', { value: 'landing', text: 'Trang đích' }));
  const send = h('button', { class: 'btn primary', disabled: true, title: 'Gửi việc cho CTO sẽ hoạt động ở giai đoạn 4' }, 'Gửi cho CTO');
  return h('div', { class: 'cmd' },
    h('div', { class: 'pagehead' },
      h('div', {},
        h('div', { class: 'kicker', text: 'CEO và CTO' }),
        h('h1', { text: 'Phòng điều hành' }),
        h('p', { text: 'Nói với CTO bằng lời. Kế hoạch chỉ chạy khi bạn duyệt.' }))),
    h('div', { class: 'mid' },
      h('small', { text: 'Bắt đầu một dự án' }),
      h('h2', { text: 'Mô tả thứ bạn muốn công ty làm' }),
      h('p', { text: 'CTO sẽ chia yêu cầu thành việc cho từng phòng, báo ước tính chi phí rồi chờ bạn duyệt. Chưa duyệt thì chưa tốn đồng nào.' })),
    h('div', { class: 'examples' }, EXAMPLES.map(e =>
      h('button', { class: 'example', type: 'button', onClick: () => { ta.value = e.text; sel.value = e.kind; ta.focus(); } },
        h('b', { text: e.label }), h('span', { text: e.text })))),
    h('div', { class: 'composer' }, ta,
      h('div', { class: 'bar' }, sel,
        h('span', { class: 'hint', text: 'Bạn có thể gõ thử. Nội dung chưa được gửi đi cho tới giai đoạn 4.' }), send)));
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
  'du-an': { title: 'Dự án', phase: 5, text: 'Mỗi dự án có một bảng việc riêng, từ lúc giao tới lúc đóng gói.', items: ['Dây chuyền các phòng và tiến độ n trên m việc', 'Ngân sách đã tiêu và tối đa', 'Việc đang bị chặn'] },
  'cong-viec': { title: 'Công việc', phase: 5, text: 'Toàn bộ việc của mọi dự án, lọc theo phòng, người và trạng thái.', items: ['Người nhận, phòng, hạn, trạng thái', 'Việc phụ thuộc nhau'] },
  'loi': { title: 'Lỗi', phase: 7, text: 'Kiểm thử tìm ra lỗi và trả về đúng người sửa.', items: ['Người chịu trách nhiệm được đánh dấu đỏ tới khi sửa xong', 'Lịch sử sửa lỗi'] },
  'trien-khai': { title: 'Triển khai', phase: 8, text: 'Các lần phát hành sản phẩm ra ngoài.', items: ['Bản nháp và bản chính thức', 'Chỉ phát hành chính thức khi bạn cho phép'] },
  'chi-phi-ai': { title: 'Chi phí AI', phase: 8, text: 'Theo dõi tiền AI theo dự án và theo tháng.', items: ['Ngân sách từng dự án', 'Cảnh báo khi sắp vượt'] },
  'phe-duyet': { title: 'Phê duyệt', phase: 8, text: 'Những bước quan trọng luôn chờ bạn duyệt.', items: ['Kế hoạch của CTO', 'Chi phí phát sinh', 'Phát hành chính thức'] },
  'bao-cao': { title: 'Báo cáo', phase: 8, text: 'Tổng hợp kết quả làm việc của công ty.', items: ['Theo ngày, tuần, dự án', 'Xuất ra tệp'] },
  'kien-thuc': { title: 'Kiến thức', phase: 9, text: 'Những gì công ty đã học được qua các dự án.', items: ['Tài liệu và quy tắc dùng chung', 'Tìm nhanh trong kho kiến thức'] },
  'cai-dat': { title: 'Cài đặt', phase: 9, text: 'Tùy chỉnh công ty và cách làm việc.', items: ['Tên công ty, ngân sách tháng', 'Mô hình AI cho từng phòng (giai đoạn 10)'] }
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
