// Sơ đồ 2D của dây chuyền: các phòng là hộp, việc được chuyển giao bằng chấm sáng chạy dọc đường nối.
// Toàn bộ dựng bằng SVG, chữ chèn qua textContent.
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  kids.flat().forEach(c => c != null && e.append(c instanceof Node ? c : document.createTextNode(String(c))));
  return e;
};

const W = 104, H = 72, MID = 230, TOP = MID - H / 2;
const POS = {
  CEO: [12, TOP], '01': [140, TOP], '02': [268, TOP], '03': [396, TOP], '05': [524, TOP],
  '06': [652, 56], '07': [652, 148], '08': [652, 240], '09': [652, 332],
  '10': [780, TOP], '11': [908, TOP], '12': [1036, TOP],
  '04': [332, 18]
};
const EDGES = [['CEO', '01'], ['01', '02'], ['02', '03'], ['03', '05'],
  ['05', '06'], ['05', '07'], ['05', '08'], ['05', '09'],
  ['06', '10'], ['07', '10'], ['08', '10'], ['09', '10'], ['10', '11'], ['11', '12']];
const SUPPORT_EDGES = [['04', '03'], ['04', '05']];
const ARC_Y = 452;

const key = (a, b) => `${a}>${b}`;
function pathFor(from, to) {
  const A = POS[from], B = POS[to];
  if (!A || !B) return null;
  if (to === 'CEO') {                                           // giao hàng: vòng dưới đáy về chủ sở hữu
    const x1 = A[0] + W / 2, y1 = A[1] + H, x2 = B[0] + W / 2, y2 = B[1] + H;
    return `M${x1} ${y1} C${x1} ${ARC_Y} ${x2} ${ARC_Y} ${x2} ${y2}`;
  }
  if (from === '04' || to === '04') {                           // nhánh hỗ trợ: nối đáy phòng Nghiên cứu với đỉnh phòng được hỗ trợ
    const r = POS['04'], o = from === '04' ? B : A;
    const p = [r[0] + W / 2, r[1] + H], q = [o[0] + W / 2, o[1]];
    const [a, b] = from === '04' ? [p, q] : [q, p];
    const dy = (b[1] - a[1]) / 2;
    return `M${a[0]} ${a[1]} C${a[0]} ${a[1] + dy} ${b[0]} ${b[1] - dy} ${b[0]} ${b[1]}`;
  }
  const ax = A[0] + W, ay = A[1] + H / 2, bx = B[0], by = B[1] + H / 2, dx = (bx - ax) / 2;
  return `M${ax} ${ay} C${ax + dx} ${ay} ${bx - dx} ${by} ${bx} ${by}`;
}

export function mapView(ctx) {
  const { state } = ctx;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const deptBy = Object.fromEntries(state.depts.map(d => [d.code, d]));
  const svg = s('svg', { class: 'map', viewBox: '0 0 1160 480', role: 'group', 'aria-label': 'Sơ đồ dây chuyền các phòng ban' });
  const gEdges = s('g'), gNodes = s('g'), gDots = s('g');
  svg.append(gEdges, gNodes, gDots);
  const edgeEl = new Map(), nodes = new Map();

  for (const [a, b] of EDGES) { const p = s('path', { class: 'edge', d: pathFor(a, b) }); edgeEl.set(key(a, b), p); gEdges.append(p); }
  for (const [a, b] of SUPPORT_EDGES) { const p = s('path', { class: 'edge dashed', d: pathFor(a, b) }); edgeEl.set(key(a, b), p); gEdges.append(p); }
  const arc = s('path', { class: 'edge dashed', d: pathFor('12', 'CEO') });
  edgeEl.set(key('12', 'CEO'), arc); gEdges.append(arc);
  gEdges.append(s('text', { class: 'tiny', x: 570, y: ARC_Y - 6, 'text-anchor': 'middle' }, 'Giao hàng về cho CEO'));

  function addNode(code) {
    const [x, y] = POS[code];
    const d = deptBy[code];
    const isCeo = code === 'CEO';
    const total = d ? d.total : 0;
    const dots = [];
    const g = s('g', { class: 'node', tabindex: 0, role: 'link', 'data-code': code });
    const title = s('title', {}, isCeo ? 'CEO (bạn)' : d.name);
    g.append(title,
      s('text', { class: 'en', x, y: y - 6 }, isCeo ? 'Owner' : d.nameEn),
      s('rect', { class: 'box', x, y, width: W, height: H, rx: 12 }),
      s('rect', { x: x + 8, y: y + 8, width: 24, height: 16, rx: 5, fill: isCeo ? '#6d5ef0' : d.color }),
      s('text', { class: 'code', x: x + 20, y: y + 20, 'text-anchor': 'middle' }, isCeo ? '★' : code),
      s('text', { class: 'vn', x: x + 10, y: y + 42 }, isCeo ? 'CEO' : d.name));
    const cnt = s('text', { class: 'cnt', x: x + 10, y: y + 57 }, isCeo ? 'Giao việc, duyệt' : '');
    g.append(cnt);
    for (let i = 0; i < Math.min(total, 10); i++) { const c = s('circle', { class: 'dotc', cx: x + 13 + i * 8, cy: y + 65, r: 2.8 }); dots.push(c); g.append(c); }
    const go = () => ctx.go(isCeo ? '#/phong-dieu-hanh' : `#/nhan-su?phong=${code}`);
    g.addEventListener('click', go);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    gNodes.append(g);
    nodes.set(code, { g, cnt, dots, title, recent: 0 });
  }
  Object.keys(POS).forEach(addNode);

  function update() {
    const st = state.sim || { runs: [] };
    const tasks = {};
    for (const run of st.runs) for (const it of run.items) if (it.state === 'working') (tasks[it.dept] ||= []).push(`${it.title}: ${run.title} (${Math.round(it.progress * 100)}%)`);
    for (const d of state.depts) {
      const n = nodes.get(d.code); if (!n) continue;
      n.cnt.textContent = d.working ? `${d.working}/${d.total} đang làm` : `${d.total} người, rảnh`;
      n.g.classList.toggle('work', d.working > 0);
      n.dots.forEach((c, i) => c.classList.toggle('on', i < d.working));
      n.title.textContent = tasks[d.code] ? `${d.name}\n${tasks[d.code].join('\n')}` : `${d.name}: đang rảnh`;
      n.g.setAttribute('aria-label', `${d.name}, ${d.working} trên ${d.total} người đang làm`);
    }
  }

  const flash = (code, ms = 1800) => {
    const n = nodes.get(code); if (!n) return;
    n.g.classList.remove('recent'); void n.g.getBoundingClientRect(); n.g.classList.add('recent');
    clearTimeout(n.recent); n.recent = setTimeout(() => n.g.classList.remove('recent'), ms);
  };
  function handoff(ev) {
    flash(ev.to);
    const known = edgeEl.get(key(ev.from, ev.to));
    if (known) { known.classList.add('hot'); setTimeout(() => known.classList.remove('hot'), 1400); }
    if (reduced || gDots.childNodes.length > 40) return;
    const d = pathFor(ev.from, ev.to);
    if (!d) return;
    const path = s('path', { d, fill: 'none', stroke: 'none' });
    const dot = s('circle', { class: 'pulse', r: 5.5, cx: -20, cy: -20 });
    gDots.append(path, dot);
    const len = path.getTotalLength(), t0 = performance.now();
    const dur = 1100 / Math.sqrt(Math.max(1, state.sim?.speed || 1));
    const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const step = t => {
      const k = Math.min(1, (t - t0) / dur), p = path.getPointAtLength(len * ease(k));
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
      if (k < 1 && dot.isConnected) requestAnimationFrame(step); else { dot.remove(); path.remove(); }
    };
    requestAnimationFrame(step);
  }

  const legend = h('div', { class: 'maplegend' },
    h('span', {}, h('i', { class: 'lg on' }), 'Đang làm việc'),
    h('span', {}, h('i', { class: 'lg pulse' }), 'Việc đang được chuyển giao'),
    h('span', {}, h('i', { class: 'lg dash' }), 'Hỗ trợ ngoài dây chuyền'),
    h('span', { class: 'muted', text: 'Bấm vào một phòng để xem nhân sự.' }));
  const el = h('div', { class: 'mapcard' }, h('div', { class: 'mapscroll' }, svg), legend);
  update();
  return { el, update, handoff };
}