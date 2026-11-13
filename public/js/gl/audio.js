// Âm thanh nhẹ (ý 12), tạo bằng Web Audio, không cần tệp âm thanh. Mặc định TẮT, chỉ bật khi người dùng bấm (trình duyệt không cho tự phát).
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const distGain = d => Math.pow(clamp(1 - d / 40, 0, 1), 1.5);          // càng xa camera càng nhỏ, quá 40 m thì im
const MIN_GAP = { chime: 0.35, tick: 0.09, step: 0.12, pop: 0.3 };            // giây: giới hạn tần suất từng loại để không ồn
export function makeLimiter(gaps = MIN_GAP) {
  const last = new Map();
  return (name, now) => { const g = gaps[name] ?? 0.1, l = last.get(name) ?? -1e9; if (now - l < g) return false; last.set(name, now); return true; };
}
export function createAudio() {
  let ctx = null, master = null, on = false, volume = 0.5; const ok = makeLimiter();
  const T = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const ensure = () => {
    if (ctx) return ctx;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination); return ctx;
  };
  const tone = (f, dur, gain, type = 'sine', when = 0, slide = 0) => {
    const c = ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  };
  const noise = (dur, gain, hp) => {
    const c = ctx, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'highpass'; f.frequency.value = hp; g.gain.value = gain;
    s.buffer = buf; s.connect(f); f.connect(g); g.connect(master); s.start();
  };
  return {
    get enabled() { return on; },
    setEnabled(v) { on = !!v; if (on) { const c = ensure(); c?.resume?.(); } },
    setVolume(v) { volume = clamp(v, 0, 1); if (master) master.gain.value = volume; },
    play(name, dist = 0) {
      if (!on || !ctx || ctx.state === 'closed') return false;
      const g = distGain(dist); if (g < 0.02 || !ok(name, T())) return false;
      if (name === 'chime') { tone(880, 0.35, 0.12 * g, 'sine'); tone(1318, 0.5, 0.1 * g, 'sine', 0.09); }
      else if (name === 'tick') noise(0.025, 0.05 * g, 2500 + Math.random() * 1500);
      else if (name === 'step') { noise(0.05, 0.06 * g, 180); tone(70, 0.07, 0.05 * g, 'sine'); }
      else if (name === 'pop') { tone(300, 0.15, 0.1 * g, 'triangle', 0, 500); }
      return true;
    },
    dispose() { try { ctx?.close(); } catch { /* bỏ qua */ } ctx = null; master = null; on = false; }
  };
}
