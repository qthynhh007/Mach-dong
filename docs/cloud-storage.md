# Dữ liệu dùng chung của Mạch Đồng

Ứng dụng Windows là giao diện; dữ liệu thay đổi do người dùng tạo nằm trên máy chủ công khai [Mạch Đồng](https://mach-dong-rice-data.artfulmica6.chatgpt.site). Bản EXE không cần cài cơ sở dữ liệu hay mô hình AI trên máy người dùng. Người dùng cần Internet để xem diễn đàn, đăng nhập và mô phỏng.

| Dữ liệu | Nơi lưu trong bản phát hành | Lý do |
|---|---|---|
| Tài khoản, bản băm mật khẩu, phiên đăng nhập, ví đã mã hóa, điểm mô phỏng và lịch sử quy đổi | Cloudflare D1, chỉ Worker truy cập | Chung giữa nhiều máy; xác thực và cập nhật tập trung |
| Thông tin ruộng của tài khoản: địa chỉ, giống, diện tích, trạm | Cloudflare D1 | Đổi máy hoặc cài lại vẫn còn; trang hồ sơ chuyển dữ liệu cũ từ trình duyệt lên cloud khi mở lại |
| Bài viết, câu trả lời, bản nháp, lượt đánh dấu hữu ích và giải đáp được chọn | Cloudflare D1 | Cùng một diễn đàn cho mọi người; quyền sửa/xóa kiểm tra trên máy chủ |
| Ảnh người dùng đính kèm bài | Cloudflare R2 | Tệp ảnh dùng chung; D1 chỉ lưu đường dẫn ảnh |
| Danh mục nguồn, lịch sử NASA POWER, logic mô phỏng và dự báo thời tiết | Worker/Site công khai và nguồn thời tiết được ghi rõ | Ứng dụng nhận cùng phiên bản dữ liệu và mô phỏng, không dự đoán từ tệp riêng của từng máy |
| CSV mẫu, bản tin trạm, nguồn tra cứu của Cò Mạ | Worker/Site, API `/api/reference/<tên-tệp>` | Cập nhật dữ liệu tham chiếu bằng cách phát hành Site mới; người dùng không cần tải lại EXE |
| AI của Cò Mạ | Groq gọi từ Worker/Site; khóa chỉ ở secret máy chủ | Ứng dụng gửi câu hỏi và mã nguồn đã chọn; Groq chỉ chọn lại mã phù hợp, Worker ghép đoạn đã duyệt và giới hạn lượt gọi |
| Bản cài Windows `MachDong.exe` | R2, tải công khai tại `/downloads/MachDong.exe` | Người dùng ngoài nhóm tải được một file EXE dù kho GitHub riêng tư; bản đã đối chiếu SHA-256 |

Dữ liệu chỉ phục vụ một thiết bị vẫn ở thiết bị: cookie đăng nhập `HttpOnly`, khóa ký phiên Flask của ứng dụng desktop, vị trí thanh điều khiển mô phỏng trong `sessionStorage`, và tệp CSV người dùng chọn để xem trước (đọc trong bộ nhớ của request, không tải lên kho chung). Hồ sơ **demo chưa đăng nhập** có thể lưu trong trình duyệt; đó không phải hồ sơ tài khoản.

CSV minh họa, bản tin trạm đã đối chiếu và nguồn tham khảo của Cò Mạ là tài nguyên **chỉ đọc** tại Site. API chỉ cho phép danh sách tên tệp đã công bố, có bộ nhớ đệm 5 phút trong ứng dụng. Muốn cập nhật, thay tệp trong `server/data/reference`, chạy kiểm tra, rồi phát hành Site mới. Ảnh giao diện tiếp tục đi kèm EXE vì là thành phần hiển thị, không phải dữ liệu dùng chung.

Đã kiểm tra hai tệp `community.sqlite3` cũ trong môi trường phát triển: không có bài viết người dùng, bản nháp hay lượt bình chọn cần nhập lại; chúng chỉ có 23 bài mẫu/tham khảo. Bản phát hành mới không mở tệp SQLite diễn đàn. Các bài mẫu được tạo một lần trong D1. Nếu ở máy khác từng có bài viết thật trong bản EXE cũ, bài đó **chưa tự chuyển**; cần xuất/nhập riêng để không mất dữ liệu.

Biến `AUTH_API_URL`, `COMMUNITY_API_URL` và `REFERENCE_API_URL` mặc định cùng trỏ về Site trên. Khi máy chủ tạm ngừng, ứng dụng trả lỗi và giữ dữ liệu trên máy chủ, không âm thầm ghi một bản diễn đàn cục bộ mới. Các bảng nằm trong `server/drizzle/`; ảnh ở binding `BUCKET` trong `server/.openai/hosting.json`. Cần có kế hoạch sao lưu D1/R2, kiểm duyệt và giới hạn tần suất trước khi vận hành với lượng người dùng lớn.
