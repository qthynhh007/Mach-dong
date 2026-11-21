# Bản dựng Windows Mạch Đồng ngày 21/11/2026

- File: `K:/Unihack/Mach-dong/dist/MachDong.exe`.
- Dung lượng: 48.819.099 byte (~46,6 MiB).
- SHA-256: `ce4656796b665f432a63d77b0aa4dc2239db0d0b50c62ed5d89aec759d68e854`.
- Dựng theo `scripts/build-desktop.ps1`, PyInstaller onefile/windowed. Không cần Python trên máy nhận.
- Kiểm tra trực tiếp EXE bằng `--smoke-output`: đăng nhập/đăng ký HTTP 200; bốn trang làm việc HTTP 302 về đăng nhập; tài nguyên JavaScript HTTP 200. Workflow phát hành đã được sửa để mong đợi 302 đối với khách chưa đăng nhập.
- 81 test Python, 86 test JavaScript và build/cú pháp Worker đạt. Manifest đóng gói không có .env.local, session người dùng hoặc cơ sở dữ liệu cục bộ.
- EXE chứa giao diện mới, gọi backend cố định `https://mach-dong-rice-data.artfulmica6.chatgpt.site`. Không nhúng API key hoặc kho tài khoản thử cục bộ.
- Chưa cập nhật backend, R2, GitHub release hay link tải công khai. Sites đọc được metadata nhưng cấp quyền ghi nguồn trả `Sites project not found`. Không tạo Site khác để thay thế. Người dùng chọn ưu tiên EXE trước.
- Vì backend chưa deploy mã mới, chưa nghiệm thu đăng nhập/tư vấn end-to-end của EXE với phiên bản backend mới. Tài khoản cục bộ không tự chuyển lên cloud. File Windows chưa được ký chứng thư.
- Bản EXE cũ đã được giữ ở `K:/Unihack/output/MachDong-before-release.exe` để đối chiếu.

## Tài khoản nghiệm thu EXE

Ngày 21/11 đã tạo tài khoản thử `nongho` qua API đăng ký cloud thông thường (HTTP 201), vai trò `FARMER`. Đã kiểm tra bằng CloudAuthService với đúng User-Agent của EXE: đăng nhập HTTP 200, sau đó đăng xuất phiên kiểm thử. Mật khẩu bàn giao riêng trong chat, không ghi vào source/tài liệu. Không cần dựng lại EXE cho việc tạo tài khoản. Đây là thao tác tài khoản trên backend đang có, không phải đã deploy bản sửa backend.
