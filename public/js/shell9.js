import { h, clear, icon, toast } from './ui.js';
import { api } from './api.js';

// Giai đoạn 9: chuông thông báo trên thanh trên và khung Trợ lý. Mọi chữ từ máy chủ đều chèn bằng textContent.

const LEVEL_LABEL = { info: 'Thông tin', ok: 'Thành công', warn: 'Cần chú ý', bad: 'Quan trọng' };
export const timeAgo = iso => {
  const t = Date.parse(String(iso).replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? 'vừa xong' : s < 3600 ? `${Math.floor(s / 60)} phút trước` : s < 86400 ? `${Math.floor(s / 3600)} giờ trước` : `${Math.floor(s / 86400)} ngày trước`;
};
export const noteRow = (n, onClick) => h('a', { class: 'noterow ' + n.level + (n.read ? '' : ' unread'), href: n.link || '#/thong-bao', 'data-id': n.id, onClick },
  h('i', { class: 'ndot', title: LEVEL_LABEL[n.level] }),
  h('div', { class: 'nbody' }, h('b', { text: n.title }), n.body && h('small', { text: n.body }), h('small', { class: 'ntime', text: `${n.kindLabel} · ${timeAgo(n.createdAt)}` })));

// ---------- chuông thông báo ----------
export function createBell({ go }) {
  let items = [], unread = 0, open = false;
  const badge = h('span', { class: 'bellbadge', hidden: true });
  const btn = h('button', { class: 'iconbtn bell', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': 'Thông báo' }, icon('bell'), badge);
  const list = h('div', { class: 'notelist' });
  const markAll = h('button', { class: 'linkbtn', type: 'button' }, 'Đánh dấu đã đọc hết');
  const panel = h('div', { class: 'notepanel', role: 'dialog', 'aria-label': 'Thông báo', hidden: true },
    h('div', { class: 'notehead' }, h('b', { text: 'Thông báo' }), markAll), list,
    h('a', { class: 'noteall', href: '#/thong-bao', text: 'Xem tất cả thông báo' }));
  const el = h('div', { class: 'bellwrap' }, btn, panel);

  function paint() {
    badge.hidden = unread === 0; badge.textContent = unread > 99 ? '99+' : String(unread);
    btn.setAttribute('aria-label', unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo');
    markAll.disabled = unread === 0;
    clear(list);
    if (!items.length) list.append(h('p', { class: 'noteempty', text: 'Chưa có thông báo nào.' }));
    for (const n of items) list.append(noteRow(n, async () => { setOpen(false); if (!n.read) { try { await api.notificationsRead({ ids: [n.id] }); } catch { /* bỏ qua */ } load(); } }));
  }
  async function load() {
    try { const r = await api.notifications({ limit: 12 }); items = r.items; unread = r.unread; paint(); document.dispatchEvent(new CustomEvent('cty:notes')); } catch { /* lần sau */ }
  }
  function setOpen(v) { open = v; panel.hidden = !v; btn.setAttribute('aria-expanded', String(v)); if (v) load(); }
  btn.addEventListener('click', () => setOpen(!open));
  markAll.addEventListener('click', async () => { try { await api.notificationsRead({ all: true }); } catch (e) { toast(e.message); } load(); });
  document.addEventListener('click', e => { if (open && !el.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', e => { if (open && e.key === 'Escape') { setOpen(false); btn.focus(); } });
  document.addEventListener('cty:read', load);
  paint();
  return {
    el, load,
    // tin mới tới từ máy chủ
    push(n) {
      items = [n, ...items.filter(x => x.id !== n.id)].slice(0, 12); unread += 1; paint();
      if (n.level === 'warn' || n.level === 'bad') toast(n.title);          // "giao xong" đã có thông báo riêng, không báo hai lần
    },
    go
  };
}

// ---------- khung Trợ lý ----------
export function createAssistantPanel() {
  let openState = false, busy = false, opener = null;
  const log = h('div', { class: 'achat', role: 'log', 'aria-live': 'polite', 'aria-label': 'Cuộc trò chuyện với trợ lý' });
  const chips = h('div', { class: 'achips' });
  const input = h('input', { type: 'text', maxlength: '300', autocomplete: 'off', placeholder: 'Hỏi về chi phí, dự án, nhân sự…', 'aria-label': 'Câu hỏi cho trợ lý' });
  const send = h('button', { class: 'btn primary', type: 'submit' }, 'Gửi');
  const closeBtn = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Đóng trợ lý' }, icon('close'));
  const form = h('form', { class: 'aform' }, input, send);
  const panel = h('section', { class: 'assistpanel', role: 'dialog', 'aria-label': 'Trợ lý', hidden: true },
    h('div', { class: 'ahead2' }, h('b', {}, icon('spark'), 'Trợ lý'), closeBtn),
    log, chips, form,
    h('p', { class: 'anote', text: 'Trả lời theo quy tắc từ dữ liệu thật của công ty, chưa phải AI. AI thật có từ giai đoạn 10.' }));

  const say = (who, text, links = []) => {
    const m = h('div', { class: 'amsg ' + who }, h('div', { class: 'abubble', text }), links.length > 0 && h('div', { class: 'alinks' }, links.map(l => h('a', { class: 'btn', href: l.href, text: l.label, onClick: () => setOpen(false) }))));
    log.append(m); log.scrollTop = log.scrollHeight;
  };
  const paintChips = list => { clear(chips); for (const s of (list || []).slice(0, 4)) chips.append(h('button', { class: 'achip', type: 'button', text: s, onClick: () => ask(s) })); };

  async function ask(q) {
    q = String(q || '').trim();
    if (!q || busy) return;
    busy = true; send.disabled = true; input.value = ''; say('me', q);
    try { const r = await api.assistant(q); say('bot', r.answer, r.links); paintChips(r.suggestions); }
    catch (e) { say('bot', e.message); }
    busy = false; send.disabled = false; input.focus();
  }
  function setOpen(v, from) {
    if (v === openState) return;
    openState = v; panel.hidden = !v;
    if (v) { opener = from || document.activeElement; if (!log.children.length) { say('bot', 'Xin chào! Tôi trả lời các câu hỏi về dữ liệu thật của công ty. Bạn thử hỏi một câu bên dưới nhé.'); api.assistant('giúp').then(r => paintChips(r.suggestions)).catch(() => {}); } input.focus(); }
    else opener?.focus?.();
  }
  form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });
  closeBtn.addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } });
  return { el: panel, open: (q, from) => { setOpen(true, from); if (q) ask(q); }, close: () => setOpen(false), get isOpen() { return openState; } };
}
