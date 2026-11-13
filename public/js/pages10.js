import { h, clear, icon, toast, money } from './ui.js';
import { api } from './api.js';
import { GUIDE } from './guide-data.js';

// Giai đoạn 10 và 11: cài đặt AI thật, sao lưu, khối "Sản phẩm AI đã tạo" của dự án, trang Hướng dẫn.
// Mọi chữ từ máy chủ hoặc từ AI đều chèn bằng textContent (qua h), không bao giờ innerHTML. Khoá API không bao giờ được vẽ lại sau khi lưu.

// Element.append in ra chữ "false" hoặc "null" nếu gặp giá trị rỗng, nên mọi chỗ vẽ lại đều đi qua fill().
const fill = (el, ...kids) => { clear(el); for (const k of kids.flat()) if (k) el.append(k); return el; };
const errBox = () => h('div', { class: 'cmderr', role: 'alert', hidden: true });
const showErr = (box, msg) => { box.textContent = msg; box.hidden = !msg; };
const fmtBytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const localTime = iso => { const t = Date.parse(String(iso).includes('T') ? iso : String(iso).replace(' ', 'T') + 'Z'); return Number.isFinite(t) ? new Date(t).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : String(iso); };
const num = n => Number(n || 0).toLocaleString('vi-VN');
function twoStep(label, armed, action, cls = 'btn') {
  const b = h('button', { class: cls, type: 'button' }, label);
  let on = false, t = null;
  b.addEventListener('click', () => {
    if (!on) { on = true; b.textContent = armed; b.classList.add('danger'); t = setTimeout(() => { on = false; b.textContent = label; b.classList.remove('danger'); }, 4000); return; }
    clearTimeout(t); on = false; action(b);
  });
  return b;
}
const field = (label, ...kids) => h('label', {}, h('span', { text: label }), ...kids);
const DEPTS = [['01', 'Điều hành'], ['02', 'Sản phẩm'], ['03', 'Phân tích'], ['05', 'Thiết kế'], ['06', 'Giao diện'], ['07', 'Máy chủ'], ['08', 'Di động'], ['09', 'Web'], ['10', 'Kiểm thử'], ['11', 'An ninh'], ['12', 'Vận hành']];

// ---------- cài đặt AI thật ----------
export function aiSettingsCard(ctx) {
  const root = h('section', { class: 'card ssec aicard' });
  const statusBox = h('div', { class: 'aistatus', 'aria-live': 'polite' }), keyBox = h('div', { class: 'aikey' }), formBox = h('div', {});
  let st = null, cfg = null, changingKey = false, testMsg = null, timer = null;
  const cur = () => (cfg && cfg.currency) || 'USD';

  async function loadAll() {
    try { [st, cfg] = await Promise.all([api.aiStatus(), api.settings()]); paintStatus(); paintKey(); paintForm(); }
    catch (e) { clear(root).append(h('div', { class: 'cmderr', role: 'alert', text: e.message })); }
  }
  async function loadStatus() { try { st = await api.aiStatus(); paintStatus(); } catch { /* lần sau */ } }
  function paintStatus() {
    if (!st) return;
    fill(statusBox, 
      h('p', { class: 'ailine' }, h('i', { class: 'sdot ' + (st.active ? 'on' : 'off') }), h('b', { text: st.active ? `AI thật đang bật (${st.providers[st.provider].label})` : st.enabled ? 'AI đang bật nhưng chưa có khoá' : 'AI thật đang tắt, mọi việc chạy mô phỏng' })),
      h('p', { class: 'mute', text: `Hôm nay: ${num(st.today.calls)} lời gọi (tối đa ${num(st.dailyCalls)}), ${num(st.today.tokensIn + st.today.tokensOut)} token, chi phí ${money(st.today.cost, cur())}${st.tier === 'free' ? ' (bậc miễn phí)' : ''}.` }),
      st.queue.queued > 0 && h('p', { class: 'aiwarn', role: 'status', text: `Đang chờ hạn mức: ${st.queue.queued} lời gọi trong hàng đợi (tối đa ${st.rpm} lời gọi mỗi phút).` }),
      st.lastError && h('p', { class: 'aierr', text: `Lỗi gần nhất (${localTime(st.lastError.at)}): ${st.lastError.message}` }));
  }
  // Mỗi nhà cung cấp một khối khoá riêng: chưa có thì ô dán khoá, có rồi thì thử, đổi, xoá.
  const changing = new Set(), tests = new Map(), testModel = new Map();
  function providerRow(id, pv) {
    const isDef = st.provider === id, box = h('div', { class: 'provrow' });
    const head = h('h4', {}, pv.label, isDef && h('span', { class: 'defchip', text: 'mặc định' }));
    if (!pv.hasKey || changing.has(id)) {
      const input = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', 'aria-label': `Khoá API ${pv.label}`, placeholder: 'Dán khoá API vào đây', maxlength: '256' });
      const err = errBox(), save = h('button', { class: 'btn primary', type: 'button' }, 'Lưu khoá');
      save.addEventListener('click', async () => {
        showErr(err, ''); save.disabled = true;
        try { await api.aiKeySave(input.value, id); input.value = ''; changing.delete(id); tests.delete(id); toast(`Đã lưu khoá ${pv.label}.`); await loadAll(); }
        catch (e) { showErr(err, e.message); save.disabled = false; }
      });
      return fill(box, head, input, err, h('div', { class: 'pactions' }, save, changing.has(id) && h('button', { class: 'btn', type: 'button', onClick: () => { changing.delete(id); paintKey(); } }, 'Huỷ')),
        h('p', { class: 'mute' }, pv.freeTier ? 'Có bậc miễn phí (giới hạn tốc độ). ' : 'Luôn tính tiền theo mức dùng. ', 'Tạo khoá ở ', h('a', { href: pv.keyUrl, target: '_blank', rel: 'noopener noreferrer', text: pv.keyUrl.replace('https://', '') }), '. Giữ bí mật như mật khẩu.'));
    }
    const t = tests.get(id), out = h('p', { class: t && !t.ok ? 'aierr' : 'mute', role: 'status', text: t ? t.text : '' });
    const mInput = !isDef && h('input', { type: 'text', 'aria-label': `Mô hình dùng để thử khoá ${pv.label}`, placeholder: 'Mô hình để thử, ví dụ: tên-mô-hình', maxlength: '60', value: testModel.get(id) || '' });
    if (mInput) mInput.addEventListener('input', () => testModel.set(id, mInput.value));
    const testBtn = h('button', { class: 'btn', type: 'button' }, 'Thử khoá');
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true; out.className = 'mute'; out.textContent = 'Đang thử…';
      try { const r = await api.aiTest(id, isDef ? undefined : (mInput.value.trim() || undefined)); tests.set(id, { ok: true, text: `Kết nối tốt: mô hình ${r.model} trả lời sau ${r.ms} ms (${r.tokensIn + r.tokensOut} token).` }); }
      catch (e) { tests.set(id, { ok: false, text: e.message }); }
      paintKey(); loadStatus();
    });
    return fill(box, head,
      h('p', { class: 'ailine' }, h('i', { class: 'sdot on' }), h('b', { text: `Đã có khoá (…${pv.keyLast4}, ${pv.keySource === 'env' ? 'từ biến môi trường' : 'lưu trong data/ai-key.json'})` })),
      mInput, h('div', { class: 'pactions' }, testBtn, h('button', { class: 'btn', type: 'button', onClick: () => { changing.add(id); paintKey(); } }, 'Đổi khoá'),
        pv.keySource === 'file' && twoStep('Xoá khoá', isDef ? 'Bấm lần nữa: AI sẽ tắt' : 'Bấm lần nữa để xoá', async b => { b.disabled = true; try { await api.aiKeyDelete(id); tests.delete(id); toast('Đã xoá khoá.'); await loadAll(); ctx.refresh?.(); } catch (e) { toast(e.message); b.disabled = false; } })), out);
  }
  function paintKey() {
    if (!st) return;
    fill(keyBox, ...Object.entries(st.providers).map(([id, pv]) => providerRow(id, pv)));
  }
  function paintForm() {
    if (!cfg || !st) return clear(formBox);
    const err = errBox();
    const enabled = h('input', { type: 'checkbox', checked: cfg.aiEnabled, disabled: !st.hasKey && !cfg.aiEnabled });
    const provSel = h('select', { 'aria-label': 'Nhà cung cấp mặc định' }, Object.entries(st.providers).map(([id, pv]) => h('option', { value: id, selected: id === cfg.aiProvider, text: pv.label + (pv.hasKey ? '' : ' (chưa có khoá)') })));
    const bugRounds = h('input', { type: 'number', min: '1', max: '5', step: '1', value: String(cfg.aiBugRounds), 'aria-label': 'Số vòng sửa lỗi tối đa' });
    const deep = h('input', { type: 'checkbox', checked: cfg.aiDeepQa });
    const think = h('select', { 'aria-label': 'Mức suy nghĩ của Gemini' }, [['auto', 'Tự động (mô hình tự chọn, có thể chậm)'], ['low', 'Thấp (nhanh, nên dùng)'], ['medium', 'Vừa'], ['high', 'Cao (chậm, tốn token)']].map(([v, t]) => h('option', { value: v, selected: v === cfg.aiThinking, text: t })));
    const tierFree = h('input', { type: 'radio', name: 'aitier', value: 'free', checked: cfg.aiTier === 'free' }), tierPaid = h('input', { type: 'radio', name: 'aitier', value: 'paid', checked: cfg.aiTier === 'paid' });
    const model = h('input', { type: 'text', list: 'ai-models', value: cfg.aiModel, maxlength: '60', 'aria-label': 'Mô hình mặc định' });
    const dl = h('datalist', { id: 'ai-models' }, Object.keys(cfg.aiPrices).map(m => h('option', { value: m })));
    const rpm = h('input', { type: 'number', min: '1', max: '600', step: '1', value: String(cfg.aiRpm), 'aria-label': 'Lời gọi mỗi phút' });
    const daily = h('input', { type: 'number', min: '1', max: '5000', step: '1', value: String(cfg.aiDailyCalls), 'aria-label': 'Lời gọi mỗi ngày' });
    const maxTok = h('input', { type: 'number', min: '256', max: '65536', step: '1', value: String(cfg.aiMaxTokens), 'aria-label': 'Token tối đa mỗi câu trả lời' });
    const deptInputs = Object.fromEntries(DEPTS.map(([c]) => [c, h('input', { type: 'text', list: 'ai-models', value: cfg.aiDeptModels[c] || '', maxlength: '60', placeholder: 'mặc định (hoặc nhà:tên)', 'aria-label': `Mô hình phòng ${c}` })]));
    const priceRows = h('div', { class: 'pricerows' });
    const rows = Object.entries(cfg.aiPrices).map(([m, p]) => ({ m, i: String(p.in), o: String(p.out) }));
    const drawPrices = () => {
      clear(priceRows).append(h('div', { class: 'prow head' }, h('span', { text: 'Mô hình' }), h('span', { text: 'Vào (USD/triệu token)' }), h('span', { text: 'Ra (USD/triệu token)' }), h('span')));
      rows.forEach((r, k) => {
        const a = h('input', { type: 'text', value: r.m, maxlength: '60', 'aria-label': 'Tên mô hình' }), b = h('input', { type: 'number', min: '0', step: 'any', value: r.i, 'aria-label': 'Đơn giá vào' }), c = h('input', { type: 'number', min: '0', step: 'any', value: r.o, 'aria-label': 'Đơn giá ra' });
        a.addEventListener('input', () => { r.m = a.value; }); b.addEventListener('input', () => { r.i = b.value; }); c.addEventListener('input', () => { r.o = c.value; });
        priceRows.append(h('div', { class: 'prow' }, a, b, c, h('button', { class: 'linkbtn', type: 'button', 'aria-label': `Bỏ dòng ${r.m}`, onClick: () => { rows.splice(k, 1); drawPrices(); } }, 'Bỏ')));
      });
    };
    drawPrices();
    const tierNote = h('p', { class: 'mute' });
    const syncTier = () => { tierNote.textContent = provSel.value !== 'gemini' ? 'Bậc này chỉ áp dụng cho Gemini. OpenAI và Anthropic luôn tính tiền theo bảng đơn giá (không có đơn giá thì không chạy được), và ngân sách tháng là trần cứng.' : tierPaid.checked ? 'Trả tiền: chi phí tính theo đơn giá bên dưới. Ngân sách tháng là trần cứng, chạm là AI tự dừng. Hãy tự kiểm tra đơn giá trên trang giá của Google.' : 'Miễn phí: không mất tiền nhưng bị giới hạn tốc độ, và nội dung gửi lên có thể được Google dùng để cải thiện sản phẩm. Đừng đưa dữ liệu mật vào.'; };
    tierFree.addEventListener('change', syncTier); tierPaid.addEventListener('change', syncTier); provSel.addEventListener('change', syncTier); syncTier();
    const save = h('button', { class: 'btn primary', type: 'submit' }, 'Lưu cài đặt AI');
    const kill = twoStep('Tắt khẩn cấp', 'Bấm lần nữa để tắt ngay', async b => { b.disabled = true; try { await api.aiKill(); toast('Đã tắt khẩn cấp: mọi lời gọi bị huỷ, các dự án AI đã dừng.'); await loadAll(); ctx.refresh?.(); } catch (e) { toast(e.message); b.disabled = false; } }, 'btn danger');
    const form = h('form', { class: 'aiform', novalidate: true },
      h('label', { class: 'check' }, enabled, h('span', { text: 'Bật AI thật cho các dự án mới' })),
      !st.hasKey && h('p', { class: 'mute', text: 'Cần lưu khoá API của nhà cung cấp mặc định trước khi bật.' }),
      field('Nhà cung cấp mặc định', provSel),
      h('fieldset', {}, h('legend', { text: 'Bậc sử dụng' }), h('label', { class: 'check' }, tierFree, h('span', { text: 'Miễn phí' })), h('label', { class: 'check' }, tierPaid, h('span', { text: 'Trả tiền' })), tierNote),
      field('Mô hình mặc định (gõ tên; hoặc nhà:tên, ví dụ openai:tên-mô-hình)', model, dl),
      h('fieldset', {}, h('legend', { text: 'Chất lượng sản phẩm' }),
        field('Số vòng sửa lỗi tối đa (1 đến 5)', bugRounds),
        h('label', { class: 'check' }, deep, h('span', { text: 'Kiểm thử sâu: AI rà soát hai lượt (logic và đối chiếu yêu cầu) và kiểm lại bằng AI. Tốn thêm 2 đến 3 lời gọi mỗi dự án.' }))),
      h('details', { class: 'aiadv' }, h('summary', { text: 'Tuỳ chọn nâng cao: mô hình theo phòng, đơn giá, hạn mức' }),
        h('h4', { text: 'Mô hình riêng cho từng phòng (để trống thì dùng mô hình mặc định)' }),
        h('div', { class: 'deptgrid' }, DEPTS.map(([c, n]) => field(`${c} ${n}`, deptInputs[c]))),
        h('h4', { text: 'Bảng đơn giá' }), priceRows,
        h('button', { class: 'btn', type: 'button', onClick: () => { rows.push({ m: '', i: '0', o: '0' }); drawPrices(); } }, 'Thêm một mô hình'),
        h('h4', { text: 'Gemini: mức suy nghĩ' }), field('Mô hình càng suy nghĩ nhiều thì càng chậm và tốn token. Nếu hay bị quá thời gian, hãy để Thấp.', think),
        h('h4', { text: 'Hạn mức an toàn' }),
        h('div', { class: 'deptgrid' }, field('Lời gọi mỗi phút', rpm), field('Lời gọi mỗi ngày', daily), field('Token tối đa mỗi câu trả lời', maxTok))),
      err, h('div', { class: 'pactions' }, save, st.enabled && kill));
    form.addEventListener('submit', async e => {
      e.preventDefault(); showErr(err, '');
      const prices = {};
      for (const r of rows) { if (!r.m.trim()) continue; const i = Number(r.i), o = Number(r.o); if (!Number.isFinite(i) || !Number.isFinite(o) || r.i === '' || r.o === '') return showErr(err, `Đơn giá của "${r.m}" phải là hai con số.`); prices[r.m.trim()] = { in: i, out: o }; }
      const toInt = (el, label) => { const v = Number(el.value); if (el.value.trim() === '' || !Number.isInteger(v)) { showErr(err, `${label} phải là số nguyên.`); return null; } return v; };
      const r1 = toInt(rpm, 'Số lời gọi mỗi phút'), r2 = toInt(daily, 'Số lời gọi mỗi ngày'), r3 = toInt(maxTok, 'Số token tối đa');
      if (r1 == null || r2 == null || r3 == null) return;
      const r4 = toInt(bugRounds, 'Số vòng sửa lỗi'); if (r4 == null) return;
      const body = { aiEnabled: enabled.checked, aiProvider: provSel.value, aiBugRounds: r4, aiDeepQa: deep.checked, aiThinking: think.value, aiTier: tierPaid.checked ? 'paid' : 'free', aiModel: model.value.trim(), aiDeptModels: Object.fromEntries(Object.entries(deptInputs).map(([c, el]) => [c, el.value.trim()])), aiPrices: prices, aiRpm: r1, aiDailyCalls: r2, aiMaxTokens: r3 };
      save.disabled = true;
      try { cfg = await api.settingsSave(body); toast('Đã lưu cài đặt AI.'); await loadAll(); ctx.refresh?.(); }
      catch (e2) { showErr(err, e2.message); save.disabled = false; }
    });
    fill(formBox, form);
  }
  root.append(h('h3', { text: 'AI thật' }),
    h('p', { class: 'mute', text: 'Khi tắt, mọi việc chạy mô phỏng như trước và không tốn gì. Việc Chạy thử luôn là mô phỏng.' }), statusBox, keyBox, formBox);
  loadAll();
  return { el: root, live: { ai() { clearTimeout(timer); timer = setTimeout(loadStatus, 600); }, destroy() { clearTimeout(timer); } } };
}

// ---------- sao lưu và thông tin hệ thống ----------
const REASON = { manual: 'Thủ công', auto: 'Tự động', 'before-restore': 'Trước khi khôi phục' };
export function backupCard() {
  const root = h('section', { class: 'card ssec backupcard' }), err = errBox();
  async function load() {
    try {
      const [b, sys] = await Promise.all([api.backups(), api.system()]);
      const create = h('button', { class: 'btn primary', type: 'button', disabled: !b.available }, 'Sao lưu ngay');
      create.addEventListener('click', async () => { create.disabled = true; showErr(err, ''); try { const m = await api.backupCreate(); toast(`Đã sao lưu: ${m.id}`); await load(); } catch (e) { showErr(err, e.message); create.disabled = false; } });
      fill(root, h('h3', { text: 'Sao lưu và hệ thống' }),
        h('p', { class: 'mute', text: b.available ? `Tự động sao lưu mỗi ngày khi ứng dụng đang chạy, giữ ${b.keep} bản gần nhất trong data/backups. Bản sao lưu không chứa khoá API.` : 'Đang dùng cơ sở dữ liệu tạm nên không sao lưu được.' }),
        b.pending && h('div', { class: 'gatebox' }, h('p', { text: `Sẽ khôi phục bản ${b.pending.id} khi bạn khởi động lại ứng dụng (đóng cửa sổ đen rồi mở lại start.bat).` }), h('button', { class: 'btn', type: 'button', onClick: async () => { try { await api.backupCancel(); toast('Đã huỷ lệnh khôi phục.'); load(); } catch (e) { toast(e.message); } } }, 'Huỷ khôi phục')),
        h('div', { class: 'pactions' }, create), err,
        b.items.length > 0 ? h('div', { class: 'tablewrap' }, h('table', { class: 'tasktable' },
          h('thead', {}, h('tr', {}, ['Thời gian', 'Loại', 'Dung lượng', 'Nội dung', ''].map(x => h('th', { scope: 'col', text: x })))),
          h('tbody', {}, b.items.map(m => h('tr', {}, h('td', { class: 'num', text: localTime(m.createdAt) }), h('td', { text: REASON[m.reason] || m.reason }), h('td', { class: 'num', text: fmtBytes(m.bytes) }),
            h('td', { class: 'num', text: `${m.projects} dự án, ${m.files} tệp` }),
            h('td', { class: 'rowacts' },
              twoStep('Khôi phục', 'Bấm lần nữa để hẹn', async x => { x.disabled = true; try { await api.backupRestore(m.id); toast('Đã hẹn khôi phục. Hãy khởi động lại ứng dụng.'); await load(); } catch (e) { toast(e.message); x.disabled = false; } }),
              twoStep('Xoá', 'Bấm lần nữa để xoá', async x => { x.disabled = true; try { await api.backupDelete(m.id); await load(); } catch (e) { toast(e.message); x.disabled = false; } }))))))) : b.available && h('p', { class: 'mute', text: 'Chưa có bản sao lưu nào.' }),
        h('dl', { class: 'sysinfo' },
          h('dt', { text: 'Phiên bản' }), h('dd', { text: sys.version }), h('dt', { text: 'Node.js' }), h('dd', { text: `${sys.node} (${sys.platform}, ${sys.arch})` }),
          h('dt', { text: 'Thư mục dữ liệu' }), h('dd', { text: sys.dataDir || '(tạm)' }), h('dt', { text: 'Cơ sở dữ liệu' }), h('dd', { text: fmtBytes(sys.dbBytes) }),
          h('dt', { text: 'Sao lưu gần nhất' }), h('dd', { text: sys.lastBackup ? localTime(sys.lastBackup) : 'chưa có' }),
          sys.lastRestore && h('dt', { text: 'Khôi phục gần nhất' }), sys.lastRestore && h('dd', { text: sys.lastRestore.ok ? `${localTime(sys.lastRestore.at)} từ bản ${sys.lastRestore.id}` : `${localTime(sys.lastRestore.at)} thất bại: ${sys.lastRestore.error}` })));
    } catch (e) { clear(root).append(h('div', { class: 'cmderr', role: 'alert', text: e.message })); }
  }
  load();
  return { el: root };
}

// ---------- khối "Sản phẩm AI đã tạo" trong trang dự án ----------
const opened = new Map();       // projectId -> đường dẫn tệp đang mở, để vẽ lại trang không làm mất tệp đang xem
export function filesBlock(p, ctx) {
  const view = h('div', { class: 'fileview' });
  const money1 = n => money(n, ctx.state.config.currency || 'USD');
  async function open(rel) {
    opened.set(p.id, rel); paintList();
    clear(view).append(h('p', { class: 'mute', text: 'Đang tải…' }));
    try {
      const f = await api.projectFile(p.id, rel);
      if (opened.get(p.id) !== rel) return;
      const copy = h('button', { class: 'btn', type: 'button', onClick: async () => { try { await navigator.clipboard.writeText(f.content); toast('Đã sao chép.'); } catch { toast('Không sao chép được, hãy bôi đen và nhấn Ctrl + C.'); } } }, 'Sao chép');
      fill(view, h('div', { class: 'fvhead' }, h('b', { text: f.path }), h('small', { class: 'num', text: `${fmtBytes(f.size)} · phiên bản ${f.version}${f.truncated ? ' · đã cắt bớt khi hiển thị' : ''}` }), h('span', { class: 'spacer' }), copy),
        h('pre', { class: 'filepre', tabindex: '0', 'aria-label': `Nội dung ${f.path}`, text: f.content }));
    } catch (e) { clear(view).append(h('div', { class: 'cmderr', role: 'alert', text: e.message })); }
  }
  const list = h('div', { class: 'filelist', role: 'list' });
  function paintList() {
    clear(list);
    for (const f of p.files || []) list.append(h('button', { class: 'frow' + (opened.get(p.id) === f.path ? ' on' : ''), type: 'button', role: 'listitem', 'aria-pressed': String(opened.get(p.id) === f.path), onClick: () => open(f.path) },
      h('span', { class: 'fpath', text: f.path }), h('small', { class: 'num', text: `${fmtBytes(f.size)}${f.version > 1 ? ` · v${f.version}` : ''}` })));
  }
  paintList();
  if (opened.get(p.id) && (p.files || []).some(f => f.path === opened.get(p.id))) open(opened.get(p.id));
  const u = p.aiUsage;
  return h('section', { class: 'card csec filesblock' },
    h('h3', { text: 'Sản phẩm AI đã tạo' }),
    h('p', { class: 'mute' }, 'Các tệp nằm trong thư mục ', h('code', { text: p.folder }), ' trên máy bạn. Mã do AI viết có thể sai: hãy đọc trước khi chạy. Ứng dụng không bao giờ tự chạy mã này.'),
    u && h('p', { class: 'num', text: `AI đã gọi ${num(u.calls)} lần (${num(u.ok)} thành công), ${num(u.tokensIn)} token vào và ${num(u.tokensOut)} token ra, chi phí ${money1(u.cost)}.` }),
    u && u.errors.length > 0 && h('details', { class: 'aierrs' }, h('summary', { text: `${u.errors.length} lời gọi gần đây bị lỗi` }), u.errors.map(e => h('p', { class: 'mute', text: `${localTime(e.at)}: ${e.error}` }))),
    (p.files || []).length ? h('div', { class: 'filesgrid' }, list, view) : h('p', { class: 'mute', text: 'Chưa có tệp nào. Tệp sẽ xuất hiện khi các phòng làm xong việc.' }));
}

// ---------- trang Hướng dẫn ----------
export function guidePage() {
  const toc = h('nav', { class: 'guidetoc', 'aria-label': 'Mục lục hướng dẫn' }, GUIDE.map(s => h('a', { href: `#/huong-dan?muc=${s.id}`, text: s.title })));
  const sections = GUIDE.map(s => h('section', { class: 'card gsec', id: `g-${s.id}` }, h('h2', { text: s.title }),
    (s.paras || []).map(t => h('p', { text: t })), s.steps && h('ol', {}, s.steps.map(t => h('li', { text: t }))), s.list && h('ul', {}, s.list.map(t => h('li', { text: t })))));
  return { el: h('div', { class: 'guidepage' }, h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'kicker', text: 'Hướng dẫn' }), h('h1', { text: 'Hướng dẫn sử dụng' }), h('p', { class: 'mute', text: 'Dành cho người không rành kỹ thuật. Bản đầy đủ cũng có trong tệp HUONG-DAN.md.' }))), toc, sections) };
}
export function scrollToGuide(id) { const el = id && document.getElementById(`g-${id}`); if (el) el.scrollIntoView({ block: 'start' }); }
void icon;
