# AgriData · Mạch Đồng

Bản web MVC + Service phục vụ cộng đồng chia sẻ số đo ruộng và mô phỏng rủi ro mặn, ngập cho lúa OM5451. Module diễn đàn đã lưu dữ liệu trên máy chủ và hỗ trợ hỏi đáp theo chuỗi.

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
| Kho CSV cộng đồng | `/community` | Tìm, lọc, xem thử và tải CSV. Mỗi bộ ghi rõ địa bàn, kỳ, số dòng và dung lượng tệp |
| Diễn đàn | `/forum` | Bấm tên người đăng hoặc người trả lời để mở hồ sơ. Lọc **Bài tham khảo** để đọc 20 bài Admin chia sẻ |
| Đăng bài | `/forum/new` | Soạn bài, đính kèm tối đa 4 ảnh, lưu/khôi phục/xóa bản nháp riêng |
| Chi tiết bài | `/forum/<postId>` | Trả lời theo chuỗi, đánh dấu hữu ích, chọn giải đáp, sửa/xóa nội dung của mình |
| Sửa bài | `/forum/<postId>/edit` | Chỉnh sửa bài và ảnh; kiểm tra quyền tác giả trên máy chủ |
| Mô phỏng | `/simulation` | Bốn thanh trượt và nút đặt lại, hình cắt lớp toàn chiều ngang và tỷ lệ cây phát triển tốt mô phỏng trong khung Cò Mạ |
| Trợ lý Cò Mạ | `/assistant` | Tra số liệu đã công bố hoặc hỏi Gemini 3.8 Flash về cách trồng, dinh dưỡng, sâu bệnh, mặn và ngập trên nhiều cây |
| Đăng nhập | `/login` | Nhập thông tin mẫu, hiện/ẩn mật khẩu và chuyển sang đăng ký |
| Đăng ký | `/register` | Nhập thông tin mẫu, kiểm tra mật khẩu xác nhận và quay lại đăng nhập |
| Tài khoản | `/profile` | Mở từ avatar, lưu hồ sơ demo trên trình duyệt và xem thử biểu mẫu đổi mật khẩu |

Đăng nhập và đăng ký vẫn là biểu mẫu xem thử, thuộc phần tích hợp tài khoản của nhóm. CSV tải lên được đọc để xem trước. Bộ có nhãn `[Giả lập]` và bài “Dữ liệu mẫu” là dữ liệu minh họa. Bộ mặn và mực nước trạm gồm các bản ghi lịch sử tháng 4–5/2026 có nguồn đối chiếu.

Bài viết, ảnh, bản nháp, câu trả lời và lượt hữu ích được lưu vào `data/community.sqlite3`, tự tạo khi khởi động. Mặc định mỗi trình duyệt có một **phiên khách dùng thử**; giữ cookie để tiếp tục sửa bài của phiên đó. Đây chưa phải tài khoản đăng nhập. Có sẵn adapter cho tài khoản của Tân và cấu hình tắt khách.

Đọc [hướng dẫn module Cộng đồng và API](docs/community.md) để xem cách nối đăng nhập, các lớp MVC, cấu hình và quy tắc nghiệp vụ. Dữ liệu và khóa phiên được loại khỏi Git. Bài demo cũ trong localStorage vẫn được giữ nguyên trong trình duyệt nhưng không tự chuyển sang cơ sở dữ liệu mới.

Mã ứng dụng nằm trong [src/](src). Sửa template ở `src/views/`, CSS và JavaScript ở `src/static/`, route Flask ở `src/controllers/` và logic nghiệp vụ ở `src/services/`.

## Bật Gemini cho Cò Mạ

1. Tạo API key trong [Google AI Studio](https://aistudio.google.com/apikey).
2. Tạo `.env.local` cạnh `main.py` (có thể sao chép từ `.env.example`). Điền khóa thật sau `GEMINI_API_KEY=` và lưu. Git đã bỏ qua `.env.local`.
3. Chạy lại `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`, sau đó khởi động lại bằng `.\.venv\Scripts\python.exe main.py`.
4. Mở [Trợ lý Cò Mạ](http://127.0.0.1:5000/assistant). Thử **Cà chua đen đáy quả** rồi mở nguồn trong câu trả lời. Khi thiếu khóa, trang vẫn tra được số liệu Cầu Quan và ca giả lập LH-03 từ các CSV đã duyệt.

Để thử API cục bộ khi máy chủ đang chạy, mở một cửa sổ PowerShell khác.

```powershell
$body = @{message = "Trồng dưa leo trong chậu bắt đầu thế nào?"} | ConvertTo-Json
$result = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5000/api/assistant/chat `
  -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
$result.data.reply
$result.data.sources
```

Flask chọn tối đa bốn đoạn căn cứ theo cây, chủ đề và điều kiện trồng, rồi gửi cùng câu hỏi và tối đa bốn lượt hỏi đáp gần nhất. Flask kiểm tra mã căn cứ Gemini trả về và lấy URL từ danh mục của máy chủ. [Tham chiếu Google về generateContent](https://aistudio.google.com/api-reference/generate-content/generate-content)

Xem [kế hoạch backend và prompt bàn giao cho AI](docs/assistant-backend.md).

## Thu thập và tái tạo dữ liệu

Tải bản gốc vào một thư mục lưu nguồn riêng. Mỗi manifest ghi URL, thời điểm tải, SHA-256 hoặc lý do tải lỗi. Lệnh làm sạch kiểm tra hash của hai bản tin gốc, trích bảng PDF của Vĩnh Long và dùng bốn số đã đối chiếu từ bảng scan của SIWRR.

```powershell
$python = '.\.venv\Scripts\python.exe'
$raw = '..\mach-dong-raw'
& $python -m pip install pdfplumber
& $python -X utf8 -m scripts.agriculture_data fetch station --out "$raw\station"
& $python -X utf8 -m scripts.agriculture_data clean-stations --raw "$raw\station" --out "$raw\station\dbscl-rebuilt.csv"
& $python -X utf8 -m scripts.agriculture_data fetch knowledge --out "$raw\knowledge"
& $python -X utf8 -m scripts.agriculture_data check
& $python -m unittest discover -s tests -v
```

Hai thư mục bản gốc dùng để đối chiếu. Cập nhật [danh mục căn cứ Cò Mạ](data/reference/co-ma-knowledge.json) sau khi đọc và duyệt phạm vi của từng tài liệu. Mỗi cơ sở dữ liệu được thêm [20 bài Admin chia sẻ](docs/blog-nguon-dien-dan.md) một lần khi khởi động. Đặt biến môi trường `COMMUNITY_SEED_EDITORIAL=0` nếu cần chạy cơ sở dữ liệu mới mà chưa thêm danh mục này.

Xem [quy trình thu thập và làm sạch](docs/instruction-crawl-csv-va-co-ma.md) và [các bản tin trạm đã dùng](docs/nguon-du-lieu-man-ngap.md).
