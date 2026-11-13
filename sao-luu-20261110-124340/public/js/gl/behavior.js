// Hành vi của nhân viên: đứng dậy, đi qua hành lang, uống cà phê, trò chuyện, họp, mang hồ sơ sang phòng khác.
// Thuần logic (không DOM, không GL) nên kiểm thử được ngoài trình duyệt.
import { FL, SEAT_BACK, CORR_Z, V_X, DOOR_DX, PANTRIES, MEET_SEATS, aisleOf, corrOf } from './building.js';
import { makeLook, seeded } from './people.js';

const ease = k => k * k * (3 - 2 * k);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const COURIER_BACKLOG = 3;         // mỗi điều phối viên nhận tối đa 3 chuyến (kể cả chuyến đang đi); dư thì gửi điện tử
const COURIER_STALE = 45;          // chuyến chờ quá 45 giây thì chuyển sang gửi điện tử để hồ sơ không đến muộn so với công việc
const turn = (a, b, maxStep) => a + clamp(angDiff(a, b), -maxStep, maxStep);

/* ---------- tạo người từ dữ liệu toà nhà ---------- */
export function createPeople(B, agents, colors = {}, seed = 1) {
  const people = [], rand = seeded(seed);
  for (const room of B.rooms) {
    const slots = B.slots.filter(s => s.room === room.code);
    const list = room.code === 'CEO' ? [{ id: -1, name: 'CEO (bạn)', ceo: true, isLead: true }]
      : agents.filter(a => a.deptCode === room.code).sort((a, b) => (b.isLead ? 1 : 0) - (a.isLead ? 1 : 0));
    list.forEach((ag, i) => {
      const slot = slots[i]; if (!slot) return;
      const look = makeLook(ag.id > 0 ? ag.id : 99, colors[room.code] || '#6d5ef0', !!ag.ceo);
      if (!ag.ceo) look.lead = !!ag.isLead;
      const seat = { x: slot.x, z: slot.z - SEAT_BACK }, xa = room.x0 + aisleOf(room.def, slot.x - room.x0);
      const p = {
        ref: ag, room, slot, seat, xa, mode: 'seated', queue: [], cur: null, pending: [], script: null, at: null,
        P: { x: seat.x, y: FL, z: seat.z, heading: 0, pose: 'sit', sit: 1, walk: 0, t: rand() * 10, work: false, look, speed: 1.35, act: null, actAmt: 0, hold: null },
        chair: { out: 0, side: seat.x >= xa ? 1 : -1 }, say: null, wantAct: null, nextAct: 4 + rand() * 25, nextMicro: 5 + rand() * 10,
        courier: !!ag.courier, courierJobs: [], curJob: null, courierActive: false, returningHome: false, borrowWant: null, borrowAt: null, borrowSeat: null, borrowKey: null,
        engaged: 0, pace: 0.9 + rand() * 0.2, laneOff: (i % 3 - 1) * 0.28 + (rand() - 0.5) * 0.08, lookTo: 0, lookLeft: 0, meeting: false, task: null
      };
      p.at = { t: 'seat', p };
      people.push(p);
    });
  }
  return people;
}

/* ---------- đường đi ---------- */
// Chỗ (place): { t:'seat', p } | { t:'spot', R, xa, z } | { t:'chair', seat } | { t:'pantry', k, i }
const posOf = pl => pl.t === 'seat' ? [pl.p.seat.x, pl.p.seat.z] : pl.t === 'spot' ? [pl.xa, pl.z] : pl.t === 'chair' ? [pl.seat.x, pl.seat.z] : PANTRIES[pl.k].spots[pl.i].slice();

// Các điểm đi từ một chỗ ra hành lang ngang. Phần tử đầu là điểm sát chỗ đó, phần tử cuối nằm trên trục giữa hành lang. c = chỉ số hành lang (0 = C1, 1 = C2).
function exitOf(pl) {
  if (pl.t === 'pantry') { const P = PANTRIES[pl.k], sp = P.spots[pl.i]; return { pts: [sp.slice(), [sp[0], CORR_Z[P.corr]]], c: P.corr }; }
  if (pl.t === 'chair') { const a = pl.seat.approach; return { pts: [...a.map(p => p.slice()), [a[a.length - 1][0], CORR_Z[0]]], c: 0 }; }
  const R = pl.t === 'seat' ? pl.p.room : pl.R, xa = pl.t === 'seat' ? pl.p.xa : pl.xa, z = pl.t === 'seat' ? pl.p.seat.z : pl.z, row = R.def.row, c = corrOf(row);
  const pts = [[xa, z]];
  if (row < 2) pts.push([xa, R.z0 + R.d + 0.5], [xa, CORR_Z[c]]);                           // hàng 0 và 1: mở về phía nam, ra thẳng hành lang
  else { const dx = R.x0 + DOOR_DX; pts.push([xa, R.z0 + 0.9], [dx, R.z0 + 0.9], [dx, R.z0 - 0.5], [dx, CORR_Z[c]]); }   // hàng 2: ra cửa ở tường bắc
  return { pts, c };
}
const roomOfPlace = pl => pl.t === 'seat' ? pl.p.room : pl.t === 'spot' ? pl.R : null;
export function route(from, to, off = 0) {
  const start = posOf(from), rf = roomOfPlace(from), rt = roomOfPlace(to);
  let pts;
  const xaF = from.t === 'seat' ? from.p.xa : from.xa, xaT = to.t === 'seat' ? to.p.xa : to.xa;
  if (rf && rt && rf === rt && xaF === xaT) pts = [[xaF, start[1]], exitOf(to).pts[0]];      // cùng phòng, cùng lối đi: đi thẳng theo lối
  else {
    const a = exitOf(from), b = exitOf(to), aE = a.pts[a.pts.length - 1], bE = b.pts[b.pts.length - 1], za = CORR_Z[a.c] + off, zb = CORR_Z[b.c] + off;
    let mid;
    if (a.c === b.c) mid = [[aE[0], za], [bE[0], zb]];
    else {                                                                                   // khác hành lang: đi qua hành lang dọc gần nhất
      const xv = V_X.reduce((u, v) => Math.abs(aE[0] - v) + Math.abs(bE[0] - v) < Math.abs(aE[0] - u) + Math.abs(bE[0] - u) ? v : u);
      mid = [[aE[0], za], [xv + off, za], [xv + off, zb], [bE[0], zb]];
    }
    pts = [...a.pts.slice(0, -1), ...mid, ...b.pts.slice(0, -1).reverse()];
  }
  const out = []; let last = start;
  for (const p of pts) { if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.05) { out.push(p); last = p; } }
  return out;
}
export const pathLength = (start, pts) => { let n = 0, l = start; for (const p of pts) { n += Math.hypot(p[0] - l[0], p[1] - l[1]); l = p; } return n; };

/* ---------- bộ điều phối ---------- */
export class Director {
  constructor({ people, slots = [], rooms = [], rng = Math.random, getSpeed = () => 1, maxAway = null, ambient = true }) {
    this.ambient = ambient; this.quiet = 0; this.wantMeeting = false;
    this.load = { runs: 0, queued: 0, working: 0 };         // tải hiện tại của công ty (do giao diện cập nhật mỗi nhịp)
    this.busyRooms = new Set();                              // các phòng đang có việc làm hoặc việc chờ: người trong phòng không đi dạo
    this.roomByCode = new Map(rooms.map(r => [r.code, r]));
    this.slotsByRoom = new Map(); for (const sl of slots) { if (!this.slotsByRoom.has(sl.room)) this.slotsByRoom.set(sl.room, []); this.slotsByRoom.get(sl.room).push(sl); }
    this.slotUse = new Map();                                // 'mã phòng:số bàn' -> người đang mượn bàn trống đó
    this.people = people; this.rng = rng; this.getSpeed = getSpeed; this.now = 0;
    this.byAgent = new Map(people.map(p => [p.ref.id, p]));
    this.byRoom = new Map(); for (const p of people) { if (!this.byRoom.has(p.room.code)) this.byRoom.set(p.room.code, []); this.byRoom.get(p.room.code).push(p); }
    this.pantryTaken = new Map(); this.meeting = null; this.nextMeeting = 35 + rng() * 30;
    this.maxAway = maxAway ?? Math.max(3, Math.round(people.length * 0.3));
    this.couriers = people.filter(p => p.courier);
    this.events = [];                      // hàng chờ sự kiện cho giao diện: { type: 'arrive' | 'delivered', ... }
  }
  rand(a, b) { return a + this.rng() * (b - a); }
  seatPlace(p) { return { t: 'seat', p }; }
  away() { return this.people.filter(p => (p.mode !== 'seated' && !(p.mode === 'table' && p.borrowAt && !p.cur)) || (p.script && !['micro', 'phone'].includes(p.script.kind) && (p.cur || p.queue.length))).length; }   // người đang ngồi làm ở bàn mượn không tính là đi lại
  speedMul() { return clamp(this.getSpeed() * 0.75, 1, 3); }
  setSay(p, text, sec = 2.2) { p.say = { text, left: sec }; }

  /* --- dựng kịch bản --- */
  sitBack(p, chair = true) { return [{ k: 'sit', x: p.seat.x, z: p.seat.z, h: 0, chair }, { k: 'at', place: this.seatPlace(p) }]; }
  walkTo(p, from, to) { return { k: 'walk', pts: route(from, to, p.laneOff), dest: to }; }
  spotNear(partner) { return { t: 'spot', R: partner.room, xa: partner.xa, z: partner.seat.z, face: [partner.seat.x, partner.seat.z] }; }
  start(p, steps, kind, cancellable) { p.queue = steps; p.script = { kind, cancellable }; }

  coffee(p) {
    const free = [];                                           // các chỗ đứng còn trống ở cả hai quầy, ưu tiên quầy cùng hành lang với phòng mình
    PANTRIES.forEach((P, k) => P.spots.forEach((_, i) => { if (!this.pantryTaken.has(`${k}:${i}`)) free.push({ k, i, near: P.corr === corrOf(p.room.def.row) }); }));
    if (!free.length) return false;
    const near = free.filter(f => f.near), pool = near.length && this.rng() < 0.75 ? near : free;
    const { k, i } = pool[Math.floor(this.rng() * pool.length)], pl = { t: 'pantry', k, i }, here = this.seatPlace(p), key = `${k}:${i}`;
    this.pantryTaken.set(key, p);
    this.start(p, [{ k: 'rise' }, this.walkTo(p, here, pl), { k: 'face', h: PANTRIES[k].face }, { k: 'carry', item: 'cup' },
      { k: 'wait', t: this.rand(5, 8), act: 'sip', emoji: '☕', repeat: 2.6 }, { k: 'call', fn: () => { if (this.pantryTaken.get(key) === p) this.pantryTaken.delete(key); } }, { k: 'carry', item: null },
      this.walkTo(p, pl, here), ...this.sitBack(p)], 'coffee', true);
    return true;
  }
  chat(p) {
    const cands = this.people.filter(q => q !== p && q.mode === 'seated' && !q.cur && !q.queue.length && !q.engaged && !q.P.work && !q.pending.length);
    if (!cands.length) return false;
    const same = cands.filter(q => q.room === p.room), pool = same.length && this.rng() < 0.6 ? same : cands;
    const q = pool[Math.floor(this.rng() * pool.length)], spot = this.spotNear(q), here = this.seatPlace(p), dur = this.rand(6, 10);
    q.engaged = dur + 4;
    this.start(p, [{ k: 'rise' }, this.walkTo(p, here, spot), { k: 'face', to: spot.face },
      { k: 'call', fn: () => { q.wantAct = 'talk'; q.engaged = dur + 1; this.setSay(q, '💬', dur); } },
      { k: 'wait', t: dur, act: 'talk', emoji: '💬' }, { k: 'call', fn: () => { if (q.wantAct === 'talk') q.wantAct = null; q.engaged = 0; } },
      this.walkTo(p, spot, here), ...this.sitBack(p)], 'chat', true);
    return true;
  }
  stretch(p) { this.start(p, [{ k: 'rise' }, { k: 'wait', t: this.rand(3, 4.5), act: 'stretch', emoji: '💪' }, ...this.sitBack(p)], 'stretch', true); return true; }
  phone(p) { this.start(p, [{ k: 'carry', item: 'phone' }, { k: 'wait', t: this.rand(4, 7), act: 'phone', emoji: '📱' }, { k: 'carry', item: null }], 'phone', true); return true; }
  wander(p) {
    const others = this.people.filter(q => q.room !== p.room), q = others[Math.floor(this.rng() * others.length)]; if (!q) return false;
    const spot = this.spotNear(q), here = this.seatPlace(p);
    this.start(p, [{ k: 'rise' }, this.walkTo(p, here, spot), { k: 'face', to: spot.face }, { k: 'wait', t: this.rand(2.5, 4), act: null, emoji: '👀' }, this.walkTo(p, spot, here), ...this.sitBack(p)], 'wander', true);
    return true;
  }
  handOver(p, q, toCode, onHand) {                          // người p đưa hồ sơ cho q (trưởng phòng toCode): hiện 📥, phát sự kiện cho giao diện
    this.setSay(q, '📥', 2); this.events.push({ type: 'handed', from: p.ref.id, to: q.ref.id, room: toCode }); onHand?.(p, q);
  }
  // Giao hồ sơ: người gửi đứng dậy, cầm hồ sơ đi tới chỗ trưởng phòng nhận việc, đưa, rồi về chỗ.
  errand({ agentId = null, toCode, color = '#4a7bd0', label = null, onHand = null }) {
    const p = agentId == null ? this.byAgent.get(-1) : this.byAgent.get(agentId), list = this.byRoom.get(toCode);
    if (!p || !list || !list.length) return false;
    const q = list[0]; if (q === p) return false;
    if (this.onBorrowDuty(p)) return false;                        // đang ngồi, sắp sang hoặc đang đi tới bàn mượn: để điều phối viên lo, không tự đi
    if (p.pending.length >= 3) return false;                      // tốc độ cao: không dồn quá nhiều chuyến giao hồ sơ
    const spot = this.spotNear(q), here = this.seatPlace(p);
    p.pending.push({ kind: 'errand', cancellable: false, steps: [{ k: 'rise' }, { k: 'carry', item: 'folder', color, label, dest: toCode, target: [spot.xa, spot.z] }, { k: 'emoji', text: '📄' }, this.walkTo(p, here, spot),
      { k: 'face', to: spot.face }, { k: 'wait', t: 1.6, act: 'hand', hold: true }, { k: 'call', fn: () => this.handOver(p, q, toCode, onHand) },
      { k: 'carry', item: null }, this.walkTo(p, spot, here), ...this.sitBack(p)], job: { toCode, color, label } });
    if (p.script?.cancellable) p.wantReturn = true;
    return true;
  }
  // Điều phối: lúc vắng (≤ 1 việc) người vừa làm xong tự mang hồ sơ cho sinh động; lúc bận điều phối viên đi nhận tại bàn người gửi rồi giao tận nơi.
  // Điều phối viên chỉ nhận thêm khi hàng chờ còn ngắn; hồ sơ dư (hoặc chờ quá lâu) được GỬI ĐIỆN TỬ: không ai đi lại, giao diện chỉ hiện một tờ giấy bay.
  // Trả về 'sender' | 'courier' | 'digital' | false.
  dispatch({ senderId = null, fromCode, toCode, color = '#4a7bd0', label = null }) {
    const sender = fromCode === 'CEO' ? this.byAgent.get(-1) : this.byAgent.get(senderId);
    const calm = this.load.runs <= 1 && this.getSpeed() <= 1, args = { agentId: sender && sender.ref.id > 0 ? sender.ref.id : null, toCode, color, label };
    if (calm && sender && !sender.courier && !sender.P.work && !this.onBorrowDuty(sender) && this.errand(args)) return 'sender';
    const c = this.pickCourier();
    if (c && sender && sender !== c) { c.courierJobs.push({ sender, toCode, color, label, t0: this.now }); this.kickCourier(c); return 'courier'; }
    return this.electronic(sender, toCode, color, label) ? 'digital' : false;
  }
  electronic(sender, toCode, color, label) {                 // gửi qua hệ thống: người gửi hiện 📤, trưởng phòng nhận hiện 📥, giao diện vẽ tờ giấy bay giữa hai bàn
    const q = (this.byRoom.get(toCode) || [])[0]; if (!sender || !q || q === sender) return false;
    const own = this.seatOwner(sender);
    this.setSay(sender, '📤', 2); this.setSay(q, '📥', 2.4);
    this.events.push({ type: 'handed', from: sender.ref.id, to: q.ref.id, room: toCode, digital: true, color, label, at: [own.seat.x, own.seat.z], dest: [q.seat.x, q.seat.z] });
    return true;
  }
  pickCourier() {
    let best = null, n = 99;
    for (const c of this.couriers) { const load = c.courierJobs.length + (c.curJob ? 1 : 0); if (load < COURIER_BACKLOG && load < n) { best = c; n = load; } }
    return best;
  }
  kickCourier(c) {
    if (c.courierActive) return;
    c.courierActive = true;
    if (c.returningHome && c.cur?.k === 'walk') { c.queue = [{ k: 'chain' }]; c.returningHome = false; return; }      // đang trên đường về bàn thì quay lại nhận việc luôn
    c.pending.push({ kind: 'courier', cancellable: false, steps: [{ k: 'rise' }, { k: 'chain' }] });
    if (c.script?.cancellable) c.wantReturn = true;
  }
  courierSteps(c, job) {                                      // một chuyến: tới bàn người gửi nhận hồ sơ, rồi giao cho trưởng phòng nhận
    const q = (this.byRoom.get(job.toCode) || [])[0]; if (!q) return [];
    const own = this.seatOwner(job.sender), from = { t: 'spot', R: own.room, xa: own.xa, z: own.seat.z, face: [own.seat.x, own.seat.z] }, to = this.spotNear(q);
    return [this.walkTo(c, c.at, from), { k: 'face', to: from.face }, { k: 'call', fn: () => this.setSay(job.sender, '📤', 2) }, { k: 'wait', t: 0.9, act: 'hand' },
      { k: 'carry', item: 'folder', color: job.color, label: job.label, dest: job.toCode, target: [to.xa, to.z] }, this.walkTo(c, from, to), { k: 'face', to: to.face },
      { k: 'wait', t: 1.6, act: 'hand' }, { k: 'call', fn: () => { this.handOver(c, q, job.toCode); c.curJob = null; } }, { k: 'carry', item: null }, { k: 'chain' }];
  }
  chain(c) {                                                  // hết một chuyến: nhận chuyến kế tiếp ngay tại chỗ, hết việc thì về bàn
    let job;
    while ((job = c.courierJobs.shift())) {
      if (this.now - job.t0 > COURIER_STALE) { this.electronic(job.sender, job.toCode, job.color, job.label); continue; }   // chờ quá lâu: gửi điện tử cho kịp
      const steps = this.courierSteps(c, job); if (steps.length) { c.curJob = job; c.queue.unshift(...steps); return; }
    }
    c.curJob = null; c.courierActive = false; c.returningHome = true;
    c.queue.unshift(this.walkTo(c, c.at, this.seatPlace(c)), ...this.sitBack(c), { k: 'call', fn: () => { c.returningHome = false; } });
  }

  /* --- mượn người: sang ngồi bàn trống ở phòng đang quá tải, xong việc thì về --- */
  makeSeatOwner(room, slot) { return { room, seat: { x: slot.x, z: slot.z - SEAT_BACK }, xa: room.x0 + aisleOf(room.def, slot.x - room.x0), slot }; }
  onBorrowDuty(p) { return !!(p.borrowAt || p.borrowWant || p.script?.kind === 'borrow'); }    // đang ngồi ở bàn mượn, sắp sang, hoặc đang trên đường đi
  seatOwner(p) { return p.borrowAt && p.borrowSeat ? p.borrowSeat : p; }        // chỗ ngồi hiện tại: bàn nhà hoặc bàn mượn
  setBorrow(p, code) { p.borrowWant = code || null; }
  freeSlot(code) {
    const home = (this.byRoom.get(code) || []).length;
    for (const sl of this.slotsByRoom.get(code) || []) if (sl.idx >= home && !this.slotUse.has(`${code}:${sl.idx}`)) return sl;
    return null;
  }
  deskUser(sl, homePerson) {                                  // ai đang ngồi ở bàn này (để màn hình bàn sáng đúng người)
    const b = this.slotUse.get(`${sl.room}:${sl.idx}`);
    if (b) return b.mode === 'table' && b.borrowAt === sl.room ? b : null;
    return homePerson && homePerson.mode === 'seated' ? homePerson : null;
  }
  tickBorrow(p) {
    if ((p.borrowWant || null) === (p.borrowAt || null)) return false;
    if (p.cur || p.queue.length || p.pending.length) return false;
    const want = p.borrowWant || null; let toOwner = p, slot = null;
    if (want) { slot = this.freeSlot(want); if (!slot) return false; toOwner = this.makeSeatOwner(this.roomByCode.get(want), slot); }
    const from = { t: 'seat', p: this.seatOwner(p) }, to = { t: 'seat', p: toOwner }, key = want ? `${want}:${slot.idx}` : null;
    if (p.borrowKey) this.slotUse.delete(p.borrowKey);
    if (key) this.slotUse.set(key, p);
    p.borrowKey = key;
    this.start(p, [{ k: 'rise', chair: p.borrowAt ? false : undefined }, this.walkTo(p, from, to), { k: 'sit', x: toOwner.seat.x, z: toOwner.seat.z, h: 0, chair: !want },
      { k: 'call', fn: () => { p.borrowAt = want; p.borrowSeat = want ? toOwner : null; } }, { k: 'at', place: to }], 'borrow', false);
    return true;
  }

  // Họp ở bàn họp phòng 01: 3 đến 6 người đang rảnh cùng đi tới, ngồi bàn rồi về.
  startMeeting() {
    if (this.meeting) return false;
    const el = this.people.filter(p => p.mode === 'seated' && !p.cur && !p.queue.length && !p.pending.length && !p.engaged && !p.P.work && !p.courier && !p.borrowWant && !p.borrowAt && !this.busyRooms.has(p.room.code));       // người ở phòng đang có việc không bị gọi đi họp
    if (el.length < 3) return false;
    const n = Math.min(MEET_SEATS.length, 3 + Math.floor(this.rng() * 4)), members = [];
    // ưu tiên người ngồi gần phòng họp (đi bộ ngắn), chọn ngẫu nhiên trong nhóm gần nhất
    const dist = p => Math.hypot(p.seat.x - 4.2, p.seat.z - 5.2) + (p.room.def.row === 0 ? 0 : 14 * p.room.def.row);
    const pool = el.sort((a, b) => dist(a) - dist(b)).slice(0, Math.max(n + 3, 9)); while (members.length < Math.min(n, pool.length)) members.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
    const seats = MEET_SEATS.slice().sort(() => this.rng() - 0.5), dur = this.rand(22, 34);
    this.meeting = { left: members.length, members };
    members.forEach((p, i) => {
      const seat = seats[i], cp = { t: 'chair', seat }, here = this.seatPlace(p), talk = [];
      for (let t = 0; t < dur; t += 6) talk.push({ k: 'wait', t: 3.2, act: 'talk' }, { k: 'wait', t: 2.8, act: null });
      this.start(p, [{ k: 'wait', t: i * 0.9 + 0.1, act: null }, { k: 'rise' }, this.walkTo(p, here, cp), { k: 'sit', x: seat.x, z: seat.z, h: seat.h, chair: false },
        { k: 'meet', on: true }, ...talk, { k: 'meet', on: false }, { k: 'rise', chair: false }, this.walkTo(p, cp, here), ...this.sitBack(p),
        { k: 'call', fn: () => { if (this.meeting && --this.meeting.left <= 0) this.meeting = null; } }], 'meeting', true);
    });
    return true;
  }
  recallAll(quietSec = 0) {
    this.quiet = quietSec; this.wantMeeting = false;
    for (const p of this.people) {
      p.pending.length = 0;
      if (p.cur || p.queue.length || p.mode !== 'seated') { p.wantReturn = true; p.script = { ...(p.script || { kind: 'recall' }), cancellable: true }; }
    }
  }

  /* --- chạy từng bước --- */
  returnScript(p) {
    if (p.P.hold === 'folder') { p.P.hold = null; p.carryLabel = p.carryDest = p.carryTarget = null; }          // bị gọi về giữa đường: bỏ hồ sơ
    for (const [i, q] of [...this.pantryTaken]) if (q === p) this.pantryTaken.delete(i);
    p.meeting = false;
    const at = p.at || this.seatPlace(p);
    if (p.mode === 'table') return [{ k: 'rise', chair: false }, this.walkTo(p, at, this.seatPlace(p)), ...this.sitBack(p)];
    if (at.t === 'seat' && at.p === p) return p.mode === 'seated' ? [] : [{ k: 'sit', x: p.seat.x, z: p.seat.z, h: 0, chair: true }, { k: 'at', place: this.seatPlace(p) }];
    return [this.walkTo(p, at, this.seatPlace(p)), ...this.sitBack(p)];
  }
  runStep(p, st, dt) {
    const P = p.P;
    switch (st.k) {
      case 'rise': {
        st.e = (st.e || 0) + dt; const k = clamp(st.e / 0.55, 0, 1);
        P.sit = 1 - ease(k); if (st.chair !== false) p.chair.out = ease(k);
        if (k >= 1) { p.mode = 'away'; return true; } return false;
      }
      case 'walk': {
        if (st.i === undefined) st.i = 0;
        if (st.i >= st.pts.length) { if (st.dest) p.at = st.dest; return true; }
        P.walk = Math.min(1, P.walk + dt * 6);
        const tg = st.pts[st.i], dx = tg[0] - P.x, dz = tg[1] - P.z, dist = Math.hypot(dx, dz);
        if (dist > 0.02) {
          const want = Math.atan2(dx, dz); P.heading = turn(P.heading, want, dt * 9);
          const mv = Math.min(dist, P.speed * dt * (Math.abs(angDiff(P.heading, want)) > 1.2 ? 0.25 : 1));
          P.x += dx / dist * mv; P.z += dz / dist * mv;
        }
        if (Math.hypot(tg[0] - P.x, tg[1] - P.z) < 0.04) st.i++;
        if (st.i >= st.pts.length) { if (st.dest) p.at = st.dest; return true; }
        return false;
      }
      case 'face': {
        st.e = (st.e || 0) + dt;
        const h = st.to ? Math.atan2(st.to[0] - P.x, st.to[1] - P.z) : st.h;
        P.heading = turn(P.heading, h, dt * 7);
        return Math.abs(angDiff(P.heading, h)) < 0.05 || st.e > 0.9;
      }
      case 'wait': {
        if (st.e === undefined) {
          st.e = 0; p.wantAct = st.act; if (st.emoji) this.setSay(p, st.emoji, Math.min(st.t, 2.4));
        }
        st.e += dt;
        if (st.repeat && st.e > st.repeat && st.e < st.t) { st.repeat += 2.6; if (st.emoji) this.setSay(p, st.emoji, 1.6); }
        if (st.e >= st.t) { if (p.wantAct === st.act) p.wantAct = null; return true; }
        return false;
      }
      case 'sit': {
        if (st.e === undefined) { st.e = 0; st.x0 = P.x; st.z0 = P.z; st.h0 = P.heading; p.mode = 'away'; }
        st.e += dt; const k = clamp(st.e / 0.6, 0, 1), e = ease(k);
        P.x = st.x0 + (st.x - st.x0) * e; P.z = st.z0 + (st.z - st.z0) * e; P.heading = st.h0 + angDiff(st.h0, st.h) * e;
        P.sit = e; if (st.chair !== false) p.chair.out = 1 - e;
        P.walk = Math.max(0, P.walk - dt * 6);
        if (k >= 1) { P.x = st.x; P.z = st.z; P.heading = st.h; P.sit = 1; p.mode = st.chair === false ? 'table' : 'seated'; return true; }
        return false;
      }
      case 'carry': { P.hold = st.item; if (st.color) P.holdColor = st.color; p.carryLabel = st.item ? (st.label || null) : null; p.carryDest = st.item ? (st.dest || null) : null; p.carryTarget = st.item ? (st.target || null) : null; return true; }
      case 'emoji': this.setSay(p, st.text, 2.4); return true;
      case 'meet': p.meeting = st.on; return true;
      case 'chain': this.chain(p); return true;
      case 'call': st.fn?.(); return true;
      case 'at': p.at = st.place; return true;
      default: return true;
    }
  }

  /* --- mỗi khung hình --- */
  update(dt) {
    this.now += dt;
    const sm = this.speedMul();
    for (const p of this.people) {
      const P = p.P;
      P.speed = 1.35 * sm * p.pace * (p.courier && p.courierActive ? 1 + 0.15 * Math.min(3, p.courierJobs.length) : 1);   // điều phối viên tăng tốc khi còn nhiều hồ sơ chờ
      if (p.say && (p.say.left -= dt) <= 0) p.say = null;
      if (p.engaged > 0) p.engaged = Math.max(0, p.engaged - dt);

      if (P.work && p.script?.cancellable && !p.wantReturn && (p.cur || p.queue.length)) p.wantReturn = true;   // có việc thì về bàn
      if (!p.cur && p.queue.length) p.cur = p.queue.shift();
      if (p.cur) {
        if (p.wantReturn && p.cur.k === 'wait') p.cur.t = Math.min(p.cur.t, (p.cur.e || 0) + 0.2);
        if (this.runStep(p, p.cur, dt)) {
          p.cur = null;
          if (p.wantReturn && p.script?.cancellable) { p.wantReturn = false; p.queue = this.returnScript(p); p.script = { kind: 'return', cancellable: false }; }
          else if (p.wantReturn && !p.script?.cancellable) p.wantReturn = false;
        }
      } else if (p.mode === 'table' && !p.meeting) {                 // đang ngồi ở bàn mượn: việc được giao cho người này (hồ sơ) hoặc quay về bàn nhà
        if (p.script?.kind === 'borrow') p.script = null;
        if (p.pending.length) {
          const sc = p.pending.shift();
          if (sc.job) { const c = this.pickCourier(); if (c) { c.courierJobs.push({ sender: p, ...sc.job }); this.kickCourier(c); } }   // chuyến này dựng từ bàn nhà: người gửi đã sang bàn mượn nên giao cho điều phối viên
          else this.start(p, sc.steps, sc.kind, sc.cancellable);
        } else this.tickBorrow(p);
      } else if (p.mode === 'seated') {
        if (p.script) { if (!['micro', 'phone'].includes(p.script.kind)) p.nextAct = this.rand(10, 32); p.script = null; }
        this.seatedLogic(p, dt);
      }
      // dọn dẹp nhịp cho phần vẽ
      if (!(p.cur && p.cur.k === 'walk')) P.walk = Math.max(0, P.walk - dt * 5);
      if (p.mode === 'seated') {
        P.sit = 1; if (!p.cur || p.cur.k !== 'sit') p.chair.out = Math.max(0, p.chair.out - dt * 3);
      }
      const want = p.wantAct;
      if (want) { P.act = want; P.actAmt = Math.min(1, P.actAmt + dt * 5); }
      else if (P.actAmt > 0) { P.actAmt = Math.max(0, P.actAmt - dt * 5); if (P.actAmt <= 0) P.act = null; }
      if (P.hold === 'cup' && !p.cur && p.mode === 'seated' && !p.wantAct) P.hold = null;
      if (p.mode === 'seated' && !p.cur) {                           // ngồi: quay nhẹ, thỉnh thoảng nhìn quanh
        const sway = P.work ? 0.03 * Math.sin(P.t * 0.9) : 0.12 * Math.sin(P.t * 0.35 + p.ref.id);
        P.heading = turn(P.heading, (p.lookLeft > 0 ? p.lookTo : 0) + sway, dt * 4);
        if (p.lookLeft > 0) p.lookLeft -= dt;
      }
    }
    if (this.quiet > 0) this.quiet -= dt;
    if (this.load.runs >= 2) this.wantMeeting = false;           // đang bận nhiều việc thì không họp
    if (this.ambient && this.quiet <= 0 && !this.meeting && this.load.runs < 2) {
      this.nextMeeting -= dt;
      if (this.nextMeeting <= 0) this.wantMeeting = true;           // đến hẹn: chặn hành động tự phát mới cho tới khi họp được
      if (this.wantMeeting && this.startMeeting()) { this.wantMeeting = false; this.nextMeeting = this.rand(70, 120); }
    }
  }
  seatedLogic(p, dt) {
    const P = p.P;
    if (p.pending.length) { const s = p.pending.shift(); this.start(p, s.steps, s.kind, s.cancellable); return; }
    if (this.tickBorrow(p)) return;
    if (P.work) {
      p.nextMicro -= dt;
      if (p.nextMicro <= 0 && !p.wantAct) { p.nextMicro = this.rand(7, 16); this.micro(p, ['sip', 'sip', 'think', 'think', 'stretch', 'look']); }
      return;
    }
    p.nextMicro -= dt;
    if (p.nextMicro <= 0 && !p.wantAct) { p.nextMicro = this.rand(6, 14); this.micro(p, ['sip', 'think', 'look', 'look']); }
    if (!this.ambient || this.quiet > 0 || this.wantMeeting || p.engaged > 0 || p.wantAct) return;
    if (p.courier || (p.borrowWant || null) !== (p.borrowAt || null) || this.busyRooms.has(p.room.code)) return;   // điều phối viên trực sẵn; phòng đang có việc thì người trong phòng ở yên
    const calm = clamp(1 - 0.3 * this.load.runs, 0.15, 1);                                                          // càng nhiều việc chạy cùng lúc thì càng ít đi dạo
    p.nextAct -= dt * calm;
    if (p.nextAct > 0) return;
    if (this.away() >= Math.max(2, Math.round(this.maxAway * calm))) { p.nextAct = this.rand(4, 9); return; }
    const r = this.rng(), act = r < 0.28 ? 'coffee' : r < 0.5 ? 'chat' : r < 0.7 ? 'stretch' : r < 0.86 ? 'phone' : 'wander';
    if (!this[act](p)) p.nextAct = this.rand(5, 12);
  }
  micro(p, options) {
    const a = options[Math.floor(this.rng() * options.length)];
    if (a === 'look') { p.lookTo = this.rand(-0.7, 0.7); p.lookLeft = this.rand(1.2, 2.6); return; }
    const dur = a === 'sip' ? 2.6 : a === 'think' ? 2.8 : 2.2;
    p.wantAct = a; if (a === 'sip') p.P.hold = 'cup';
    p.queue = [{ k: 'wait', t: dur, act: a, emoji: a === 'think' ? '💡' : null }]; p.script = { kind: 'micro', cancellable: false };
  }
  summary() {
    const c = {}; for (const p of this.people) { const k = p.mode + (p.cur ? ':' + p.cur.k : ''); c[k] = (c[k] || 0) + 1; }
    return c;
  }
}

// Đọc ảnh chụp trạng thái của bộ mô phỏng (snapshot) và áp vào văn phòng: tải chung, các phòng đang bận, ai đang làm gì,
// ai phải sang phòng khác ngồi làm (mượn người). Dùng chung cho cảnh 3D và kiểm thử. Trả về Map agentId -> việc đang làm.
export function applySim(d, snap) {
  const runs = snap?.runs || [], working = new Map(), wantBorrow = new Map(), busy = new Set();
  let queued = 0;
  for (const run of runs) for (const it of run.items) {
    if (it.state === 'queued') { queued++; busy.add(it.dept); }
    else if (it.state === 'working') { busy.add(it.dept); if (it.agentId != null) { working.set(it.agentId, { ...it, runId: run.id, runTitle: run.title }); if (it.borrowed) wantBorrow.set(it.agentId, it.dept); } }
  }
  d.load = { runs: runs.length, queued, working: working.size };
  d.busyRooms = busy;
  for (const p of d.people) {
    if (p.ref.id <= 0) continue;
    const it = working.get(p.ref.id);
    d.setBorrow(p, wantBorrow.get(p.ref.id) || null);
    p.P.work = !!it && !it.travelling;                                    // đang đi sang phòng khác thì chưa gõ phím
    p.task = it ? { title: it.title, progress: it.progress, from: it.borrowed ? it.from : null, travelling: !!it.travelling, dept: it.dept, runId: it.runId } : null;
  }
  return working;
}
