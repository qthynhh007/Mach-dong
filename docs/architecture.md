# Kiến trúc MVC kết hợp Service

## Cây thư mục

```text
AgriData/
├── src/
│   ├── main.py          # Flask factory và đăng ký Blueprint
│   ├── config.py        # Cấu hình API cloud và đường dẫn thử nghiệm
│   ├── controllers/     # Route HTTP theo nhóm màn hình
│   ├── models/          # Kiểu dữ liệu, đầu vào mô phỏng
│   ├── services/        # Kiểm tra CSV, diễn đàn, truy xuất căn cứ và mô phỏng
│   ├── views/           # Template Jinja, header và sidebar chung
│   └── static/          # CSS, JavaScript và assets/
├── contracts/          # Hợp đồng điểm đóng góp
├── data/               # Trạng thái thử nghiệm trên máy phát triển; không đóng gói dữ liệu tham chiếu
├── docs/stitch/        # Bản thiết kế xuất từ Stitch
├── scripts/            # Dựng CSS Tailwind cho các trang Stitch
├── server/data/reference/ # Nguồn công bố lên cloud: CSV và tài liệu Cò Mạ
├── server/             # Worker cloud: engine, Groq/Gemini, dự báo và dữ liệu có nguồn
├── desktop.py          # Launcher cho bản Windows EXE
├── tests/              # Kiểm tra route, CSV và engine
└── main.py             # Chạy phát triển và điểm vào WSGI main:app
```

Flask nạp template từ `src/views/` và phục vụ `src/static/` qua URL `/static/`. Chạy `python main.py` tại gốc AgriData.

## Luồng đang chạy

- **CSV** · `csv_library` khai báo bộ công bố và nguồn gốc. Xem trước qua `GET /api/community/datasets/<name>`, tải qua `GET /community/samples/<name>`. Với tệp do người dùng chọn, `POST /api/community/preview` kiểm tra cấu trúc và đọc tối đa 5 dòng xem trước.
- **Diễn đàn** · `views/forum/` + `src/static/forum.js` → `communityController` → `cloudCommunityService` → Worker `communityController` → D1/R2. Worker xác minh phiên tài khoản, CSRF, quyền tác giả, phiên bản và dữ liệu. `communityModel`/`communityService` dùng cho kiểm thử SQLite cục bộ. Giữ các URL `/forum` cùng giao diện sẵn có. Xem [tài liệu module](community.md).
- **Mô phỏng** · `simulationView` → `simulationController` → `simulationService` → `simulationInput` → `aiClient/cloudClient` → HTTPS đến Worker trong `server/`. Engine có phiên bản và dữ liệu có nguồn chạy trên cloud. Không tính CHI/năng suất/tỷ lệ sống minh họa cũ. Groq chọn ID bằng chứng hợp lệ; Gemini là nhà cung cấp tùy chọn. Key chỉ nằm trong secret của máy chủ, không nằm trong EXE. Xem [module mô phỏng](simulation.md).
- **Tài khoản** · `auth_controller` → `CloudAuthService` → Worker `/api/account/*` → D1 cho đăng nhập, hồ sơ, thông tin ruộng, ví và lịch sử điểm. `AuthService`/`SQLiteUserRepository` chỉ dùng trong kiểm thử cục bộ. Danh tính tài khoản nối vào diễn đàn. Xem [trạng thái và cấu hình](cloud-accounts.md).
- **Trợ lý** · `assistant_controller` → `assistant_service` → `assistant_sources` và `cloudAssistantService` → Worker `assistantController` → Groq. Dữ liệu nguồn đọc từ Site; Groq chỉ trả mã nguồn, Worker ghép đoạn đã duyệt thành lời đáp. Gemini còn là đường thử tùy chọn, không cần cấu hình trong EXE.

## Vị trí tích hợp tiếp theo

1. **Tài khoản** · Có thể dùng `COMMUNITY_IDENTITY_PROVIDER` để thay nguồn xác thực theo [hướng dẫn Cộng đồng](community.md). Phiên khách dành cho chạy thử.
2. **CSV đã duyệt** · Kiểm tra loại điểm đo và đơn vị trên từng quan trắc, lưu trạng thái đóng góp, để quản trị viên duyệt.
3. **Cò Mạ** · Chat đã có backend Gemini và bộ nguồn; cần cấu hình riêng để gọi Gemini thật. Muốn phát hành desktop không cần khóa cho từng người, cần đưa backend chat lên dịch vụ dùng chung như mô phỏng.
4. **Fuji** · Đã có hợp đồng `SimulationCredits.sol`, `FujiCreditService`, kết nối ví trình duyệt và đọc số dư. Gửi giao dịch cần cấu hình hợp đồng và signer trên backend; quy đổi giả lập vẫn ghi nhãn riêng. Chưa kiểm thử gửi giao dịch thật trong lần hợp nhất.
5. **Triển khai web** · Máy chủ WSGI của nền tảng hosting có thể import `main:app`. `python main.py` dùng cho phát triển cục bộ.
