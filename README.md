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

Nếu không tới được API cloud, cài Node.js 22 trở lên và chạy `powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1` thay cho lệnh `main.py`. Lệnh khởi động cùng bộ máy mô phỏng và dữ liệu có nguồn trên `127.0.0.1:8787`, rồi mở Flask ở cổng 5000. Dự báo mới và phần AI tùy chọn vẫn cần truy cập nhà cung cấp qua Internet.

Khi thêm class Tailwind vào HTML, chạy `npm install` và `npm run build:css` để cập nhật CSS trong `src/static/`. Node.js chỉ cần cho bước dựng lại CSS.

| Trang | Đường dẫn | Xem thử |
|---|---|---|
| Kho CSV cộng đồng | `/community` | Tìm, lọc, xem trước và tải bộ dữ liệu. Tệp UTF-8 do người dùng chọn được kiểm tra cấu trúc trước khi xem |
| Diễn đàn | `/forum` | Tìm không dấu, lọc chủ đề/trạng thái/bài của tôi, sắp xếp và phân trang. Các bài tham khảo đầu có ảnh minh họa ghi tác giả và giấy phép |
| Đăng bài | `/forum/new` | Soạn bài, đính kèm tối đa 4 ảnh, lưu/khôi phục/xóa bản nháp riêng |
| Chi tiết bài | `/forum/<postId>` | Trả lời theo chuỗi, đánh dấu hữu ích, chọn giải đáp, sửa/xóa nội dung của mình |
| Sửa bài | `/forum/<postId>/edit` | Chỉnh sửa bài và ảnh; kiểm tra quyền tác giả trên máy chủ |
| Mô phỏng | `/simulation` | Chỉnh bốn thanh trượt để xem cảnh ruộng giả lập, bổ sung điều kiện rồi mở tab Báo cáo & nguồn hoặc Dữ liệu thời tiết |
| Báo cáo & nguồn | `/simulation/report` | Đường dẫn trực tiếp để lập báo cáo, xem bằng chứng, tải dự báo 7 ngày và dữ liệu NASA POWER |
| Trợ lý Cò Mạ | `/assistant` | Trò chuyện từ nút Cò Mạ ở góc dưới các trang hoặc mở tab trợ lý đầy đủ |
| Đăng nhập | `/login` | Đăng nhập tài khoản cloud, hiện/ẩn mật khẩu và chuyển sang đăng ký |
| Đăng ký | `/register` | Tạo tài khoản và ví Fuji trên cloud, kiểm tra mật khẩu xác nhận |
| Tài khoản | `/profile` | Lưu hồ sơ canh tác vào tài khoản cloud và xem số bài viết, câu trả lời trên diễn đàn |
| Thể lệ dùng điểm LÚA | `/wallet/rules` | Mở từ túi LÚA trên thanh đầu trang để xem tỷ lệ quy đổi và cách dùng ví thử nghiệm |

Đăng nhập và đăng ký dùng [kho tài khoản cloud](docs/cloud-accounts.md). Xác minh email và khôi phục mật khẩu cần cấu hình dịch vụ email trên Site. CSV tải lên chỉ được đọc để xem trước. Kho đánh dấu các bộ giả lập và dẫn nguồn trên các bộ công bố. CSV khí tượng NASA POWER và thống kê lúa FAOSTAT nằm trong `server/data/reference/published-csv/`. Ảnh chụp được thu nhỏ và nén JPEG trong `src/static/assets/forum-photos/`. Tác giả, giấy phép và liên kết ảnh gốc nằm trong `server/data/reference/forum-photo-assets.json`. Phần trăm cây sống chờ số liệu thực địa và mô hình được kiểm định.

Bài viết, câu trả lời, lượt hữu ích, bản nháp và thông tin ruộng của tài khoản được lưu trong D1 trên máy chủ; ảnh diễn đàn nằm trong R2. CSV mẫu, bản tin trạm và nguồn tra cứu của Cò Mạ cũng được đọc từ Site, không đóng gói trong EXE. Hai máy đăng nhập cùng tài khoản sẽ thấy cùng dữ liệu. Khách chưa đăng nhập chỉ được đọc diễn đàn. SQLite cộng đồng chỉ còn dùng cho kiểm thử cục bộ. Xem [sơ đồ lưu trữ cloud](docs/cloud-storage.md) và [hướng dẫn module](docs/community.md).

Bản hợp nhất các nhánh ngày 18/11/2026 giữ mô phỏng Groq trên cloud, hình ruộng mới, bộ dữ liệu cộng đồng, trợ lý, đăng nhập và ví Fuji. Xem [biên bản hợp nhất và kiểm tra](docs/integration-2026-11-18.md). Khóa Groq chỉ nằm trên cloud; Gemini của tab Trợ lý là cấu hình riêng của backend Flask. `.env` được giữ ngoài Git.

Đọc [hướng dẫn module Cộng đồng và API](docs/community.md) để xem lớp MVC, cấu hình và quy tắc nghiệp vụ. Dữ liệu và khóa phiên được loại khỏi Git. Nếu trình duyệt từng lưu thông tin ruộng của tài khoản, trang hồ sơ điền lại dữ liệu để chuyển lên cloud khi lưu; dữ liệu demo chưa đăng nhập vẫn ở thiết bị.

Mã ứng dụng nằm trong [src/](src). Sửa template ở `src/views/`, CSS và JavaScript ở `src/static/`, route Flask ở `src/controllers/` và logic nghiệp vụ ở `src/services/`.

## Kiểm tra và phát hành

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node --test server/tests/*.test.mjs
node --test tests/simulation-view.test.mjs
```

Repository đã có cấu hình Git; không cần `git init` hoặc thêm lại remote sau khi clone. Xem [hướng dẫn bản Windows](docs/simulation.md) để dựng `MachDong.exe`, cấu hình AI trên máy chủ và cập nhật dữ liệu. Workflow Windows có thể chạy thủ công hoặc tạo prerelease khi đẩy tag `desktop-v*`. EXE nằm trong bản phát hành, không đưa vào lịch sử mã nguồn. Không commit môi trường ảo, cơ sở dữ liệu người dùng hoặc khóa cấu hình.

Đọc [kiến trúc và cây thư mục](docs/architecture.md), [hướng dẫn đóng góp](AGENTS.md) và [danh mục Stitch](docs/stitch/README.md).
