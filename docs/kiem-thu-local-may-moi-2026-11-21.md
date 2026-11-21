# Kiểm thử bản mã nguồn local — 21/11/2026

> Biên bản này ghi lượt kiểm thử **full-local trước khi chuyển sang AI dùng chung**. Quy trình mặc định mới không yêu cầu key trên máy giám khảo: xem [triển khai AI dùng chung](trien-khai-ai-dung-chung.md). Thành công ở lượt full-local không được coi là bằng chứng đã triển khai cloud.

## Cách kiểm tra

Tạo bản sao từ danh sách tệp Git cùng các bản sửa hiện tại, không mang theo `.venv`, `node_modules`, `.env.local` hoặc dữ liệu local cũ. Dùng cơ sở dữ liệu mới và tài khoản mới. Sau đó chạy script PowerShell để tự tạo môi trường Python mới, cài `requirements.txt` và khởi động lại ứng dụng bằng chính môi trường mới đó.

Khóa Gemini được cấp riêng qua môi trường tiến trình kiểm thử, không ghi vào báo cáo hoặc mã nguồn. Đây là mô phỏng một checkout sạch trên cùng máy Windows, chưa phải kiểm thử trên máy vật lý thứ hai. Runtime kiểm tra: Python 3.14.6, Node.js 26.13.1; hướng dẫn yêu cầu Python 3.12+ và Node.js 24 LTS, chưa chạy ma trận mọi phiên bản/hệ điều hành.

## CSS và tài nguyên

- 12 trang × 2 chiều rộng 1440px/1280px: HTTP 200, không tràn ngang.
- Trang đã kiểm tra: đăng nhập, đăng ký, CSV, diễn đàn, soạn bài, chi tiết bài, sửa bài, mô phỏng, báo cáo, trợ lý, hồ sơ và thể lệ ví.
- Phông Be Vietnam Pro hiển thị đúng; không ghi nhận CSS/ảnh lỗi tải hoặc lỗi JavaScript trong các lượt mở trang.
- Giữ nguyên phần CSS/giao diện đang được sửa trước đó. Không cần cài npm để sử dụng các tài nguyên đã đi kèm Git.

## Chức năng local

- Đăng ký bằng OTP giả lập và đăng nhập tài khoản mới: 201/200.
- CSV: tải tệp công bố và xem trước tệp tải lên: 200.
- Diễn đàn: đăng bài, tìm, đọc, trả lời, sửa, xóa; lưu/đọc bản nháp: 200/201.
- Hồ sơ: đổi tên, lưu thông tin ruộng, tải và đọc ảnh đại diện: 200.
- Ví: quy đổi điểm ở chế độ giả lập: 200, không phải xác nhận gửi giao dịch Fuji thật.
- Mô phỏng: chọn giai đoạn và chạy bằng nút trên giao diện, mở báo cáo thành công; danh mục, dự báo Open-Meteo và lịch sử thời tiết: 200.
- Chat Cò Mạ bằng nút gửi trên giao diện: Gemini thật, HTTP 200, phản hồi 1.469 ký tự.
- Nhờ Cò Mạ tư vấn bằng nút trên giao diện với môi trường Python vừa cài: Gemini thật, HTTP 200, model `gemini-3.1-flash-lite`, 1.802 ký tự, `isFallback=false`; đầu vào làm đòng, mặn ruộng 2,8 g/L, nước 4,5 cm được giữ trong snapshot.
- Python unit/integration: **83/83** qua trên môi trường vừa cài.
- Node backend/frontend: **87/87** qua. Kiểm tra cú pháp 15 JavaScript trình duyệt qua. `git diff --check` qua.

## Lỗi đã sửa để chuyển máy

`python main.py` trước đây chỉ chạy backend local khi có `MACH_DONG_LOCAL_PREVIEW=1` riêng trên máy phát triển. Đã có test tái hiện lỗi và sửa mặc định chạy cả Flask + Node local. WSGI/desktop vẫn giữ đường import cloud; `MACH_DONG_USE_CLOUD=1` cho phép chọn cloud rõ ràng.

Script Windows trước đây yêu cầu `.venv` có sẵn. Nay tự tạo và cài thư viện, kiểm tra Python/Node SQLite, tạo file cấu hình mẫu và hỗ trợ `-Check`. Đã sửa thêm phụ thuộc `Get-FileHash` không sẵn có trong PowerShell của phiên kiểm tra. Mẫu cấu hình và model mặc định của launcher local được khớp với model đã gọi thật thành công.

Thiếu khóa AI được báo rõ ở terminal và phản hồi API, không còn chỉ báo dịch vụ gián đoạn chung chung. Chạy `--check` trên bản sao chưa cấp khóa trả mã lỗi 1 như mong đợi.

## Điều kiện còn phải chuẩn bị

Giám khảo phải có Python, Node, Internet và khóa Gemini hợp lệ/còn hạn mức được cấp ngoài Git. Không thể chỉ clone Git mà tự có khóa bí mật. OTP local và quy đổi điểm đang giả lập; gửi email thật/giao dịch Fuji thật cần cấu hình dịch vụ riêng và chưa được xác minh trong lượt này. Bản EXE không nằm trong phạm vi sửa.

Các bản sửa cần được commit/push lên nhánh dùng để chấm thì checkout của người khác mới nhận được. Xem [hướng dẫn chạy trên máy mới](chay-local-giam-khao.md).
