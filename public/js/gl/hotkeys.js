// Phím tắt chọn phòng (ý 11): gõ hai số (05, 12...) trong vòng 0,9 giây; C = phòng CEO, L = phòng nghỉ.
export function createHotkeys(codes) {
  let buf = '', t0 = 0;
  return {
    feed(key, now) {
      if (buf && now - t0 > 0.9) buf = '';
      const k = String(key).toLowerCase();
      if (k === 'c') { buf = ''; return codes.includes('CEO') ? 'CEO' : null; }
      if (k === 'l') { buf = ''; return codes.includes('LNG') ? 'LNG' : null; }
      if (!/^[0-9]$/.test(k)) { buf = ''; return null; }
      if (!buf) { if (k !== '0' && k !== '1') return null; buf = k; t0 = now; return null; }
      const code = buf + k; buf = '';
      return codes.includes(code) ? code : null;
    },
    pending: () => buf
  };
}
