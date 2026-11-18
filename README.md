# AgriData · Mạch Đồng

Bản MVC + Service phục vụ cộng đồng và mô phỏng điều kiện canh tác OM5451. Màn hình cánh đồng dùng kịch bản giả lập cục bộ. Báo cáo và dữ liệu thời tiết chạy qua API cloud. Bản Windows EXE chạy trực tiếp sau khi tải về. [Hướng dẫn mô phỏng, nguồn dữ liệu, cấu hình AI và phát hành EXE](docs/simulation.md).

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
| Kho CSV cộng đồng | `/community` | Tìm, lọc, xem trước và tải bộ dữ liệu. Tệp UTF-8 do người dùng chọn được kiểm tra cấu trúc trước khi xem |
| Diễn đàn | `/forum` | Tìm không dấu, lọc chủ đề/trạng thái/bài của tôi, sắp xếp và phân trang. Các bài tham khảo đầu có ảnh minh họa ghi tác giả và giấy phép |
| Đăng bài | `/forum/new` | Soạn bài, đính kèm tối đa 4 ảnh, lưu/khôi phục/xóa bản nháp riêng |
| Chi tiết bài | `/forum/<postId>` | Trả lời theo chuỗi, đánh dấu hữu ích, chọn giải đáp, sửa/xóa nội dung của mình |
| Sửa bài | `/forum/<postId>/edit` | Chỉnh sửa bài và ảnh; kiểm tra quyền tác giả trên máy chủ |
| Mô phỏng | `/simulation` | Chỉnh bốn thanh trượt và xem cảnh ruộng, khóm lúa, lời khuyên Cò Mạ cho kịch bản giả lập |
| Báo cáo & nguồn | `/simulation/report` | Nhập điều kiện để chạy mô phỏng cloud, xem bằng chứng và dự báo 7 ngày hoặc tải lịch sử NASA POWER |
| Trợ lý Cò Mạ | `/assistant` | Khung chat desktop với mascot Cò Mạ và câu trả lời mẫu trong trình duyệt |
| Đăng nhập | `/login` | Nhập thông tin mẫu, hiện/ẩn mật khẩu và chuyển sang đăng ký |
| Đăng ký | `/register` | Nhập thông tin mẫu, kiểm tra mật khẩu xác nhận và quay lại đăng nhập |
| Tài khoản | `/profile` | Mở từ avatar, lưu hồ sơ demo trên trình duyệt và xem thử biểu mẫu đổi mật khẩu |

Đăng nhập và đăng ký vẫn là biểu mẫu xem thử, thuộc phần tích hợp tài khoản của nhóm. CSV tải lên hiện chỉ được đọc để xem trước. Kho đánh dấu các bộ giả lập và dẫn nguồn trên các bộ công bố. CSV khí tượng NASA POWER và thống kê lúa FAOSTAT nằm trong `data/reference/published-csv/`. Ảnh chụp được thu nhỏ và nén JPEG trong `src/static/assets/forum-photos/`. Tác giả, giấy phép và liên kết ảnh gốc nằm trong `data/reference/forum-photo-assets.json`. Phần trăm cây sống chờ số liệu thực địa và mô hình được kiểm định.

Bài viết, ảnh, bản nháp, câu trả lời và lượt hữu ích được lưu vào `data/community.sqlite3`, tự tạo khi khởi động. Mặc định mỗi trình duyệt có một **phiên khách dùng thử**; giữ cookie để tiếp tục sửa bài của phiên đó. Đây chưa phải tài khoản đăng nhập. Có sẵn adapter cho tài khoản của Tân và cấu hình tắt khách.

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
