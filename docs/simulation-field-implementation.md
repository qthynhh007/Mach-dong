# Kế hoạch triển khai và kiểm thử mô phỏng cánh đồng

## Luồng triển khai

1. Dựng cảnh tĩnh tại `src/views/simulation/field.html`. Bốn góc thửa chính định nghĩa cả đường bao SVG và hệ tọa độ để dựng hàng lúa.
2. Kết nối `src/static/simulation-field.js` với thông số của bốn thanh trượt. Tạo vị trí cây bằng bộ sinh số giả ngẫu nhiên có seed cố định, chiếu dạng hình thang để thể hiện góc nhìn xéo, và vẽ lá theo giai đoạn mà máy chủ trả về. Nước và sắc độ phản hồi khi kéo. Cảnh dùng để minh họa. Số liệu kết quả lấy từ máy chủ.
3. Giữ `POST /api/simulation` và phiên bản `SIM-PHYSIOLOGY-V1`. API có thêm `advice_steps` gồm `title` và `body` bên cạnh trường tóm tắt `advice`. Đối tượng `physiology` chứa tín hiệu dựng hình, mô tả và nguồn. Các trường này dùng luật cục bộ nên xuất hiện cùng CHI, giai đoạn và rủi ro.
4. Bảng lời khuyên ưu tiên kiểm tra ngập hoặc khô khi mực nước vượt khoảng hiện hành. Các bước đo mặn ghi riêng vị trí ruộng và kênh/cống. Giai đoạn nóng có thêm mục quan sát, còn tỷ lệ sống cần số đếm trên ô mẫu.
5. Trình duyệt gom các lần kéo nhanh trong 120 ms và hủy yêu cầu cũ để kết quả chỉ cập nhật theo thông số gần nhất. Giá trị lưu trong phiên trình duyệt, nút **Đặt lại** dùng bộ mặc định từ trang.

## Ca kiểm thử

| Ca | Kết quả mong đợi |
| --- | --- |
| Mặc định 2,8 g/L, +4,5 cm, ngày 48, 28,5 °C | Làm đòng, CHI 72/100, ưu tiên đo mặn tại ruộng |
| Chọn ngày 10 rồi ngày 90 | Từ tán mạ thưa, thấp sang ruộng chín vàng có bông |
| Đổi mực nước từ −8 cm lên +25 cm | Nền đất chuyển sang lớp nước rõ hơn, lời khuyên đổi từ kiểm tra khô sang đo độ sâu và thời gian ngập |
| Tăng nhiệt độ lên 38 °C | Tăng sắc ấm của cảnh và có bước quan sát stress nhiệt |
| Thử kịch bản hạ mặn rồi đặt lại | Thanh mặn về 1 g/L, CHI mặc định phục hồi về 72/100 sau khi đặt lại |
| Vừa đổi thanh vừa có yêu cầu cũ hoặc lỗi API | Giữ được kết quả lần tính trước với thông báo, lần trả lời cũ không ghi đè thông số mới |
| Mở **Xem lời khuyên** | Khung chi tiết hiện đúng thông số và nội dung của lần tính được hiển thị. Nút **Đóng** và phím Escape đưa tiêu điểm về nút mở. |
| Bật giảm chuyển động hoặc chỉ dùng bàn phím | Vẫn chỉnh được các thanh trượt, số liệu và lời khuyên cập nhật |

Phạm vi demo là trạng thái tức thời của một kịch bản. Mô phỏng lan truyền nước, chuỗi ngày phơi nhiễm và so sánh nhiều thửa cần dữ liệu đầu vào và phiên bản quy tắc riêng.
