// Kênh sự kiện thời gian thực (Server-Sent Events) từ máy chủ tới trình duyệt.
export function createHub() {
  const clients = new Set();
  const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const timer = setInterval(() => { for (const res of clients) res.write(': nhịp\n\n'); }, 15000);
  timer.unref();
  return {
    size: () => clients.size,
    add(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write('retry: 3000\n\n');
      clients.add(res);
      send(res, 'hello', { time: Date.now() });
      req.on('close', () => clients.delete(res));
    },
    broadcast(event, data) { for (const res of clients) send(res, event, data); },
    close() { clearInterval(timer); for (const res of clients) res.end(); clients.clear(); }
  };
}
