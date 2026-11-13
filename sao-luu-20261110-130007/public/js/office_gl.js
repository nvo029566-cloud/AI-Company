// Văn phòng 3D bằng WebGL2: camera xoay 360 độ, phóng to sát từng phòng, nhân viên ngồi tại bàn.
// Cùng giao diện lập trình với bản canvas phẳng (office3d.js) để trang Tổng quan dùng được cả hai.
import { createEngine, Layer } from './gl/engine.js';
import { mat4, v3 } from './gl/math.js';
import { buildStatic, drawWalls, chair, chairColor, ROOM_NAME, W, D, FL, Y0, WALL_H, SEAT_BACK, CORR_Z, V_X } from './gl/building.js';
import { buildOutside, drawTraffic, LAMPS } from './gl/world.js';
import { paintAtlas, UV } from './gl/textures.js';
import { box, cyl, quad, sph as sphere, mixc } from './gl/shapes.js';
import { drawPerson, headPos } from './gl/people.js';
import { createPeople, Director, applySim } from './gl/behavior.js';
import { h } from './ui.js';

export function glSupported() {
  try {
    const c = document.createElement('canvas'), g = c.getContext('webgl2');
    if (!g) return false;
    g.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

const FOV = 32 * Math.PI / 180;
const DELIVERABLE = { CEO: 'Yêu cầu của CEO', '01': 'Kế hoạch dự án', '02': 'Phạm vi sản phẩm', '03': 'Bản yêu cầu chi tiết', '05': 'Bản thiết kế', '06': 'Giao diện', '07': 'Máy chủ', '08': 'Bản di động', '09': 'Trang web', '10': 'Báo cáo kiểm thử', '11': 'Báo cáo an ninh', '12': 'Bản triển khai' };
// Mỗi dự án (lượt chạy) một màu cố định: hồ sơ cầm trên tay, chồng hồ sơ chờ trên bàn và chấm tròn ở danh sách dự án cùng màu để phân biệt.
const PROJ = ['#e0526b', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];
const projColor = id => PROJ[(Math.abs(Number(id) || 0)) % PROJ.length];
const shortTitle = t => { const x = String(t || '').trim(); return x.length > 22 ? x.slice(0, 21) + '…' : x; };
const LIGHT = v3.norm([-0.35, 0.8, 0.5]);
const DAY = { sun: [0.5, 0.46, 0.4], sky: [0.56, 0.6, 0.66], ground: [0.4, 0.4, 0.38], bg: [0.89, 0.91, 0.93] };
const NIGHT = { sun: [0.1, 0.13, 0.26], sky: [0.17, 0.2, 0.36], ground: [0.08, 0.09, 0.16], bg: [0.05, 0.07, 0.16] };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const store = { get: (k, d) => { try { return localStorage.getItem('cty.' + k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('cty.' + k, v); } catch { /* bỏ qua */ } } };

export function createOfficeGL(host, opts) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'office-cv'; canvas.tabIndex = 0; canvas.style.touchAction = 'none';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Văn phòng 3D của công ty, kéo chuột để xoay. Muốn đọc dạng chữ, hãy mở tab Sơ đồ 2D hoặc Danh sách phòng.');
  host.prepend(canvas);
  let engine;
  try { engine = createEngine(canvas); } catch (e) { canvas.remove(); throw e; }

  const colors = Object.fromEntries(opts.depts().map(d => [d.code, d.color])); colors.CEO = '#6d5ef0';
  const statL = new Layer(2048), dyn = new Layer(1024), peopleL = new Layer(1024), ghostL = new Layer(512);
  const carryGhostL = new Layer(256), glowL = new Layer(1024), hiL = new Layer(256);
  dyn.dynamic = peopleL.dynamic = ghostL.dynamic = carryGhostL.dynamic = glowL.dynamic = hiL.dynamic = true;
  ghostL.tint = [0.74, 0.9, 1.0]; ghostL.alpha = 0.62;                            // người đi lại bị tường che: bóng xanh nhạt
  carryGhostL.ghost = true; carryGhostL.tint = [1.0, 0.8, 0.2]; carryGhostL.alpha = 0.95;   // người mang hồ sơ: bóng vàng đậm
  glowL.glow = true; glowL.blend = 'add';                                          // ánh đèn ban đêm (cộng ánh sáng)
  hiL.glow = true; hiL.blend = 'alpha';                                            // đánh dấu người mang hồ sơ (phủ màu trong suốt, thấy cả ban ngày)
  peopleL.mark = true; ghostL.ghost = true;                      // người: đánh dấu vùng nhìn thấy; bóng: vẽ phần bị tường che
  const occupied = {};                                           // số bàn có người ngồi ở mỗi phòng: ghế của họ vẽ ở phần động
  for (const a of opts.agents()) occupied[a.deptCode] = (occupied[a.deptCode] || 0) + 1;
  occupied.CEO = 1;
  const B = buildStatic(statL, { colors, occupied });
  buildOutside(statL);                                           // đường, công trình, cây cối, xe đỗ
  engine.upload(statL);
  engine.setAtlas(paintAtlas(document.createElement('canvas'), opts.brand?.() || 'Công ty AI'));
  engine.fitLight(LIGHT, [-4, -0.6, -4], [W + 4, 7, D + 14]);   // bóng đổ chỉ tính quanh toà nhà

  /* ---------- người ---------- */
  const people = createPeople(B, opts.agents(), colors, 1), roomOf = new Map(B.rooms.map(r => [r.code, r]));
  const bySlot = new Map(people.map(p => [p.slot, p]));
  for (const r of B.rooms) { r.work = 0; r.total = 0; r.progress = 0; r.queued = 0; r.queue = []; r.borrowers = 0; r.incoming = 0; r.flash = 0; }
  const director = new Director({ people, slots: B.slots, rooms: B.rooms, getSpeed: () => opts.sim()?.speed || 1 });
  const leadSlot = new Map(B.slots.filter(sl => sl.idx === 0).map(sl => [sl.room, sl]));      // bàn trưởng phòng: nơi chồng hồ sơ chờ
  const papers = [];                                                                          // hồ sơ gửi điện tử đang bay giữa hai bàn

  /* ---------- camera ---------- */
  const view = { w: 800, h: 500, dpr: 1 };
  const T = { yaw: 0.55, pitch: 0.66, dist: 60, x: W / 2, y: 0.6, z: D / 2 + 1 };
  const C = { ...T };
  let focus = null;
  const aspect = () => view.w / Math.max(1, view.h);
  const th = Math.tan(FOV / 2);
  function fitBox(wd, dp, pitch, yaw, pad) {
    const horiz = (wd * Math.abs(Math.cos(yaw)) + dp * Math.abs(Math.sin(yaw))) / 2 / (th * aspect());
    const vert = ((dp * Math.abs(Math.cos(yaw)) + wd * Math.abs(Math.sin(yaw))) * Math.sin(pitch) + pad) / 2 / th;
    return Math.max(horiz, vert) * 1.02;
  }
  function overview(snap) {
    focus = null; host.classList.remove('focused');
    Object.assign(T, { pitch: 0.66, x: W / 2 - 2, y: 0.6, z: D / 2 + 6 });
    T.dist = fitBox(W + 14, D + 16, T.pitch, T.yaw, 5);
    if (snap) Object.assign(C, T);
    opts.onZoom?.(null);
  }
  function focusRoom(R) {
    focus = R;
    Object.assign(T, { pitch: 0.86, x: R.cx, y: 1.0, z: R.cz + 0.8 });
    T.dist = Math.max(8, fitBox(R.w, R.d, T.pitch, T.yaw, 3));
    host.classList.add('focused');
    opts.onZoom?.(info(R));
  }
  const info = R => { const d = opts.depts().find(x => x.code === R.code); return { code: R.code, name: ROOM_NAME[R.code] || d?.name || R.code, total: R.code === 'CEO' ? 1 : (d?.total || 0), ceo: R.code === 'CEO', lounge: R.code === 'LNG' }; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const eye = [0, 0, 0], proj = mat4.create(), vmat = mat4.create(), vp = mat4.create(), inv = mat4.create();
  // Tính ma trận nhìn và vị trí mắt từ một trạng thái camera S (hiện tại C hoặc đích T).
  function camOf(S, outVP, outEye) {
    const cp = Math.cos(S.pitch);
    outEye[0] = S.x + S.dist * Math.sin(S.yaw) * cp; outEye[1] = S.y + S.dist * Math.sin(S.pitch); outEye[2] = S.z + S.dist * Math.cos(S.yaw) * cp;
    mat4.perspective(proj, FOV, aspect(), 0.4, 400);
    mat4.lookAt(vmat, outEye, [S.x, S.y, S.z], [0, 1, 0]);
    mat4.mul(outVP, proj, vmat);
  }
  function updateCamera(dt) {
    const k = reduce ? 1 : 1 - Math.exp(-dt * 6.5);
    for (const key of ['yaw', 'pitch', 'dist', 'x', 'y', 'z']) C[key] += (T[key] - C[key]) * k;
    camOf(C, vp, eye);
  }

  /* ---------- nhãn phủ lên cảnh ---------- */
  const layer = h('div', { class: 'gl-labels' });
  const stat = h('div', { class: 'glstat' });
  const pills = h('div', { class: 'glpills' });
  host.append(layer, stat, pills);
  const tags = new Map(B.rooms.map(R => {
    const d = opts.depts().find(x => x.code === R.code), plain = R.code === 'CEO' || R.code === 'LNG';
    const el = h('div', { class: 'rtag' + (R.code === 'CEO' ? ' ceo' : '') + (R.code === 'LNG' ? ' lounge' : '') },
      h('span', { class: 'rc', text: R.code === 'CEO' ? '★' : (R.code === 'LNG' ? '☕' : R.code) }),
      h('span', { class: 'rn', text: ROOM_NAME[R.code] || `${d?.nameEn || ''} ${d?.name || ''}`.trim() }),
      h('span', { class: 'rk', text: plain ? '' : '0' }),
      h('span', { class: 'rq', text: '' }));
    layer.append(el);
    return [R.code, { el, k: el.querySelector('.rk'), q: el.querySelector('.rq'), pos: '' }];
  }));
  const nameOf = p => p.courier ? `${p.ref.name} · điều phối` : (p.borrowAt ? `${p.ref.name} · mượn từ ${p.room.code}` : p.ref.name);
  const bubbles = [], names = [], emos = [];
  const mkBubble = () => {
    const el = h('div', { class: 'pbub' }, h('b', { class: 'st' }), h('span', { class: 'tx' }), h('em', { class: 'bar' }, h('u')));
    layer.append(el); return { el, st: el.querySelector('.st'), tx: el.querySelector('.tx'), u: el.querySelector('u'), on: false, pos: '' };
  };
  const mkCarry = () => { const el = h('div', { class: 'pcarry' }); layer.append(el); return { el, on: false, pos: '' }; };
  const carries = [];
  const mkEmo = () => { const el = h('div', { class: 'pemo' }); layer.append(el); return { el, on: false, pos: '' }; };
  const mkName = () => { const el = h('div', { class: 'pname' }); layer.append(el); return { el, on: false, pos: '' }; };

  function project(p) {
    const q = mat4.transform(vp, p);
    if (q[3] <= 0.01) return null;
    return [(q[0] / q[3] * 0.5 + 0.5) * view.w, (1 - (q[1] / q[3] * 0.5 + 0.5)) * view.h];
  }
  const place = (obj, sp, dx = 0, dy = 0) => {
    if (!sp || sp[0] < -80 || sp[0] > view.w + 80 || sp[1] < -60 || sp[1] > view.h + 60) { if (obj.on) { obj.el.style.display = 'none'; obj.on = false; } return; }
    if (!obj.on) { obj.el.style.display = ''; obj.on = true; }
    const t = `translate(${(sp[0] + dx).toFixed(1)}px,${(sp[1] + dy).toFixed(1)}px) translate(-50%,-100%)`;
    if (t !== obj.pos) { obj.el.style.transform = t; obj.pos = t; }
  };
  function updateLabels() {
    const near = C.dist < 34;
    for (const R of B.rooms) {
      const t = tags.get(R.code);
      t.el.classList.toggle('open', near && (!focus || focus === R));
      t.el.classList.toggle('work', R.work > 0);
      t.el.classList.toggle('hot', R.flash > now);
      t.el.classList.toggle('dim', !!focus && focus !== R);
      place(t, project([R.cx, FL + WALL_H + 0.55, R.z0 + 0.1]));
    }
    // Biểu tượng cảm xúc trên đầu (cà phê, trò chuyện, điện thoại...): hiện khi không quá xa
    let ei = 0;
    for (const p of people) {
      if (!p.say || ei >= 14 || (C.dist >= 55 && p.mode === 'seated')) continue;      // ở xa chỉ hiện cho người đang rời bàn
      const hp = headPos(p.P), e = emos[ei] || (emos[ei] = mkEmo()); ei++;
      e.el.textContent = p.say.text; place(e, project([hp[0], hp[1] + 0.3, hp[2]]), 0, -2);
    }
    let ci = 0;                                                  // bản hoàn thành đang được mang đi: luôn hiện, ở mọi khoảng cách
    for (const p of people) {
      if (!p.carryLabel || p.P.hold !== 'folder' || ci >= 8) continue;
      const hp = headPos(p.P), c = carries[ci] || (carries[ci] = mkCarry()); ci++;
      const dst = p.carryDest ? ' ▸ ' + (p.carryDest === 'CEO' ? 'CEO' : `${p.carryDest} ${info(roomOf.get(p.carryDest)).name}`) : '', txt = p.carryLabel + dst;
      const far = C.dist > 55, shown = far ? p.carryLabel : txt;
      if (c.el.textContent !== shown) c.el.textContent = shown;
      c.el.classList.toggle('far', far);
      c.el.style.setProperty('--pc', p.P.holdColor || '#ffd54a');
      place(c, project([hp[0], hp[1] + 0.62, hp[2]]), 0, -2);
    }
    for (let i = ci; i < carries.length; i++) if (carries[i].on) { carries[i].el.style.display = 'none'; carries[i].on = false; }
    for (let i = ei; i < emos.length; i++) if (emos[i].on) { emos[i].el.style.display = 'none'; emos[i].on = false; }
    // Bong bóng trạng thái và tên: chỉ khi đã phóng gần
    let bi = 0, ni = 0;
    if (C.dist < 30 || (focus && C.dist < 60)) {
      for (const p of people) {
        const inScope = focus ? (p.room === focus || (p.mode !== 'seated' && v3.len([p.P.x - C.x, 0, p.P.z - C.z]) < 12)) : v3.len([p.P.x - C.x, 0, p.P.z - C.z]) < 13;
        if (!inScope) continue;
        const hp = headPos(p.P);
        const showName = p.mode === 'seated' || (C.dist <= 20 && !(p.carryLabel && p.P.hold === 'folder'));   // người đang đi: chỉ hiện tên khi zoom gần và không đang mang hồ sơ (nhãn hồ sơ đã đủ), tránh chữ chồng nhau
        if (p.meeting && bi < 14) {
          const b = bubbles[bi] || (bubbles[bi] = mkBubble()); bi++;
          b.st.textContent = 'ĐANG HỌP'; b.tx.textContent = 'Họp bàn công việc'; b.u.style.width = '0%';
          place(b, project([hp[0], hp[1] + 0.35, hp[2]]), 0, -4);
        } else if (p.task && (p.P.work || p.task.travelling) && bi < 14) {
          const b = bubbles[bi] || (bubbles[bi] = mkBubble()); bi++;
          const bd = p.task.from ? ` · MƯỢN TỪ ${p.task.from}` : '';
          b.st.textContent = p.task.travelling ? `ĐI SANG PHÒNG ${p.task.dept}` : (p.task.dept === '10' || p.task.dept === '11' ? 'ĐANG KIỂM' : 'ĐANG LÀM') + bd;
          b.tx.textContent = p.task.title;
          b.u.style.width = Math.round(p.task.progress * 100) + '%';
          place(b, project([hp[0], hp[1] + 0.35, hp[2]]), 0, -4);
        } else if (focus && showName && ni < 20) {
          const n = names[ni] || (names[ni] = mkName()); ni++;
          n.el.textContent = nameOf(p);
          place(n, project([hp[0], hp[1] - 1.0, hp[2]]), 0, 22);
        }
        if (p.P.work && focus && showName && ni < 20) {
          const n = names[ni] || (names[ni] = mkName()); ni++;
          n.el.textContent = nameOf(p);
          place(n, project([hp[0], hp[1] - 1.0, hp[2]]), 0, 22);
        }
      }
    }
    for (let i = bi; i < bubbles.length; i++) if (bubbles[i].on) { bubbles[i].el.style.display = 'none'; bubbles[i].on = false; }
    for (let i = ni; i < names.length; i++) if (names[i].on) { names[i].el.style.display = 'none'; names[i].on = false; }
  }

  /* ---------- đồng bộ với trạng thái công ty ---------- */
  function sync() {
    for (const d of opts.depts()) { const R = roomOf.get(d.code); if (R) R.total = d.total; }
    for (const R of B.rooms) { R.progress = 0; R.queued = 0; R.queue = []; R.work = 0; R.borrowers = 0; R.incoming = 0; }
    const sim = opts.sim(), runs = sim?.runs || [];
    applySim(director, sim);                                     // tải chung, phòng đang bận, ai làm gì, ai sang mượn bàn trống
    for (const run of runs) for (const it of run.items) {
      const R = roomOf.get(it.dept); if (!R) continue;
      if (it.state === 'working') { R.work++; if (it.borrowed) R.borrowers++; if (!it.travelling) R.progress = Math.max(R.progress, it.progress); }
      else if (it.state === 'queued') { if (it.inTransit) R.incoming++; else { R.queued++; R.queue.push(run.id); } }
    }
    for (const R of B.rooms) {
      const t = tags.get(R.code); if (R.code === 'CEO' || R.code === 'LNG') continue;
      if (t.k.textContent !== String(R.work)) t.k.textContent = R.work;
      const q = (R.queued ? `⏳${R.queued}` : '') + (R.incoming ? `📥${R.incoming}` : '');       // ⏳ việc chờ người làm · 📥 đang chờ hồ sơ của phòng trước tới
      if (t.q.textContent !== q) { t.q.textContent = q; t.el.classList.toggle('queued', !!R.queued); t.el.classList.toggle('incoming', !!R.incoming && !R.queued); }
    }
    const s = opts.stats?.() || {};
    stat.replaceChildren(
      ...[[s.agents ?? opts.agents().length, 'agent AI'], [s.depts ?? opts.depts().length, 'phòng ban'], [s.laptops ?? 1, 'laptop']].map(([n, l]) =>
        h('div', {}, h('b', { class: 'num', text: String(n) }), h('span', { text: l }))));
    pills.replaceChildren(...runs.slice(0, 4).map(r => {
      const el = h('div', { class: 'glpill' }, h('i'), h('span', { class: 'tt', text: r.title }), h('span', { class: 'pg num', text: `${r.stage}/${r.total}` }));
      el.style.setProperty('--pc', projColor(r.id));              // biến CSS phải đặt bằng setProperty (gán thẳng vào style không có tác dụng)
      return el;
    }));
  }

  /* ---------- hiệu ứng ---------- */
  let now = 0, lastPing = -1e9;
  const bits = [];
  function confetti() {
    if (reduce) return;
    const R = roomOf.get('CEO'), cols = ['#ffd54a', '#ff6b6b', '#4cd3b5', '#6aa2ff', '#c98bff', '#ffffff'];
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3.2;
      bits.push({ x: R.cx, y: FL + 1.8, z: R.cz, vx: Math.cos(a) * sp, vy: 3 + Math.random() * 4, vz: Math.sin(a) * sp, life: 2 + Math.random() * 1.2, rot: Math.random() * 6, c: cols[i % cols.length] });
    }
  }
  const steam = [], sparks = [];
  function burst(x, y, z, n, cols) {
    if (reduce) return;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = 0.8 + Math.random() * 1.6; sparks.push({ x, y, z, vx: Math.cos(a) * sp, vy: 1.5 + Math.random() * 1.5, vz: Math.sin(a) * sp, life: 0.7 + Math.random() * 0.4, c: cols[i % cols.length] }); }
  }
  function handoff(ev) {
    const R = roomOf.get(ev.to) || (ev.to === 'CEO' ? roomOf.get('CEO') : null);
    if (!R) return;
    R.flash = now + 1.8;
    if (ev.support) return;                                      // hỗ trợ ngoài dây chuyền: chỉ nháy phòng
    // Lúc vắng người vừa làm xong tự cầm hồ sơ đi giao; lúc bận điều phối viên đi nhận tại bàn rồi giao; quá tải thì gửi điện tử (giấy bay)
    const doc = DELIVERABLE[ev.from] || 'Bản hoàn thành';
    const how = director.dispatch({ senderId: ev.from === 'CEO' ? null : ev.agentId, fromCode: ev.from, toCode: ev.to, color: projColor(ev.runId), label: ev.title ? `${shortTitle(ev.title)} · ${doc}` : doc, meta: { runId: ev.runId, fromCode: ev.from } });
    if (!how) opts.onDelivered?.({ runId: ev.runId, from: ev.from, to: ev.to });                  // không ai giao được (thiếu người gửi hoặc nhận): báo luôn để phòng kế tiếp không phải chờ
    if (ev.delivered) roomOf.get('CEO').flash = now + 2.4;
  }
  function landed(e) {                                           // hồ sơ đã tới tay trưởng phòng nhận
    if (e.runId != null) opts.onDelivered?.({ runId: e.runId, from: e.fromCode, to: e.room });    // báo máy chủ: phòng nhận được bắt đầu làm ngay lúc này
    const R = roomOf.get(e.room); if (!R) return;
    R.flash = now + 1.4;
    const q = people.find(p => p.ref.id === e.to);
    if (q) burst(q.P.x, FL + 1.3, q.P.z, 14, ['#ffd54a', '#5cf2c4', '#ffffff']);
    if (e.room === 'CEO') { confetti(); const c = people.find(p => p.ref.ceo); if (c) { c.wantAct = 'cheer'; setTimeout(() => { if (c.wantAct === 'cheer') c.wantAct = null; }, 2200); } }
  }
  function consumeEvents() {
    while (director.events.length) {
      const e = director.events.shift();
      if (e.type !== 'handed') continue;
      if (e.digital && !reduce) { const d = Math.hypot(e.dest[0] - e.at[0], e.dest[1] - e.at[1]); papers.push({ a: e.at, b: e.dest, t: 0, dur: 0.8 + Math.min(1.4, d * 0.03), c: e.color || '#ffd54a', e }); }
      else landed(e);
    }
  }

  /* ---------- ánh sáng ---------- */
  let lightMode = ['auto', 'day', 'night'].includes(store.get('light3d', 'auto')) ? store.get('light3d', 'auto') : 'auto';
  let shadows = store.get('shadow3d', 'on') !== 'off' && engine.fboOk, night = null;
  function lightLevel() {
    if (lightMode === 'day') return 0; if (lightMode === 'night') return 1;
    const d = new Date(), hr = d.getHours() + d.getMinutes() / 60;
    if (hr >= 19.5 || hr < 5.5) return 1; if (hr >= 17.5) return (hr - 17.5) / 2; if (hr < 7) return 1 - (hr - 5.5) / 1.5; return 0;
  }
  let Lv = lightLevel();

  /* ---------- đèn ban đêm ---------- */
  const NIGHT_CORR = [];                                                         // đèn trần hành lang: vũng sáng cách đều
  for (const zc of CORR_Z) for (let x = 4; x < W - 2; x += 6) NIGHT_CORR.push([x, zc, 2.5, 1.3]);
  for (const xv of V_X) for (let z = 4; z < D - 2; z += 6) if (!CORR_Z.some(c => Math.abs(z - c) < 2.2)) NIGHT_CORR.push([xv, z, 1.3, 2.5]);
  function pool(x, y, z, rx, rz, col, total, n = 6) {                            // vũng sáng mềm: n đĩa đồng tâm nhỏ dần, cộng dồn nên giữa sáng nhất (total = độ sáng ở tâm)
    for (let i = 0; i < n; i++) { const f = 1 - i * (0.85 / n); cyl(glowL, x, y, z, rx * f, 0.01, col, total / n, rz * f); }
  }
  function drawNightGlow(k) {
    for (const R of B.rooms) {                                                   // đèn từng phòng: phòng đang làm việc sáng ấm hơn, phòng rảnh dịu hơn, phòng vừa nhận việc ánh tím
      const work = R.work > 0, fl = R.flash > now;
      pool(R.cx, FL + 0.075, R.cz + 0.1, (R.w - 0.8) / 2, (R.d - 1.0) / 2, fl ? '#b9b0ff' : work ? '#ffdc96' : '#ffc983', k * (R.code === 'LNG' ? 0.75 : work ? 0.85 : 0.5), 16);
    }
    for (const wl of B.walls) {                                                  // đèn rọi tường dưới dải đèn trần
      if (wl.id[0] !== 'N' || wl.f < 0.7) continue;
      const st = wl.att.find(q => q.t === 'strip'); if (!st) continue;
      quad(glowL, st.x, Y0 + WALL_H - 0.55, st.z + 0.03, st.w, 0.9, 0, null, 0.14 * k * wl.f, '#ffe7b0');
      quad(glowL, st.x, Y0 + WALL_H - 1.05, st.z + 0.03, st.w * 0.9, 1.9, 0, null, 0.04 * k * wl.f, '#ffe7b0');
    }
    for (const c of B.sconces) {                                                 // đèn tường trên các vách: quầng sáng, vệt sáng trên vách và vũng sáng dưới sàn
      sphere(glowL, c.x, c.y, c.z, 0.28, '#ffe2a8', 0.5 * k); sphere(glowL, c.x, c.y, c.z, 0.7, '#ffd98a', 0.14 * k);
      quad(glowL, c.px, c.y - 0.15, c.z, 2.2, 1.7, c.side > 0 ? Math.PI / 2 : -Math.PI / 2, null, 0.16 * k, '#ffe7b0');
      pool(c.x + c.side * 1.2, FL + 0.078, c.z, 1.7, 1.7, '#ffc77d', 0.55 * k, 10);
    }
    const top = FL + 0.74;
    for (const s of B.slots) {                                                   // đèn bàn bật ở bàn đang làm việc
      if (!director.deskUser(s, bySlot.get(s))?.P.work) continue;
      sphere(glowL, s.x - 0.56, top + 0.33, s.z + 0.19, 0.3, '#ffd98a', 0.45 * k); sphere(glowL, s.x - 0.56, top + 0.33, s.z + 0.19, 0.7, '#ffd98a', 0.13 * k);
      pool(s.x - 0.1, FL + 0.08, s.z - 0.15, 1.1, 0.9, '#ffe3a8', 0.3 * k, 8);
    }
    for (const [x, z, rx, rz] of NIGHT_CORR) pool(x, FL + 0.06, z, rx, rz, '#d7e4ff', 0.22 * k, 8);
    for (const [x, z, h] of LAMPS) {                                              // đèn đường: quầng sáng quanh bóng đèn và vũng sáng trên mặt đất
      sphere(glowL, x, h - 0.1, z, 0.5, '#fff0b8', 0.5 * k); sphere(glowL, x, h - 0.1, z, 1.0, '#ffe9a8', 0.12 * k);
      pool(x, 0.11, z, 3.6, 3.6, '#ffe2a0', 0.45 * k, 12);
    }
    pool(36, 0.58, 40, 2.1, 2.1, '#7fe8ff', 0.4 * k, 4);                          // đèn dưới đài phun nước
  }

  /* ---------- làm nổi bật người đang mang hồ sơ đi giao ---------- */
  function drawCarriers(dt) {
    const pul = 0.5 + 0.5 * Math.sin(now * 6);
    const ring = (x, z, r, col, a, y) => cyl(hiL, x, y, z, r, 0.01, col, a);
    for (const p of people) {
      if (!(p.P.hold === 'folder' && p.carryLabel)) { p.trail = null; continue; }
      const P = p.P;
      p.trail = p.trail || []; p.trailT = (p.trailT || 0) - dt;
      if (p.trailT <= 0) { p.trailT = 0.16; p.trail.push([P.x, P.z]); if (p.trail.length > 18) p.trail.shift(); }
      ring(P.x, P.z, 0.82 + 0.07 * pul, '#ffd54a', 0.28, FL + 0.09); ring(P.x, P.z, 0.62, '#ffd54a', 0.36, FL + 0.093); ring(P.x, P.z, 0.42, '#fff3b0', 0.5, FL + 0.096);   // vòng vàng dưới chân
      cyl(hiL, P.x, FL + 2.6, P.z, 0.17, 5.0, '#ffd54a', 0.12 + 0.06 * pul); cyl(hiL, P.x, FL + 2.6, P.z, 0.07, 5.0, '#fff6c0', 0.3);                                  // cột sáng: thấy được cả khi bị tường che
      const n = p.trail.length;
      p.trail.forEach(([x, z], i) => { const u = (i + 1) / n; ring(x, z, 0.06 + 0.14 * u, '#ffd54a', 0.6 * u, FL + 0.1); });                                          // vệt đường đã đi
      if (p.carryTarget) {                                                                                                                                              // điểm đến
        const [tx, tz] = p.carryTarget;
        ring(tx, tz, 0.95 + 0.25 * pul, '#35e0b0', 0.3, FL + 0.09); ring(tx, tz, 0.6, '#35e0b0', 0.42, FL + 0.093); ring(tx, tz, 0.28, '#e8fff8', 0.7, FL + 0.096);
        cyl(hiL, tx, FL + 1.3, tz, 0.1, 2.6, '#35e0b0', 0.18);
      }
    }
  }

  /* ---------- vẽ ---------- */
  function drawDynamic(dt) {
    dyn.clear(); peopleL.clear(); ghostL.clear(); carryGhostL.clear(); glowL.clear(); hiL.clear();
    for (const wl of B.walls) {                  // tường hạ thấp khi camera ở phía ngoài tường đó
      const out = wl.n[0] * (eye[0] - wl.cx) + wl.n[1] * (eye[2] - wl.cz);
      wl.f += ((out > 1.5 ? 0 : 1) - wl.f) * Math.min(1, dt * 7);
    }
    drawWalls(dyn, B.walls);
    for (const R of B.rooms) {                   // vòng sáng dưới khu bàn
      if (!R.ring) continue;
      const g = R.ring, work = R.work > 0, fl = R.flash > now;
      cyl(dyn, g.x, g.y, g.z, g.rx, 0.02, fl ? '#b3a9ff' : (R.queued > 0 ? '#ffb347' : (work ? '#6ff7ea' : '#58b8b8')), fl || work || R.queued > 0 ? 1 : 0.2, g.rz);
    }
    const top = FL + 0.74;
    for (const s of B.slots) {                   // màn hình và đèn báo ở từng bàn
      const home = bySlot.get(s), u = director.deskUser(s, home), on = !!u?.P.work, zz = s.z + 0.13;
      if (on) quad(dyn, s.x, top + 0.34, zz - 0.0275, 0.56, 0.32, Math.PI, ((s.idx % 2) ? UV.mini2 : UV.mini), 1);
      else quad(dyn, s.x, top + 0.34, zz - 0.0275, 0.56, 0.32, Math.PI, null, 0, '#0b1118');
      if (home || u) box(dyn, s.x + 0.22, top + 0.06, zz + 0.0215, 0.035, 0.035, 0.01, on ? '#5cf2c4' : '#8a96a0', on ? 1 : 0);
    }
    for (const R of B.rooms) {                   // hồ sơ đang chờ chồng lên bàn trưởng phòng, mỗi dự án một màu
      const sl = leadSlot.get(R.code); if (!sl || !R.queue.length) continue;
      for (let i = 0; i < Math.min(R.queue.length, 9); i++) box(dyn, sl.x + 0.52 + ((i * 7) % 3 - 1) * 0.008, top + 0.03 + i * 0.026, sl.z - 0.12, 0.25, 0.021, 0.18, projColor(R.queue[i]), 0.12, (i % 3 - 1) * 0.07);
    }
    for (let i = papers.length - 1; i >= 0; i--) {   // hồ sơ gửi điện tử: tờ giấy bay theo vòng cung từ bàn người gửi sang bàn người nhận
      const f = papers[i]; f.t += dt;
      if (f.t >= f.dur) { landed(f.e); papers.splice(i, 1); continue; }
      const u = f.t / f.dur, at = k => { const w = Math.max(0, Math.min(1, k)), ease = w * w * (3 - 2 * w); return [f.a[0] + (f.b[0] - f.a[0]) * ease, FL + 1.05 + Math.sin(Math.PI * ease) * 2.2, f.a[1] + (f.b[1] - f.a[1]) * ease]; };
      for (let j = 6; j >= 1; j--) { const q = at(u - j * 0.035); sphere(hiL, q[0], q[1], q[2], 0.07 * (1 - j / 8), f.c, 0.55 * (1 - j / 7)); }
      const q = at(u); box(hiL, q[0], q[1], q[2], 0.34, 0.03, 0.24, f.c, 1, u * 9); sphere(hiL, q[0], q[1], q[2], 0.34, f.c, 0.22);
    }
    drawTraffic(dyn, now, glowL, Lv);
    director.update(dt);
    consumeEvents();
    for (const p of people) {                    // ghế của người ngồi bàn: trượt ra khi đứng dậy
      const out = p.chair.out;
      chair(dyn, p.slot.x + p.chair.side * 0.6 * out * (p.ref.ceo ? 1 : 1), p.slot.z - SEAT_BACK - 0.12 * out, chairColor(p.room.def, p.slot.idx));
    }
    for (const p of people) {
      p.P.t += dt;
      const r = drawPerson(peopleL, p.P);
      if (p.mode !== 'seated') drawPerson(p.P.hold === 'folder' && p.carryLabel ? carryGhostL : ghostL, p.P);   // người đang đi lại vẫn thấy được khi bị tường che; người mang hồ sơ có bóng vàng
      if (p.P.hold === 'cup' && r && (p.P.act === 'sip' || p.P.walk < 0.5) && !reduce) {          // hơi nóng bốc lên từ cốc
        p.steamT = (p.steamT || 0) - dt;
        if (p.steamT <= 0) { p.steamT = 0.22; steam.push({ x: r.hand[0] + (Math.random() - 0.5) * 0.04, y: r.hand[1] + 0.16, z: r.hand[2], life: 1.1 }); }
      }
    }
    drawCarriers(dt);
    if (Lv > 0.04) drawNightGlow(Lv);
    for (let i = steam.length - 1; i >= 0; i--) {
      const q = steam[i]; q.life -= dt; q.y += dt * 0.35; q.x += Math.sin(q.life * 6) * dt * 0.05;
      if (q.life <= 0) { steam.splice(i, 1); continue; }
      sphere(dyn, q.x, q.y, q.z, 0.028 + (1.1 - q.life) * 0.03, '#f4f6f8', 0.85);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const q = sparks[i]; q.life -= dt; q.vy -= 5 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.life <= 0) { sparks.splice(i, 1); continue; }
      sphere(dyn, q.x, q.y, q.z, 0.045 * Math.min(1, q.life * 2), q.c, 1);
    }
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]; b.life -= dt; b.vy -= 9 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.rot += dt * 7;
      if (b.life <= 0 || b.y < FL) { bits.splice(i, 1); continue; }
      box(dyn, b.x, b.y, b.z, 0.14, 0.02, 0.09, b.c, 0.7, b.rot);
    }
  }
  // Tự thích nghi: máy yếu thì giảm độ nét, vẫn chậm thì tắt bóng. Không tự bật lại để khỏi giật qua lại.
  let perfScale = 1, ema = 0.016, slowFor = 0, autoQuality = true;
  const born = performance.now();
  function adapt(realDt) {                                      // realDt: thời gian thật giữa hai khung, giây
    if (!autoQuality || document.hidden || performance.now() - born < 3000) return;   // bỏ qua 3 giây đầu và lúc tab bị ẩn
    const d = Math.min(realDt, 0.5);                           // một khung dài chỉ tính tối đa 0,5 giây
    ema = ema * 0.9 + d * 0.1;
    slowFor = ema > 0.045 ? slowFor + d : 0;
    if (slowFor < 2.5) return;
    slowFor = 0; ema = 0.016;
    if (perfScale > 0.56) { perfScale = Math.max(0.55, perfScale - 0.15); resize(); opts.onPerf?.('scale'); }
    else if (shadows) { shadows = false; store.set('shadow3d', 'off'); opts.onPerf?.('shadows-off'); }
  }
  let raf = 0, last = performance.now(), dead = false;
  let frameErrors = 0;
  function frame(t) {
    if (dead) return;
    try {
      const real = (t - last) / 1000, dt = Math.min(0.1, real); last = t; now += dt;
      adapt(real);
      if (t - lastPing > 15000) { lastPing = t; opts.onViewer?.(); }       // báo máy chủ: đang có người xem cảnh 3D (khi tab ẩn, khung hình dừng thì tin này cũng dừng và máy chủ tự thả việc)
      Lv += (lightLevel() - Lv) * Math.min(1, dt * 2);
      const isNight = Lv > 0.5;
      if (isNight !== night) { night = isNight; host.classList.toggle('night', isNight); }
      updateCamera(dt);
      drawDynamic(dt);
      const sky = mix3(DAY.sky, NIGHT.sky, Lv), grd = mix3(DAY.ground, NIGHT.ground, Lv), bg = mix3(DAY.bg, NIGHT.bg, Lv);
      engine.render({ vp, eye, light: LIGHT, sun: mix3(DAY.sun, NIGHT.sun, Lv), sky, ground: grd, fog: bg, fogK: 0.012, bg, shadows, layers: [statL, dyn, peopleL, ghostL, carryGhostL, glowL, hiL] });
      updateLabels();
      frameErrors = 0;
    } catch (err) {                                              // một khung lỗi không được làm đứng cả cảnh: ghi lại, vẽ tiếp; lỗi liên tục thì chuyển sang chế độ dự phòng
      if (frameErrors++ < 3) console.error('office_gl: lỗi khi vẽ khung hình', err);
      if (frameErrors > 30) { dead = true; opts.onFail?.('error'); return; }
    }
    raf = requestAnimationFrame(frame);
  }

  /* ---------- kích thước ---------- */
  function resize() {
    const r = host.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * perfScale;
    view.w = r.width; view.h = r.height; view.dpr = dpr;
    engine.resize(Math.round(r.width * dpr), Math.round(r.height * dpr));
    if (!focus) { T.dist = fitBox(W + 14, D + 16, T.pitch, T.yaw, 5); if (!resized) C.dist = T.dist; } else focusRoom(focus);
    resized = true;
  }
  let resized = false;
  const ro = new ResizeObserver(resize); ro.observe(host);

  /* ---------- chuột, cảm ứng, bàn phím ---------- */
  const ptr = new Map();
  let drag = null;
  function ray(sx, sy, S) {
    let m = vp, o = eye;
    if (S) { m = mat4.create(); o = [0, 0, 0]; camOf(S, m, o); }
    const nx = sx / view.w * 2 - 1, ny = 1 - sy / view.h * 2;
    if (!mat4.invert(inv, m)) return null;
    const un = z => { const q = mat4.transform(inv, [nx, ny, z]); return [q[0] / q[3], q[1] / q[3], q[2] / q[3]]; };
    const a = un(-1), b = un(1);
    return { o: [o[0], o[1], o[2]], d: v3.norm(v3.sub(b, a)) };
  }
  // Tìm người gần tia chuột nhất: mỗi người là một đoạn thẳng đứng, lấy khoảng cách giữa tia và đoạn đó.
  function pickPerson(r) {
    let best = null, bt = 1e9;
    for (const p of people) {
      const a = [p.P.x, FL + 0.25, p.P.z], b = [p.P.x, FL + 1.55, p.P.z];
      const u = v3.sub(b, a), w0 = v3.sub(a, r.o);                  // w0 = điểm đầu đoạn thẳng trừ gốc tia
      const uu = v3.dot(u, u), ud = v3.dot(u, r.d), uw = v3.dot(u, w0), dw = v3.dot(r.d, w0);
      const den = uu - ud * ud; if (Math.abs(den) < 1e-9) continue;   // tia song song với đoạn thẳng
      const s = clamp((ud * dw - uw) / den, 0, 1);                      // vị trí gần nhất trên đoạn thẳng
      const tt = dw + ud * s;                                           // vị trí tương ứng trên tia
      if (tt < 0) continue;
      const c1 = v3.add(a, v3.scale(u, s)), c2 = v3.add(r.o, v3.scale(r.d, tt));
      if (v3.len(v3.sub(c1, c2)) < 0.6 && tt < bt) { bt = tt; best = p; }
    }
    return best;
  }
  function pickRoom(r) {
    if (r.d[1] >= -1e-4) return null;
    const t = (FL - r.o[1]) / r.d[1], x = r.o[0] + r.d[0] * t, z = r.o[2] + r.d[2] * t;
    return B.rooms.find(R => x >= R.x0 - 0.2 && x <= R.x0 + R.w + 0.2 && z >= R.z0 - 0.2 && z <= R.z0 + R.d + 0.2) || null;
  }
  const rect = () => canvas.getBoundingClientRect();
  const onDown = e => {
    canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.button === 2 || e.button === 1 || e.shiftKey, t: performance.now(), pinch: 0 };
  };
  const onMove = e => {
    const r = rect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const prev = ptr.get(e.pointerId);
    if (!prev || !drag) {
      const rr = ray(sx, sy), hit = rr && (pickPerson(rr) || pickRoom(rr));
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (ptr.size >= 2) {                                         // hai ngón: chụm để zoom
      const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (drag.pinch) T.dist = clamp(T.dist * (drag.pinch / d), 4, 230);
      drag.pinch = d; return;
    }
    canvas.style.cursor = 'grabbing';
    if (drag.pan) {
      const k = T.dist * 0.0016, cy = Math.cos(T.yaw), sy2 = Math.sin(T.yaw);
      T.x += -dx * k * cy + dy * k * -sy2; T.z += dx * k * sy2 + dy * k * -cy;
      T.x = clamp(T.x, -45, W + 45); T.z = clamp(T.z, -30, D + 45);
    } else { T.yaw -= dx * 0.006; T.pitch = clamp(T.pitch + dy * 0.005, 0.14, 1.5); }
  };
  const onUp = e => {
    ptr.delete(e.pointerId);
    if (!drag) return;
    const click = drag.moved < 6 && performance.now() - drag.t < 450 && e.button === 0 && ptr.size === 0;
    drag = ptr.size ? drag : null;
    if (!click) return;
    const r = rect(), rr = ray(e.clientX - r.left, e.clientY - r.top); if (!rr) return;
    const person = pickPerson(rr);
    if (person) return opts.onPickAgent?.(person.ref);
    const room = pickRoom(rr);
    if (room) { if (room !== focus) focusRoom(room); }
    else if (focus) overview();
  };
  // Zoom hướng về chỗ con trỏ: điểm trên sàn dưới con trỏ giữ nguyên vị trí trên màn hình.
  const onWheel = e => {
    e.preventDefault();
    const nd = clamp(T.dist * Math.exp(e.deltaY * 0.0012), 4, 230), f = nd / T.dist;
    const r = rect(), rr = ray(e.clientX - r.left, e.clientY - r.top, T);
    if (rr && rr.d[1] < -1e-4) {
      const t = (FL + 0.9 - rr.o[1]) / rr.d[1], hx = rr.o[0] + rr.d[0] * t, hz = rr.o[2] + rr.d[2] * t;
      T.x = clamp(hx + (T.x - hx) * f, -45, W + 45); T.z = clamp(hz + (T.z - hz) * f, -30, D + 45);
    }
    T.dist = nd;
  };
  const onKey = e => { if (e.key === 'Escape' && focus) overview(); };
  const onLost = e => { e.preventDefault(); opts.onFail?.(new Error('Mất kết nối với card đồ họa.')); };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('webglcontextlost', onLost);
  window.addEventListener('keydown', onKey);

  sync();
  resize(); overview(true);
  raf = requestAnimationFrame(frame);

  return {
    kind: 'webgl', sync, handoff,
    pickAt(sx, sy) { const r = ray(sx, sy); if (!r) return null; const p = pickPerson(r), R = pickRoom(r); return { person: p?.ref.name || null, room: R?.code || null }; },
    zoom: code => { const R = code && roomOf.get(code); if (R) focusRoom(R); else overview(); },
    zoomedCode: () => focus?.code || null,
    setLight(m) { lightMode = m; store.set('light3d', m); },
    getLight: () => lightMode,
    setShadows(on) { shadows = !!on && engine.fboOk; store.set('shadow3d', shadows ? 'on' : 'off'); },
    getShadows: () => shadows,
    setAutoQuality(on) { autoQuality = !!on; },
    perf: () => ({ scale: perfScale, shadows, ema: +ema.toFixed(4), slowFor: +slowFor.toFixed(2), auto: autoQuality, age: Math.round(performance.now() - born) }),
    rooms: () => B.rooms.map(r => ({ code: r.code, work: r.work, total: r.total })),
    setAmbient(on) { director.ambient = !!on; },
    advance(sec) { for (let t = 0; t < sec; t += 0.05) { now += 0.05; director.update(0.05); consumeEvents(); } },   // tua nhanh mô phỏng (kiểm thử)
    lookAt(x, z, dist = 12) { focus = null; host.classList.remove('focused'); Object.assign(T, { x, z, y: 1, dist, pitch: 0.8 }); opts.onZoom?.(null); },
    summary: () => director.summary(),
    director,
    debug: () => ({ load: director.load, papers: papers.length, borrowers: people.filter(p => p.borrowAt).map(p => ({ name: p.ref.name, at: p.borrowAt, key: p.borrowKey, mode: p.mode })), couriers: people.filter(p => p.courier).map(p => ({ name: p.ref.name, mode: p.mode, jobs: p.courierJobs.length, active: p.courierActive })), queued: B.rooms.filter(r => r.queued).map(r => [r.code, r.queued]), ghost: ghostL.count(), carryGhost: carryGhostL.count(), glow: glowL.count(), hi: hiL.count(), light: Lv, roomsScreen: B.rooms.map(r => ({ code: r.code, s: project([r.cx, FL, r.cz]) })), heads: people.map(p => ({ id: p.ref.id, name: p.ref.name, room: p.room.code, mode: p.mode, say: p.say?.text || null, hold: p.P.hold, act: p.P.act, pos: [p.P.x, p.P.z], s: project(headPos(p.P)) })), static: statL.count(), dynamic: dyn.count() + peopleL.count(), glError: engine.error(), shadowMap: engine.fboOk, dist: C.dist, people: people.length }),
    destroy() {
      dead = true; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', onKey);
      layer.remove(); stat.remove(); pills.remove(); canvas.remove(); engine.dispose();
    }
  };
}
