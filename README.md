# AgriData · Mạch Đồng

Bản MVC + Service phục vụ cộng đồng và mô phỏng điều kiện canh tác OM5451. Mô phỏng và dữ liệu chạy qua API cloud; có bản Windows EXE không cần cài Python hoặc AI cục bộ. Xem [hướng dẫn mô phỏng, nguồn dữ liệu, cấu hình AI và phát hành EXE](docs/simulation.md).

API công khai: [Mạch Đồng · Dữ liệu mô phỏng](https://mach-dong-rice-data.artfulmica6.chatgpt.site). Có 2.920 dòng NASA POWER năm 2025 tại 8 điểm ĐBSCL, dự báo Open-Meteo và 12 nguồn tham chiếu. Groq với model `openai/gpt-oss-20b` đã được bật trên máy chủ và kiểm thử gọi thật ngày 18/11/2026. Trong tab Mô phỏng, chọn **Nhờ AI chọn bằng chứng** để nhận báo cáo có các mục AI lưu ý. Người dùng không cần nhập key; gói AI miễn phí có hạn mức. AI chọn bằng chứng có sẵn, không tự sinh con số năng suất.

Người dùng tải trực tiếp [MachDong.exe](https://mach-dong-rice-data.artfulmica6.chatgpt.site/downloads/MachDong.exe) (Windows 64-bit, khoảng 40,6 MB), nhấp đúp để chạy. Không cần đăng nhập GitHub hoặc ChatGPT, không cần cài Python. Giao diện mở trong trình duyệt; đóng cửa sổ Mạch Đồng để thoát. Cần Internet để đăng nhập, đọc diễn đàn, lấy dữ liệu và mô phỏng. SHA-256 của bản phát hành: `15be15bebde1fd82d1ed026853eb1d9b31ce1c6b88c739f8ea191e545a05b1de`.

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
| Trợ lý Cò Mạ | `/assistant` | Hỏi đáp có nguồn; Groq trên máy chủ chọn tài liệu phù hợp, lời đáp lấy từ đoạn đã duyệt |
| Đăng nhập | `/login` | Đăng nhập bằng tài khoản cloud; phiên có thời hạn và chống CSRF |
| Đăng ký | `/register` | Tạo hồ sơ và ví Fuji trên cloud; xác minh email cần dịch vụ email của Site |
| Tài khoản | `/profile` | Hồ sơ, mật khẩu, liên kết ví, lịch sử điểm; phân biệt giao dịch giả lập và Fuji |

Đăng nhập và đăng ký dùng [kho tài khoản cloud](docs/cloud-accounts.md) theo mặc định; máy người dùng không lưu cơ sở dữ liệu tài khoản. Xác minh email và khôi phục mật khẩu cần cấu hình dịch vụ email trên Site. CSV tải lên hiện chỉ được đọc để xem trước. Các CSV minh họa trong `server/data/reference` và bài có nhãn “Dữ liệu mẫu” là giả lập; bộ NASA POWER trên cloud là dữ liệu thực từ nguồn có ghi metadata. Phần trăm cây sống chờ số liệu thực địa và mô hình được kiểm định.

Bài viết, câu trả lời, lượt hữu ích, bản nháp và thông tin ruộng của tài khoản được lưu trong D1 trên máy chủ; ảnh diễn đàn nằm trong R2. CSV mẫu, bản tin trạm và nguồn tra cứu của Cò Mạ cũng được đọc từ Site, không đóng gói trong EXE. Hai máy đăng nhập cùng tài khoản sẽ thấy cùng dữ liệu. Khách chưa đăng nhập chỉ được đọc diễn đàn. SQLite cộng đồng chỉ còn dùng cho kiểm thử cục bộ. Xem [sơ đồ lưu trữ cloud](docs/cloud-storage.md) và [hướng dẫn module](docs/community.md).

Bản hợp nhất các nhánh ngày 18/11/2026 giữ mô phỏng Groq trên cloud, hình ruộng mới, bộ dữ liệu cộng đồng, trợ lý, đăng nhập và ví Fuji. Xem [biên bản hợp nhất và kiểm tra](docs/integration-2026-11-18.md). Khóa Groq chỉ nằm trên cloud, dùng cho mô phỏng và trợ lý; người dùng không nhập khóa. `.env` được giữ ngoài Git.

Đọc [hướng dẫn module Cộng đồng và API](docs/community.md) để xem lớp MVC, cấu hình và quy tắc nghiệp vụ. Dữ liệu và khóa phiên được loại khỏi Git. Nếu trình duyệt từng lưu thông tin ruộng của tài khoản, trang hồ sơ chuyển dữ liệu đó lên cloud khi mở lại; dữ liệu demo chưa đăng nhập vẫn ở thiết bị.

Mã ứng dụng nằm trong [src/](src). Sửa template ở `src/views/`, CSS và JavaScript ở `src/static/`, route Flask ở `src/controllers/` và logic nghiệp vụ ở `src/services/`.

## Kiểm tra và phát hành

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node --test server/tests/*.test.mjs
node --test tests/simulation-view.test.mjs
```

Repository đã có cấu hình Git; không cần `git init` hoặc thêm lại remote sau khi clone. Xem [hướng dẫn bản Windows](docs/simulation.md) để dựng `MachDong.exe`, cấu hình AI trên máy chủ và cập nhật dữ liệu. Workflow Windows có thể chạy thủ công hoặc tạo prerelease khi đẩy tag `desktop-v*`; kho GitHub riêng tư chỉ cho người có quyền tải Assets. Bản EXE công khai được lưu riêng trong R2 của Site ở link trên, không đưa vào lịch sử mã nguồn. Không commit môi trường ảo, cơ sở dữ liệu người dùng hoặc khóa cấu hình.

Đọc [kiến trúc và cây thư mục](docs/architecture.md), [hướng dẫn đóng góp](AGENTS.md) và [danh mục Stitch](docs/stitch/README.md).

## Tải bản EXE từ GitHub

Để dùng bản có giao diện codex và các chức năng Simulation đã hợp nhất, mở [dist/MachDong.exe](dist/MachDong.exe) trong nhánh `feature/Simulation` trên GitHub, chọn **Download raw file** rồi lưu file về máy Windows 64-bit. Nếu kho GitHub yêu cầu quyền truy cập, hãy đăng nhập tài khoản được cấp quyền trước khi tải. Link tải cloud ở phần trên là bản phát hành trước.

Nhấp đúp `MachDong.exe` để chạy. Ứng dụng mở giao diện trong trình duyệt; giữ cửa sổ Mạch Đồng đang chạy và đóng cửa sổ đó khi muốn thoát. Không cần cài Python hay mô hình AI; cần Internet để đăng nhập, dùng diễn đàn, lấy dữ liệu và mô phỏng. File trong Git có dung lượng 46.932.688 byte; SHA-256: `2d64c023d4a22328a21750689634addc016c803702595a6ef45d9a6e0e6add53`.
