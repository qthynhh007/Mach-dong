# Thiết kế lại màn hình Mô phỏng cánh đồng lúa

## Bố cục và hình ảnh

- Duy trì kiểu chữ Be Vietnam Pro, dải xanh của Mạch Đồng, nền kính mờ và cách vẽ vector của trang hiện tại.
- Thay hình cắt lớp một bụi lúa bằng nhiều thửa ruộng nhìn xéo từ trên xuống. Ruộng chính có các hàng lúa ở những độ xa, gần khác nhau, bờ ruộng, kênh và dải dừa nước ở xa. Cảnh dựng bằng SVG và co giãn theo màn hình.
- Đặt bốn thanh điều khiển trên một hàng ở màn hình rộng và hai cột ở màn hình hẹp. Mỗi thanh hiện giá trị, đơn vị, phần đã kéo và các mốc có ích. Chú thích làm rõ mực nước ở trên, ngang hay dưới mặt ruộng, giai đoạn theo ngày sau sạ và ngưỡng nóng của mô hình. Gom điểm CHI và hai mức rủi ro vào bảng Cò Mạ. Các khung quang hợp, khí khổng, hút nước, ion, kính lúp và năng suất minh họa được bỏ khỏi cảnh.
- Desktop hiển thị cánh đồng bên trái và bảng Cò Mạ bên phải, hai khung bằng chiều cao. Màn hình hẹp xếp vùng điều khiển, cảnh và bảng lời khuyên theo thứ tự dọc. Bảng Cò Mạ hiện tên các bước ưu tiên. Nút **Xem lời khuyên** mở khung chi tiết với thông số của lần tính và nội dung từng bước.

## Diễn tiến hình ảnh

| Điều khiển | Phản hồi trong cảnh |
| --- | --- |
| Độ mặn nước ruộng | Tán lúa và mặt ruộng ấm màu dần theo giá trị mô phỏng. Mức rủi ro có nhãn chữ trong bảng Cò Mạ. |
| Mực nước | Nền đất hiện rõ hơn khi khô. Khi nước dâng, lớp nước phủ đậm hơn và gợn nước rõ hơn trong ranh thửa. |
| Ngày sau sạ | Mạ thưa và thấp, sau đó dày và cao hơn. Đến trổ bông, các hàng lúa có đầu bông và chuyển vàng khi chín. Giai đoạn lấy từ kết quả mô phỏng. |
| Nhiệt độ | Ánh sáng trên cảnh ấm hơn. Bảng Cò Mạ thêm mục quan sát stress nhiệt khi vượt ngưỡng hiện có của mô hình. |

Mọi thay đổi trong cảnh là minh họa. Chuyển động gồm gợn nước, tán lúa lay nhẹ và dải ánh sáng. Khi hệ điều hành yêu cầu giảm chuyển động, cảnh vẫn đổi theo thông số và dừng các hiệu ứng lặp.

Khối **Lúa thay đổi thế nào?** dùng toàn chiều ngang bên dưới cảnh và bảng lời khuyên. Màn hình rộng đặt hình cận cảnh khóm lúa ở cột trái và các giải thích kèm link tài liệu ở cột phải. Màn hình hẹp xếp hình trên phần giải thích. Cò Mạ đứng cạnh điểm CHI trong bảng kết quả và đổi giữa năm biểu cảm theo các mốc 40, 60, 78 và 95. Khung **Xem lời khuyên** dùng riêng tư thế Cò Mạ đang chỉ dẫn. [Căn cứ và giới hạn của cảnh sinh lý](simulation-physiology-sources.md)

## Tiêu chí nghiệm thu

1. Ở 1440 px, 1280 px và 390 px, cảnh nhìn thấy nhiều hàng lúa, bờ ruộng và bảng lời khuyên đủ chỗ đọc mà không cuộn ngang.
2. Đổi ngày sau sạ làm thay đổi hình dáng và nhãn giai đoạn. Đổi nước từ khô sang ngập làm đổi hiệu ứng và bước kiểm tra được ưu tiên.
3. Các mức rủi ro có nhãn chữ, thanh trượt dùng được bằng bàn phím, và chế độ giảm chuyển động vẫn dùng được.
