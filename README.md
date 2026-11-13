# Công ty AI

Bảng điều khiển của một công ty phần mềm mà nhân viên đều là AI. Có 12 phòng ban, 26 agent, một văn phòng 3D vẽ bằng WebGL2 viết tay, dây chuyền làm việc từ yêu cầu đến phát hành, phê duyệt, chi phí, thông báo, kho Kiến thức và một Trợ lý. Từ giai đoạn 10, các phòng có thể nhờ mô hình AI thật (Gemini, OpenAI, Anthropic) viết tài liệu và mã nguồn.

Ứng dụng chạy ngay trên máy của bạn, **không có phụ thuộc npm nào**: chỉ cần Node.js, SQLite có sẵn trong Node (`node:sqlite`), giao diện là các tệp ES module, cập nhật thời gian thực bằng SSE.

- Hướng dẫn dành cho người không rành kỹ thuật: [HUONG-DAN.md](HUONG-DAN.md). Bản này cũng có trong ứng dụng (nút "i" ở thanh trên).
- Tài liệu này dành cho người cài đặt, người bảo trì và người muốn hiểu ứng dụng hoạt động thế nào.

## Mục lục
1. [Trạng thái hiện tại](#1-trạng-thái-hiện-tại-đọc-phần-này-trước)
2. [Cài đặt và chạy](#2-cài-đặt-và-chạy)
3. [Những gì ứng dụng làm](#3-những-gì-ứng-dụng-làm)
4. [Dự án đi qua công ty như thế nào](#4-dự-án-đi-qua-công-ty-như-thế-nào)
5. [AI thật](#5-ai-thật)
6. [Chi phí và ngân sách](#6-chi-phí-và-ngân-sách)
7. [An toàn và quyền riêng tư](#7-an-toàn-và-quyền-riêng-tư)
8. [Sao lưu và khôi phục](#8-sao-lưu-và-khôi-phục)
9. [Cấu hình](#9-cấu-hình)
10. [API](#10-api)
11. [Cơ sở dữ liệu](#11-cơ-sở-dữ-liệu)
12. [Cấu trúc thư mục](#12-cấu-trúc-thư-mục)
13. [Kiểm thử](#13-kiểm-thử)
14. [Phát triển và cập nhật](#14-phát-triển-và-cập-nhật)
15. [Xử lý sự cố](#15-xử-lý-sự-cố)
16. [Giới hạn đã biết](#16-giới-hạn-đã-biết)

---

## 1. Trạng thái hiện tại (đọc phần này trước)

| Phần | Trạng thái |
|---|---|
| Chế độ mô phỏng (mặc định) | Hoàn chỉnh, miễn phí, không cần khoá, đã kiểm thử |
| Văn phòng 3D, bản đồ nhiệt, chế độ trình chiếu (kiosk) | Hoàn chỉnh. Đã chạy thử bằng Chromium không đầu; chưa thử trên nhiều trình duyệt và card đồ hoạ |
| Phê duyệt, chi phí, báo cáo, thông báo, Kiến thức, Trợ lý, Cài đặt | Hoàn chỉnh, đã kiểm thử |
| Sao lưu, khôi phục, hướng dẫn | Hoàn chỉnh, đã kiểm thử |
| **AI thật** (Gemini, OpenAI, Anthropic) | **Đã viết và kiểm thử bằng máy chủ giả. CHƯA từng chạy thành công với dịch vụ thật** |

Về AI thật, cần nói thẳng:
- Mọi bài kiểm thử dùng một máy chủ giả, giữ đúng định dạng yêu cầu và phản hồi **theo cách mình hiểu từ tài liệu** của từng nhà. Bộ kiểm thử không chứng minh dịch vụ thật chấp nhận định dạng đó. Tên mô hình, tên trường và giới hạn thực tế vẫn có thể lệch.
- Lần thử thực tế đầu tiên: Gemini (`gemini-3.8-flash`) quá thời gian chờ, OpenAI trả lỗi 429. Nguyên nhân chưa được xác định.
- Chất lượng mã và tài liệu do AI viết ra chưa được đánh giá với mô hình thật. Chỉ dẫn cho từng phòng (`src/ai/prompts.js`) chưa từng được thử với mô hình thật và có thể cần chỉnh.
- OpenAI và Anthropic luôn tính tiền. Chỉ Gemini có bậc miễn phí (có giới hạn tốc độ; theo điều khoản của Google, nội dung gửi lên có thể được dùng để cải thiện sản phẩm).

## 2. Cài đặt và chạy

**Yêu cầu:** Node.js 22.5 trở lên (kiểm tra bằng `node -v`). Hệ điều hành bất kỳ; các tệp `.bat` dành cho Windows. Cảnh 3D cần trình duyệt có WebGL2; nếu không, ứng dụng tự chuyển sang bản đồ phẳng.

**Chạy:**
1. Windows: bấm đúp `start.bat`. Hoặc trong thư mục dự án chạy `node server.js`.
2. Mở http://localhost:3000 (`start.bat` tự mở giúp bạn).
3. Dừng bằng cách đóng cửa sổ hoặc nhấn Ctrl+C. Dữ liệu nằm trong `data/` và còn nguyên lần sau.

Đổi cổng bằng `"port"` trong `config.json` hoặc biến môi trường `PORT`.

**Cập nhật:** đặt `cap-nhat.mjs` cạnh `server.js`, chạy `cap-nhat.bat` (hoặc `node cap-nhat.mjs`), mở lại `start.bat`, nhấn Ctrl+F5 trong trình duyệt. Bộ cập nhật so từng tệp mã nguồn với bản đúng, sao lưu tệp cũ vào thư mục `sao-luu-...`, rồi chép đúng chỗ. **Không** đụng tới `config.json`, `data/` và `start.bat`. Có thể chạy với `--chi-kiem-tra` để chỉ xem, không sửa.

Khi khởi động, `server.js` tự kiểm tra các tệp giao diện có khớp nhau không (hay hỏng khi chép thiếu tệp, khiến trang trắng) và in cảnh báo kèm cách sửa.

## 3. Những gì ứng dụng làm

Thanh bên có các trang sau:

| Trang | Nội dung |
|---|---|
| **Tổng quan** | Ba tab: sơ đồ 2D, văn phòng 3D, danh sách phòng. Điều khiển mô phỏng (chạy thử, tốc độ, tự tạo việc). Nút **Chế độ trình chiếu** ở tab 3D |
| **Phòng điều hành** | Nhập yêu cầu bằng tiếng Việt, CTO lập kế hoạch, bạn duyệt hoặc từ chối |
| **Dự án** | Danh sách và chi tiết: tiến độ, chi phí, cổng phê duyệt, lỗi, và (với dự án AI thật) các tệp sản phẩm cùng nhật ký lời gọi |
| **Nhân sự** | 26 nhân viên của 12 phòng, hồ sơ từng người |
| **Công việc** | Việc đang làm, đang chờ, đã xong |
| **Lỗi** | Lỗi phòng Kiểm thử tìm ra, ai đang sửa, trạng thái |
| **Triển khai** | Các bản phát hành đã ghi nhận |
| **Chi phí AI** | Tiền thật và chi phí mô phỏng, theo tháng, dự án, phòng, loại việc; xuất CSV |
| **Phê duyệt** | Kế hoạch CTO, chi phí vượt, cho phép phát hành |
| **Báo cáo** | Báo cáo công ty (7 ngày, 30 ngày, tất cả) và từng dự án; in PDF |
| **Kiến thức** | Quy tắc dùng chung, ghi chú, bài học tự động sau mỗi dự án |
| **Cài đặt** | Tên công ty, ngân sách, cổng phê duyệt, thông báo, AI thật, sao lưu, thông tin hệ thống |
| **Hướng dẫn** | Hướng dẫn sử dụng (đường dẫn `#/huong-dan`) |

Các thành phần dùng chung:
- **Ctrl+K** (hoặc phím `/`): ô lệnh. Tìm trang, phòng, người, dự án, kiến thức (không cần gõ dấu); lệnh nhanh; hỏi Trợ lý; giao việc cho CTO.
- **Chuông thông báo**: phê duyệt cần xử lý, lỗi mới, dự án xong, cảnh báo ngân sách, dự án bị dừng. Có phát trực tiếp.
- **Trợ lý**: trả lời theo quy tắc và từ dữ liệu thật (chi phí, ai đang rảnh, dự án đang chạy, việc cần duyệt, lỗi chưa sửa). **Không phải AI**.
- **Giao diện sáng và tối**, chấm "Trực tiếp" cho biết kênh thời gian thực đang nối.

**Văn phòng 3D** có kéo xoay, zoom, bấm phòng để phóng to, phím tắt gõ số phòng, ngày và đêm, thời tiết, chất lượng tự điều chỉnh theo máy, chụp ảnh và quay video, chế độ màu thân thiện, giảm chuyển động.

**Bản đồ nhiệt** (tab 3D, hàng "Nhiệt"): tô màu sàn từng phòng, xanh là ít, vàng là vừa, đỏ là nhiều, kèm nhãn số trên thẻ phòng (không chỉ dựa vào màu). Bốn thước đo:
- *Đang bận*: số người đang làm trên tổng số người của phòng, cập nhật trực tiếp.
- *Việc xong*, *Chi phí*, *Lỗi*: lấy từ `/api/heatmap`, theo 7 ngày, 30 ngày hoặc tất cả.

**Chế độ trình chiếu** (`#/kiosk`): văn phòng 3D toàn màn hình cho màn hình treo tường. Camera tự đi tham quan (toàn cảnh, theo dõi dự án đang chạy, các phòng bận nhất; công ty rảnh thì luân phiên các phòng). Có đồng hồ, thống kê và dòng chữ chạy khi hồ sơ chuyển tay. Phím: Dấu cách tạm dừng, mũi tên phải sang cảnh kế, `F` bật tắt toàn màn hình, Esc thoát. Chỉ để xem. **Chi phí mặc định ẩn**; thêm `?chiphi=1` vào địa chỉ (`#/kiosk?chiphi=1`) để hiện.

## 4. Dự án đi qua công ty như thế nào

**Vòng đời:** yêu cầu của CEO (bạn) → CTO lập kế hoạch (chặng, ước tính chi phí) → bạn duyệt → các chặng chạy lần lượt → có thể dừng ở cổng chi phí vượt → kiểm thử, có thể trả lỗi về để sửa → có thể dừng ở cổng phát hành → triển khai → xong. Mỗi bước chuyển giữa hai phòng là một người cầm hồ sơ đi giao thật trong cảnh 3D, và phòng kế tiếp chỉ bắt đầu khi hồ sơ tới tay (có dự phòng theo thời gian để dây chuyền không bao giờ kẹt).

**Dây chuyền theo loại sản phẩm** (các phòng trong cùng ngoặc chạy song song):

| Loại | Các chặng |
|---|---|
| Ứng dụng web | 01 → 02 → 03 → 05 → [06, 07, 09] → 10 → 11 → 12 |
| Phần mềm máy tính | 01 → 02 → 03 → 05 → [07, 06] → 10 → 11 → 12 |
| Trang đích | 01 → 02 → 05 → [06, 09] → 10 → 12 |
| Ứng dụng di động | 01 → 02 → 03 → 05 → [08, 07] → 10 → 11 → 12 |

12 phòng: 01 Điều hành, 02 Sản phẩm, 03 Phân tích, 04 Nghiên cứu (hỗ trợ khi cần, ở chặng 03 và 05), 05 Thiết kế, 06 Giao diện, 07 Máy chủ, 08 Di động, 09 Web, 10 Kiểm thử, 11 An ninh, 12 Vận hành. Phòng hết người rảnh có thể mượn người từ phòng khác (có giới hạn).

**Ba chỗ công ty dừng chờ bạn** (trang Phê duyệt): kế hoạch của CTO; chi phí vượt ngân sách dự án (duyệt thì ngân sách được nâng thêm, từ chối thì dự án dừng); cho phép phát hành trước bước triển khai. Hai cổng sau tắt được bằng một công tắc trong Cài đặt. Khởi động lại máy chủ giữa chừng thì các dự án đang chạy bị dừng và báo cho bạn; tiền đã tiêu vẫn được tính.

**Lỗi và sửa lỗi:** khi phòng Kiểm thử xong, có thể có lỗi. Mỗi lỗi được trả về đúng người đã làm ra nó (họ hiện trạng thái "bị chặn" cho tới khi sửa xong), sau đó phòng Kiểm thử kiểm lại. Ở chế độ mô phỏng, lỗi lấy từ danh sách có sẵn theo tỷ lệ cấu hình; ở chế độ AI thật, lỗi là do kiểm tra tĩnh và AI rà soát tìm ra thật.

## 5. AI thật

### Nguyên tắc
- Mặc định **tắt**. Bật cần có khoá của nhà cung cấp mặc định.
- Chế độ được chốt khi dự án bắt đầu: bật AI giữa chừng không đổi dự án đang chạy mô phỏng, và ngược lại.
- Việc "Chạy thử" và tự tạo việc **không bao giờ** gọi AI.
- Nếu thiếu khoá của một nhà đang dùng (mặc định hoặc theo phòng), hoặc thiếu đơn giá ở nhà tính tiền, việc **duyệt kế hoạch bị chặn ngay (HTTP 409)** với thông báo nói rõ thiếu gì; kế hoạch vẫn chờ duyệt.

### Nhà cung cấp và mô hình
| Nhà | Endpoint | Ghi chú |
|---|---|---|
| Gemini | `POST /v1beta/models/{model}:generateContent`, khoá trong tiêu đề `x-goog-api-key` | Có bậc miễn phí. Có thể đặt mức suy nghĩ (`thinkingConfig.thinkingLevel`); nếu mô hình từ chối trường này, tự gửi lại không kèm nó |
| OpenAI | `POST /v1/chat/completions`, `Authorization: Bearer` | Dùng `max_completion_tokens`, không gửi `temperature`; JSON mode bằng `response_format` |
| Anthropic | `POST /v1/messages`, `x-api-key` và `anthropic-version: 2023-06-01` | Bắt buộc `max_tokens`; không có JSON mode riêng nên bộ đọc JSON tự tách |

Chọn mô hình: một **nhà mặc định** và **mô hình mặc định** (gõ tên trần, thuộc nhà mặc định), cộng mô hình riêng cho từng phòng viết dạng `nhà:tên` (ví dụ `openai:tên-mô-hình`). Mỗi nhà một khoá riêng và một hàng đợi giới hạn tốc độ riêng.

### Một lời gọi đi qua những gì
1. **Rào chắn** (kiểm trước mỗi lần, kể cả lần thử lại): AI đang bật, có khoá của nhà đó, chưa chạm giới hạn lời gọi trong ngày, với nhà tính tiền thì phải có đơn giá và ngân sách tháng chưa chạm.
2. **Hàng đợi** của nhà đó: tối đa `rpm` lời gọi mỗi phút và 2 lời gọi cùng lúc.
3. **Gọi nhà cung cấp** với thời gian chờ 120 giây.
4. **Thử lại**: lỗi tạm thời (hết tốc độ 429, máy chủ 5xx, mất mạng, quá thời gian) thử lại tối đa 5 lần, chờ theo thời gian nhà yêu cầu hoặc lùi dần 2, 4, 8, 16 giây. Lỗi khoá, mô hình, yêu cầu sai, hết số dư, bị chặn an toàn thì **không** thử lại.
5. **Ghi sổ**: mỗi lần thử ghi một dòng vào `ai_calls` (nhà, mô hình, token, tiền, thời gian, lỗi đã che khoá). Chi phí ghi vào `costs` theo số token do nhà báo.
6. **Đọc JSON**: mô hình phải trả JSON theo mẫu; nếu hỏng hoặc bị cắt vì hết token thì hỏi lại đúng một lần kèm lời nhắc, hỏng tiếp thì dự án dừng.

Nút **Thử khoá** chỉ thử một lần, chờ tối đa 30 giây, không tự thử lại, để lỗi hiện ngay.

### Mỗi phòng làm gì và ghi ra tệp nào
Mô hình trả `{ "summary": "...", "files": [{ "path": "...", "content": "..." }] }`. Tệp được ghi vào `data/projects/<mã dự án>/`.

| Phòng | Tệp tạo ra |
|---|---|
| 01 Điều hành | `docs/01-ke-hoach-ky-thuat.md` |
| 02 Sản phẩm | `docs/02-pham-vi-san-pham.md` |
| 03 Phân tích | `docs/03-yeu-cau-chi-tiet.md` |
| 05 Thiết kế | `docs/05-thiet-ke-giao-dien.md` |
| 06/07/08/09 Lập trình | Mã nguồn theo loại sản phẩm (bảng dưới) |
| 10 Kiểm thử | `docs/10-bao-cao-kiem-thu.md`, và `docs/10-bao-cao-kiem-thu-lai.md` sau khi sửa |
| 11 An ninh | `docs/11-ra-soat-an-ninh.md` (đọc mã, không sửa) |
| 12 Vận hành | `docs/12-huong-dan-chay.md`, `README.md` |

Mã nguồn theo loại sản phẩm (phòng đứng sau chờ phòng đứng trước xong rồi đọc tệp của họ để mã khớp nhau):

| Loại | Tệp |
|---|---|
| Web | 06: `index.html`, `style.css` → 09: `app.js` (chờ 06) ; 07: `server/server.js` |
| Trang đích | 06: `index.html`, `style.css` → 09: `app.js` (chờ 06) |
| Phần mềm máy tính | 07: `src/core.js` → 06: `main.js` (chờ 07). Chương trình Node.js, **chưa đóng gói `.exe`** |
| Di động | 08: `index.html`, `style.css`, `app.js`, `manifest.json` → 07: `server/server.js` (chờ 08). Là PWA đơn giản, không phải ứng dụng cài từ cửa hàng |

Mỗi phòng nhận: yêu cầu gốc, tóm tắt các phòng trước, nội dung các tệp liên quan (cắt theo giới hạn độ dài), và các quy tắc trong trang Kiến thức (tối đa 8) cùng lời nhắc an toàn.

### Kiểm thử thật
Phòng 10 chạy **kiểm tra tĩnh** trên các tệp (chỉ đọc và phân tích cú pháp, **không bao giờ chạy mã**; `vm.Script` chỉ biên dịch):
- Lỗi cú pháp JavaScript (bỏ qua mã ES module), JSON không hợp lệ, ngoặc nhọn CSS không khớp, tệp rỗng.
- HTML: thẻ mở đóng không khớp (với các thẻ thông dụng), id bị trùng, thiếu `<!doctype html>`, ảnh thiếu `alt`, tệp được tham chiếu (`src`, `href`) không tồn tại.
- Đối chiếu chéo: JavaScript tìm phần tử theo id mà không tệp HTML nào có.
- Dùng `eval`, `new Function`, `document.write`; máy chủ mở ra toàn mạng (`listen` không chỉ định `127.0.0.1`); `manifest.json` thiếu `name` hoặc `start_url`; thiếu `index.html` (web, trang đích, di động).

Sau đó AI rà soát mã tìm tối đa 3 lỗi logic. Bật **kiểm thử sâu** thì rà soát hai lượt (logic, rồi đối chiếu từng tính năng trong yêu cầu với mã, tối đa 5 lỗi mỗi vòng) và kiểm lại bằng AI chứ không chỉ kiểm tra tĩnh.

Lỗi tìm ra được trả về đúng phòng đã viết tệp (theo ghi nhận trong `project_files`), người đó nhờ AI sửa, rồi phòng Kiểm thử kiểm lại. Số vòng sửa lỗi tối đa chỉnh từ 1 đến 5 (mặc định 1). Hết vòng mà còn lỗi thì dự án đi tiếp kèm thông báo "Kiểm lại vẫn còn…".

## 6. Chi phí và ngân sách

**Hai loại chi phí, tách bạch:**
- **Tiền thật:** các khoản từ AI thật, tính theo số token nhà báo. Chỉ loại này được tính vào ô "Chi phí tháng", ngân sách tháng, cảnh báo 80% và 100%, trần tự dừng của AI, và phần "ngân sách còn lại" khi lập kế hoạch.
- **Chi phí mô phỏng:** đơn giá giả định × hệ số ngẫu nhiên 0,8 đến 1,3, mang nhãn model "Mô phỏng". Hiện thành dòng riêng ("Mô phỏng: $x, không phải tiền thật") và **không** tính vào ngân sách hay cảnh báo.

**Cách tính tiền thật:**
- Gemini ở bậc **Miễn phí**: tiền luôn 0 nhưng vẫn đếm token.
- Gemini ở bậc **Trả tiền**, OpenAI, Anthropic: tiền = (token vào × giá vào + token ra × giá ra) / 1.000.000 theo bảng đơn giá ở Cài đặt (USD cho một triệu token). Token "suy nghĩ" của mô hình tính như token đầu ra.
- Bảng đơn giá chỉ có sẵn vài mô hình Gemini, lấy từ các trang tổng hợp (đầu tháng 10/2026), **chưa phải trang chính thức**: hãy tự kiểm tra. **OpenAI và Anthropic không có giá mặc định** (thiếu số liệu đáng tin); không có giá thì không bắt đầu được dự án.

**Ngân sách:**
- Ngân sách tháng đặt trong Cài đặt. Từ 80% có cảnh báo vàng, từ 100% cảnh báo đỏ; mỗi mức báo một lần mỗi tháng. Ở bậc tính tiền, chạm 100% là AI tự dừng.
- Ngân sách mỗi dự án = ước tính của kế hoạch × 1,15. Vượt thì dừng ở cổng chi phí vượt chờ bạn duyệt (duyệt thì nâng thêm tối thiểu 0,5 hoặc 25% ước tính, lấy số lớn hơn).
- Ước tính của CTO dùng đơn giá giả định, nên chi phí thật có thể lệch nhiều.
- Nên đặt thêm hạn mức chi tiêu ngay trên tài khoản của nhà cung cấp làm lớp bảo vệ thứ hai.

## 7. An toàn và quyền riêng tư

**Máy chủ:** chỉ lắng nghe `127.0.0.1`; từ chối `Host` và `Origin` lạ (chống truy cập từ trang web khác); các yêu cầu ghi phải là JSON; có chính sách bảo mật nội dung (CSP); không cho thoát khỏi thư mục `public`.

**Khoá API:**
- Lưu ở `data/ai-key.json` (dạng `{ "key": "<khoá Gemini>", "keys": { "openai": "...", "anthropic": "..." } }`). Tệp được tạo với quyền chỉ chủ sở hữu đọc được (trên Windows không áp dụng). **Là chữ thường, giống tệp `.env`**: ai đọc được ổ đĩa của bạn thì đọc được khoá.
- Không nằm trong cơ sở dữ liệu, không nằm trong bản sao lưu, không bao giờ gửi ra giao diện (chỉ 4 ký tự cuối) và bị che khỏi thông báo lỗi và nhật ký (cả dạng `AIza…` lẫn `sk-…`).
- Chỉ gửi tới đúng địa chỉ của nhà cung cấp; địa chỉ lạ trong cấu hình bị bỏ qua (địa chỉ máy này chỉ dùng để kiểm thử).
- Có thể thay bằng biến môi trường `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.
- **Đừng chụp màn hình hoặc gửi lên mạng khi có khoá hiện trên đó.** Nếu lỡ, hãy xoá khoá ở trang của nhà cung cấp và tạo khoá mới.

**Tệp do AI tạo (không đáng tin):**
- Chỉ ghi tệp chữ có đuôi cho phép (`.md .txt .html .htm .css .js .json .svg .py .csv .xml .yml .yaml .sql .ts`); không `.exe`, `.bat`, `.sh`, `.ps1`…
- Đường dẫn: tương đối, không ẩn, không `..`, không ổ đĩa, không tên đặc biệt của Windows, tối đa 5 cấp; không ghi đè thư mục hay liên kết tượng trưng.
- Giới hạn: 200 KB mỗi tệp, 12 tệp và 600 KB mỗi lần, 60 tệp và 4 MB mỗi dự án.
- Chỉ đọc lại được tệp đã ghi nhận trong cơ sở dữ liệu, nên giao diện không thể dùng để đọc tệp tuỳ ý trên ổ đĩa.
- Ứng dụng **không bao giờ chạy** mã do AI viết. Hãy đọc trước khi tự chạy.

**Hàng rào chi tiêu:** AI tắt mặc định; giới hạn lời gọi mỗi phút (hàng đợi) và mỗi ngày (mặc định 10 và 300); trần ngân sách tháng; nút **Tắt khẩn cấp** huỷ mọi lời gọi đang chạy và đang chờ ở cả ba nhà, tắt AI và dừng các dự án AI. Tắt AI trong Cài đặt, xoá khoá nhà mặc định, hoặc khôi phục cài đặt mặc định đều làm điều tương tự.

## 8. Sao lưu và khôi phục

- **Sao lưu:** tự động mỗi ngày khi ứng dụng đang chạy (kiểm tra mỗi 6 giờ), hoặc bấm "Sao lưu ngay" trong Cài đặt. Mỗi bản là một thư mục `data/backups/<mã>/` gồm `company.db` (chụp nhất quán bằng `VACUUM INTO`), thư mục `projects/` (tệp sản phẩm) và `manifest.json`. Giữ 10 bản gần nhất, cộng 3 bản "trước khi khôi phục". **Không gồm khoá API.**
- **Khôi phục:** chọn một bản, bấm Khôi phục (xác nhận hai bước). Việc này đặt một lệnh chờ; bước khôi phục thật diễn ra **khi bạn khởi động lại ứng dụng**, trước khi mở cơ sở dữ liệu. Trước khi thay, ứng dụng giữ một bản an toàn của dữ liệu hiện tại. Từ chối bản hỏng (kiểm tra toàn vẹn) và bản từ phiên bản mới hơn. Có thể huỷ lệnh chờ. Nếu khôi phục lỗi giữa chừng, lệnh chờ bị xoá (không lặp vô hạn), ứng dụng vẫn khởi động và bản an toàn vẫn còn.
- Mang dữ liệu sang máy khác: chép cả thư mục `data` (lưu ý nó chứa khoá API nếu bạn đã lưu).

## 9. Cấu hình

**`config.json`** (tệp của bạn, bộ cập nhật không đụng tới):

| Khoá | Ý nghĩa | Mặc định |
|---|---|---|
| `brandName`, `tagline` | Tên và khẩu hiệu công ty | "Công ty AI" |
| `port` | Cổng | 3000 |
| `currency` | Đơn vị tiền hiển thị | USD |
| `monthlyBudget` | Ngân sách tháng | 100 |
| `sim.stageSeconds` | Thời lượng mỗi chặng mô phỏng (giây, tối thiểu và tối đa) | [8, 18] |
| `sim.autoDemo`, `sim.maxAutoRuns` | Tự tạo việc mô phỏng, số việc tối đa cùng lúc | false, 3 |
| `sim.bugRate` | Xác suất lỗi mô phỏng | 0,35 |
| `sim.maxBugRounds` | Số vòng lỗi mô phỏng | 1 |
| `sim.gates` | Bật hai cổng phê duyệt (chi phí vượt, phát hành) | true |
| `ai` (tuỳ chọn) | Giá trị mặc định cho AI thật; xem dưới | AI tắt |

**Trang Cài đặt** chỉnh ngay không cần khởi động lại, lưu vào bảng `settings` của cơ sở dữ liệu và **ghi đè** `config.json` mỗi lần khởi động. Gồm: tên và khẩu hiệu, ngân sách tháng, tỷ lệ lỗi mô phỏng, cổng phê duyệt, thông báo nào được bật, và toàn bộ phần AI: bật tắt, nhà mặc định, bậc Miễn phí hoặc Trả tiền (chỉ áp dụng cho Gemini), mô hình mặc định, mô hình theo phòng, bảng đơn giá, mức suy nghĩ của Gemini, số vòng sửa lỗi (1 đến 5), kiểm thử sâu, lời gọi mỗi phút (1 đến 600), lời gọi mỗi ngày (1 đến 5000), token tối đa mỗi câu trả lời (256 đến 65536). Mọi giá trị đều được kiểm tra chặt; giá trị lưu hỏng bị bỏ qua khi khởi động. "Khôi phục mặc định" đưa về `config.json` và **tắt AI** (không xoá khoá).

## 10. API

Tất cả nằm dưới `/api/`, trả JSON, lỗi có `{ "error": "..." }` bằng tiếng Việt. Yêu cầu `POST` cần `Origin` khớp và `Content-Type: application/json`. Cập nhật thời gian thực qua SSE (`/events`).

| Nhóm | Đường dẫn |
|---|---|
| Hệ thống | `GET /health`, `/system`, `/config`, `/overview`, `/search` |
| Công ty | `GET /departments`, `/agents` |
| Mô phỏng | `GET /sim`; `POST /sim/spawn`, `/sim/speed`, `/sim/auto`, `/sim/clear`, `/sim/delivered`, `/sim/arrived`, `/sim/viewer` |
| Dự án | `GET/POST /projects`; `GET /projects/{id}`, `/projects/{id}/files`, `/projects/{id}/file?path=`; `POST /projects/{id}/approve`, `/reject` |
| Việc và lỗi | `GET /tasks`, `/bugs`, `/bugs/summary` |
| Phê duyệt | `GET /approvals`; `POST /approvals/{id}/approve`, `/reject` |
| Chi phí | `GET /costs`, `/costs/summary`, `/deployments` |
| Báo cáo | `GET /reports/company`, `/reports/project/{id}` |
| Bản đồ nhiệt | `GET /heatmap?metric=tasks\|cost\|bugs&period=7\|30\|all` |
| Thông báo | `GET /notifications`; `POST /notifications/read` |
| Kiến thức | `GET/POST /knowledge`, `GET /knowledge/tags`, `POST /knowledge/{id}`, `/{id}/update`, `/{id}/delete` |
| Trợ lý | `POST /assistant` |
| Cài đặt | `GET/POST /settings`; `POST /settings/reset` |
| AI thật | `GET /ai/status`; `POST /ai/key`, `/ai/key/delete`, `/ai/test`, `/ai/kill` |
| Sao lưu | `GET/POST /backups`; `POST /backups/{id}/restore`, `/{id}/delete`, `/backups/cancel-restore` |

Các tuyến nhận `provider` (`gemini`, `openai`, `anthropic`) trong thân yêu cầu, mặc định `gemini`: `/ai/key`, `/ai/key/delete`, `/ai/test` (kèm `model` cho nhà không phải mặc định).

## 11. Cơ sở dữ liệu

SQLite một tệp `data/company.db` (chế độ WAL, nên có thêm `-wal` và `-shm` khi đang chạy). Mỗi giai đoạn thêm một migration ở cuối `src/db.js`; **không bao giờ sửa migration cũ**.

| # | Nội dung |
|---|---|
| 1 | Nền tảng: phòng ban, agent |
| 2 | Bộ máy mô phỏng: cài đặt, lượt chạy, việc |
| 3 | Yêu cầu của CEO, kế hoạch của CTO (dự án) |
| 4 | Lỗi, việc sửa lỗi và kiểm lại |
| 5 | Chi phí, phê duyệt, triển khai |
| 6 | Thông báo, kiến thức |
| 7 | AI thật: tệp sản phẩm (`project_files`), tóm tắt từng phòng (`ai_outputs`), nhật ký lời gọi (`ai_calls`), cờ `ai` của dự án và lượt chạy |

## 12. Cấu trúc thư mục

```
server.js              Điểm chạy: kiểm tra giao diện, mở máy chủ, tự sao lưu
config.json            Cấu hình của bạn
start.bat, cap-nhat.bat, cap-nhat.mjs   Chạy và cập nhật (Windows)
HUONG-DAN.md           Hướng dẫn người dùng (sinh từ public/js/guide-data.js)
data/                  Dữ liệu của bạn: company.db, ai-key.json, projects/, backups/
src/
  app.js               Dựng máy chủ HTTP, nối các mô-đun, khôi phục lúc khởi động
  api.js               Các tuyến /api
  db.js                Mở cơ sở dữ liệu và các migration
  sim.js               Bộ máy mô phỏng và dây chuyền (cả việc AI thật)
  planner.js, projects.js, work.js, bugs.js        Kế hoạch, dự án, việc, lỗi
  approvals.js, costs.js, pricing.js, reports.js   Phê duyệt, chi phí, báo cáo
  notify.js, knowledge.js, assistant.js, settings.js   Thông báo, kiến thức, trợ lý, cài đặt
  backup.js, heatmap.js, checkfront.js, events.js  Sao lưu, bản đồ nhiệt, kiểm tra giao diện, SSE
  ai/
    service.js         Điều phối: rào chắn, hàng đợi, thử lại, kiểm thử, sửa lỗi
    gemini.js, openai.js, anthropic.js, providers.js, http.js   Từng nhà cung cấp
    secrets.js         Lưu và che khoá
    limiter.js         Hàng đợi giới hạn tốc độ
    files.js, checks.js   Ghi tệp an toàn, kiểm tra tĩnh
    prompts.js         Chỉ dẫn từng phòng
    config.js, errors.js
public/
  index.html, css/app.css
  js/app.js            Khung, định tuyến, thanh trên và dưới
  js/pages*.js         Các trang; shell9.js chuông và trợ lý
  js/office_gl.js, gl/ Văn phòng 3D (WebGL2); office3d.js bản phẳng dự phòng; map2d.js sơ đồ 2D
  js/heat.js           Bản đồ nhiệt (hàm thuần)
  js/kiosk.js, kiosk-logic.js   Chế độ trình chiếu
  js/guide-data.js     Nội dung hướng dẫn
tests/                 Các bài kiểm thử; helpers/fake-gemini.js là máy chủ AI giả
tools/                 build-patcher.mjs, build-guide.mjs
```

## 13. Kiểm thử

```
node --test "tests/*.test.js"
```
Hiện có **374 bài**, chạy trong vài chục giây, không cần mạng, khoá thật hay tốn tiền.

- Các bài về AI dùng `tests/helpers/fake-gemini.js`: một máy chủ HTTP chạy trên máy, nói được định dạng của cả ba nhà, có thể giả lập 429, 5xx, treo, mất kết nối, JSON hỏng, bị cắt, bị chặn, hết số dư, từ chối trường `thinkingConfig`. Có bài chạy trọn một dự án qua máy chủ giả.
- Còn có bài kiểm tra: cửa sổ trượt và đồng thời của hàng đợi, ghi tệp an toàn (đường dẫn thoát, liên kết tượng trưng, giới hạn), kiểm tra tĩnh, khoá không lọt ra giao diện, nhật ký, bản sao lưu, và thông báo lỗi; cả luồng sao lưu và khôi phục qua việc khởi động lại; ngân sách chỉ tính tiền thật; màu và nhãn bản đồ nhiệt; kế hoạch tham quan của kiosk; hướng dẫn khớp với `HUONG-DAN.md`; `cap-nhat.mjs` khớp với mã.
- **Giới hạn của bộ kiểm thử:** nó chứng minh mã khớp với định dạng mà mình hiểu, **không** chứng minh dịch vụ thật chấp nhận định dạng đó (xem mục 1).

## 14. Phát triển và cập nhật

- Sửa mã trong `src/`, `public/` hoặc `server.js` thì chạy `node tools/build-patcher.mjs` để dựng lại `cap-nhat.mjs` (có bài kiểm thử báo đỏ nếu quên).
- Sửa hướng dẫn trong `public/js/guide-data.js` thì chạy `node tools/build-guide.mjs` để sinh lại `HUONG-DAN.md` (cũng có bài kiểm thử so khớp).
- Thêm cột hoặc bảng: thêm migration mới ở **cuối** `src/db.js`, tăng số migration trong `tests/phase1.test.js`.
- Thêm nhà cung cấp AI: viết bộ gọi mới trong `src/ai/` (cùng giao diện `generate`), đăng ký trong `providers.js`, `service.js` và `secrets.js`, mở rộng máy chủ giả trong `tests/helpers/fake-gemini.js`, và viết bài kiểm thử tương tự `tests/phase13.test.js`.
- Tệp `cap-nhat.mjs` chỉ gồm `server.js`, `package.json`, `src/` và `public/`. README và `HUONG-DAN.md` không nằm trong đó.
- Lưu ý khi chạy kiểm thử hoặc máy chủ thử trên Linux: một lệnh dài có thể bị cắt; giữ máy chủ nền chạy bằng `setsid nohup`.

## 15. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Trang trắng sau khi cập nhật | Chạy `cap-nhat.bat`, mở lại `start.bat`, nhấn Ctrl+F5. Console của `server.js` cũng in danh sách tệp không khớp |
| "Cổng 3000 đang được dùng" | Đóng cửa sổ ứng dụng cũ, hoặc đổi `port` trong `config.json` |
| Không có cảnh 3D, chỉ thấy bản phẳng | Máy hoặc trình duyệt không hỗ trợ WebGL2. Bản đồ nhiệt không có ở bản phẳng |
| **Thử khoá**: "Khoá API bị từ chối" | Khoá sai, thiếu, hoặc bị thu hồi. Dán lại khoá đúng |
| **Thử khoá**: "Không tìm thấy mô hình" | Tên mô hình không có trong tài khoản. Chép đúng tên từ AI Studio hoặc trang của nhà cung cấp |
| **Thử khoá**: "Mô hình không trả lời sau 30 giây" | Phía nhà cung cấp chậm hoặc nghẽn (hay gặp khi mô hình suy nghĩ lâu), hoặc mạng chặn. Thử mức suy nghĩ Thấp, đổi mô hình nhẹ hơn, kiểm tra mạng và VPN |
| 429 "hết hạn mức tốc độ" | Chạm giới hạn mỗi phút hoặc tài khoản còn ở bậc thấp (OpenAI thường cần có số dư). Chờ một phút và thử một lần; hạ "lời gọi mỗi phút" |
| "hết số dư" (OpenAI, Anthropic) | Nạp thêm số dư trên tài khoản nhà cung cấp |
| Duyệt kế hoạch báo 409 | Thiếu khoá của một nhà đang dùng, hoặc thiếu đơn giá của mô hình; làm theo nội dung thông báo |
| Dự án dừng "vì lỗi AI" | Mở thông báo đọc nguyên nhân. Tiền đã tiêu vẫn được tính. Sửa nguyên nhân rồi gửi lại yêu cầu |
| Dự án dừng vì "chạm ngân sách tháng" hoặc "giới hạn lời gọi" | Tăng ngân sách hoặc giới hạn trong Cài đặt |
| Chi phí tháng không tăng sau khi "Chạy thử" | Đúng thiết kế: chi phí mô phỏng tách riêng, không tính vào ngân sách |
| Muốn về dữ liệu gốc | Tắt ứng dụng, sao lưu thư mục `data`, rồi xoá `data/company.db`. Mọi dự án sẽ mất |

Khi báo lỗi, hãy chụp nguyên văn thông báo và **che khoá** nếu nó hiện trên màn hình.

## 16. Giới hạn đã biết

- **AI thật chưa được xác nhận với dịch vụ thật** (xem mục 1). Chỉ dẫn từng phòng, tên mô hình mặc định `gemini-3.8-flash` và các định dạng gọi API đều có thể cần chỉnh.
- Mẫu mã của Google AI Studio hiện dùng một API khác (`interactions.create`) với cách ứng dụng đang gọi (`generateContent`). Chưa biết hai cách có khác biệt nào ảnh hưởng với mô hình mới hay không.
- Chưa đóng gói `.exe` hay ứng dụng di động thật, chưa đưa sản phẩm lên máy chủ nào. Mục Triển khai chỉ ghi lại rằng mã nguồn đã được tạo.
- Kiểm lại ở chế độ thường chỉ kiểm tra tĩnh, không phát hiện được lỗi logic; chế độ kiểm thử sâu cải thiện phần này bằng AI nhưng tốn thêm lời gọi.
- Kiểm tra tĩnh dựa trên cách phân tích đơn giản, có thể báo nhầm hoặc bỏ sót (ví dụ id do mã tạo động). Chỉ kiểm tra thẻ HTML thông dụng.
- Cảnh 3D cần WebGL2. Tấm màu bản đồ nhiệt trên sàn 3D chưa được xác nhận bằng mắt ở mọi góc nhìn; nhãn số, chú giải và bản đồ nhỏ thì đã kiểm.
- Chỉ kiểm tra bằng Chromium không đầu; chưa thử trên nhiều trình duyệt, card đồ hoạ và kích thước màn hình.
- Khoá API lưu dạng chữ thường (xem mục 7). Chưa mã hoá bằng kho khoá của hệ điều hành.
- Giá có sẵn của Gemini chưa kiểm tra với trang giá chính thức; OpenAI và Anthropic không có giá mặc định.
- Trợ lý trả lời theo quy tắc, không phải AI.
