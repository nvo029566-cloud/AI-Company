import { h, clear, icon, toast } from './ui.js';
import { api } from './api.js';
import { noteRow, timeAgo } from './shell9.js';
import { aiSettingsCard, backupCard } from './pages10.js';

// Giai đoạn 9: Kiến thức, Cài đặt, Thông báo. Mọi chữ từ máy chủ đều chèn bằng textContent (qua h), không bao giờ innerHTML.

const KINDS = [['rule', 'Quy tắc'], ['note', 'Ghi chú'], ['lesson', 'Bài học']];
const SOURCE_LABEL = { seed: 'Có sẵn', auto: 'Tự động' };
const errBox = () => h('div', { class: 'cmderr', role: 'alert', hidden: true });
const showErr = (box, msg) => { box.textContent = msg; box.hidden = !msg; };
// Nút xoá hai bước: bấm lần đầu đổi chữ, bấm lần hai trong 4 giây mới làm thật.
function twoStep(label, armedLabel, action, cls = 'btn') {
  const b = h('button', { class: cls, type: 'button' }, label);
  let armed = false, t = null;
  b.addEventListener('click', () => {
    if (!armed) { armed = true; b.textContent = armedLabel; b.classList.add('danger'); t = setTimeout(() => { armed = false; b.textContent = label; b.classList.remove('danger'); }, 4000); return; }
    clearTimeout(t); armed = false; action(b);
  });
  return b;
}

// ---------- Kiến thức ----------
export function knowledgePage(ctx) {
  let q = ctx.query.q || '', kind = '', tag = '', editing = null, items = [], tags = [], token = 0, timer = null;
  const list = h('div', { class: 'klist' }), tagsBox = h('div', { class: 'ktags', role: 'group', 'aria-label': 'Lọc theo nhãn' }), top = errBox();
  const search = h('input', { type: 'search', value: q, placeholder: 'Tìm trong kiến thức…', 'aria-label': 'Tìm trong kiến thức' });
  const kindSel = h('select', { 'aria-label': 'Lọc theo loại' }, h('option', { value: '', text: 'Tất cả loại' }), KINDS.map(([v, l]) => h('option', { value: v, text: l })));
  const addBtn = h('button', { class: 'btn primary', type: 'button', onClick: () => { editing = 'new'; paint(); list.querySelector('input')?.focus(); } }, 'Thêm mục mới');
  const count = h('p', { class: 'num' });

  async function load() {
    const my = ++token;
    try {
      const [rows, tg] = await Promise.all([api.knowledge({ q, kind, tag, limit: 100 }), api.knowledgeTags()]);
      if (my !== token) return;
      items = rows; tags = tg; showErr(top, ''); paint();
    } catch (e) { if (my === token) showErr(top, e.message); }
  }
  function paint() {
    count.textContent = items.length ? `${items.length} mục` : '';
    clear(tagsBox);
    for (const t of tags.slice(0, 14)) tagsBox.append(h('button', { class: 'ktag' + (tag === t.tag ? ' on' : ''), type: 'button', 'aria-pressed': String(tag === t.tag), onClick: () => { tag = tag === t.tag ? '' : t.tag; load(); } }, `${t.tag} · ${t.n}`));
    clear(list);
    if (editing === 'new') list.append(form(null));
    if (!items.length && editing !== 'new') list.append(h('div', { class: 'card empty' }, icon('spark'), h('p', { text: q || kind || tag ? 'Không có mục nào khớp bộ lọc.' : 'Chưa có mục kiến thức nào. Bạn thêm quy tắc hoặc ghi chú đầu tiên nhé.' })));
    for (const it of items) list.append(it.id === editing ? form(it) : card(it));
  }
  async function update(id, body, btn) {
    if (btn) btn.disabled = true;
    try { await api.knowledgeUpdate(id, body); await load(); } catch (e) { toast(e.message); if (btn) btn.disabled = false; }
  }
  function card(it) {
    const long = it.body.length > 320 || it.body.split('\n').length > 6;
    const body = h('div', { class: 'kbody' + (long ? ' clamp' : ''), text: it.body });
    const more = long && h('button', { class: 'linkbtn', type: 'button', 'aria-expanded': 'false', onClick: e => { const open = body.classList.toggle('clamp') === false; e.target.textContent = open ? 'Thu gọn' : 'Xem thêm'; e.target.setAttribute('aria-expanded', String(open)); } }, 'Xem thêm');
    return h('article', { class: 'kcard ' + it.kind },
      h('div', { class: 'khead' },
        h('span', { class: 'kkind ' + it.kind, text: it.kindLabel }), h('b', { text: it.title }),
        SOURCE_LABEL[it.source] && h('span', { class: 'ksrc', text: SOURCE_LABEL[it.source] }),
        h('button', { class: 'pinbtn' + (it.pinned ? ' on' : ''), type: 'button', 'aria-pressed': String(it.pinned), title: it.pinned ? 'Bỏ ghim' : 'Ghim lên đầu', 'aria-label': it.pinned ? `Bỏ ghim: ${it.title}` : `Ghim: ${it.title}`, onClick: e => update(it.id, { pinned: !it.pinned }, e.currentTarget) }, '★')),
      it.body && body, more,
      it.tags.length > 0 && h('div', { class: 'chips' }, it.tags.map(t => h('button', { class: 'chip ktagchip', type: 'button', onClick: () => { tag = t; load(); } }, t))),
      h('div', { class: 'kfoot' },
        it.projectId && h('a', { href: `#/du-an/${it.projectId}`, text: `Từ dự án: ${it.projectTitle || '#' + it.projectId}` }),
        h('small', { class: 'num', text: `Cập nhật ${timeAgo(it.updatedAt)}` }),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', onClick: () => { editing = it.id; paint(); } }, 'Sửa'),
        twoStep('Xoá', 'Bấm lần nữa để xoá', async b => { b.disabled = true; try { await api.knowledgeDelete(it.id); await load(); } catch (e) { toast(e.message); b.disabled = false; } })));
  }
  function form(it) {
    const err = errBox();
    const title = h('input', { type: 'text', maxlength: '120', value: it ? it.title : '', 'aria-label': 'Tiêu đề', placeholder: 'Tiêu đề ngắn gọn' });
    const kindF = h('select', { 'aria-label': 'Loại' }, KINDS.map(([v, l]) => h('option', { value: v, text: l, selected: (it ? it.kind : 'note') === v })));
    const bodyF = h('textarea', { rows: '6', maxlength: '4000', 'aria-label': 'Nội dung', placeholder: 'Nội dung chi tiết (không bắt buộc)' }); bodyF.value = it ? it.body : '';
    const counter = h('small', { class: 'num', text: `${bodyF.value.length}/4000` });
    bodyF.addEventListener('input', () => { counter.textContent = `${bodyF.value.length}/4000`; });
    const tagsF = h('input', { type: 'text', value: it ? it.tags.join(', ') : '', 'aria-label': 'Nhãn', placeholder: 'Nhãn, cách nhau bằng dấu phẩy (tối đa 8)' });
    const pin = h('input', { type: 'checkbox', checked: it ? it.pinned : false });
    const save = h('button', { class: 'btn primary', type: 'submit' }, it ? 'Lưu thay đổi' : 'Thêm');
    const f = h('form', { class: 'kcard kform' },
      h('label', {}, h('span', { text: 'Tiêu đề' }), title), h('label', {}, h('span', { text: 'Loại' }), kindF),
      h('label', {}, h('span', { text: 'Nội dung' }), bodyF, counter), h('label', {}, h('span', { text: 'Nhãn' }), tagsF),
      h('label', { class: 'check' }, pin, h('span', { text: 'Ghim lên đầu danh sách' })), err,
      h('div', { class: 'pactions' }, save, h('button', { class: 'btn', type: 'button', onClick: () => { editing = null; paint(); } }, 'Huỷ')));
    f.addEventListener('submit', async e => {
      e.preventDefault(); showErr(err, ''); save.disabled = true;
      const body = { kind: kindF.value, title: title.value, body: bodyF.value, tags: tagsF.value.split(',').map(s => s.trim()).filter(Boolean), pinned: pin.checked };
      try { if (it) await api.knowledgeUpdate(it.id, body); else await api.knowledgeCreate(body); editing = null; await load(); toast(it ? 'Đã lưu.' : 'Đã thêm.'); }
      catch (e2) { showErr(err, e2.message); save.disabled = false; }
    });
    return f;
  }
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value.trim(); load(); }, 250); });
  kindSel.addEventListener('change', () => { kind = kindSel.value; load(); });
  const el = h('div', {},
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'kicker', text: 'Kiến thức' }), h('h1', { text: 'Những gì công ty đã học được' }), count), addBtn),
    h('div', { class: 'note' }, icon('spark'), h('span', { text: 'Quy tắc dùng chung, ghi chú của bạn và bài học tự sinh ra mỗi khi một dự án xong. Từ giai đoạn 10, các quy tắc sẽ được đưa vào chỉ dẫn của agent.' })),
    h('div', { class: 'toolbar' }, search, kindSel), tagsBox, top, list);
  load();
  return { el, live: { projects() { if (!editing) load(); }, destroy() { token++; clearTimeout(timer); } } };
}

// ---------- Cài đặt ----------
export function settingsPage(ctx) {
  const root = h('div', {}), err = errBox();
  let cur = null;
  async function load() {
    try { cur = await api.settings(); render(); } catch (e) { clear(root).append(h('div', { class: 'card empty' }, icon('alert'), h('p', { text: e.message }))); }
  }
  function render() {
    const brand = h('input', { type: 'text', maxlength: '60', value: cur.brandName, 'aria-label': 'Tên công ty' });
    const tagline = h('input', { type: 'text', maxlength: '120', value: cur.tagline, 'aria-label': 'Khẩu hiệu' });
    const budget = h('input', { type: 'number', min: '1', max: '1000000', step: '0.01', value: String(cur.monthlyBudget), 'aria-label': 'Ngân sách tháng' });
    const bug = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(cur.bugRatePct), 'aria-label': 'Tỷ lệ lỗi' });
    const bugOut = h('output', { class: 'num', text: `${cur.bugRatePct}%` });
    bug.addEventListener('input', () => { bugOut.textContent = `${bug.value}%`; });
    const gates = h('input', { type: 'checkbox', checked: cur.gates });
    const notif = Object.fromEntries(Object.keys(cur.notify).map(k => [k, h('input', { type: 'checkbox', checked: cur.notify[k] })]));
    const save = h('button', { class: 'btn primary', type: 'submit' }, 'Lưu cài đặt');
    const form = h('form', { class: 'settings', novalidate: true },        // thông báo lỗi tiếng Việt của máy chủ, không dùng bong bóng gốc của trình duyệt
      h('section', { class: 'card ssec' }, h('h3', { text: 'Công ty' }),
        h('label', {}, h('span', { text: 'Tên công ty' }), brand), h('label', {}, h('span', { text: 'Khẩu hiệu' }), tagline)),
      h('section', { class: 'card ssec' }, h('h3', { text: 'Ngân sách' }),
        h('label', {}, h('span', { text: `Ngân sách tháng (${cur.currency})` }), budget),
        h('p', { class: 'mute', text: 'Dùng hơn 80% thì có cảnh báo vàng, từ 100% thì cảnh báo đỏ. Kế hoạch lớn hơn phần còn lại phải xác nhận mới duyệt được.' })),
      h('section', { class: 'card ssec' }, h('h3', { text: 'Cách vận hành' }),
        h('label', { class: 'check' }, gates, h('span', { text: 'Dừng chờ tôi duyệt trước khi phát hành và khi chi phí vượt ngân sách dự án' })),
        h('label', {}, h('span', {}, 'Tỷ lệ kiểm thử tìm ra lỗi ', bugOut), bug),
        h('p', { class: 'mute', text: 'Chỉ áp dụng cho các dự án bắt đầu từ bây giờ. Đặt 0% để không bao giờ có lỗi mô phỏng.' })),
      h('section', { class: 'card ssec' }, h('h3', { text: 'Thông báo' }),
        Object.keys(cur.notify).map(k => h('label', { class: 'check' }, notif[k], h('span', { text: cur.notifyLabels[k] })))),
      err, h('div', { class: 'pactions' }, save, twoStep('Khôi phục mặc định (kể cả AI: sẽ tắt)', 'Bấm lần nữa để khôi phục', async b => { b.disabled = true; try { cur = await api.settingsReset(); apply(cur); toast('Đã khôi phục cài đặt mặc định.'); render(); } catch (e) { showErr(err, e.message); b.disabled = false; } })));
    form.addEventListener('submit', async e => {
      e.preventDefault(); showErr(err, '');
      const n = Number(budget.value);
      if (budget.value.trim() === '' || !Number.isFinite(n)) return showErr(err, 'Ngân sách tháng phải là một con số.');
      const body = {};
      if (brand.value !== cur.brandName) body.brandName = brand.value;
      if (tagline.value !== cur.tagline) body.tagline = tagline.value;
      if (n !== cur.monthlyBudget) body.monthlyBudget = n;
      if (Number(bug.value) !== cur.bugRatePct) body.bugRatePct = Number(bug.value);
      if (gates.checked !== cur.gates) body.gates = gates.checked;
      const nf = {}; for (const k of Object.keys(notif)) if (notif[k].checked !== cur.notify[k]) nf[k] = notif[k].checked;
      if (Object.keys(nf).length) body.notify = nf;
      if (!Object.keys(body).length) return toast('Chưa có gì thay đổi.');
      save.disabled = true;
      try { cur = await api.settingsSave(body); apply(cur); toast('Đã lưu cài đặt.'); render(); }
      catch (e2) { showErr(err, e2.message); save.disabled = false; }
    });
    clear(root).append(form);
  }
  const apply = s => ctx.applyConfig && ctx.applyConfig({ brandName: s.brandName, tagline: s.tagline, monthlyBudget: s.monthlyBudget });
  const aiCard = aiSettingsCard(ctx), bkCard = backupCard();
  const el = h('div', {}, h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'kicker', text: 'Cài đặt' }), h('h1', { text: 'Tùy chỉnh công ty' }), h('p', { class: 'mute', text: 'Lưu trong cơ sở dữ liệu và áp dụng ngay, không cần khởi động lại.' }))), root,
    h('div', { class: 'settings extra' }, aiCard.el, bkCard.el, h('a', { class: 'btn', href: '#/huong-dan', text: 'Mở hướng dẫn sử dụng' })));
  load();
  return { el, live: { ai: aiCard.live.ai, destroy: aiCard.live.destroy } };
}

// ---------- Thông báo ----------
export function notificationsPage() {
  let tab = 'all', token = 0;
  const box = h('div', {}), count = h('p', { class: 'num' });
  const tabs = [['all', 'Tất cả'], ['unread', 'Chưa đọc']].map(([k, l]) => h('button', { class: 'ftab', type: 'button', role: 'tab', onClick: () => { tab = k; load(); } }, l));
  const markAll = h('button', { class: 'btn', type: 'button' }, 'Đánh dấu đã đọc hết');
  async function load() {
    const my = ++token;
    try {
      const r = await api.notifications({ limit: 100, unread: tab === 'unread' ? '1' : '' });
      if (my !== token) return;
      tabs.forEach((t, i) => { const on = (i === 0) === (tab === 'all'); t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
      count.textContent = r.unread ? `${r.unread} chưa đọc` : 'Đã đọc hết'; markAll.disabled = r.unread === 0;
      clear(box);
      if (!r.items.length) box.append(h('div', { class: 'card empty' }, icon('spark'), h('p', { text: tab === 'unread' ? 'Không có thông báo nào chưa đọc.' : 'Chưa có thông báo nào. Khi có việc cần duyệt, lỗi mới hoặc dự án xong, thông báo sẽ hiện ở đây.' })));
      else box.append(h('div', { class: 'card notefull' }, r.items.map(n => noteRow(n, async () => { if (!n.read) { try { await api.notificationsRead({ ids: [n.id] }); document.dispatchEvent(new CustomEvent('cty:read')); } catch { /* bỏ qua */ } } }))));
    } catch (e) { if (my === token) clear(box).append(h('div', { class: 'cmderr', role: 'alert', text: e.message })); }
  }
  markAll.addEventListener('click', async () => { try { await api.notificationsRead({ all: true }); document.dispatchEvent(new CustomEvent('cty:read')); } catch (e) { toast(e.message); } load(); });
  const el = h('div', {}, h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'kicker', text: 'Thông báo' }), h('h1', { text: 'Thông báo của bạn' }), count), markAll),
    h('div', { class: 'ftabs', role: 'tablist', 'aria-label': 'Lọc thông báo' }, tabs), box);
  load();
  return { el, live: { notification() { load(); }, destroy() { token++; } } };
}
