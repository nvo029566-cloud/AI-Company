// Dò các cặp mặt phẳng trùng nhau (cùng hướng, cùng độ cao, chồng lên nhau, khác màu): nguồn gây nhấp nháy khi camera di chuyển.
export function faces(L, rotTol = 1e-4) {
  const out = [], b = L.box, c = L.cyl;
  const col = (d, o) => [d[o + 16], d[o + 17], d[o + 18], d[o + 19]];
  for (let i = 0; i < b.n; i++) {
    const o = i * 24, d = b.data;
    if (Math.abs(d[o + 2]) > rotTol || Math.abs(d[o + 8]) > rotTol) continue;          // chỉ hộp không xoay
    const sx = d[o], sy = d[o + 5], sz = d[o + 10], cx = d[o + 12], cy = d[o + 13], cz = d[o + 14], k = col(d, o);
    out.push({ ax: 1, dir: 1, p: cx + sx / 2, a0: cy - sy / 2, a1: cy + sy / 2, b0: cz - sz / 2, b1: cz + sz / 2, k, id: 'hộp' + i });
    out.push({ ax: 1, dir: -1, p: cx - sx / 2, a0: cy - sy / 2, a1: cy + sy / 2, b0: cz - sz / 2, b1: cz + sz / 2, k, id: 'hộp' + i });
    out.push({ ax: 2, dir: 1, p: cy + sy / 2, a0: cx - sx / 2, a1: cx + sx / 2, b0: cz - sz / 2, b1: cz + sz / 2, k, id: 'hộp' + i });
    out.push({ ax: 2, dir: -1, p: cy - sy / 2, a0: cx - sx / 2, a1: cx + sx / 2, b0: cz - sz / 2, b1: cz + sz / 2, k, id: 'hộp' + i });
    out.push({ ax: 3, dir: 1, p: cz + sz / 2, a0: cx - sx / 2, a1: cx + sx / 2, b0: cy - sy / 2, b1: cy + sy / 2, k, id: 'hộp' + i });
    out.push({ ax: 3, dir: -1, p: cz - sz / 2, a0: cx - sx / 2, a1: cx + sx / 2, b0: cy - sy / 2, b1: cy + sy / 2, k, id: 'hộp' + i });
  }
  for (let i = 0; i < c.n; i++) {                                                       // mặt trên của trụ ~ hình chữ nhật thu nhỏ (xấp xỉ hình tròn)
    const o = i * 24, d = c.data, sx = d[o], sy = d[o + 5], sz = d[o + 10], cx = d[o + 12], cy = d[o + 13], cz = d[o + 14], k = col(d, o), s = 0.7;
    out.push({ ax: 2, dir: 1, p: cy + sy / 2, a0: cx - sx / 2 * s, a1: cx + sx / 2 * s, b0: cz - sz / 2 * s, b1: cz + sz / 2 * s, k, id: 'trụ' + i });
  }
  return out;
}
// minY: mặt đứng chỉ tính phần nằm trên độ cao này (phần dưới mặt sàn nằm khuất trong khối sàn nên không bao giờ thấy).
export function findZFights(L, { tol = 0.004, minArea = 0.01, minY = 0 } = {}) {
  const F = faces(L), groups = new Map(), res = [];
  if (minY > 0) for (const f of F) { if (f.ax === 1) f.a0 = Math.max(f.a0, minY); else if (f.ax === 3) f.b0 = Math.max(f.b0, minY); }   // trục x: độ cao nằm ở a; trục z: độ cao nằm ở b
  for (const f of F) { const key = f.ax + ':' + f.dir + ':' + Math.round(f.p / tol); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(f); }
  const seen = new Set();
  for (const [key, list] of groups) {
    const [ax, dir, q] = key.split(':').map(Number);
    const near = [...list, ...(groups.get(`${ax}:${dir}:${q + 1}`) || [])];
    for (let i = 0; i < list.length; i++) for (let j = 0; j < near.length; j++) {
      const a = list[i], b = near[j]; if (a === b || a.id === b.id) continue;
      if (a.ax === 2 && a.dir < 0) continue;                                            // mặt úp xuống: camera luôn ở trên nên không bao giờ thấy
      if (Math.abs(a.p - b.p) > tol) continue;
      const w = Math.min(a.a1, b.a1) - Math.max(a.a0, b.a0), h = Math.min(a.b1, b.b1) - Math.max(a.b0, b.b0);
      if (w <= 0 || h <= 0 || w * h < minArea) continue;
      const dc = Math.abs(a.k[0] - b.k[0]) + Math.abs(a.k[1] - b.k[1]) + Math.abs(a.k[2] - b.k[2]) + Math.abs(a.k[3] - b.k[3]);
      if (dc < 0.03) continue;                                                        // cùng màu thì không thấy nhấp nháy
      const id = [a.id, b.id].sort().join('|'); if (seen.has(id)) continue; seen.add(id);
      res.push({ a: a.id, b: b.id, ax, dir, y: a.p, area: w * h, x0: Math.max(a.a0, b.a0), z0: Math.max(a.b0, b.b0), colors: [a.k.slice(0, 3).map(v => +v.toFixed(2)), b.k.slice(0, 3).map(v => +v.toFixed(2))] });
    }
  }
  return res.sort((p, q) => q.area - p.area);
}