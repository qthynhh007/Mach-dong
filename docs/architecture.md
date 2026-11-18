# Kiến trúc MVC kết hợp Service

## Cây thư mục

```text
AgriData/
├── src/
│   ├── main.py          # Flask factory và đăng ký Blueprint
│   ├── config.py        # Cấu hình và đường dẫn đến dữ liệu mẫu
│   ├── controllers/     # Route HTTP theo nhóm màn hình
│   ├── models/          # Kiểu dữ liệu, đầu vào mô phỏng
│   ├── services/        # Kiểm tra CSV, diễn đàn và mô phỏng
│   ├── views/           # Template Jinja, header và sidebar chung
│   └── static/          # CSS, JavaScript và assets/
├── contracts/          # Hợp đồng điểm đóng góp
├── data/reference/     # Bộ CSV giả lập tải từ app
├── docs/stitch/        # Bản thiết kế xuất từ Stitch
├── scripts/            # Dựng CSS Tailwind cho các trang Stitch
├── server/             # Worker cloud: engine, Gemini, dự báo và dữ liệu có nguồn
├── desktop.py          # Launcher cho bản Windows EXE
├── tests/              # Kiểm tra route, CSV và engine
└── main.py             # Chạy phát triển và điểm vào WSGI main:app
```

Flask nạp template từ `src/views/` và phục vụ `src/static/` qua URL `/static/`. Chạy `python main.py` tại gốc AgriData.

## Luồng đang chạy

- **CSV** · Trang Kho CSV → `POST /api/community/preview` → kiểm tra định dạng bằng `quality_service` → hiển thị tên cột, tổng số dòng và tối đa 5 dòng mẫu. Tệp tải lên chỉ được dùng để đọc trong lần xem trước. Tải bộ mẫu qua `GET /community/samples/<name>`.
- **Diễn đàn** · `views/forum/` + các lớp View trong `src/static/forum.js` → `communityController` → `communityService` → `communityModel`/`communityStore` → SQLite. Controller kiểm tra request và CSRF; service kiểm tra nghiệp vụ, quyền tác giả, phiên bản; model chịu trách nhiệm SQL và giao dịch. Giữ các URL `/forum` cùng giao diện sẵn có. `forum_controller.py` chỉ xuất Blueprint tương thích, `forum_service.py` giữ các chủ đề và dữ liệu mẫu. Xem [tài liệu module](community.md).
- **Mô phỏng** · `simulationView` → `simulationController` → `simulationService` → `simulationInput` → `aiClient/cloudClient` → HTTPS đến Worker trong `server/`. Engine có phiên bản và dữ liệu có nguồn chạy trên cloud. Không tính CHI/năng suất/tỷ lệ sống minh họa cũ. Gemini chọn ID bằng chứng hợp lệ khi quản trị viên đã cấu hình key; key không nằm trong EXE. Xem [module mô phỏng](simulation.md).
- **Tài khoản** · `GET /login` và `GET /register` trả mẫu HTML. JavaScript kiểm tra dữ liệu mẫu trong trình duyệt. Cả hai form có thông báo xem thử và liên kết đi tiếp.
- **Trợ lý** · `GET /assistant` hiện một hình Cò Mạ và khung chat desktop. `src/static/assistant.js` hiển thị phản hồi mẫu trong trình duyệt.

## Vị trí tích hợp tiếp theo

1. **Tài khoản** · Nối đăng nhập thật qua `COMMUNITY_IDENTITY_PROVIDER` hoặc session theo [hướng dẫn Cộng đồng](community.md). Diễn đàn đã lưu SQLite và kiểm tra quyền phía server; phiên khách hiện dành cho chạy thử. Luồng duyệt CSV vẫn cần triển khai riêng.
2. **CSV đã duyệt** · Kiểm tra loại điểm đo và đơn vị trên từng quan trắc, lưu trạng thái đóng góp, để quản trị viên duyệt.
3. **Cò Mạ** · Tab chat `/assistant` còn dùng phản hồi mẫu. Phần chọn bằng chứng bằng Gemini trong tab Mô phỏng đã có ở `server/ai.mjs`, chờ khóa máy chủ; `src/services/ai_client.py` và `weather_client.py` chuyển yêu cầu đến cloud. Tích hợp chat hỏi đáp hệ thống là luồng riêng.
4. **Fuji** · Thêm triển khai hợp đồng và service ghi nhận đóng góp sau khi duyệt, có chống cấp điểm trùng. `SimulationCredits.sol` hiện khai báo giao diện dự kiến.
5. **Triển khai web** · Máy chủ WSGI của nền tảng hosting có thể import `main:app`. `python main.py` dùng cho phát triển cục bộ.
