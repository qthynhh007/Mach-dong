# AGENTS.md · AgriData

Đọc README và docs/architecture.md trước khi sửa. Ưu tiên bốn luồng UI trong README và giữ tiếng Việt dễ hiểu cho nông hộ.

- Views trình bày dữ liệu và nhận tương tác. Controller đọc và kiểm tra request, gọi service, rồi trả HTML hoặc JSON dạng `{ data, error }`.
- Đặt quy tắc nghiệp vụ trong `src/services/`. Mô hình dữ liệu nằm trong `src/models/`. Dùng Python 3.12+, type hints, snake_case và Ruff.
- Header và sidebar nằm tại `src/views/shared/`. Sửa giao diện ứng dụng trong `src/views/` và `src/static/`. Giữ nguyên bản xuất Stitch tại docs/stitch để thuận tiện đối chiếu.
- Gắn nhãn dữ liệu giả lập. Giữ loại điểm đo và đơn vị gốc. Dữ liệu mặn kênh/cống chỉ dùng làm bối cảnh cho số đo tại ruộng.
- Engine mô phỏng chạy thuần, có phiên bản và cho cùng kết quả với cùng đầu vào. CHI là điểm mô phỏng sức khỏe dùng thang 100. Tỷ lệ sống cần kiểm định bằng số đếm trên ô mẫu.
- Chỉ gọi Gemini/thời tiết từ lớp client phía server khi tích hợp. Giữ khóa trong biến môi trường.
- Điểm đóng góp dành cho bài hoặc CSV đã duyệt. Mọi tích hợp Avalanche của demo dùng Fuji, chain ID 43113.
- Trước khi mở PR, chạy `python -m unittest discover -s tests -v` và mở cả bốn trang để thử điều hướng.
