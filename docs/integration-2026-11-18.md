# Hợp nhất các nhánh ngày 18/11/2026

Nhánh làm việc: `feature/Simulation`. Nhánh dự phòng trước khi hợp nhất: `backup/before-integration-20261118` (commit `7143202`). Không sửa lịch sử hoặc force-push.

Nguồn đã fetch:

| Nhánh | Commit đầu nhánh |
|---|---|
| `main` | `da5e9af` |
| `feature/Community` | `875c336` |
| `feature/AIAssistant` | `67ff334` |
| `feature/Session&Wallet_handle` | `a1e18e0` |
| `Testing` | `5a4e284` |
| `feature/Deploy_to_Avalanche` | `6740e6f` |

`Testing` đã chứa lịch sử của main, Community, AIAssistant và Session&Wallet_handle. Hợp nhất Testing trước, sau đó nhập cập nhật Avalanche còn lại: cấu hình môi trường, ví Core/MetaMask và hiển thị số dư/giao dịch Fuji.

## Cách xử lý xung đột

- Trang mô phỏng giữ kiểm tra đầu vào, API cloud, Groq, báo cáo tự mở, nguồn, dự báo và tải dữ liệu lịch sử. Ghép hình ruộng/khóm lúa mới và nút thử hạ mặn vào luồng này. Giai đoạn do người dùng xác nhận; dấu hiệu màu lá chỉ theo cảnh báo cloud, không tự quy đổi g/L thành tỷ lệ thiệt hại.
- Các file mô phỏng demo cũ từ nhánh nguồn được giữ để đối chiếu; `/simulation` và `/api/simulation` không gọi chúng. Không khôi phục CHI, năng suất minh họa hay tỷ lệ lép không có dữ liệu hiệu chuẩn.
- Đăng nhập, OTP, phiên, hồ sơ/ví, trợ lý có nguồn, giao diện và kho CSV mới được giữ. Danh tính đăng nhập nối với quyền đăng/sửa bài; đăng xuất làm mất quyền ghi khi tắt chế độ khách.
- Sửa cách phân biệt mã giao dịch: chuỗi 0x dài 66 ký tự không chứng minh đã gửi lên Fuji. Chỉ giao dịch do service ghi nhận gửi on-chain mới có liên kết trình khám phá.
- Giữ `.env` trên máy theo lựa chọn người dùng và bỏ khỏi Git. Việc này không xóa bản đã có trong lịch sử các nhánh nguồn. EXE không đóng gói `.env`; bản đóng gói có thêm dữ liệu trạm để phần Kho CSV và Trợ lý không thiếu tài nguyên.

## Kiểm tra

- 63 kiểm thử Python: cộng đồng, quyền/CSRF, đăng nhập/OTP/phiên, ví, trợ lý, cloud và kiểm tra liên kết giữa các chức năng.
- 27 kiểm thử JavaScript: engine cloud, Groq, báo cáo, hủy kết quả cũ và hình ruộng chỉ theo bằng chứng.
- Ruff kiểm tra mã nguồn không còn lỗi.
- Đã gọi Groq thật từ giao diện sau hợp nhất, nhận báo cáo với nhãn “AI chọn lưu ý”.
- Đã mở Kho CSV, Diễn đàn, Mô phỏng, Trợ lý và đăng nhập tài khoản thử trên cơ sở dữ liệu tách riêng; không có lỗi JavaScript trong lần kiểm tra.
- Đã dựng lại Windows EXE. Chạy kiểm tra đóng gói: cả bốn trang chính và JavaScript trả HTTP 200; URL mô phỏng vẫn trỏ đúng Sites. Có `dist/SHA256SUMS.txt` và `dist/HUONG-DAN.md` đi kèm.

Kiểm thử OTP/Gemini chat/Fuji dùng dữ liệu thử và transport giả, không gửi email hoặc giao dịch thật. Groq mô phỏng là lời gọi thật tới dịch vụ đã triển khai. Dữ liệu mô phỏng vẫn ở Sites; tài khoản, diễn đàn và bộ nguồn trợ lý mới nhập vẫn theo backend Flask hiện tại.
