# AgriData · Mạch Đồng

Bản web MVC + Service để đội duyệt UI trước khi tạo repo GitHub. Giao diện phục vụ cộng đồng chia sẻ số đo ruộng và mô phỏng rủi ro mặn, ngập cho lúa OM5451.

## Chạy trên Windows

Cài Python 3.12 trở lên. Mở PowerShell tại thư mục AgriData chứa `main.py`, rồi chạy các lệnh sau.

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe main.py
```

Mở [Mạch Đồng](http://127.0.0.1:5000/community). CSS, phông chữ và ảnh ruộng gốc từ Stitch đã đi kèm.

Khi thêm class Tailwind vào HTML, chạy `npm install` và `npm run build:css` để cập nhật CSS trong `src/static/`. Node.js chỉ cần cho bước dựng lại CSS.

| Trang | Đường dẫn | Xem thử |
|---|---|---|
| Kho CSV cộng đồng | `/community` | Tìm và lọc 4 bộ mẫu, tải CSV, chọn hoặc thả tệp UTF-8 để kiểm tra cấu trúc và xem trước |
| Diễn đàn | `/forum` | Tìm bài theo nội dung và chủ đề, mở chi tiết và gửi lời nhắn demo |
| Đăng bài | `/forum/new` | Soạn bài canh tác, đính kèm ảnh, lưu nháp và đăng thử |
| Mô phỏng | `/simulation` | Bốn thanh trượt và nút đặt lại, hình cắt lớp toàn chiều ngang và tỷ lệ cây phát triển tốt mô phỏng trong khung Cò Mạ |
| Trợ lý Cò Mạ | `/assistant` | Khung chat desktop với mascot Cò Mạ và câu trả lời mẫu trong trình duyệt |
| Đăng nhập | `/login` | Nhập thông tin mẫu, hiện/ẩn mật khẩu và chuyển sang đăng ký |
| Đăng ký | `/register` | Nhập thông tin mẫu, kiểm tra mật khẩu xác nhận và quay lại đăng nhập |
| Tài khoản | `/profile` | Mở từ avatar, lưu hồ sơ demo trên trình duyệt và xem thử biểu mẫu đổi mật khẩu |

Đăng nhập và đăng ký chạy dưới dạng xem thử biểu mẫu trong trình duyệt. Máy chủ chỉ đọc CSV để xem trước. Dữ liệu hiện có là giả lập. Phần trăm cây sống chờ số liệu thực địa và mô hình được kiểm định.

Bài đăng, bản nháp, lượt đánh dấu hữu ích và lời nhắn của diễn đàn được lưu trong trình duyệt hiện tại. Dùng dữ liệu mẫu khi chạy demo.

Mã ứng dụng nằm trong [src/](src). Sửa template ở `src/views/`, CSS và JavaScript ở `src/static/`, route Flask ở `src/controllers/` và logic nghiệp vụ ở `src/services/`.

## Kiểm tra và đưa lên GitHub

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
git init -b main
git add .
git commit -m "feat: scaffold AgriData MVC demo"
```

Tạo repo GitHub mới với tên `agridata`, chọn quyền hiển thị rồi để GitHub tạo repo trống. Sao chép URL HTTPS ở trang Quick Setup và chạy từ thư mục chứa `main.py`.

```powershell
git remote add origin https://github.com/TEN-GITHUB/agridata.git
git push -u origin main
```

Đổi `TEN-GITHUB` thành tài khoản GitHub của bạn. Kiểm tra kết quả `git status --short` sau khi thêm file để chắc rằng môi trường ảo và khóa cấu hình nằm ngoài commit. [Hướng dẫn đưa code cục bộ lên GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)

Đọc [kiến trúc và cây thư mục](docs/architecture.md), [hướng dẫn đóng góp](AGENTS.md) và [danh mục Stitch](docs/stitch/README.md).
