// Nội dung Hướng dẫn sử dụng. Là dữ liệu thuần: trang Hướng dẫn trong ứng dụng và tệp HUONG-DAN.md đều sinh ra từ đây
// (chạy: node tools/build-guide.mjs), nên hai bản không bao giờ lệch nhau.
export const GUIDE = [
  { id: 'bat-dau', title: 'Bắt đầu nhanh', paras: [
    'Công ty AI chạy ngay trên máy của bạn, không cần tài khoản hay cài thêm gói nào. Chỉ cần Node.js bản 22.5 trở lên (gõ node -v để kiểm tra).'
  ], steps: [
    'Bấm đúp start.bat. Trình duyệt tự mở trang http://localhost:3000.',
    'Dùng xong, đóng cửa sổ đen để tắt ứng dụng. Dữ liệu của bạn vẫn còn lần sau.',
    'Khi có bản cập nhật mới: đặt tệp cap-nhat.mjs cạnh server.js, bấm đúp cap-nhat.bat, mở lại start.bat, rồi nhấn Ctrl + F5 trong trình duyệt. Cập nhật không đụng tới dữ liệu và config.json.'
  ] },
  { id: 'giao-viec', title: 'Giao việc cho công ty', paras: [
    'Mọi việc bắt đầu từ một yêu cầu bằng tiếng Việt, từ 10 đến 2000 ký tự, mô tả sản phẩm bạn muốn.'
  ], steps: [
    'Vào Phòng điều hành, gõ yêu cầu và chọn loại sản phẩm (web, phần mềm máy tính, trang đích hoặc di động).',
    'Giám đốc kỹ thuật (CTO) lập kế hoạch: chia việc cho từng phòng theo từng chặng và ước tính chi phí.',
    'Bạn đọc kế hoạch rồi bấm Duyệt và chạy, hoặc Từ chối. Chưa duyệt thì chưa có việc nào bắt đầu và chưa tốn gì.',
    'Cách nhanh hơn: nhấn Ctrl + K, gõ cả câu yêu cầu rồi chọn Giao cho CTO. Việc này chỉ lập kế hoạch và chờ bạn duyệt.'
  ] },
  { id: 'theo-doi', title: 'Theo dõi công việc', paras: [
    'Tổng quan có văn phòng 3D để xem nhân viên đi lại, ngồi làm việc và chuyển hồ sơ cho nhau. Các trang khác cho cái nhìn chi tiết:'
  ], list: [
    'Dự án: từng dự án, tiến độ, chi phí, lỗi, và sản phẩm đã tạo.',
    'Công việc: danh sách việc đang làm, đang chờ, đã xong.',
    'Lỗi: các lỗi phòng Kiểm thử tìm ra và ai đang sửa.',
    'Nhân sự: 26 nhân viên của 12 phòng, mỗi người làm gì.',
    'Chuông thông báo ở thanh trên: báo khi cần bạn duyệt, có lỗi mới, dự án xong, sắp hết ngân sách hoặc bị dừng.'
  ] },
  { id: 'phe-duyet', title: 'Những bước cần bạn duyệt', paras: [
    'Công ty luôn dừng lại chờ bạn ở ba chỗ, và không tự ý đi tiếp:'
  ], list: [
    'Kế hoạch của CTO, trước khi bắt đầu.',
    'Chi phí vượt ngân sách của dự án: duyệt thì ngân sách được nâng thêm, từ chối thì dự án dừng và tiền đã tiêu vẫn tính.',
    'Cho phép phát hành, trước bước triển khai cuối cùng: từ chối thì dự án dừng.',
    'Tất cả nằm ở trang Phê duyệt. Bạn có thể tắt hai cổng sau trong Cài đặt nếu không muốn bị hỏi.'
  ] },
  { id: 'that-va-thu', title: 'Chạy thử và chạy thật', paras: [
    'Có hai kiểu làm việc, và bạn luôn biết đang ở kiểu nào:'
  ], list: [
    'Mô phỏng: nhân viên làm việc theo đồng hồ, không gọi dịch vụ AI nào, không tốn tiền và không tạo tệp. Đây là chế độ mặc định, dùng để xem công ty vận hành.',
    'AI thật: mỗi phòng nhờ một mô hình AI làm việc thật, viết tài liệu và mã nguồn, có chi phí tính theo số token thật.',
    'Nút Chạy thử và tính năng tự tạo việc ở Tổng quan luôn là mô phỏng, kể cả khi AI thật đang bật.',
    'Dự án thật (đã duyệt kế hoạch) dùng AI thật nếu AI đang bật và có khoá API; ngược lại thì chạy mô phỏng. Chế độ được chốt lúc bắt đầu dự án và giữ nguyên đến hết.'
  ] },
  { id: 'bat-ai', title: 'Bật AI thật', paras: [
    'AI thật cần một khoá API (giống mật khẩu cho phép chương trình gọi mô hình). Công ty hỗ trợ ba nhà: Gemini (Google), OpenAI và Anthropic (Claude). Mỗi nhà một khoá riêng; bạn chỉ cần khoá của nhà bạn định dùng.',
    'Gói đăng ký cá nhân như Gemini Pro hay ChatGPT Plus không có khoá API và không dùng được cho việc này.'
  ], steps: [
    'Mở Google AI Studio, vào mục khoá API (aistudio.google.com/apikey) và tạo một khoá. Giữ bí mật như mật khẩu, không gửi cho ai và không chụp màn hình có hiện khoá.',
    'Trong Cài đặt, mục AI thật, dán khoá vào và bấm Lưu khoá. Bấm Thử khoá để kiểm tra kết nối (tốn một lượng token rất nhỏ).',
    'Chọn bậc: Miễn phí hoặc Trả tiền (xem bên dưới), chọn mô hình, rồi tick Bật AI thật và bấm Lưu.',
    'Giao một dự án như bình thường. Bạn thấy nhãn AI thật trên dự án và các tệp xuất hiện trong trang dự án.'
  ], list: [
    'Bậc miễn phí: không mất tiền (công ty hiển thị 0 đô nhưng vẫn đếm token), nhưng bị giới hạn số lời gọi mỗi phút và mỗi ngày nên chạy chậm hơn, và theo điều khoản của Google, nội dung gửi lên có thể được dùng để cải thiện sản phẩm. Đừng đưa dữ liệu mật vào.',
    'Bậc trả tiền: chi phí tính theo đơn giá trong Cài đặt. Đơn giá có sẵn lấy từ các trang tổng hợp, chưa phải trang chính thức: bạn hãy tự kiểm tra trên trang giá của Google và sửa nếu cần.',
    'Chọn nhà mặc định và mô hình trong Cài đặt. Mỗi phòng có thể dùng nhà và mô hình riêng, ghi dạng nhà:tên (ví dụ openai:tên-mô-hình). Bậc miễn phí chỉ có ở Gemini; OpenAI và Anthropic luôn tính tiền và bạn phải nhập đơn giá (mục nâng cao) thì mới chạy được dự án. Thiếu khoá hoặc đơn giá thì ứng dụng báo ngay khi duyệt kế hoạch.',
    'Giới hạn an toàn: số lời gọi mỗi phút (hàng đợi tự giãn cách), số lời gọi mỗi ngày, và với bậc trả tiền thì ngân sách tháng là trần cứng: chạm là AI tự dừng.',
    'Nút Tắt khẩn cấp: huỷ ngay mọi lời gọi đang chạy, tắt AI và dừng các dự án đang dùng AI.',
    'Khoá được lưu trong data/ai-key.json trên máy bạn, ở dạng chữ thường như tệp .env. Ai đọc được ổ đĩa của bạn thì đọc được khoá. Khoá không nằm trong cơ sở dữ liệu, không có trong bản sao lưu và không bao giờ hiện lại trên màn hình (chỉ 4 ký tự cuối).'
  ] },
  { id: 'chi-phi', title: 'Chi phí và ngân sách', paras: [
    'Trang Chi phí AI cho thấy tiền tiêu theo tháng, theo dự án, theo phòng và từng khoản chi.'
  ], list: [
    'Ngân sách tháng đặt trong Cài đặt. Dùng hơn 80% thì có cảnh báo vàng, từ 100% thì cảnh báo đỏ.',
    'Ngân sách mỗi dự án bằng ước tính của kế hoạch nhân 1,15. Vượt thì dự án dừng chờ bạn duyệt thêm.',
    'Chi phí mô phỏng chỉ là đơn giá giả định để xem cách công ty tính tiền. Chi phí thật chỉ có từ các dự án AI thật và được ghi riêng.',
    'Ước tính của CTO là ước tính theo đơn giá giả định, nên chi phí thật có thể khác khá nhiều. Hãy bắt đầu với ngân sách tháng thấp (vài đô) cho tới khi bạn thấy một dự án tốn bao nhiêu.',
    'Bạn nên đặt thêm hạn mức chi tiêu ngay trên tài khoản Google Cloud của mình làm lớp bảo vệ thứ hai.'
  ] },
  { id: 'san-pham', title: 'Sản phẩm AI tạo ra', paras: [
    'Với dự án AI thật, mọi tệp nằm trong thư mục data/projects/<mã dự án>/ trên máy bạn, và xem được ngay trong trang dự án (mục Sản phẩm AI đã tạo). Tài liệu của các phòng nằm trong thư mục docs.'
  ], list: [
    'Dự án web và trang đích: mở tệp index.html bằng trình duyệt.',
    'Phần mềm máy tính: chương trình Node.js, chạy bằng lệnh node main.js trong thư mục dự án. Chưa đóng gói thành tệp .exe.',
    'Ứng dụng di động: một trang web dạng PWA cho điện thoại, chưa phải ứng dụng cài từ cửa hàng.',
    'Mã do AI viết có thể sai hoặc thiếu. Hãy đọc trước khi chạy. Ứng dụng không bao giờ tự chạy mã đó.',
    'Phòng Kiểm thử kiểm tra thật: đọc mã tìm lỗi cú pháp, JSON hỏng, thẻ HTML không khớp, tệp bị thiếu, rồi nhờ AI rà soát thêm. Lỗi tìm ra được trả về đúng phòng đã viết tệp để sửa, sau đó kiểm tra lại. Việc kiểm tra chỉ đọc mã, không chạy.',
    'Số vòng sửa lỗi tối đa chỉnh được từ 1 đến 5 trong Cài đặt. Bật Kiểm thử sâu thì AI rà soát hai lượt (logic, và đối chiếu từng tính năng trong yêu cầu với mã) rồi kiểm lại bằng AI; tốn thêm 2 đến 3 lời gọi mỗi dự án.',
    'Hiện chưa có bước đưa sản phẩm lên máy chủ nào: mục Triển khai chỉ ghi lại rằng mã nguồn đã được tạo.'
  ] },
  { id: 'sao-luu', title: 'Sao lưu và khôi phục', paras: [
    'Ứng dụng tự sao lưu dữ liệu mỗi ngày khi đang chạy và giữ 10 bản gần nhất trong data/backups. Bạn cũng sao lưu ngay được ở Cài đặt, mục Sao lưu.'
  ], list: [
    'Một bản sao lưu gồm cơ sở dữ liệu (dự án, chi phí, thông báo, kiến thức, cài đặt) và các tệp sản phẩm. Không gồm khoá API.',
    'Khôi phục: chọn một bản rồi bấm Khôi phục. Việc khôi phục xảy ra khi bạn khởi động lại ứng dụng (đóng cửa sổ đen rồi mở lại start.bat). Trước khi thay, ứng dụng giữ một bản an toàn của dữ liệu hiện tại, nên làm nhầm vẫn quay lại được.',
    'Ứng dụng từ chối khôi phục bản sao lưu bị hỏng hoặc được tạo bởi phiên bản mới hơn.',
    'Muốn mang dữ liệu sang máy khác: chép cả thư mục data (nhớ rằng data có chứa khoá API nếu bạn đã lưu).'
  ] },
  { id: 'do-hoa', title: 'Bản đồ nhiệt và chế độ trình chiếu', list: [
    'Bản đồ nhiệt: ở Tổng quan, tab Văn phòng 3D, chọn Nhiệt rồi một thước đo: Đang bận (số người đang làm trên tổng số người của phòng, cập nhật trực tiếp), Việc xong, Chi phí, hoặc Lỗi (7 ngày, 30 ngày hoặc tất cả). Màu xanh là ít, vàng là vừa, đỏ là nhiều; mỗi phòng cũng hiện con số cụ thể.',
    'Chế độ trình chiếu: nút Chế độ trình chiếu ở Tổng quan (hoặc Ctrl + K). Văn phòng 3D toàn màn hình, camera tự đi tham quan, có đồng hồ, thống kê và dòng chữ chạy khi hồ sơ chuyển. Dấu cách tạm dừng, mũi tên phải sang cảnh kế, F bật tắt toàn màn hình, Esc thoát.',
    'Chế độ trình chiếu chỉ để xem và mặc định không hiện chi phí (dành cho màn hình treo công khai). Muốn hiện, thêm ?chiphi=1 vào cuối địa chỉ trang #/kiosk.'
  ] },
  { id: 'tien-ich', title: 'Phím tắt, Trợ lý, Kiến thức, Cài đặt', list: [
    'Ctrl + K (hoặc phím /): ô lệnh. Tìm trang, phòng, người, dự án, kiến thức; chạy lệnh nhanh; hỏi Trợ lý; hoặc giao việc cho CTO.',
    'Trợ lý (nút lấp lánh ở thanh trên): hỏi về chi phí, ai đang làm gì, dự án đang chạy, có gì cần duyệt, lỗi chưa sửa. Trợ lý trả lời theo quy tắc dựa trên dữ liệu thật, chưa phải AI.',
    'Kiến thức: quy tắc dùng chung, ghi chú của bạn, và bài học tự động sau mỗi dự án. Các quy tắc được đưa vào chỉ dẫn của mọi agent AI thật.',
    'Cài đặt: tên công ty, ngân sách, cổng phê duyệt, tỷ lệ lỗi mô phỏng, thông báo, AI thật, sao lưu. Lưu trong cơ sở dữ liệu, áp dụng ngay.',
    'Giao diện sáng hoặc tối đổi bằng nút ở thanh trên.'
  ] },
  { id: 'su-co', title: 'Khi gặp sự cố', list: [
    'Trang trắng sau khi cập nhật: chạy cap-nhat.bat, mở lại start.bat và nhấn Ctrl + F5.',
    'Báo cổng 3000 đang được dùng: đóng cửa sổ ứng dụng cũ, hoặc đổi port trong config.json.',
    'Khoá API bị từ chối: kiểm tra lại khoá đã dán đủ và đúng; tạo khoá mới nếu cần.',
    'Báo hết hạn mức (429) hoặc dự án chạy chậm: bậc miễn phí bị giới hạn. Công ty tự chờ và thử lại tối đa 5 lần; hạn mức ngày làm mới vào nửa đêm giờ Thái Bình Dương. Có thể giảm số việc chạy cùng lúc hoặc chuyển sang bậc trả tiền.',
    'Dự án dừng vì lỗi AI: mở thông báo để đọc nguyên nhân (khoá, hạn mức, mô hình trả lời hỏng...). Tiền đã tiêu vẫn được tính. Sửa nguyên nhân rồi gửi lại yêu cầu.',
    'Chạm giới hạn lời gọi trong ngày hoặc ngân sách tháng: tăng giới hạn trong Cài đặt nếu muốn chạy tiếp.',
    'Muốn về dữ liệu gốc: tắt ứng dụng, sao lưu thư mục data, rồi xoá data/company.db. Mọi dự án sẽ mất.'
  ] },
  { id: 'gioi-han', title: 'Giới hạn hiện tại', paras: [
    'Để bạn không bị bất ngờ, đây là những điều ứng dụng chưa làm:'
  ], list: [
    'Chất lượng sản phẩm phụ thuộc hoàn toàn vào mô hình AI và yêu cầu của bạn. Mô hình nhẹ hoặc miễn phí cho kết quả đơn giản hơn.',
    'Chưa đóng gói tệp .exe hay ứng dụng di động thật, chưa đưa lên máy chủ nào. Trang web chạy bằng cách mở tệp.',
    'Cách gọi OpenAI và Anthropic được viết theo tài liệu của họ và kiểm bằng máy chủ giả, chưa thử với dịch vụ thật; Gemini cũng vậy. Hãy bấm Thử khoá trước khi chạy dự án.',
    'Chi phí ước tính của CTO dùng đơn giá giả định, không phải giá của mô hình bạn chọn.',
    'Số vòng sửa lỗi mặc định là một (tối đa năm). Kiểm lại ở chế độ thường chỉ chạy kiểm tra tĩnh, không phát hiện được lỗi logic.',
    'Chưa kiểm tra trên mọi trình duyệt và mọi card đồ họa. Cảnh 3D cần WebGL2; nếu máy không hỗ trợ, ứng dụng tự chuyển sang bản đồ phẳng.'
  ] }
];
