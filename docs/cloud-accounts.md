# Kho tài khoản cloud

Tài khoản được lưu trên Cloudflare D1 của Site công khai [Mạch Đồng](https://mach-dong-rice-data.artfulmica6.chatgpt.site). Ứng dụng mới dùng `AUTH_API_URL=https://mach-dong-rice-data.artfulmica6.chatgpt.site` theo mặc định. Đã kiểm tra đăng ký, đăng nhập, kiểm tra phiên và đăng xuất trên bản triển khai thật ngày 19/11/2026. Máy người dùng cần Internet để đăng nhập; khi cloud lỗi, ứng dụng báo lỗi và **không** tự chuyển sang kho tài khoản cục bộ.

Luồng: `auth_controller` → `CloudAuthService` → `/api/account/*` → Cloudflare Worker → D1. Chỉ Worker được đọc cơ sở dữ liệu. Mật khẩu không lưu nguyên văn: máy chủ dùng sáu vòng PBKDF2-HMAC-SHA256, mỗi vòng 100.000 lượt với muối và miền tách biệt, do Workers giới hạn tối đa 100.000 lượt cho một lần gọi. Mỗi tài khoản có muối riêng. Phiên đăng nhập chỉ lưu bản băm SHA-256 trong D1; yêu cầu thay đổi hồ sơ hoặc điểm giả lập cần token phiên và CSRF.

Ví tự tạo được mã hóa AES-GCM trên thiết bị trước khi bản mã gửi lên D1. Khóa mã hóa được rút từ mật khẩu bằng PBKDF2 600.000 lượt trên thiết bị. Khi đổi mật khẩu bằng mật khẩu cũ, ứng dụng mã hóa lại khóa ví. Nếu sau này đặt lại mật khẩu qua email mà không có mật khẩu cũ, khóa ví cũ không thể giải mã; cần bản sao khóa riêng do người dùng tự lưu.

## Cấu hình còn thiếu

- Xác minh email và khôi phục mật khẩu cần hai biến bí mật của Site: `AUTH_EMAIL_API_KEY` (Resend) và `AUTH_FROM_EMAIL` (địa chỉ gửi đã xác minh). Hiện chưa cấu hình; người dùng vẫn đăng ký và đăng nhập bằng mật khẩu, nhưng email chưa xác minh và chức năng quên mật khẩu chưa hoạt động. Không nhúng khóa vào EXE hay Git.
- Tài khoản quản trị đầu tiên cần `AUTH_ADMIN_BOOTSTRAP_TOKEN` ngẫu nhiên ít nhất 32 ký tự trên Site. Đăng ký tài khoản chủ sở hữu, rồi gọi `POST /api/account/bootstrap-admin` kèm Bearer token, `X-CSRF-Token`, `X-Admin-Bootstrap-Token`; xóa biến bí mật sau khi hoàn tất. API chỉ cho phép thao tác này khi chưa có quản trị viên.

Tài khoản của các bản EXE cũ dùng SQLite cục bộ **không tự chuyển** sang D1. Cần nhập dữ liệu theo quy trình riêng, hoặc người dùng đăng ký tài khoản mới. Bài viết diễn đàn là kho khác và hiện vẫn lưu trên từng máy, chưa đồng bộ cloud.

Để kiểm thử cục bộ, cấu hình kiểm thử truyền `AUTH_API_URL=""`. Biến này chỉ dành cho phát triển; bản EXE phát hành dùng địa chỉ cloud mặc định.
