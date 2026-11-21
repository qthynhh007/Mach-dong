# Khắc phục tư vấn Cò Mạ và thu gọn đăng ký

Ngày 21/11/2026. Phạm vi: bản cục bộ, chưa phát hành cloud.

## 1. Tư vấn không trả lời khi gặp 429

- Tái hiện hạn mức từ dịch vụ; không dùng đoạn mẫu để che lỗi.
- Chỉ thử model dự phòng khác khi cấu hình cho phép, cùng khóa và dịch vụ; tối đa hai lần gọi cho một yêu cầu. Kiểm tra nguồn, đơn vị, số đo và đề xuất phân/thuốc áp dụng như nhau.
- Kiểm tra model dự phòng bằng API thật trước khi bật. Không bật billing hoặc đổi tài khoản.
- Khi yêu cầu đã lỗi, ẩn trạng thái đang chờ và nút dừng; giữ thông báo thử lại rõ ràng. Mốc 270 giây cho gợi ý tạm thời vẫn được giữ, không hiện mẫu ngay khi lỗi.
- Dùng lại lời đáp thật khi thông số không đổi để giảm gọi trùng.
- Kiểm tra bằng unit test, ba kịch bản API và thao tác nhận lời khuyên trên Chrome thật.

## 2. Tránh chạy nhầm backend cũ

- Chuẩn hóa cách chạy bản cục bộ bằng một launcher Python cho cả PowerShell và điểm vào phát triển.
- Kiểm tra tiến trình thực giữ cổng trước khi nạp bản sửa; không để phiên main.py mặc định vô tình gọi cloud cũ trong phiên nghiệm thu cục bộ.
- Không thay đổi cách import WSGI khi triển khai production.

## 3. Đăng ký trong một màn hình laptop

- Mục tiêu: 1366 × 768 và 1440 × 900, các trường bắt buộc và nút đăng ký nhìn thấy trong cùng trang.
- Giảm khoảng cách và phần minh họa; giữ email đủ dài, SĐT và OTP cùng hàng, mật khẩu/xác nhận cùng hàng.
- Tùy chọn ví dài đặt trong mục mở rộng, mặc định tự tạo ví; giữ đầy đủ luồng dùng ví có sẵn.
- Không ẩn trường bắt buộc, không thu chữ quá nhỏ, không dùng khung cuộn bên trong form. Mobile và màn thấp vẫn được cuộn tự nhiên.
- Kiểm tra desktop, mobile, mở tùy chọn ví, hiển thị OTP/lỗi và nút tạo tài khoản.

## Kết quả

- **Tư vấn thật đã hiển thị trên Chrome:** kịch bản làm đòng, mặn ruộng 2,9 g/L, nước 13 cm, nhiệt độ 29°C nhận lời đáp có bốn mục và danh sách việc làm. Khung chờ kết thúc khi lời đáp xuất hiện. Ảnh: `K:\Unihack\output\co-ma-advice-real-ui.png`.
- **Ca mặn ở kênh trước đây bị 429 đã đạt:** model chính hết lượt, model dự phòng Gemini 3.1 Flash-Lite trả lời 2066 ký tự với ba nguồn, `isFallback=false`. Đây vẫn là phản hồi API; không phải đoạn mẫu. Ba ca của script đều đã có kết quả, lưu ở `K:\Unihack\output\co-ma-advice-regression.json`.
- **Cấu hình:** `GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite`, `GEMINI_QUOTA_FALLBACK=1`. Đã bật trong `.env.local` và bổ sung vào `server/.env.example`. Chỉ chuyển một lần sang model khác; không bật billing hay đổi tài khoản. Khi không bật cờ, 429 không được tự thử lại. Bộ kiểm tra đầu ra dùng chung cho cả hai model.
- **Tránh gọi trùng:** bấm lại tư vấn cho snapshot chưa đổi sử dụng lời đáp API đang giữ trên trang. Đổi điều kiện sẽ xóa kết quả đó và cho phép yêu cầu mới.
- **Trạng thái lỗi:** unit test và kiểm tra Chrome mô phỏng lỗi 429 xác nhận khung chờ, đồng hồ và nút dừng đều ẩn khi request kết thúc; nút thử lại được trả về trạng thái dùng được. Gợi ý tạm thời vẫn không xuất hiện trước 270 giây. Không hứa hết mọi lỗi upstream.
- **Launcher:** `main.py` khi có `MACH_DONG_LOCAL_PREVIEW=1` và `scripts/run-local.ps1` đều dùng `scripts/run-local.py`. Launcher đối chiếu mã instance giữa API và HTML đăng nhập; mở lại khi đúng phiên đang chạy thì thoát bình thường, không tạo backend thứ hai. Đã thử cả hai điểm vào. Trên Windows, probe cổng dùng `SO_EXCLUSIVEADDRUSE` để phát hiện cổng đang được giữ. WSGI import vẫn giữ nguyên.
- **Đăng ký 1366×768:** chiều cao trang đúng 768 px, đáy nút đăng ký khoảng 671 px; không cuộn trang, mọi trường bắt buộc nhìn thấy.
- **Đăng ký 1440×900:** chiều cao trang đúng 900 px, đáy nút khoảng 741 px; không cuộn trang. Tùy chọn ví mở được và dùng ví có sẵn vẫn hiển thị ô địa chỉ.
- **Mobile 390 px:** không tràn ngang, cuộn tự nhiên để giữ trường nhập dễ đọc; không ép các trường bắt buộc vào màn hình thấp. Nhãn OTP ngắn để cùng hàng với SĐT. Ảnh: `K:\Unihack\output\register-1366x768.png`, `register-1440x900.png`, `register-390x844.png`.
- **Kiểm tra:** 81 test Python, 86 test JavaScript, cú pháp 15 tệp client, build/cú pháp Worker và `git diff --check` đạt. Script Chrome không ghi mật khẩu vào source/kết quả; phiên QA riêng được đăng xuất.
- Bản cục bộ đang chạy ở `http://127.0.0.1:5000`. Chưa phát hành cloud; cần triển khai đồng bộ cấu hình fallback và mã mới khi phát hành.

- Bổ sung kiểm tra tránh gọi trùng khi mở cửa sổ sau lỗi: chỉ hiển thị lại lỗi, không tự gọi API. Có nút Thử lại tư vấn ngay trong cửa sổ; một lần bấm gọi đúng một request. Chrome mô phỏng 429 đã xác nhận đếm request 1 khi mở lại và 2 sau một lần bấm thử lại; không có đồng hồ chờ giả. Test này nâng tổng JavaScript lên 86.
