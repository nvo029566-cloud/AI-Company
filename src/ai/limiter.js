import { AiError } from './errors.js';

// Hàng đợi giới hạn tốc độ: tối đa rpm lời gọi mỗi phút và `concurrency` lời gọi cùng lúc, theo thứ tự đến trước làm trước.
// Nhờ đó nhiều agent cùng làm việc không dồn cùng lúc làm vượt hạn mức miễn phí.
export function createLimiter({ getRpm, concurrency = 2, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const queue = [], starts = [];
  let running = 0, timer = null, waitingUntil = 0;
  function pump() {
    if (timer) { clearTimer(timer); timer = null; }
    waitingUntil = 0;
    while (queue.length && running < concurrency) {
      const t = now();
      while (starts.length && t - starts[0] >= 60000) starts.shift();
      if (starts.length >= Math.max(1, getRpm())) {
        const wait = starts[0] + 60000 - t;
        waitingUntil = t + wait; timer = setTimer(pump, Math.max(1, wait));
        return;
      }
      const job = queue.shift();
      if (job.signal?.aborted) { job.reject(new AiError('aborted', 'Đã dừng lời gọi AI.')); continue; }
      starts.push(t); running++;
      Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => { running--; pump(); });
    }
  }
  return {
    schedule(fn, signal) {
      return new Promise((resolve, reject) => {
        const job = { fn, signal, resolve, reject };
        signal?.addEventListener?.('abort', () => { const i = queue.indexOf(job); if (i >= 0) { queue.splice(i, 1); reject(new AiError('aborted', 'Đã dừng lời gọi AI.')); } }, { once: true });
        queue.push(job); pump();
      });
    },
    flush(reason = 'Đã dừng lời gọi AI.') { for (const j of queue.splice(0)) j.reject(new AiError('aborted', reason)); },
    stats: () => ({ queued: queue.length, running, waitingUntil })
  };
}
