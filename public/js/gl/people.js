// Nhân vật 3D bộ xương khớp nối (đùi, cẳng chân, thân, tay, đầu), dựng từ các khối cơ bản.
// Tư thế: 'sit' (ngồi gõ phím), 'stand' (đứng), 'walk' (đi). Bước 3 sẽ thêm logic di chuyển, hình dáng giữ nguyên.
import { between, obox, sph, mixc } from './shapes.js';
import { v3 } from './math.js';

export const HAIR = ['#2b1d16', '#6b3f23', '#c79a4b', '#1f2a44', '#8a2f2f', '#151515'];
export const SKIN = ['#f0c9a4', '#d9a67c', '#b57b57', '#f5d6bb'];
export const PANTS = ['#2b3945', '#3b3f4a', '#5a6270', '#7a6a58', '#2f3d4d'];
export const SHIRTS = ['#f4f6f7', '#2b3945', '#4a6fa5', '#7a9a78', '#b5524a', '#cfc7b8', '#33495a', '#6b5b95', '#c9a24a', '#e8a33d', '#4aa3a0'];
const SHOES = ['#1e252b', '#33261f', '#e9edef', '#b5333a'];
const STYLES = ['short', 'short', 'short', 'long', 'long', 'bun'];

const D = { hipW: .1, shW: .2, thigh: .44, shin: .43, torso: .5, neck: .08, headR: .155, upA: .3, foreA: .28, ank: .07, footL: .2 };
export const SEAT_Y = 0.56;                    // độ cao xương chậu khi ngồi, so với sàn

export function seeded(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// Ngoại hình cố định theo mã người (cùng một người luôn trông giống nhau).
export function makeLook(id, accent, ceo) {
  const r = seeded(id * 7919 + 13), pick = a => a[Math.floor(r() * a.length)];
  if (ceo) return { skin: '#e3b88e', hair: '#1c1c1c', shirt: '#2b2f4a', pants: '#20242e', shoe: '#14171c', style: 'short', glasses: false, lead: true, badge: '#ffd54a' };
  return { skin: pick(SKIN), hair: pick(HAIR), shirt: mixc(pick(SHIRTS), accent, 0.5), pants: pick(PANTS), shoe: pick(SHOES), style: pick(STYLES), glasses: r() < 0.28, lead: false, badge: accent };   // áo ngả theo màu phòng ban + dây đeo thẻ màu phòng: nhìn xa cũng biết ai thuộc phòng nào
}

// Tư thế gốc cho từng kiểu; các tư thế được trộn với nhau để chuyển mượt (ngồi <-> đứng <-> đi).
function basePose(kind, P) {
  const t = P.t, work = !!P.work;
  const o = { th: [0, 0], kn: [0, 0], sh: [0, 0], el: [0, 0], lean: 0.05, spread: 0.05, pelvis: 0 };
  const legZ = () => D.ank + Math.max(...[0, 1].map(i => D.thigh * Math.cos(o.th[i]) + D.shin * Math.cos(o.th[i] - o.kn[i])));
  if (kind === 'sit') {
    o.lean = 0.08; o.spread = 0.02; o.pelvis = SEAT_Y;
    for (let i = 0; i < 2; i++) {
      o.th[i] = Math.PI / 2 - 0.04; o.kn[i] = Math.PI / 2; o.sh[i] = 0.42;
      o.el[i] = work ? 1.15 + 0.16 * Math.sin(t * 17 + i * 1.9) : 1.08 + 0.03 * Math.sin(t * 1.5 + i);
    }
  } else if (kind === 'walk') {
    o.lean = 0.1; o.spread = 0.03;
    const sp = Math.min(2.6, (P.speed || 1.4) / 1.4);
    for (let i = 0; i < 2; i++) {
      const p = t * 8.5 * sp + i * Math.PI;
      o.th[i] = 0.42 * Math.sin(p); o.kn[i] = 0.1 + 0.75 * Math.max(0, Math.cos(p)); o.sh[i] = -0.4 * Math.sin(p); o.el[i] = 0.3;
    }
    o.pelvis = legZ();
  } else {
    o.spread = 0.07; o.th = [0.03, -0.03]; o.kn = [0.05, 0.1];
    for (let i = 0; i < 2; i++) { o.sh[i] = 0.08 + 0.03 * Math.sin(t * 2 + i); o.el[i] = 0.2; }
    o.pelvis = legZ();
  }
  return o;
}
const mx = (a, b, k) => a + (b - a) * k;
function mixPose(a, b, k) {
  if (k <= 0) return a; if (k >= 1) return b;
  return { th: a.th.map((v, i) => mx(v, b.th[i], k)), kn: a.kn.map((v, i) => mx(v, b.kn[i], k)), sh: a.sh.map((v, i) => mx(v, b.sh[i], k)),
    el: a.el.map((v, i) => mx(v, b.el[i], k)), lean: mx(a.lean, b.lean, k), spread: mx(a.spread, b.spread, k), pelvis: mx(a.pelvis, b.pelvis, k) };
}
// Động tác phủ lên tư thế nền. Tay phải = chỉ số 0, tay trái = chỉ số 1. Góc vai tính từ thẳng xuống, hướng ra trước.
function applyAct(o, P) {
  const k = P.actAmt ?? 1, t = P.t;
  const arm = (i, sh, el) => { o.sh[i] = mx(o.sh[i], sh, k); o.el[i] = mx(o.el[i], el, k); };
  switch (P.act) {
    case 'sip': arm(0, 0.7, 2.15); o.lean = mx(o.lean, o.lean - 0.07, k); break;                    // đưa cốc lên miệng
    case 'phone': arm(0, 0.9, 2.3); break;                                                           // áp điện thoại lên tai
    case 'think': arm(0, 0.85, 2.0); break;                                                          // tay chống cằm
    case 'stretch': arm(0, 2.85, 0.15); arm(1, 2.85, 0.15); o.lean = mx(o.lean, -0.12, k); o.spread = mx(o.spread, 0.32, k); break;   // vươn vai
    case 'talk': arm(0, 0.95 + 0.35 * Math.sin(t * 3.1), 0.9 + 0.5 * Math.sin(t * 4.3 + 1)); arm(1, 0.5 + 0.25 * Math.sin(t * 2.3 + 2), 0.8); break;   // vừa nói vừa ra hiệu
    case 'hand': arm(0, 1.45, 0.25); break;                                                          // chìa tay đưa hồ sơ
    case 'cheer': arm(0, 2.5 + 0.4 * Math.sin(t * 9), 0.3); arm(1, 2.5 + 0.4 * Math.sin(t * 9 + 1.6), 0.3); break;   // mừng
    default:
      if (P.hold === 'folder' && (P.sit ?? 0) < 0.6) arm(0, 0.75, 1.3);                            // ôm hồ sơ trước ngực
      else if (P.hold === 'cup' && (P.sit ?? 0) < 0.6) arm(0, 0.5, 1.25);
  }
}
function pose(P) {
  const sit = P.sit ?? (P.pose === 'sit' ? 1 : 0), walk = P.walk ?? (P.pose === 'walk' ? 1 : 0);
  const o = mixPose(mixPose(basePose('stand', P), basePose('walk', P), walk), basePose('sit', P), sit);
  const c = { th: o.th.slice(), kn: o.kn.slice(), sh: o.sh.slice(), el: o.el.slice(), lean: o.lean, spread: o.spread, pelvis: o.pelvis };
  applyAct(c, P);
  return c;
}

// Vẽ một người vào lớp L. P: { x, y (mặt sàn), z, heading (0 = quay về +z), pose, t, work, look, speed, holding }
export function drawPerson(L, P) {
  const K = P.look, o = pose(P), h = P.heading || 0;
  if (P.stress && (P.sit ?? (P.pose === 'sit' ? 1 : 0)) > 0.6) o.lean += 0.2 * P.stress;      // phòng đang dồn việc: cúi sát màn hình
  const f = [Math.sin(h), 0, Math.cos(h)], s = [Math.cos(h), 0, -Math.sin(h)], up = [0, 1, 0];
  const dir = a => [f[0] * Math.sin(a), -Math.cos(a), f[2] * Math.sin(a)];
  const at = (p, d, len) => [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
  const pel = [P.x, P.y + o.pelvis, P.z];
  const hip = [-1, 1].map(sd => [pel[0] + s[0] * sd * D.hipW, pel[1], pel[2] + s[2] * sd * D.hipW]);
  const knee = hip.map((p, i) => at(p, dir(o.th[i]), D.thigh));
  const ank = knee.map((p, i) => at(p, dir(o.th[i] - o.kn[i]), D.shin));
  const tv = [f[0] * Math.sin(o.lean), Math.cos(o.lean), f[2] * Math.sin(o.lean)];
  const sc = at(pel, tv, D.torso);
  const sho = [-1, 1].map(sd => [sc[0] + s[0] * sd * D.shW, sc[1] - 0.02, sc[2] + s[2] * sd * D.shW]);
  const elb = sho.map((p, i) => { const q = at(p, dir(o.sh[i]), D.upA), k = o.spread * (i ? 1 : -1) * D.upA; return [q[0] + s[0] * k, q[1], q[2] + s[2] * k]; });
  const hand = elb.map((p, i) => { const q = at(p, dir(o.sh[i] + o.el[i]), D.foreA), k = o.spread * (i ? 1 : -1) * D.foreA * 0.8; return [q[0] + s[0] * k, q[1], q[2] + s[2] * k]; });
  const hc = [sc[0] + f[0] * 0.03, sc[1] + D.neck + D.headR * 0.95, sc[2] + f[2] * 0.03];

  for (let i = 0; i < 2; i++) {
    between(L, hip[i], knee[i], 0.085, K.pants); between(L, knee[i], ank[i], 0.07, K.pants);
    const toe = at(at(ank[i], f, D.footL * 0.55), up, -0.05);
    obox(L, toe, s, up, f, 0.115, 0.075, D.footL + 0.06, K.shoe);
  }
  between(L, hip[0], hip[1], 0.1, K.pants);
  const mid = at(pel, tv, D.torso * 0.5);
  obox(L, mid, s, tv, v3.cross(s, tv), 0.4, D.torso + 0.1, 0.24, K.shirt);
  if (K.badge) {                                                                              // dây đeo thẻ + thẻ màu phòng ban
    const ch = at(pel, tv, D.torso * 0.74), cf = at(ch, f, 0.125), bt = at(at(pel, tv, D.torso * 0.5), f, 0.125);
    obox(L, cf, s, tv, v3.cross(s, tv), 0.04, 0.2, 0.018, K.badge);
    obox(L, bt, s, tv, v3.cross(s, tv), 0.1, 0.12, 0.02, '#f6f8fa'); obox(L, at(bt, tv, 0.05), s, tv, v3.cross(s, tv), 0.1, 0.035, 0.024, K.badge);
  }
  between(L, sho[0], sho[1], 0.085, K.shirt);
  for (let i = 0; i < 2; i++) {
    between(L, sho[i], elb[i], 0.065, K.shirt); between(L, elb[i], hand[i], 0.055, K.skin);
    sph(L, hand[i][0], hand[i][1], hand[i][2], 0.052, K.skin);
  }
  between(L, sc, [hc[0], hc[1] - D.headR * 0.7, hc[2]], 0.05, K.skin);
  sph(L, hc[0], hc[1], hc[2], D.headR, K.skin, 0, 1, 1.05, 1);
  const back = f.map(v => -v);
  sph(L, hc[0] + back[0] * 0.03, hc[1] + 0.04, hc[2] + back[2] * 0.03, D.headR * 1.07, K.hair, 0, 1, 1, 1);
  if (K.style === 'long') obox(L, [hc[0] + back[0] * 0.1, hc[1] - 0.12, hc[2] + back[2] * 0.1], s, up, f, 0.3, 0.36, 0.1, K.hair);
  else if (K.style === 'bun') sph(L, hc[0] + back[0] * 0.09, hc[1] + 0.13, hc[2] + back[2] * 0.09, 0.06, K.hair);
  for (const sd of [-1, 1]) sph(L, hc[0] + f[0] * D.headR * 0.93 + s[0] * sd * 0.06, hc[1] + 0.012, hc[2] + f[2] * D.headR * 0.93 + s[2] * sd * 0.06, 0.022, '#1b2a31');
  if (K.glasses) obox(L, [hc[0] + f[0] * D.headR * 0.98, hc[1] + 0.012, hc[2] + f[2] * D.headR * 0.98], s, up, f, 0.2, 0.014, 0.014, '#26323b');
  if (K.lead) obox(L, at(at(pel, tv, D.torso * 0.62), f, 0.125), s, tv, v3.cross(s, tv), 0.05, 0.26, 0.02, '#26333b');
  // Vật cầm ở tay phải
  const hd = hand[0], hf = v3.cross(s, up);
  if (P.hold === 'cup') { between(L, [hd[0], hd[1] - 0.01, hd[2]], [hd[0], hd[1] + 0.1, hd[2]], 0.045, '#ffffff'); sph(L, hd[0], hd[1] + 0.1, hd[2], 0.034, '#6b4a2f', 0, 1, 0.3, 1); }
  else if (P.hold === 'folder') obox(L, [hd[0], hd[1] + 0.02, hd[2]], s, up, f, 0.24, 0.035, 0.32, '#f4f6f8') , obox(L, [hd[0], hd[1] + 0.04, hd[2]], s, up, f, 0.18, 0.01, 0.1, P.holdColor || '#4a7bd0');
  else if (P.hold === 'phone') obox(L, [hd[0] + s[0] * 0.02, hd[1] + 0.03, hd[2] + s[2] * 0.02], s, up, f, 0.075, 0.13, 0.014, '#1e262d');
  return { hand: hd, head: hc };
}

// Vị trí đầu người (để gắn nhãn, bong bóng) và vùng bấm chuột.
export function headPos(P) { return [P.x, P.y + 1.45 + (1 - (P.sit ?? (P.pose === 'sit' ? 1 : 0))) * 0.3, P.z]; }
