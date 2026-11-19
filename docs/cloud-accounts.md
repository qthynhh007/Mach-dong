# Kho tài khoản cloud (đang chờ triển khai)

Ứng dụng đã có mã cho kho tài khoản tập trung trong Site đang phục vụ dữ liệu lúa. Khi Site được triển khai với D1, ứng dụng đặt `AUTH_API_URL=https://mach-dong-rice-data.artfulmica6.chatgpt.site` để dùng API tài khoản qua HTTPS. Không đặt khóa quản trị hay khóa email trong mã nguồn hoặc EXE. Khi biến này chưa được bật, ứng dụng tiếp tục dùng SQLite cục bộ như trước.

## Luồng dữ liệu

`auth_controller` → `CloudAuthService` → `/api/account/*` trên Worker → D1. Worker thực hiện đăng ký, kiểm tra mật khẩu, khóa tài khoản khi thử sai nhiều lần, tạo/thu hồi phiên, sửa hồ sơ, đổi mật khẩu và ghi lịch sử điểm giả lập. Client không có quyền đọc bảng tài khoản. Mật khẩu không lưu nguyên văn; bản băm PBKDF2-HMAC-SHA256 có muối riêng và 600.000 vòng. Token phiên chỉ lưu bản băm SHA-256 trong D1. API từ chối sửa hồ sơ và điểm nếu thiếu phiên hoặc mã CSRF.

Ví tự tạo trên thiết bị được mã hóa AES-GCM bằng khóa rút ra từ mật khẩu trước khi lưu bản mã lên D1. Khi xem khóa ví phải nhập lại mật khẩu. Đổi mật khẩu khi đang biết mật khẩu cũ sẽ mã hóa lại khóa ví. Nếu **đặt lại mật khẩu qua email** mà không biết mật khẩu cũ, khóa ví cũ không thể giải mã; người dùng phải dùng bản sao khóa riêng đã xuất và lưu an toàn. Ví gắn ngoài do người dùng quản lý.

## Cấu hình cần có trước khi bật

1. Đồng bộ thư mục `server/` vào checkout Sites của Site `appgprj_6afcfbe9375c8191af0a348ebb094ff8` bằng công cụ Sites. Giữ `server/.openai/hosting.json` có `d1: "DB"`; đóng gói `server/drizzle/` để áp dụng migration tạo bảng. Triển khai và xác nhận `GET /api/account/config` trả JSON, sau đó thử đăng ký và đăng nhập bằng tài khoản thử.
2. Để email xác minh và khôi phục mật khẩu hoạt động cho người dùng EXE, cấu hình hai secret của Site: `AUTH_EMAIL_API_KEY` (API key của Resend) và `AUTH_FROM_EMAIL` (địa chỉ gửi đã xác minh). Khi chưa có hai secret này, đăng ký bằng mật khẩu vẫn dùng được nhưng email chưa xác minh, OTP và quên mật khẩu bị ẩn. **Không phát hành bản thương mại trước khi cấu hình email và kiểm thử khôi phục.**
3. Để cấp quyền quản trị đầu tiên, đặt secret `AUTH_ADMIN_BOOTSTRAP_TOKEN` ngẫu nhiên tối thiểu 32 ký tự trên Site. Sau khi đăng ký tài khoản chủ sở hữu, gọi `POST /api/account/bootstrap-admin` bằng Bearer token đăng nhập, `X-CSRF-Token` và `X-Admin-Bootstrap-Token`. Endpoint chỉ thăng quyền khi D1 chưa có ADMIN. Xóa secret sau khi dùng.
4. Chỉ sau khi kiểm thử Site thật mới đặt mặc định `AUTH_API_URL` trong `src/config.py`, dựng lại `MachDong.exe` và phát hành bản mới. Bản EXE cũ vẫn dùng SQLite cục bộ và không tự chuyển tài khoản. Trước khi chuyển tài khoản đã có, cần quy trình nhập riêng; hiện kho `data/agridata.db` của checkout này có 0 tài khoản.

Site công khai chỉ cung cấp endpoint xác thực theo phiên; nó không có endpoint liệt kê tài khoản hoặc truy xuất băm mật khẩu. Tài khoản và bài diễn đàn là hai kho khác nhau: diễn đàn vẫn lưu SQLite trên từng máy và chưa đồng bộ giữa người dùng.

## Kiểm tra tại chỗ

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -q
node --test server\tests\*.test.mjs tests\simulation-view.test.mjs
node server\build.mjs
```

Việc băm mật khẩu trong Cloudflare Worker miễn phí cần kiểm thử thời gian CPU trên bản triển khai thật; nếu vượt hạn mức, phải dùng dịch vụ xác thực chuyên dụng hoặc gói Workers phù hợp trước khi bật mặc định.
