// Đường ống dây chuyền trên sàn (ý 3): mỗi dự án một màu, đoạn đã qua, đoạn hồ sơ đang đi, đoạn sắp tới.
// Chuỗi: CEO -> các bước (mỗi bước có thể nhiều phòng chạy song song) -> CEO.
export function flowSegments(runs) {
  const out = [];
  runs.forEach((run, ri) => {
    const st = run.stages || [];
    if (!st.length) return;
    const chain = [['CEO'], ...st.map(s => s.depts), ['CEO']];
    const state = ['done', ...st.map(s => s.state), 'todo'];
    for (let k = 0; k < chain.length - 1; k++) {
      const seg = state[k + 1] === 'done' ? 'done' : (state[k] === 'done' && state[k + 1] === 'current' ? 'active' : (state[k] === 'done' && k === chain.length - 2 ? 'active' : 'next'));
      for (const from of chain[k]) for (const to of chain[k + 1]) if (from !== to) out.push({ runId: run.id, lane: ri, from, to, state: seg, key: `${run.id}:${from}>${to}` });
    }
  });
  return out;
}
// Các điểm dọc đường đi để vẽ chấm/vạch chạy: khoảng cách đều nhau, dịch theo thời gian (phase) để thấy chuyển động.
export function dotsAlong(pts, gap, phase) {
  const out = []; let acc = 0, need = ((phase % gap) + gap) % gap;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-6) continue;
    while (need <= acc + len) { const k = (need - acc) / len; out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[0] - a[0], b[1] - a[1])]); need += gap; }
    acc += len;
  }
  return out;
}
