# Cò Mạ trên mọi trang

## Trải nghiệm

- Avatar tròn của Cò Mạ xuất hiện ở góc dưới bên phải. Cò nháy mắt trong hình và lắc nhẹ một nhịp khi rê chuột hoặc dùng bàn phím để lấy tiêu điểm. Cài đặt giảm chuyển động của hệ điều hành tắt hiệu ứng lắc.
- Bấm avatar hoặc nhấn Enter để mở hộp thoại **Trợ lý Cò Mạ**. Mô phỏng, Kho CSV và Diễn đàn có câu hỏi mẫu riêng. Chọn một câu để điền vào ô soạn, rồi sửa hoặc gửi. Liên kết **Mở tab Trợ lý** giữ bộ câu hỏi gợi ý của trang đang xem.
- Nút đóng và phím Escape đóng hộp thoại rồi trả tiêu điểm về Cò Mạ. Đóng rồi mở lại trên cùng trang giữ nội dung đang trò chuyện.

## Triển khai

- Gắn nút và hộp thoại vào template dùng chung. Chỉ tải khung chat khi người dùng mở Cò Mạ lần đầu trên trang.
- Dùng chế độ gọn của trang Trợ lý trong hộp thoại. Dùng chung API `/api/assistant/chat`, nguồn tham khảo, giới hạn câu hỏi, nút dừng chờ và xử lý lỗi của trang Trợ lý.
- Khi JavaScript bị tắt, liên kết Cò Mạ dẫn thẳng tới `/assistant`.
- Các mục điều hướng trong header, sidebar và bộ tab báo cáo có vạch nhấn chuyển động khi rê chuột. Biểu tượng dịch nhẹ theo hướng của từng khu vực.

## Avatar vẫy chào

Ảnh PNG nền trong suốt 256 × 256 nằm tại [src/static/assets/co-ma/wave.png](../src/static/assets/co-ma/wave.png). Template dùng macro `co_ma_wave(size)` để hiển thị avatar. Ảnh được vẽ bằng ImageGen tích hợp, tham chiếu bộ `emotions.png`.

```text
Use case: stylized-concept. Draw one new reusable app mascot sticker, based on the attached sprite sheet as character/style reference only. This is Cò Mạ, an anthropomorphic white Vietnamese rice-farmer egret with a golden woven nón lá, orange elongated pointed beak, moss-green work jacket and rust-and-cream checked khăn rằn. Reinvent the expression as an endearing chibi hello: waist-up compact silhouette, oversized round friendly head, one eye winking and the other bright and round, soft peach blush, joyous smile, and one rounded feathered wing lifted in a wave beside the face. Add one tiny sage-green heart just beyond the wing. Omit the hoe for a clearer silhouette at 40 pixels. Match the reference sticker's warm brown ink, creamy white plumage and vintage illustrated feel with a clean cream contour. Center a single isolated sticker, fully visible, with narrow even transparent margins and a balanced square composition, no floor shadow, no background objects, no typography. PNG with actual transparent alpha. Do not reproduce a sprite sheet or any other poses.
```

## Kiểm tra

- Mở từ Mô phỏng, Kho CSV và Diễn đàn để kiểm tra câu hỏi theo trang. Chọn câu gợi ý, sửa trong ô soạn, gửi, rồi kiểm tra Escape và thao tác mở lại.
- Thử ở 1440 px và 390 px, dùng bàn phím và bật giảm chuyển động. Kiểm tra liên kết mở trang Trợ lý và chế độ tra cứu dữ liệu của backend khi thiếu khóa Gemini.
