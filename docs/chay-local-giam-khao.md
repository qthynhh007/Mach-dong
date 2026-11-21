# Chạy mã nguồn Mạch Đồng trên máy mới

Chạy trong thư mục chứa `main.py`, `requirements.txt`, `server/` và `src/`. Giao diện/CSS chạy bằng Python trên máy giám khảo; tài khoản, dữ liệu và AI gọi backend dùng chung. Không chạy `pnpm dev` của bản giao diện Next.js ở thư mục khác.

## Chuẩn bị một lần

1. Cài **Python 3.12 trở lên** (bật Add Python to PATH trên Windows). Mở lại PowerShell sau khi cài.
2. Clone/tải toàn bộ repository, không chỉ tải file `main.py`. Không copy `.venv` hoặc `node_modules` từ máy khác.
3. Có kết nối Internet. **Không cần `.env.local`, Gemini API key hoặc Node.js** cho chế độ mặc định. Nếu còn file cấu hình cũ, bỏ `MACH_DONG_BACKEND_MODE=local` để trở về chế độ dùng chung.

## Windows

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1
```

Script tự tạo `.venv` và cài thư viện Python lần đầu. Không tạo hay yêu cầu file khóa API. CSS, JavaScript, phông chữ và ảnh giao diện đã nằm trong mã nguồn.

Mở **http://127.0.0.1:5000**. Giữ terminal đang chạy. Nếu cổng bị ứng dụng khác chiếm, dùng cổng khác:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1 -Port 5001
```

Kiểm tra cấu hình trước khi demo (không gọi Gemini và không in khóa):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1 -Check
```

`-Check` gọi health của backend và yêu cầu cả chat/tư vấn đã được cấu hình; không tiêu tốn lượt Gemini. Nếu backend cũ hoặc chưa có secret, nhóm vận hành phải sửa trên server; giám khảo không nhập key. Cần thử hai chức năng AI trên giao diện để kiểm tra hạn mức thực tế.

## Chạy thủ công / macOS / Linux

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python main.py
```

Trên Windows dùng `.venv\Scripts\python.exe` thay cho `.venv/bin/python`. `python main.py` mặc định mở giao diện local và gọi các dịch vụ chung qua HTTPS. Import WSGI/desktop vẫn giữ cấu hình cloud.

## Danh sách thử trước khi chấm

- Đăng nhập bằng tài khoản cloud của nhóm cấp hoặc đăng ký bằng email của mình nếu dịch vụ email đã sẵn sàng. Tài khoản full-local từ bản cũ không tự chuyển lên cloud. Thử đăng xuất rồi đăng nhập lại.
- Mở Kho CSV, lọc/tải dữ liệu, tải một CSV UTF-8 để xem trước.
- Mở diễn đàn, đăng bài, mở chi tiết và trả lời; sửa/xóa bài của chính tài khoản đó.
- Mở mô phỏng, chọn giai đoạn quan sát, thay đổi điều kiện, lập báo cáo, mở nguồn và dự báo thời tiết. Internet cần cho dự báo Open-Meteo.
- Nhấn **Nhờ Cò Mạ tư vấn**, chờ câu trả lời thật theo kịch bản.
- Mở trợ lý Cò Mạ, gửi câu hỏi và một câu hỏi tiếp nối; xác nhận lời đáp và nguồn được hiển thị.
- Mở hồ sơ, đổi thông tin, thử chọn ảnh đại diện và kiểm tra lịch sử ví/điểm.
- Mở các trang ở màn hình 1280–1440px, kiểm tra CSS/phông chữ/ảnh không lỗi 404 và không tràn ngang. Nếu đang dùng một tab cũ từ trước khi cập nhật, tải lại bằng Ctrl+F5.

## Phạm vi bản local

Chế độ mặc định `shared`: tài khoản/bài viết/tệp nằm trên D1/R2 của nhóm, Gemini key ở runtime secret trên server. Hai máy cùng tài khoản dùng chung dữ liệu. Máy giám khảo không cài D1/R2/Supabase. Ví/điểm minh họa không chứng minh đã gửi giao dịch Fuji thật; phần này cần cấu hình và biên nhận riêng.

Nhóm phát triển vẫn có thể chọn `MACH_DONG_BACKEND_MODE=local` trong `.env.local`: lúc đó cần Node.js 24 LTS và Gemini key riêng, SQLite/tệp tạo trong `data/local-preview/`. Đây là chế độ phát triển tùy chọn, không phải hướng dẫn cho giám khảo.

Mất Internet, backend chưa triển khai hoặc hết hạn mức AI vẫn có thể làm chức năng thất bại; không thay phản hồi thật bằng lời mẫu giả. Xem trạng thái và hướng dẫn vận hành tại [triển khai AI dùng chung](trien-khai-ai-dung-chung.md).
