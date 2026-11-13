// Chạy trước mọi thứ (không phải mô-đun). Nếu giao diện không dựng được, hiện bảng báo lỗi tiếng Việt thay vì để trang trắng.
// Nguyên nhân hay gặp: chép thiếu hoặc chưa ghi đè một tệp .js, nên các tệp không còn khớp nhau.
(function () {
  var shown = false;
  function empty() { var s = document.getElementById('side'), m = document.getElementById('main'); return !!(s && m && !s.children.length && !m.children.length); }
  function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text) e.textContent = text; return e; }
  function show(msg, issues) {
    if (shown) return; shown = true;
    var box = el('div', 'position:fixed;inset:0;z-index:99999;background:rgba(20,24,36,.55);display:flex;align-items:center;justify-content:center;padding:20px;font:15px/1.5 system-ui,Segoe UI,Arial,sans-serif');
    var card = el('div', 'background:#fff;color:#1b2333;max-width:720px;width:100%;border-radius:14px;padding:22px 26px;box-shadow:0 20px 60px rgba(0,0,0,.35);max-height:90vh;overflow:auto');
    card.append(el('div', 'font-size:20px;font-weight:800;margin-bottom:6px', '⚠ Giao diện không khởi động được'));
    card.append(el('div', 'color:#5b6578;margin-bottom:12px', 'Trang bị trắng vì trình duyệt không nạp nổi các tệp giao diện.'));
    if (issues && issues.length) {
      card.append(el('div', 'font-weight:700;margin:8px 0 4px', 'Các tệp đang không khớp nhau:'));
      var ul = el('ul', 'margin:0 0 12px 18px;padding:0');
      issues.slice(0, 8).forEach(function (i) { ul.append(el('li', 'margin:3px 0', i.text)); });
      card.append(ul);
      card.append(el('div', 'background:#eef6ff;border:1px solid #bcd7f7;border-radius:10px;padding:10px 12px;margin-bottom:12px', 'Cách sửa nhanh nhất: chạy cap-nhat.bat (hoặc gõ: node cap-nhat.mjs) trong thư mục dự án, nó tự chép đúng các tệp. Sau đó tắt cửa sổ start.bat, mở lại và nhấn Ctrl + F5 trên trình duyệt.'));
    } else {
      card.append(el('div', 'background:#fff7e6;border:1px solid #f5d38a;border-radius:10px;padding:10px 12px;margin-bottom:12px', 'Máy chủ không thấy tệp nào lệch. Hãy nhấn F12, chọn thẻ Console và gửi cho tôi dòng chữ đỏ đầu tiên (hoặc chụp màn hình), tôi sẽ xử lý.'));
    }
    var det = el('details', 'color:#5b6578;font-size:13px'); det.append(el('summary', 'cursor:pointer', 'Chi tiết kỹ thuật')); det.append(el('pre', 'white-space:pre-wrap;word-break:break-word;margin:8px 0 0', String(msg)));
    card.append(det);
    var close = el('button', 'margin-top:14px;padding:8px 16px;border:0;border-radius:8px;background:#6d5ef0;color:#fff;font-weight:700;cursor:pointer', 'Đóng bảng này');
    close.onclick = function () { box.remove(); }; card.append(close);
    box.append(card); (document.body || document.documentElement).append(box);
  }
  function report(msg, wait) {
    if (shown) return;
    setTimeout(function () {
      if (shown || !empty()) return;                                           // trang đã dựng được thì bỏ qua các lỗi vặt
      fetch('/api/frontend-check', { cache: 'no-store' }).then(function (r) { return r.json(); })
        .then(function (j) { show(msg, j && j.issues); }, function () { show(msg, null); });
    }, wait || 1500);
  }
  var MODULE_ERR = /module|import|export|syntax|unexpected token|is not defined|failed to fetch/i;
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName) { if (t.tagName === 'SCRIPT') report('Không tải được tệp: ' + (t.src || t.href)); }   // tệp .js không tải được
    else if (MODULE_ERR.test(e.message || '')) report(e.message);                                                                // lỗi nạp mô-đun / cú pháp; lỗi vặt của tiện ích trình duyệt thì bỏ qua
  }, true);
  window.addEventListener('unhandledrejection', function (e) { var m = String((e.reason && e.reason.message) || e.reason || ''); if (MODULE_ERR.test(m)) report(m); });
  setTimeout(function () { if (empty()) report('Sau vài giây trang vẫn chưa dựng được nội dung.', 50); }, 6000);
})();
