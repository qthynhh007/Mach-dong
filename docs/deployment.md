# Phát hành Mạch Đồng

Máy chủ dùng chung là Site [Mạch Đồng](https://mach-dong-rice-data.artfulmica6.chatgpt.site), ID trong `server/.openai/hosting.json`. API này giữ tài khoản và diễn đàn trong D1, ảnh bài viết trong R2, còn dữ liệu tham chiếu và mô phỏng trong bản Worker được phát hành. Không tạo Site mới khi cập nhật.

Sửa nguồn tham chiếu trong `server/data/reference/`, kiểm tra `node --test server/tests/*.test.mjs` và `node server/build.mjs`, sau đó đồng bộ nguồn `server/` vào checkout Site, lưu phiên bản và deploy cùng Site. Ứng dụng lấy dữ liệu mới qua `REFERENCE_API_URL` sau tối đa 5 phút mà không cần thay EXE. Quy trình nguồn của Site phải đẩy đúng commit đã dùng để đóng gói Worker. Xem [chi tiết lưu trữ](cloud-storage.md).

Bản Windows được dựng bằng `scripts/build-desktop.ps1`; chỉ đóng gói giao diện và mã client, không đóng gói `data/reference` hay cơ sở dữ liệu. Đẩy tag `desktop-v*` để workflow `.github/workflows/windows-release.yml` kiểm tra, dựng EXE và đưa `MachDong.exe` cùng `SHA256SUMS.txt` vào Assets của prerelease. Người dùng tải một EXE, nhấp đúp để chạy; cần Internet để đăng nhập, đọc diễn đàn, dữ liệu tham chiếu và mô phỏng. Cấu hình SMTP, AI và ví thực hiện ở máy chủ, không đặt khóa trong EXE.
