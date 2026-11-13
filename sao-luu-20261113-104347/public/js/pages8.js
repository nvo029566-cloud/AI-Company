import { h, clear, icon, toast, money } from './ui.js';
import { api } from './api.js';
import { bar, dchip, dynamic, fmtTime, cur } from './pages5.js';

// Giai đoạn 8: Phê duyệt, Chi phí AI, Báo cáo, Triển khai.
// Chi phí hiện là MÔ PHỎNG (đơn giá giả định), chưa phải tiền thật. Mọi nội dung người dùng đều chèn bằng textContent (qua h).

const dur = s => s == null ? '—' : s < 60 ? `${s} giây` : s < 3600 ? `${Math.round(s / 60)} phút` : `${(s / 3600).toFixed(1)} giờ`;
const signed = v => v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`;
const dayLabel = d => `${d.slice(8)}/${d.slice(5, 7)}`;

// CSV: bao dấu nháy, và chặn "tiêm công thức" (ô bắt đầu bằng = + - @ sẽ bị Excel hiểu là công thức) bằng cách thêm dấu ' phía trước.
function csvCell(v) {
  let t = v == null ? '' : String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
export const toCsv = rows => '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
function downloadCsv(name, rows) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
const kindLabel = { release: 'Phát hành', overrun: 'Chi phí vượt', plan: 'Kế hoạch' };

// ---------- Phê duyệt ----------
export function approvalsPage(ctx) {
  const { state } = ctx;
  let tab = ctx.query.tab === 'lichsu' ? 'history' : 'pending';
  const box = h('div', {});
  const count = h('p', { class: 'num' });
  const tabEls = [['pending', 'Chờ duyệt'], ['history', 'Lịch sử']].map(([k, l]) => h('button', { class: 'ftab', type: 'button', role: 'tab', 'data-k': k, onClick: () => { tab = k; dyn.forceRedraw(); } }, l));
  const link = (href, text) => h('a', { href, text });

  function gateCard(it) {
    const d = it.detail, err = h('div', { class: 'cmderr', role: 'alert', hidden: true });
    const facts = it.kind === 'overrun'
      ? [`Đã tiêu ${money(d.spent, cur(state))} trên ngân sách ${money(d.budget, cur(state))}, vượt ${money(d.spent - d.budget, cur(state))}.`,
        `Đã xong ${d.tasksDone}/${d.tasksTotal} việc. Chặng kế tiếp: ${d.next.join(', ')}.`,
        `Duyệt sẽ nâng ngân sách thêm ${money(d.raiseBy, cur(state))} và chạy tiếp. Từ chối sẽ dừng dự án (tiền đã tiêu vẫn tính).`]
      : [`Sản phẩm chuẩn bị phát hành: ${d.artifact}.`, `Đã xong ${d.tasksDone}/${d.tasksTotal} việc. Chặng còn lại: ${d.next.join(', ')}.`,
        d.bugsTotal ? `Kiểm thử tìm ra ${d.bugsTotal} lỗi, đã sửa và đóng ${d.bugsClosed}.` : 'Kiểm thử không tìm ra lỗi nào.',
        `Chi phí đã ghi nhận ${money(d.spent, cur(state))} trên ngân sách ${money(d.budget, cur(state))}.`,
        'Từ chối sẽ dừng dự án, không phát hành.'];
    const act = async (approve, btn) => {
      btn.disabled = true; err.hidden = true;
      try { await (approve ? api.approvalApprove(it.id) : api.approvalReject(it.id)); toast(approve ? 'Đã duyệt.' : 'Đã từ chối.'); ctx.refresh && ctx.refresh(); dyn.forceRedraw(); }
      catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; dyn.forceRedraw(); }
    };
    const okBtn = h('button', { class: 'btn primary', type: 'button', 'data-act': 'approve' }, it.kind === 'overrun' ? `Duyệt thêm ${money(d.raiseBy, cur(state))}` : 'Cho phép phát hành');
    okBtn.addEventListener('click', () => act(true, okBtn));
    const noBtn = h('button', { class: 'btn', type: 'button', 'data-act': 'reject' }, it.kind === 'overrun' ? 'Từ chối, dừng dự án' : 'Không phát hành');
    let armed = false, timer = null; const label = noBtn.textContent;
    noBtn.addEventListener('click', () => {
      if (!armed) { armed = true; noBtn.textContent = 'Bấm lần nữa để xác nhận'; noBtn.classList.add('danger'); timer = setTimeout(() => { armed = false; noBtn.textContent = label; noBtn.classList.remove('danger'); }, 4000); return; }
      clearTimeout(timer); act(false, noBtn);
    });
    return h('article', { class: 'acard ' + it.kind },
      h('div', { class: 'ahead' }, h('span', { class: 'akind ' + it.kind, text: it.kindLabel }), h('b', { text: it.title }), h('small', { text: fmtTime(it.createdAt) })),
      h('div', { class: 'aproj' }, 'Dự án: ', link(`#/du-an/${it.projectId}`, it.projectTitle || `#${it.projectId}`)),
      h('ul', { class: 'afacts' }, facts.map(f => h('li', { text: f }))), err, h('div', { class: 'pactions' }, okBtn, noBtn));
  }
  function planCard(it) {
    return h('article', { class: 'acard plan' },
      h('div', { class: 'ahead' }, h('span', { class: 'akind plan', text: it.kindLabel }), h('b', { text: it.title }), h('small', { text: fmtTime(it.createdAt) })),
      h('ul', { class: 'afacts' }, h('li', { text: `Ước tính chi phí ${money(it.amount, cur(state))}.` }), h('li', { text: 'Bạn xem kế hoạch chia việc theo phòng rồi duyệt ở Phòng điều hành.' })),
      h('div', { class: 'pactions' }, h('a', { class: 'btn primary', href: `#/phong-dieu-hanh?kehoach=${it.id}`, text: 'Xem kế hoạch và duyệt' })));
  }
  const dyn = dynamic(box, {
    fetch: () => api.approvals(tab),
    sig: items => tab + '|' + items.map(i => `${i.key}:${i.status}`).join(','),
    render: items => {
      tabEls.forEach(t => { const on = t.dataset.k === tab; t.setAttribute('aria-selected', String(on)); t.classList.toggle('on', on); });
      count.textContent = tab === 'pending' ? (items.length ? `${items.length} phiếu đang chờ bạn` : '') : `${items.length} phiếu gần nhất`;
      if (!items.length) return { el: h('div', { class: 'card empty' }, icon('spark'), h('p', { text: tab === 'pending' ? 'Không có gì cần bạn duyệt lúc này. Khi một dự án chuẩn bị phát hành hoặc vượt ngân sách, phiếu sẽ hiện ở đây.' : 'Chưa có phiếu nào được xử lý.' })) };
      if (tab === 'pending') return { el: h('div', { class: 'alist' }, items.map(it => it.type === 'plan' ? planCard(it) : gateCard(it))) };
      return { el: h('div', { class: 'card tablewrap' }, h('table', { class: 'tasktable' },
        h('thead', {}, h('tr', {}, ['Loại', 'Phiếu', 'Dự án', 'Quyết định', 'Lúc'].map(x => h('th', { scope: 'col', text: x })))),
        h('tbody', {}, items.map(it => h('tr', {},
          h('td', {}, h('span', { class: 'akind ' + it.kind, text: it.kindLabel })), h('td', { class: 'tcell-main' }, h('b', { text: it.title })),
          h('td', {}, link(`#/du-an/${it.projectId}`, it.projectTitle || `#${it.projectId}`)),
          h('td', {}, h('span', { class: 'dstat ' + it.status, text: it.statusLabel })), h('td', { class: 'num', text: fmtTime(it.decidedAt || it.createdAt) })))))) };
    }
  });
  const el = h('div', {}, h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'kicker', text: 'Phê duyệt' }), h('h1', { text: 'Những việc cần bạn quyết định' }), count)),
    h('div', { class: 'ftabs', role: 'tablist', 'aria-label': 'Phiếu phê duyệt' }, tabEls), box);
  dyn.load();
  return { el, live: dyn.live };
}

// ---------- Chi phí AI ----------
export function costsPage(ctx) {
  const { state } = ctx;
  const root = h('div', {});
  const dyn = dynamic(root, {
    every: 3,
    fetch: async () => { const [sum, rows] = await Promise.all([api.costSummary(), api.costs({ limit: 40 })]); return { sum, rows }; },
    sig: ({ sum }) => `${sum.entries}|${sum.month.level}|${sum.byProject.length}`,
    render: ({ sum, rows }) => {
      const m = sum.month, money1 = n => money(n, cur(state));
      const levelText = { ok: '', warn: 'Đã dùng hơn 80% ngân sách tháng. Cân nhắc trước khi giao thêm dự án lớn.', over: 'Đã vượt ngân sách tháng. Dự án mới sẽ phải xác nhận vượt ngân sách mới duyệt được.' }[m.level];
      const maxDay = Math.max(0.01, ...sum.byDay.map(d => d.amount)), maxDept = Math.max(0.01, ...sum.byDept.map(d => d.amount));
      const pbar = bar(m.budget ? Math.min(1, m.spent / m.budget) : 0);
      const exportBtn = h('button', { class: 'btn', type: 'button', onClick: async () => {
        try { const all = await api.costs({ limit: 500 }); downloadCsv(`chi-phi-ai-${stamp()}.csv`, [['Thời gian (UTC)', 'Dự án', 'Phòng', 'Người làm', 'Loại', 'Token vào', 'Token ra', 'Số tiền', 'Mô hình'], ...all.map(c => [c.createdAt, c.demo ? 'Chạy thử' : c.projectTitle, c.deptName, c.agentName || '', c.kindLabel, c.tokensIn, c.tokensOut, c.amount, c.model])]); }
        catch (e) { toast(e.message); }
      } }, 'Tải CSV chi tiết');
      const el = h('div', { class: 'costpage' },
        h('div', { class: 'note' }, icon('spark'), h('span', { text: 'Đây là chi phí mô phỏng: đơn giá giả định nhân hệ số ngẫu nhiên, chưa có số token thật. Chi phí thật có từ giai đoạn 10, khi agent AI chạy thật.' })),
        h('div', { class: 'monthcard ' + m.level },
          h('div', {}, h('small', { text: 'Chi phí tháng này' }), h('div', { class: 'big num', text: money1(m.spent) }), h('small', { class: 'num', text: `trên ngân sách ${money1(m.budget)} · còn lại ${money1(m.remaining)}` })),
          h('div', { class: 'mbar' }, pbar.el, h('b', { class: 'num', text: `${Math.round(m.pct * 100)}%` })),
          levelText && h('p', { class: 'mwarn', role: 'status', text: levelText })),
        h('div', { class: 'sumgrid' },
          h('div', { class: 'sumcard' }, h('small', { text: 'Tổng từ trước tới nay' }), h('b', { class: 'num', text: money1(sum.total) }), h('small', { text: `${sum.entries} khoản ghi nhận` })),
          h('div', { class: 'sumcard' }, h('small', { text: 'Token đã dùng (mô phỏng)' }), h('b', { class: 'num', text: `${Math.round((sum.tokens.in + sum.tokens.out) / 1000).toLocaleString('vi-VN')} nghìn` }), h('small', { class: 'num', text: `vào ${Math.round(sum.tokens.in / 1000).toLocaleString('vi-VN')} nghìn · ra ${Math.round(sum.tokens.out / 1000).toLocaleString('vi-VN')} nghìn` })),
          h('div', { class: 'sumcard' }, h('small', { text: 'Theo loại việc' }), sum.byKind.length ? sum.byKind.map(k => h('span', { class: 'kline' }, h('span', { text: k.label }), h('b', { class: 'num', text: money1(k.amount) }))) : h('b', { text: '—' }))),
        h('section', { class: 'card csec' }, h('h3', { text: 'Chi phí 14 ngày gần nhất' }),
          h('div', { class: 'daychart', role: 'img', 'aria-label': 'Biểu đồ chi phí 14 ngày gần nhất' }, sum.byDay.map(d => h('div', { class: 'daybar', title: `${d.day}: ${money1(d.amount)}` }, h('i', { style: { height: Math.max(2, d.amount / maxDay * 100) + '%' } }), h('small', { text: dayLabel(d.day) }))))),
        h('div', { class: 'cols2' },
          h('section', { class: 'card csec' }, h('h3', { text: 'Theo dự án' }),
            sum.byProject.length ? sum.byProject.map(p => { const cap = p.budget || p.estimate || 0, over = cap && p.spent > cap, b = bar(cap ? Math.min(1, p.spent / cap) : 0, true); if (over) b.el.classList.add('over');
              return h('div', { class: 'crow' }, h('div', { class: 'ctop' }, p.demo ? h('b', { text: p.title }) : h('a', { href: `#/du-an/${p.projectId}`, text: p.title }), h('span', { class: 'num', text: money1(p.spent) })),
                !p.demo && h('small', { class: 'num', text: `Ngân sách ${money1(cap)}${over ? ' · đã vượt' : ''}` }), !p.demo && b.el); }) : h('p', { class: 'mute', text: 'Chưa có chi phí nào.' })),
          h('section', { class: 'card csec' }, h('h3', { text: 'Theo phòng' }),
            sum.byDept.length ? sum.byDept.map(d => { const b = bar(d.amount / maxDept, true);
              return h('div', { class: 'crow' }, h('div', { class: 'ctop' }, h('span', { class: 'whorow' }, dchip(d.code, d.color, d.name), h('span', { text: d.name })), h('span', { class: 'num', text: money1(d.amount) })), b.el); }) : h('p', { class: 'mute', text: 'Chưa có chi phí nào.' }))),
        h('section', { class: 'card csec' }, h('div', { class: 'csechead' }, h('h3', { text: 'Khoản gần đây' }), exportBtn),
          rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'tasktable' },
            h('thead', {}, h('tr', {}, ['Lúc', 'Dự án', 'Phòng', 'Người làm', 'Loại', 'Token', 'Số tiền'].map(x => h('th', { scope: 'col', text: x })))),
            h('tbody', {}, rows.map(c => h('tr', {}, h('td', { class: 'num', text: fmtTime(c.createdAt) }), h('td', {}, c.demo ? h('small', { text: 'Chạy thử' }) : h('a', { href: `#/du-an/${c.projectId}`, text: c.projectTitle })),
              h('td', {}, dchip(c.deptCode, c.deptColor, c.deptName)), h('td', { text: c.agentName || '—' }), h('td', { text: c.kindLabel }),
              h('td', { class: 'num', text: ((c.tokensIn + c.tokensOut) / 1000).toFixed(0) + 'k' }), h('td', { class: 'num', text: money1(c.amount) })))))) : h('p', { class: 'mute', text: 'Chưa có khoản nào.' })));
      return { el };
    }
  });
  const el = h('div', {}, h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'kicker', text: 'Chi phí AI' }), h('h1', { text: 'Tiền AI của công ty' }))), root);
  dyn.load();
  return { el, live: dyn.live };
}

// ---------- Báo cáo ----------
const PERIODS = [['7', 'Bảy ngày qua'], ['30', 'Ba mươi ngày qua'], ['all', 'Từ trước tới nay']];

export function reportsPage(ctx) {
  const { state, query } = ctx;
  let mode = query.duan ? 'project' : 'company', period = '7', projectId = query.duan && /^\d+$/.test(query.duan) ? query.duan : '', last = null;
  const root = h('div', {});
  const modeEls = [['company', 'Toàn công ty'], ['project', 'Một dự án']].map(([k, l]) => h('button', { class: 'ftab', type: 'button', role: 'tab', 'data-k': k, onClick: () => { mode = k; syncBar(); dyn.forceRedraw(); } }, l));
  const selPeriod = h('select', { 'aria-label': 'Khoảng thời gian' }, PERIODS.map(([v, l]) => h('option', { value: v, text: l })));
  const selProj = h('select', { 'aria-label': 'Chọn dự án' }, h('option', { value: '', text: 'Chọn dự án…' }));
  selPeriod.addEventListener('change', () => { period = selPeriod.value; dyn.forceRedraw(); });
  selProj.addEventListener('change', () => { projectId = selProj.value; dyn.forceRedraw(); });
  const printBtn = h('button', { class: 'btn', type: 'button', onClick: () => window.print() }, 'In hoặc lưu PDF');
  const csvBtn = h('button', { class: 'btn', type: 'button', onClick: () => exportCsv() }, 'Tải CSV');
  const syncBar = () => { modeEls.forEach(t => { const on = t.dataset.k === mode; t.setAttribute('aria-selected', String(on)); t.classList.toggle('on', on); }); selPeriod.hidden = mode !== 'company'; selProj.hidden = mode !== 'project'; };
  (async () => { try { const ps = await api.projects(); ps.forEach(p => selProj.append(h('option', { value: String(p.id), text: p.title }))); if (projectId) { selProj.value = projectId; dyn.forceRedraw(); } } catch { /* chọn dự án sẽ trống */ } })();
  const money1 = n => money(n, cur(state));

  function exportCsv() {
    if (!last) return;
    if (mode === 'company') downloadCsv(`bao-cao-cong-ty-${period}-${stamp()}.csv`, [['Dự án', 'Loại', 'Trạng thái', 'Ước tính', 'Ngân sách dự án', 'Chi phí ghi nhận', 'Chênh lệch %', 'Thời gian chạy (giây)', 'Lỗi'],
      ...last.rows.map(r => [r.title, r.kindLabel, r.statusLabel, r.estimate, r.budgetCap ?? '', r.spent, r.variancePct ?? '', r.durationSecs ?? '', r.bugs])]);
    else downloadCsv(`bao-cao-du-an-${last.project.id}-${stamp()}.csv`, [['Phòng', 'Chi phí', 'Số khoản'], ...last.cost.byDept.map(d => [d.name, d.amount, d.n]), [], ['Phòng', 'Việc', 'Đã xong', 'Thời gian trung bình (giây)'], ...last.tasks.byDept.map(d => [d.name, d.total, d.done, d.avgSecs ?? ''])]);
  }
  const card = (label, value, sub) => h('div', { class: 'sumcard' }, h('small', { text: label }), h('b', { class: 'num', text: value }), sub && h('small', { text: sub }));
  const deptBars = list => { const max = Math.max(0.01, ...list.map(d => d.amount)); return list.length ? list.map(d => h('div', { class: 'crow' }, h('div', { class: 'ctop' }, h('span', { class: 'whorow' }, dchip(d.code, d.color, d.name), h('span', { text: d.name })), h('span', { class: 'num', text: money1(d.amount) })), bar(d.amount / max, true).el)) : h('p', { class: 'mute', text: 'Chưa có chi phí nào.' }); };

  function companyView(r) {
    const s = r.summary;
    return h('div', { class: 'report' },
      h('h2', { class: 'rtitle', text: `Báo cáo công ty · ${r.period.label}` }), h('p', { class: 'mute', text: `Tạo lúc ${fmtTime(r.generatedAt.replace('T', ' ').slice(0, 19))}. Chi phí là mô phỏng.` }),
      h('div', { class: 'sumgrid' },
        card('Dự án gửi lên', String(s.projects), `${s.done} xong · ${s.running} đang chạy · ${s.rejected} từ chối · ${s.cancelled} dừng`),
        card('Chi phí', money1(s.cost), s.avgCostPerDoneProject != null ? `Trung bình ${money1(s.avgCostPerDoneProject)} mỗi dự án xong` : 'Chưa có dự án xong'),
        card('Thời gian chạy trung bình', dur(s.avgDurationSecs), 'tính trên các dự án đã xong'),
        card('Lỗi do kiểm thử tìm ra', String(s.bugsFound), `${s.bugsClosed} đã đóng`),
        card('Lần triển khai', String(s.deployments), 'bản mô phỏng'), card('Việc hoàn thành', String(s.tasksDone))),
      h('section', { class: 'card csec' }, h('h3', { text: 'Chi phí theo phòng' }), deptBars(r.costByDept)),
      h('section', { class: 'card csec' }, h('h3', { text: 'Các dự án' }), r.rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'tasktable' },
        h('thead', {}, h('tr', {}, ['Dự án', 'Loại', 'Trạng thái', 'Ước tính', 'Chi phí', 'Chênh lệch', 'Thời gian', 'Lỗi'].map(x => h('th', { scope: 'col', text: x })))),
        h('tbody', {}, r.rows.map(p => h('tr', {}, h('td', { class: 'tcell-main' }, h('a', { href: `#/du-an/${p.id}`, text: p.title })), h('td', { text: p.kindLabel }), h('td', {}, h('span', { class: 'pstat ' + p.status, text: p.statusLabel })),
          h('td', { class: 'num', text: money1(p.estimate) }), h('td', { class: 'num', text: money1(p.spent) }), h('td', { class: 'num' + (p.variancePct > 0 ? ' over' : ''), text: signed(p.variancePct) }), h('td', { class: 'num', text: dur(p.durationSecs) }), h('td', { class: 'num', text: String(p.bugs) })))))) : h('p', { class: 'mute', text: 'Chưa có dự án nào trong khoảng thời gian này.' })));
  }
  function projectView(r) {
    const p = r.project, c = r.cost;
    return h('div', { class: 'report' },
      h('h2', { class: 'rtitle', text: `Báo cáo dự án · ${p.title}` }), h('p', { class: 'mute', text: `${p.kindLabel} · ${p.statusLabel} · tạo lúc ${fmtTime(r.generatedAt.replace('T', ' ').slice(0, 19))}. Chi phí là mô phỏng.` }),
      h('div', { class: 'reqbox' }, h('small', { text: 'Yêu cầu gốc' }), h('p', { text: p.request })),
      h('div', { class: 'sumgrid' },
        card('Chi phí ghi nhận', money1(c.spent), `Ước tính ${money1(c.estimate)}${c.budgetCap != null ? ` · ngân sách ${money1(c.budgetCap)}` : ''}`), card('Chênh lệch so với ước tính', signed(c.variancePct), c.variancePct > 0 ? 'tiêu nhiều hơn dự kiến' : 'trong mức dự kiến'),
        card('Việc hoàn thành', `${r.tasks.done}/${r.tasks.total}`), card('Thời gian chạy', dur(r.durationSecs)), card('Lỗi tìm ra', String(r.bugs.length), `${r.bugs.filter(b => b.status === 'closed').length} đã đóng`)),
      r.timeline.length > 0 && h('section', { class: 'card csec' }, h('h3', { text: 'Các mốc' }), h('ol', { class: 'timeline' }, r.timeline.map(t => h('li', {}, h('b', { text: t.label }), h('small', { class: 'num', text: fmtTime(t.at) }))))),
      r.deployment && h('section', { class: 'card csec' }, h('h3', { text: 'Triển khai' }), h('p', { text: `Phiên bản ${r.deployment.version} · ${r.deployment.artifact} · ${fmtTime(r.deployment.createdAt)}` })),
      r.tasks.byDept.length > 0 && h('section', { class: 'card csec' }, h('h3', { text: 'Việc theo phòng' }), h('div', { class: 'tablewrap' }, h('table', { class: 'tasktable' },
        h('thead', {}, h('tr', {}, ['Phòng', 'Việc', 'Đã xong', 'Thời gian trung bình'].map(x => h('th', { scope: 'col', text: x })))),
        h('tbody', {}, r.tasks.byDept.map(d => h('tr', {}, h('td', {}, h('span', { class: 'whorow' }, dchip(d.code, d.color, d.name), h('span', { text: d.name }))), h('td', { class: 'num', text: String(d.total) }), h('td', { class: 'num', text: String(d.done) }), h('td', { class: 'num', text: dur(d.avgSecs) }))))))),
      h('div', { class: 'cols2' }, h('section', { class: 'card csec' }, h('h3', { text: 'Chi phí theo phòng' }), deptBars(c.byDept)),
        h('section', { class: 'card csec' }, h('h3', { text: 'Chi phí theo loại' }), c.byKind.length ? c.byKind.map(k => h('div', { class: 'ctop kline' }, h('span', { text: k.label }), h('b', { class: 'num', text: money1(k.amount) }))) : h('p', { class: 'mute', text: 'Chưa có chi phí nào.' }))),
      r.bugs.length > 0 && h('section', { class: 'card csec' }, h('h3', { text: 'Lỗi' }), r.bugs.map(b => h('div', { class: 'brow' }, h('span', { class: 'sev ' + b.severity, text: b.severityLabel }), h('div', { class: 'tbody' }, h('b', { text: b.title }), h('small', { text: `Người làm ra lỗi: ${b.ownerName} (${b.ownerDeptName})` })), h('span', { class: 'bstat ' + b.status, text: b.statusLabel })))),
      r.approvals.length > 0 && h('section', { class: 'card csec' }, h('h3', { text: 'Phiếu phê duyệt' }), r.approvals.map(a => h('div', { class: 'wrow' }, h('span', { class: 'akind ' + a.kind, text: kindLabel[a.kind] }), h('span', { text: a.title }), h('small', { text: `${a.statusLabel} · ${fmtTime(a.decidedAt || a.createdAt)}` })))));
  }

  const dyn = dynamic(root, {
    every: 5,
    fetch: async () => {
      if (mode === 'company') { last = await api.reportCompany(period); return last; }
      if (!projectId) return { empty: true };
      last = await api.reportProject(projectId); return last;
    },
    sig: r => `${mode}|${period}|${projectId}|` + (r.empty ? 'empty' : JSON.stringify({ ...r, generatedAt: 0 })),
    render: r => ({ el: r.empty ? h('div', { class: 'card empty' }, icon('spark'), h('p', { text: 'Chọn một dự án ở trên để xem báo cáo của dự án đó.' })) : (mode === 'company' ? companyView(r) : projectView(r)) })
  });
  syncBar();
  const el = h('div', { class: 'reportpage' }, h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'kicker', text: 'Báo cáo' }), h('h1', { text: 'Tổng hợp kết quả làm việc' }))),
    h('div', { class: 'ftabs', role: 'tablist', 'aria-label': 'Loại báo cáo' }, modeEls),
    h('div', { class: 'toolbar reporttools' }, selPeriod, selProj, h('span', { class: 'spacer' }), csvBtn, printBtn), root);
  dyn.load();
  return { el, live: dyn.live };
}

// ---------- Triển khai ----------
export function deploymentsPage(ctx) {
  const { state } = ctx;
  const root = h('div', {});
  const dyn = dynamic(root, {
    every: 4,
    fetch: async () => { const [deps, pend] = await Promise.all([api.deployments(), api.approvals('pending')]); return { deps, gates: pend.filter(a => a.kind === 'release') }; },
    sig: ({ deps, gates }) => deps.map(d => d.id).join(',') + '|' + gates.map(g => g.id).join(','),
    render: ({ deps, gates }) => ({ el: h('div', {},
      h('div', { class: 'note' }, icon('spark'), h('span', { text: 'Đây là bản mô phỏng: chưa có sản phẩm thật nào được đưa lên. Từ giai đoạn 10, agent Vận hành sẽ đóng gói và triển khai sản phẩm thật.' })),
      gates.length > 0 && h('section', { class: 'gatebox' }, h('h3', { text: `Đang chờ bạn cho phép phát hành (${gates.length})` }),
        gates.map(g => h('div', { class: 'wrow' }, h('span', { text: g.title }), h('a', { class: 'btn primary', href: '#/phe-duyet', text: 'Xem và quyết định' })))),
      deps.length ? h('div', { class: 'deplist' }, deps.map(d => h('article', { class: 'depcard' },
        h('div', { class: 'ahead' }, h('span', { class: 'ver', text: `v${d.version}` }), h('a', { href: `#/du-an/${d.projectId}`, text: d.projectTitle }), h('span', { class: 'dstat approved', text: 'Đang chạy (mô phỏng)' })),
        h('p', { class: 'dart', text: `${d.kindLabel}: ${d.artifact}` }),
        h('ul', { class: 'afacts' },
          h('li', { text: `Triển khai lúc ${fmtTime(d.createdAt)}` }), h('li', { text: d.approvedAt ? `Bạn cho phép phát hành lúc ${fmtTime(d.approvedAt)}` : 'Không qua bước cho phép phát hành (cổng đã tắt)' }),
          h('li', { text: `Chi phí ${money(d.cost, cur(state))} · thời gian chạy ${dur(d.durationSecs)}` }), h('li', { text: d.bugsTotal ? `Lỗi: ${d.bugsTotal} tìm ra, ${d.bugsClosed} đã đóng` : 'Kiểm thử không tìm ra lỗi' })),
        h('div', { class: 'pactions' }, h('a', { class: 'btn', href: `#/bao-cao?duan=${d.projectId}`, text: 'Xem báo cáo' }), h('a', { class: 'btn', href: `#/du-an/${d.projectId}`, text: 'Mở dự án' }))))) :
        h('div', { class: 'card empty' }, icon('spark'), h('h2', { text: 'Chưa có lần triển khai nào' }), h('p', { text: 'Khi một dự án chạy xong và bạn cho phép phát hành, bản phát hành sẽ hiện ở đây.' }))) })
  });
  const el = h('div', {}, h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'kicker', text: 'Triển khai' }), h('h1', { text: 'Các lần phát hành' }))), root);
  dyn.load();
  return { el, live: dyn.live };
}
