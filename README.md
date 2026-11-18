# AgriData · Mạch Đồng

Bản MVC + Service phục vụ cộng đồng và mô phỏng điều kiện canh tác OM5451. Mô phỏng và dữ liệu chạy qua API cloud; có bản Windows EXE không cần cài Python hoặc AI cục bộ. Xem [hướng dẫn mô phỏng, nguồn dữ liệu, cấu hình AI và phát hành EXE](docs/simulation.md).

API công khai: [Mạch Đồng · Dữ liệu mô phỏng](https://mach-dong-rice-data.artfulmica6.chatgpt.site). Có 2.920 dòng NASA POWER năm 2025 tại 8 điểm ĐBSCL, dự báo Open-Meteo và 12 nguồn tham chiếu. Groq với model `openai/gpt-oss-20b` đã được bật trên máy chủ và kiểm thử gọi thật ngày 18/11/2026. Trong tab Mô phỏng, chọn **Nhờ AI chọn bằng chứng** để nhận báo cáo có các mục AI lưu ý. Người dùng không cần nhập key; gói AI miễn phí có hạn mức. AI chọn bằng chứng có sẵn, không tự sinh con số năng suất.

Người dùng tải `MachDong.exe` từ Assets của bản phát hành, nhấp đúp để chạy. File dựng cục bộ nằm ở `dist/MachDong.exe`; deploy API không tự phát hành EXE. Không cần đăng nhập ChatGPT để dùng API công khai. Cần Internet.

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
| Diễn đàn | `/forum` | Tìm không dấu, lọc chủ đề/trạng thái/bài của tôi, sắp xếp và phân trang |
| Đăng bài | `/forum/new` | Soạn bài, đính kèm tối đa 4 ảnh, lưu/khôi phục/xóa bản nháp riêng |
| Chi tiết bài | `/forum/<postId>` | Trả lời theo chuỗi, đánh dấu hữu ích, chọn giải đáp, sửa/xóa nội dung của mình |
| Sửa bài | `/forum/<postId>/edit` | Chỉnh sửa bài và ảnh; kiểm tra quyền tác giả trên máy chủ |
| Mô phỏng | `/simulation` | Nhập điều kiện, mô phỏng cloud, minh họa thửa ruộng, báo cáo có nguồn, dự báo 7 ngày và tải lịch sử NASA POWER |
| Trợ lý Cò Mạ | `/assistant` | Hỏi đáp có chọn nguồn tham chiếu; lời chào và dữ liệu tra cứu có sẵn, Gemini cho câu hỏi cần AI |
| Đăng nhập | `/login` | Đăng nhập bằng tài khoản hoặc OTP email; phiên có thời hạn và chống CSRF |
| Đăng ký | `/register` | Xác thực email, tạo hồ sơ và ví Fuji; cần cấu hình SMTP để gửi OTP thật |
| Tài khoản | `/profile` | Hồ sơ, mật khẩu, liên kết ví, lịch sử điểm; phân biệt giao dịch giả lập và Fuji |

Đăng nhập và đăng ký đã nối backend; xem [cấu hình SMTP và Fuji](docs/ENV_SETUP.md). Tài khoản mẫu chỉ được tạo khi bật `AGRIDATA_AUTH_DEMO=1`. CSV tải lên hiện chỉ được đọc để xem trước. Bốn CSV cũ trong `data/reference` và bài có nhãn “Dữ liệu mẫu” là giả lập; bộ NASA POWER trên cloud là dữ liệu thực từ nguồn có ghi metadata. Phần trăm cây sống chờ số liệu thực địa và mô hình được kiểm định.

Bài viết, ảnh, bản nháp, câu trả lời và lượt hữu ích được lưu vào `data/community.sqlite3`, tự tạo khi khởi động. Người đã đăng nhập dùng danh tính tài khoản khi đăng bài; người chưa đăng nhập có **phiên khách dùng thử** nếu `COMMUNITY_ALLOW_GUESTS=1`. Tài khoản và phiên lưu trong `data/agridata.db`; bản EXE dùng thư mục riêng trong `%LOCALAPPDATA%/MachDong`. Đây vẫn là backend chạy theo máy, chưa phải diễn đàn và tài khoản dùng chung cloud.

Bản hợp nhất các nhánh ngày 18/11/2026 giữ mô phỏng Groq trên cloud, hình ruộng mới, bộ dữ liệu cộng đồng, trợ lý, đăng nhập và ví Fuji. Xem [biên bản hợp nhất và kiểm tra](docs/integration-2026-11-18.md). Khóa Groq chỉ nằm trên cloud; Gemini của tab Trợ lý là cấu hình riêng của backend Flask. `.env` được giữ ngoài Git.

Đọc [hướng dẫn module Cộng đồng và API](docs/community.md) để xem cách nối đăng nhập, các lớp MVC, cấu hình và quy tắc nghiệp vụ. Dữ liệu và khóa phiên được loại khỏi Git. Bài demo cũ trong localStorage vẫn được giữ nguyên trong trình duyệt nhưng không tự chuyển sang cơ sở dữ liệu mới.

Mã ứng dụng nằm trong [src/](src). Sửa template ở `src/views/`, CSS và JavaScript ở `src/static/`, route Flask ở `src/controllers/` và logic nghiệp vụ ở `src/services/`.

## Kiểm tra và phát hành

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node --test server/tests/simulation.test.mjs
node --test tests/simulation-view.test.mjs
```

Repository đã có cấu hình Git; không cần `git init` hoặc thêm lại remote sau khi clone. Xem [hướng dẫn bản Windows](docs/simulation.md) để dựng `MachDong.exe`, cấu hình AI trên máy chủ và cập nhật dữ liệu. Workflow Windows có thể chạy thủ công hoặc tạo prerelease khi đẩy tag `desktop-v*`. EXE nằm trong bản phát hành, không đưa vào lịch sử mã nguồn. Không commit môi trường ảo, cơ sở dữ liệu người dùng hoặc khóa cấu hình.

Đọc [kiến trúc và cây thư mục](docs/architecture.md), [hướng dẫn đóng góp](AGENTS.md) và [danh mục Stitch](docs/stitch/README.md).
