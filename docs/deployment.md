# Deploy Mạch Đồng lên Render

Hướng dẫn này dành cho bản Flask đang chạy ở `K:\Unihack\Mach-dong`. Repo cần có `main.py`, `requirements.txt`, `src/static/` và các tệp nguồn trong `data/reference/` và `data/station-context/`. Những tệp nguồn này phục vụ Kho CSV và Cò Mạ.

## 1. Chọn cấu hình

| Mục đích | Cấu hình |
| --- | --- |
| Xem giao diện và demo nhanh | Render Free đủ để mở Kho CSV, Diễn đàn, Mô phỏng và tra cứu cục bộ trong Cò Mạ. Dùng dữ liệu mẫu vì hệ thống tệp sẽ mất các thay đổi khi khởi động lại hoặc deploy. Render Free chặn cổng SMTP 465 của Gmail và có thể ngủ sau 15 phút không hoạt động. |
| Giữ tài khoản, bài đăng và OTP | Chọn Web Service trả phí, gắn Persistent Disk tại `/var/data` và lưu hai tệp SQLite vào đó. Cấu hình SMTP nếu cần xác minh email và đặt lại mật khẩu. |

[Giới hạn của Render Free](https://render.com/docs/free) · [Cách gắn Persistent Disk](https://render.com/docs/disks)

## 2. Tạo Web Service

1. Đưa commit cần deploy lên nhánh GitHub của repo Flask. Nhánh đang dùng tại máy là `feature/AIAssistant`. Chọn nhánh đó trên Render nếu đây là nhánh demo.
2. Mở [Render Dashboard](https://dashboard.render.com/), chọn **New → Web Service** và kết nối repo.
3. Chọn **Python 3**. Để trống **Root Directory** nếu `main.py` ở gốc repo GitHub. Chọn `Mach-dong` nếu GitHub chứa cả workspace và `main.py` nằm trong thư mục con.
4. Điền hai lệnh dưới đây vào **Build Command** và **Start Command**. Chọn `/community` làm HTTP health check.

**Build Command**

```sh
python -m pip install -r requirements.txt gunicorn
```

**Start Command**

```sh
gunicorn main:app --bind "0.0.0.0:$PORT" --workers 1 --worker-class gthread --threads 4 --timeout 210 --access-logfile -
```

Gunicorn nạp ứng dụng qua `main:app`. Một worker với bốn luồng là cấu hình khởi đầu cho demo SQLite. Các luồng giúp xử lý yêu cầu khác trong khi một yêu cầu đang chờ Gemini. Gunicorn dùng `--timeout 210` để theo dõi worker ngừng phản hồi. Cò Mạ có giới hạn chờ riêng là 180 giây. Kiểm tra độ trễ và lỗi trên URL thật sau lần deploy đầu tiên. [Deploy Flask trên Render](https://render.com/docs/deploy-flask) · [Cấu hình Gunicorn](https://gunicorn.org/reference/settings/) · [HTTP health checks](https://render.com/docs/health-checks)

## 3. Cài biến môi trường

Thêm các giá trị trong mục **Environment** của Web Service.

| Biến | Giá trị |
| --- | --- |
| `PYTHON_VERSION` | `3.14.10`. Workspace đã chạy bộ kiểm thử với Python 3.14.6. Render yêu cầu phiên bản đủ ba thành phần khi cài qua biến này. |
| `SECRET_KEY` | Khóa ngẫu nhiên cố định cho phiên Flask và diễn đàn. |
| `AGRIDATA_SECRET_KEY` | Khóa ngẫu nhiên cố định thứ hai. Giữ lại khóa này giữa các lượt deploy để giữ nhất quán địa chỉ ví mà app tự dẫn xuất. |
| `SESSION_COOKIE_SECURE` | `1` vì đường dẫn Render dùng HTTPS. |
| `AGRIDATA_AUTH_DEMO` | `0` để dùng xác thực tài khoản bình thường trên URL chia sẻ. |
| `COMMUNITY_DATABASE` | `/var/data/community.sqlite3` nếu đã gắn đĩa. Với bản Free, giữ mặc định. |
| `AGRIDATA_DB_PATH` | `/var/data/agridata.db` nếu đã gắn đĩa. Với bản Free, giữ mặc định. |
| `SMTP_EMAIL`, `SMTP_APP_PASSWORD` | Dùng tài khoản và mật khẩu ứng dụng của Gmail khi cần OTP trên dịch vụ hỗ trợ SMTP. App mặc định dùng `smtp.gmail.com:465`. |
| `GEMINI_API_KEY` | Bỏ trống cho bản xem thử công khai. Với bản bật Gemini, dùng khóa riêng cho demo và giới hạn truy cập, hạn mức gọi chat trước khi chia sẻ. |

Chạy lệnh này hai lần tại máy để tạo hai khóa khác nhau. Lưu các giá trị trong Render và giữ bản sao riêng ở trình quản lý thông tin mật.

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

`.env.local` và các tệp SQLite là dữ liệu riêng của máy. Git đã bỏ qua các tệp này. Cò Mạ hiện nhận yêu cầu từ khách nếu đã có khóa Gemini, kể cả khi tắt phiên khách của diễn đàn. Khi bỏ trống khóa, Cò Mạ vẫn trả lời từ CSV cục bộ. [Phiên bản Python trên Render](https://render.com/docs/python-version) · [Phạm vi và hạn mức Cò Mạ](assistant-backend.md)

## 4. Kiểm tra sau khi deploy

1. Mở URL Render tới `/community`, `/forum`, `/simulation` và `/assistant`. Thử tải một CSV và mở nguồn của câu trả lời “Độ mặn thực đo trạm Cầu Quan ngày 7/5/2026?”.
2. Hỏi “Độ mặn trạm Cầu Quan hôm qua bao nhiêu?”. Cò Mạ cần báo kho chỉ có bản tin lịch sử và hỏi thêm bản tin mới. Trong Mô phỏng, cấu hình mặc định cần hiển thị CHI **72/100**.
3. Nếu đã bật Gemini, thử một câu canh tác và một câu nối tiếp. Khi gặp 502 hoặc 504, xem **Logs** trên Render để biết ứng dụng hoặc dịch vụ Gemini gặp lỗi, rồi thử lại từ cùng trang. Có thể thử riêng câu tra CSV để xác định ứng dụng vẫn phản hồi.
4. Nếu dùng Persistent Disk, đăng một bài thử, khởi động lại dịch vụ rồi xác nhận bài vẫn còn. Nếu cấu hình Gmail, kiểm tra gửi và xác nhận OTP bằng một tài khoản thử.

`/admin` hiện là trang giới thiệu hàng đợi duyệt. Trạng thái sẵn sàng của bản web Flask cần được kiểm tra riêng với luồng duyệt và giao dịch Fuji của dự án.
