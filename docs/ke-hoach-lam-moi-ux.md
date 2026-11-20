# Kế hoạch làm mới tương tác Mạch Đồng

Phạm vi triển khai gồm khung điều hướng dùng chung, Trợ lý Cò Mạ, hai trang mô phỏng và phần ảnh đại diện trong hồ sơ. Kiểm tra các trang dùng chung khung điều hướng sau khi thay đổi.

## Rà soát hiện trạng

| Khu vực | Vấn đề thấy trong mã và ảnh chụp | Thay đổi |
| --- | --- | --- |
| Điều hướng, nút và hộp thoại | Trang chuyển cảnh, biểu tượng dịch chuyển khi rê chuột và nút thu nhỏ khi bấm | Bỏ chuyển cảnh và chuyển động khi rê chuột. Dùng nền, viền và vòng focus để báo trạng thái |
| Tab mô phỏng | Ba nút có trạng thái nhấn nhưng thiếu ngữ nghĩa tab và điều hướng bằng phím | Dùng tab có biểu tượng, trạng thái chọn rõ, phím mũi tên, Home và End. Giữ tab đang xem khi tải lại bằng tham số URL |
| Thanh trượt | Vùng kéo thấp. Trong lúc rê kéo, nhiều nhãn và phần báo cáo được ghi lại liên tục | Tăng vùng thao tác lên 44 px. Dùng thanh trượt HTML, vạch mốc, số đo và núm có trạng thái hover, focus và kéo. Gom cập nhật theo khung hình và tính kết quả sau khoảng dừng ngắn |
| Khung mô phỏng | Nền mờ nhiều lớp làm các phần khó phân biệt. Hiệu ứng nước và tán lúa chạy liên tục | Dùng nền đặc sáng, viền xanh nhạt và bóng nhẹ. Cảnh ruộng cập nhật theo thông số người dùng đổi |
| Lời khuyên | Số 1, 2, 3 chiếm chỗ. Cò Mạ nhỏ và khung có khoảng rỗng | Bỏ chỉ số ở cả phần xem nhanh và chi tiết. Phóng lớn Cò Mạ, để khung cao theo nội dung |
| Hồ sơ | Ảnh mẫu cố định | Dùng Cò Mạ hoạt hình làm ảnh mặc định. Cho tài khoản đăng nhập tải ảnh JPG, PNG hoặc WebP tối đa 1 MB. Cắt ảnh về dạng vuông để hiển thị tròn trong hồ sơ và trên thanh đầu trang |
| Trợ lý | Lời chào đơn lẻ nằm trên một vùng trắng lớn. Đường dẫn mô phỏng và gợi ý câu hỏi thiếu phân cấp | Đưa nhóm câu gợi ý lên phần mở đầu, chừa chỗ cho hội thoại khi tin nhắn đến. Đặt ô gửi ở đáy khung chat. Khung bên phải có linh vật và liên kết mô phỏng |
| Thông tin cá nhân | Form hỏi thêm trạm/cống, số vụ và mô hình canh tác | Gỡ ba ô khỏi form, giữ dữ liệu đã lưu. Thêm lối vào Thông tin cá nhân và Thể lệ quy đổi LÚA ở mục Tài khoản trong sidebar |
| Viết và sửa bài | Các bước đánh số và trường phụ dàn hết chiều ngang; chưa thấy bài sẽ hiển thị ra sao | Cho tiêu đề và nội dung vào cột viết, ảnh và thông tin mùa vụ vào cột bên. Có chế độ xem trước, bộ đếm và trạng thái bản nháp. Khi sửa bài, giữ quyền tác giả và kiểm tra phiên bản để tránh ghi đè thay đổi ở cửa sổ khác |
| Phản hồi trợ lý | Khi cả hai lượt gọi Gemini hết hạn, máy chủ trả lỗi 504 cho cả tab và khung Cò Mạ | Giới hạn thời gian chờ từng lượt và trả lời từ tài liệu có dẫn nguồn khi Gemini gián đoạn. Dùng chung API cho tab và khung chat |
| Kết nối mô phỏng | Máy chủ cloud không tới được thì ô địa điểm và nút tạo báo cáo bị khóa | Thêm lệnh chạy máy chủ mô phỏng chỉ trên loopback với cùng engine và bộ dữ liệu có nguồn. Dự báo mới và yêu cầu AI vẫn gọi nhà cung cấp trực tuyến |

## Tham khảo giao diện

- Sidebar nền xanh xám nhạt, dùng biểu tượng đồng cỡ và nhóm chức năng rõ ràng. Header desktop dùng tên trang hiện tại, điểm LÚA và tài khoản. Màn hình nhỏ dùng nút mở danh mục. [Linear UI refresh](https://linear.app/changelog/2026-03-12-ui-refresh), [shadcn Dashboard Blocks](https://ui.shadcn.com/blocks/dashboard)
- Chat dùng màn chào có câu hỏi gợi ý và ô soạn tách rõ khỏi vùng tin nhắn. Trạng thái đang trả lời, dừng chờ và gửi lại nằm gần ô soạn. [Vercel Chatbot](https://vercel.com/templates/next.js/chatbot), [AI Elements Prompt Input](https://elements.ai-sdk.dev/components/prompt-input)
- Video Cò Mạ dùng hình linh vật đã tách nền của dự án, phát một lần khi vào tab và có nút phát lại. Ảnh tĩnh cùng khung thay thế khi bật giảm chuyển động hoặc trình duyệt không phát được video trong suốt. [Hướng dẫn giảm chuyển động của web.dev](https://web.dev/articles/prefers-reduced-motion)

## Trình tự triển khai

1. Đổi phản hồi hover, focus và active của khung chung. Giữ phần báo trạng thái tải, lỗi và hành động thành công bằng chữ.
2. Chỉnh tab Mô phỏng, Báo cáo & nguồn và Dữ liệu thời tiết. Kiểm tra liên kết trực tiếp, tải lại trang và thao tác quay lại.
3. Làm lại khối thông số và lời khuyên. Kiểm tra bằng chuột, bàn phím, chạm và cài đặt giảm chuyển động.
4. Thêm ảnh mặc định và luồng tải ảnh có kiểm tra định dạng, kích thước và quyền tài khoản. Kiểm tra ảnh còn sau khi tải lại và tài khoản khác vẫn hiện ảnh riêng.
5. Mở Kho CSV, Diễn đàn, Mô phỏng và Tài khoản để thử điều hướng. Rà các màn hình 1440 px, 1280 px và cỡ điện thoại. Chạy bộ kiểm thử Flask và JavaScript.

## Cách triển khai

Dùng CSS Grid, thuộc tính CSS tùy chỉnh, `:focus-visible`, `@media (hover: hover)` và `prefers-reduced-motion`. Dùng `requestAnimationFrame` cho phản hồi trực quan của slider, `AbortController` để hủy yêu cầu xem trước đã cũ và HTML `dialog` cho lời khuyên chi tiết. Kiểm tra trạng thái tương tác theo [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md) và [mẫu tab WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).

## Chạy và kiểm tra

Chạy `powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1` trong thư mục `Mach-dong`. Dùng `-Port 5001` nếu cổng 5000 đã có ứng dụng khác. Vào Mô phỏng và kiểm tra trạng thái “Máy chủ cục bộ”, rồi chọn địa điểm và chạy báo cáo.

Playwright trên Chrome đã kiểm tra bố cục 1440, 1280 và 390 px, kéo slider bằng chuột và dùng phím, mở báo cáo, phát video có alpha, nhận phản hồi trong cả hai khung chat, đổi ảnh đại diện, xem trước bài, lưu nháp, đăng và sửa bài. Kiểm thử lỗi Gemini dùng phản hồi quá hạn mô phỏng. Lần gọi từ bản chạy cục bộ trả một câu trả lời có trích nguồn từ kho tài liệu.
