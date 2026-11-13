import { h, clear, icon, avatar, STATUS, money, strip } from './ui.js';
import { api } from './api.js';

// Giai đoạn 5: trang Dự án, chi tiết dự án, Công việc và trang từng người.
// Dữ liệu luôn chèn bằng textContent (qua h). Không dùng Element.append với mảng hoặc giá trị rỗng.

const fmtTime = s => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); };
const cur = state => (state.config && state.config.currency) || 'USD';
const pct = v => Math.max(0, Math.min(100, Math.round((Number(v) || 0) * 100)));
const labelOf = t => String(t.title).split(': ')[0];

function bar(v, small) {
  const i = h('i');
  const el = h('div', { class: 'pbar' + (small ? ' sm' : ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, i);
  const set = x => { const p = pct(x); i.style.width = (p || 0) + '%'; el.setAttribute('aria-valuenow', String(p)); };
  set(v);
  return { el, set };
}
const dchip = (code, color, name) => h('span', { class: 'dchip', style: { background: color || '#667087' }, title: name || code, text: code });
const tchip = t => h('span', { class: 'tstate ' + t.state, text: t.stateLabel });
const errorCard = (err, retry) => {
  const msg = err.message || 'Có lỗi xảy ra.';
  const network = /kết nối|^Lỗi/.test(msg);          // lỗi mạng thì thử lại được; "không có dự án/người này" thì không
  return h('div', { class: 'card empty' }, icon('alert'), h('p', { text: msg }),
    network && retry ? h('button', { class: 'btn', type: 'button', onClick: retry }, 'Thử lại') : h('a', { class: 'btn', href: '#/tong-quan', text: 'Về Tổng quan' }));
};

// Khung cập nhật tại chỗ: tải dữ liệu, nếu cấu trúc đổi (sig khác) thì dựng lại, còn không chỉ cập nhật số và thanh tiến độ.
function dynamic(root, { fetch, sig, render, every = 3 }) {
  let alive = true, loading = false, again = false, tick = 0, data = null, last = null, paint = null;
  async function load() {
    if (!alive) return;
    if (loading) { again = true; return; }     // đang tải dở: tải lại ngay sau đó để không mất thao tác lọc
    loading = true;
    let err = null;
    try { data = await fetch(); } catch (e) { err = e; } finally { loading = false; }
    if (!alive) return;
    if (again) { again = false; load(); return; }
    if (err) { if (!paint) { clear(root).append(errorCard(err, load)); } return; }
    const s = sig(data);
    if (s !== last || !paint) { last = s; const r = render(data); clear(root).append(r.el); paint = r.paint || (() => {}); }
    else paint(data);
  }
  return { load, forceRedraw: () => { last = null; return load(); }, live: { update() { if (++tick % every === 0) load(); }, projects() { load(); }, destroy() { alive = false; } } };
}

// ---------- Dự án ----------
const PROJECT_TABS = [['all', 'Tất cả'], ['running', 'Đang chạy'], ['awaiting', 'Chờ duyệt'], ['done', 'Đã xong'], ['other', 'Đã dừng hoặc từ chối']];
const inTab = (p, k) => k === 'all' || (k === 'other' ? ['rejected', 'cancelled'].includes(p.status) : p.status === k);

function projectProgress(p) {
  if (p.status === 'done') return 1;
  return p.stats.tasksTotal ? p.stats.tasksDone / p.stats.tasksTotal : 0;
}
function projectProgressText(p) {
  const s = p.stats;
  if (p.status === 'awaiting') return 'Chờ bạn duyệt';
  if (p.status === 'rejected') return 'Không chạy';
  if (p.status === 'cancelled') return `Dừng khi xong ${s.tasksDone}/${s.tasksTotal} việc`;
  return `${s.tasksDone}/${s.tasksTotal} việc xong` + (p.status === 'running' && p.progress ? ` · chặng ${Math.min(p.progress.stage + 1, p.progress.total)}/${p.progress.total}` : '');
}

export function projectsPage(ctx) {
  const { state } = ctx;
  let filter = 'all', rows = [];
  const listBox = h('div', { class: 'projlist' });
  const count = h('p', { class: 'num' });
  const tabEls = PROJECT_TABS.map(([k, l]) => h('button', { class: 'ftab', type: 'button', role: 'tab', 'data-k': k, onClick: () => { filter = k; dyn.forceRedraw(); } }, l));
  const dyn = dynamic(listBox, {
    fetch: async () => { rows = await api.projects(); return rows; },
    sig: all => filter + '|' + all.map(p => `${p.id}:${p.status}:${p.stats.tasksDone}`).join(','),
    render: all => {
      tabEls.forEach(t => { const on = t.dataset.k === filter; t.setAttribute('aria-selected', String(on)); t.classList.toggle('on', on); });
      const shown = all.filter(p => inTab(p, filter));
      count.textContent = all.length ? `${shown.length} trên ${all.length} dự án` : '';
      const el = h('div', {});
      const refs = new Map();
      if (!all.length) el.append(h('div', { class: 'card empty' }, icon('spark'), h('h2', { text: 'Chưa có dự án nào' }),
        h('p', { text: 'Dự án bắt đầu từ một yêu cầu bạn gửi cho CTO. Sau khi bạn duyệt kế hoạch, dự án sẽ hiện ở đây cùng tiến độ và chi phí.' }),
        h('a', { class: 'btn primary', href: '#/phong-dieu-hanh', text: 'Giao việc cho CTO' })));
      else if (!shown.length) el.append(h('div', { class: 'card empty', text: 'Không có dự án nào ở mục này.' }));
      for (const p of shown) {
        const b = bar(projectProgress(p), true), txt = h('small', { text: projectProgressText(p) }), money1 = h('small', { class: 'num' });
        const setMoney = q => { money1.textContent = ['awaiting', 'rejected'].includes(q.status) ? `Ước tính ${money(q.estimate, cur(state))}` : `Đã dùng ${money(q.stats.spent, cur(state))} trên ${money(q.estimate, cur(state))} ước tính`; };
        setMoney(p);
        refs.set(p.id, { b, txt, setMoney });
        el.append(h('a', { class: 'proj', href: `#/du-an/${p.id}` },
          h('div', { class: 'ptop' }, h('b', { text: p.title }), h('span', { class: 'pstat ' + p.status, text: p.statusLabel })),
          h('small', { class: 'pmeta', text: `${p.kindLabel} · gửi lúc ${fmtTime(p.createdAt)}` }),
          h('div', { class: 'pprog' }, b.el, txt), money1));
      }
      return { el, paint: all2 => { for (const q of all2) { const r = refs.get(q.id); if (r) { r.b.set(projectProgress(q)); r.txt.textContent = projectProgressText(q); r.setMoney(q); } } } };
    }
  });
  const el = h('div', {},
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'kicker', text: 'Dự án' }), h('h1', { text: 'Các dự án của công ty' }), count),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/phong-dieu-hanh', text: 'Giao việc mới' }))),
    h('div', { class: 'ftabs', role: 'tablist', 'aria-label': 'Lọc dự án theo trạng thái' }, tabEls), listBox);
  dyn.load();
  return { el, live: dyn.live };
}

// ---------- Chi tiết một dự án ----------
export function projectDetailPage(ctx, id) {
  const { state } = ctx;
  const ds = Object.fromEntries(state.depts.map(d => [d.code, d]));
  const root = h('div', {});
  const overall = p => {
    const real = p.tasks.filter(t => !t.support);
    if (p.status === 'done') return 1;
    return p.stats.tasksTotal ? real.reduce((a, t) => a + t.progress, 0) / p.stats.tasksTotal : 0;
  };
  const dyn = dynamic(root, {
    every: 2,
    fetch: () => api.project(id),
    sig: p => p.status + '|' + p.tasks.map(t => `${t.id}:${t.state}:${t.agentId}:${t.wait}`).join(','),
    render: p => {
      const pl = p.plan, run = p.status !== 'awaiting' && p.status !== 'rejected';
      const big = bar(overall(p)), bigTxt = h('b', { class: 'num' }), spentBar = bar(p.estimate ? p.stats.spent / p.estimate : 0), spentTxt = h('b', { class: 'num' });
      const sub = h('small', {});
      const paintTop = q => {
        big.set(overall(q)); bigTxt.textContent = `${pct(overall(q))}%`;
        sub.textContent = `${q.stats.tasksDone}/${q.stats.tasksTotal} việc xong` + (q.status === 'running' && q.progress ? ` · chặng ${Math.min(q.progress.stage + 1, q.progress.total)}/${q.progress.total}` : '');
        spentBar.set(q.estimate ? q.stats.spent / q.estimate : 0); spentTxt.textContent = money(q.stats.spent, cur(state));
      };
      const taskRefs = new Map();
      const stages = pl.stages.map(st => {
        const items = st.tasks.map(t => ({ plan: t, item: p.tasks.find(x => x.deptCode === t.dept && !x.support) }));
        const allDone = items.every(x => x.item && x.item.state === 'done'), started = items.some(x => x.item);
        const stState = allDone ? 'Xong' : (started ? 'Đang làm' : 'Chưa tới');
        return h('section', { class: 'pstage', 'aria-label': `Chặng ${st.index}` },
          h('header', {}, h('b', { text: `Chặng ${st.index}` }), st.parallel && h('span', { class: 'tag', text: 'làm song song' }), h('small', { class: 'stst', text: stState })),
          items.map(({ plan, item }) => {
            const d = ds[plan.dept], b = bar(item ? item.progress : 0, true);
            if (item) taskRefs.set(item.id, b);
            return h('div', { class: 'ptask' },
              dchip(plan.dept, d && d.color, d && d.name),
              h('div', { class: 'tbody' },
                h('b', { text: `${d ? d.name : plan.dept}: ${labelOf(plan)}` }),
                h('small', {}, item && item.agentId ? h('a', { href: `#/nhan-su/${item.agentId}`, text: item.agentName }) : (item ? 'Chưa có người nhận' : 'Chưa tới lượt'),
                  item && item.wait && ` · ${item.wait}`, item && item.borrowed && ' · người mượn từ phòng khác'),
                item && item.state !== 'queued' && b.el),
              h('div', { class: 'tright' }, item ? tchip(item) : h('span', { class: 'tstate todo', text: 'Chưa tới' }), h('small', { class: 'num pcost', text: money(plan.cost, cur(state)) })));
          }));
      });
      const waiting = p.tasks.filter(t => t.state === 'queued' && !t.support);
      const support = p.tasks.filter(t => t.support);
      const el = h('div', { class: 'pdetail' },
        h('div', { class: 'pagehead' },
          h('div', {}, h('a', { class: 'backlink', href: '#/du-an', text: '← Tất cả dự án' }), h('div', { class: 'kicker', text: p.kindLabel }), h('h1', { text: p.title }),
            h('p', { text: [`Gửi lúc ${fmtTime(p.createdAt)}`, p.decidedAt && `${p.status === 'rejected' ? 'từ chối' : 'duyệt'} lúc ${fmtTime(p.decidedAt)}`, p.finishedAt && `kết thúc lúc ${fmtTime(p.finishedAt)}`].filter(Boolean).join(' · ') })),
          h('div', { class: 'actions' }, h('span', { class: 'pstat ' + p.status, text: p.statusLabel }),
            p.status === 'running' && h('a', { class: 'btn', href: '#/tong-quan?xem=3d', text: 'Xem trong 3D' }),
            h('a', { class: 'btn' + (p.status === 'awaiting' ? ' primary' : ''), href: `#/phong-dieu-hanh?kehoach=${p.id}`, text: p.status === 'awaiting' ? 'Xem kế hoạch và duyệt' : 'Xem kế hoạch' }))),
        run && h('div', { class: 'sumgrid' },
          h('div', { class: 'sumcard' }, h('small', { text: 'Tiến độ' }), bigTxt, big.el, sub),
          h('div', { class: 'sumcard' }, h('small', { text: 'Chi phí đã dùng (tính theo tiến độ)' }), spentTxt, spentBar.el,
            h('small', { class: 'num', text: `trên ước tính ${money(p.estimate, cur(state))}` }),
            h('small', { class: 'mute2', text: 'Chưa phải chi phí thật. Chi phí thật có từ giai đoạn 10.' }))),
        !run && h('div', { class: 'note' }, icon('spark'), h('span', { text: p.status === 'awaiting' ? 'Dự án này đang chờ bạn duyệt kế hoạch. Chưa có việc nào được giao.' : 'Bạn đã từ chối kế hoạch này nên chưa có việc nào được giao.' })),
        h('div', { class: 'reqbox' }, h('small', { text: 'Yêu cầu gốc' }), h('p', { text: p.request })),
        waiting.length > 0 && h('div', { class: 'waitbox' }, h('h3', { text: `Đang chờ (${waiting.length})` }),
          waiting.map(t => h('div', { class: 'wrow' }, dchip(t.deptCode, t.deptColor, t.deptName), h('span', { text: `${t.deptName}: ${labelOf(t)}` }), h('small', { text: t.wait || 'Chờ tới lượt' })))),
        h('div', { class: 'pstages' }, stages),
        support.length > 0 && h('div', { class: 'waitbox' }, h('h3', { text: 'Phòng Nghiên cứu hỗ trợ' }),
          support.map(t => h('div', { class: 'wrow' }, dchip(t.deptCode, t.deptColor, t.deptName), h('span', { text: `${t.agentName || 'Chưa có người'}: ${labelOf(t)}` }), tchip(t)))));
      paintTop(p);
      return { el, paint: q => { paintTop(q); for (const t of q.tasks) { const b = taskRefs.get(t.id); if (b) b.set(t.progress); } } };
    }
  });
  dyn.load();
  return { el: root, live: dyn.live };
}

// ---------- Công việc ----------
const TASK_FILTERS = [['', 'Mọi trạng thái'], ['active', 'Đang chờ và đang làm'], ['queued', 'Đang chờ'], ['working', 'Đang làm'], ['done', 'Đã xong'], ['cancelled', 'Đã dừng']];

export function tasksPage(ctx) {
  const { state, query } = ctx;
  const search = h('input', { type: 'search', placeholder: 'Tìm theo việc, người hoặc dự án', 'aria-label': 'Tìm việc' });
  const selProj = h('select', { 'aria-label': 'Lọc theo dự án' }, h('option', { value: '', text: 'Mọi dự án' }), h('option', { value: 'demo', text: 'Chạy thử (không qua duyệt)' }));
  const selDept = h('select', { 'aria-label': 'Lọc theo phòng' }, h('option', { value: '', text: 'Mọi phòng' }), state.depts.filter(d => /^\d+$/.test(d.code)).map(d => h('option', { value: d.code, text: `${d.code} ${d.name}` })));
  const selState = h('select', { 'aria-label': 'Lọc theo trạng thái' }, TASK_FILTERS.map(([v, l]) => h('option', { value: v, text: l })));
  if (query.phong && [...selDept.options].some(o => o.value === query.phong)) selDept.value = query.phong;
  if (query.tt && [...selState.options].some(o => o.value === query.tt)) selState.value = query.tt;
  const count = h('p', { class: 'num' });
  const box = h('div', {});
  async function loadProjects() {
    try {
      const ps = await api.projects();
      ps.forEach(p => selProj.append(h('option', { value: String(p.id), text: p.title })));
      if (query.duan && [...selProj.options].some(o => o.value === query.duan)) { selProj.value = query.duan; dyn.forceRedraw(); }
    } catch { /* bộ lọc dự án chỉ thiếu danh sách, các bộ lọc khác vẫn dùng được */ }
  }
  const filterKey = () => [selProj.value, selDept.value, selState.value, strip(search.value.trim())].join('|');
  const dyn = dynamic(box, {
    fetch: () => api.tasks({ project: selProj.value, dept: selDept.value, state: selState.value }),
    sig: rows => filterKey() + '#' + rows.map(t => `${t.id}:${t.state}:${t.agentId}:${t.wait}`).join(','),
    render: rows => {
      const q = strip(search.value.trim());
      const shown = rows.filter(t => !q || strip(`${t.title} ${t.agentName || ''} ${t.projectTitle || 'chay thu'} ${t.deptName}`).includes(q));
      count.textContent = `${shown.length} việc` + (rows.length >= 200 ? ' (hiện tối đa 200 việc mới nhất)' : '');
      if (!shown.length) return { el: h('div', { class: 'card empty', text: rows.length ? 'Không có việc nào khớp với tìm kiếm.' : 'Chưa có việc nào khớp bộ lọc. Việc xuất hiện khi một dự án được duyệt và bắt đầu chạy.' }) };
      const refs = new Map();
      const body = h('tbody', {}, shown.map(t => {
        const b = bar(t.progress, true); refs.set(t.id, b);
        return h('tr', {},
          h('td', { class: 'tcell-main' }, h('b', { title: t.title, text: t.demo ? t.title : labelOf(t) }), t.support && h('span', { class: 'tag', text: 'hỗ trợ' }), t.wait && h('small', { text: t.wait })),
          h('td', {}, t.demo ? h('small', { text: 'Chạy thử' }) : h('a', { href: `#/du-an/${t.projectId}`, text: t.projectTitle })),
          h('td', {}, dchip(t.deptCode, t.deptColor, t.deptName)),
          h('td', {}, t.agentId ? h('a', { href: `#/nhan-su/${t.agentId}`, text: t.agentName }) : h('small', { text: '—' })),
          h('td', { class: 'num', text: String(t.stage) }),
          h('td', {}, tchip(t)),
          h('td', { class: 'tprog' }, b.el));
      }));
      const table = h('table', { class: 'tasktable' },
        h('thead', {}, h('tr', {}, ['Việc', 'Dự án', 'Phòng', 'Người làm', 'Chặng', 'Trạng thái', 'Tiến độ'].map(x => h('th', { scope: 'col', text: x })))), body);
      return { el: h('div', { class: 'card tablewrap' }, table), paint: rows2 => { for (const t of rows2) { const b = refs.get(t.id); if (b) b.set(t.progress); } } };
    }
  });
  const redraw = () => dyn.forceRedraw();
  selProj.addEventListener('change', redraw); selDept.addEventListener('change', redraw); selState.addEventListener('change', redraw);
  search.addEventListener('input', redraw);
  const el = h('div', {},
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'kicker', text: 'Công việc' }), h('h1', { text: 'Mọi việc của công ty' }), count)),
    h('div', { class: 'toolbar' }, search, selProj, selDept, selState), box);
  loadProjects(); dyn.load();
  return { el, live: dyn.live };
}

// ---------- Trang từng người ----------
export function agentPage(ctx, id) {
  const { state } = ctx;
  const root = h('div', {});
  const dyn = dynamic(root, {
    fetch: () => api.agent(id),
    sig: a => [a.id, a.current && `${a.current.id}:${a.current.state}`, a.doneCount, a.history.map(t => `${t.id}:${t.state}`).join(',')].join('|'),
    render: a => {
      const d = state.depts.find(x => x.code === a.deptCode);
      const st = h('span', { class: 'state ' + a.status, text: STATUS[a.status] });
      let curBar = null;
      const cardCurrent = a.current
        ? (() => { curBar = bar(a.current.progress); return h('div', { class: 'sumcard' }, h('small', { text: 'Đang làm' }), h('b', { text: a.current.title }),
            h('small', {}, a.current.demo ? 'Chạy thử' : h('a', { href: `#/du-an/${a.current.projectId}`, text: a.current.projectTitle }), ` · chặng ${a.current.stage}`, a.current.wait && ` · ${a.current.wait}`), curBar.el); })()
        : h('div', { class: 'sumcard' }, h('small', { text: 'Đang làm' }), h('b', { text: a.status === 'idle' ? 'Đang rảnh' : STATUS[a.status] }), h('small', { text: 'Chưa có việc được giao lúc này.' }));
      const el = h('div', { class: 'agentpage' },
        h('div', { class: 'pagehead' },
          h('div', { class: 'agenthead' }, avatar(a.name, a.deptColor, true),
            h('div', {}, h('a', { class: 'backlink', href: `#/nhan-su?phong=${a.deptCode}`, text: `← ${a.deptCode} ${a.deptName}` }),
              h('h1', { text: a.name }), h('p', { text: a.title }))),
          h('div', { class: 'actions' }, a.isLead && h('span', { class: 'tag', text: 'Trưởng phòng' }), st)),
        h('div', { class: 'sumgrid' }, cardCurrent,
          h('div', { class: 'sumcard' }, h('small', { text: 'Việc đã hoàn thành' }), h('b', { class: 'num bigno', text: String(a.doneCount) }), h('small', { text: d ? `Phòng ${d.name}` : '' })),
          h('div', { class: 'sumcard' }, h('small', { text: 'Mô hình AI' }), h('b', { text: 'Chưa gán' }), h('small', { text: 'Chọn ở giai đoạn 10.' }))),
        h('h3', { class: 'sechead', text: 'Việc gần đây' }),
        a.history.length ? h('div', { class: 'card tablewrap' }, h('table', { class: 'tasktable' },
          h('thead', {}, h('tr', {}, ['Việc', 'Dự án', 'Chặng', 'Trạng thái', 'Kết thúc'].map(x => h('th', { scope: 'col', text: x })))),
          h('tbody', {}, a.history.map(t => h('tr', {},
            h('td', { class: 'tcell-main' }, h('b', { text: t.title })),
            h('td', {}, t.demo ? h('small', { text: 'Chạy thử' }) : h('a', { href: `#/du-an/${t.projectId}`, text: t.projectTitle })),
            h('td', { class: 'num', text: String(t.stage) }), h('td', {}, tchip(t)), h('td', { class: 'num', text: fmtTime(t.finishedAt) })))))) : h('div', { class: 'card empty', text: 'Chưa có việc nào. Khi một dự án chạy và bạn này được giao việc, lịch sử sẽ hiện ở đây.' }));
      return { el, paint: q => { if (curBar && q.current) curBar.set(q.current.progress); } };
    }
  });
  dyn.load();
  return { el: root, live: dyn.live };
}
