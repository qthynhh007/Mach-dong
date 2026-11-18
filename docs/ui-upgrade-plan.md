# Kế hoạch nâng cấp Mạch Đồng trước demo 21/11/2026

Bản Flask là phạm vi của đợt này. Màn hình rộng 1280–1440 px dùng sidebar, vùng nội dung chính và panel hỗ trợ khi cần. Giao diện dùng tiếng Việt gần gũi, Be Vietnam Pro, tiêu đề xanh đậm và hệ nút dùng chung hiện có.

| Mốc | Việc cần làm | Cách nghiệm thu |
| --- | --- | --- |
| **18/11 · Sửa thông tin dễ hiểu sai** | Hiển thị CHI trên thang 100. Trả đúng kỳ dữ liệu trong Cò Mạ, kể cả khi câu hỏi dùng “hôm qua” hoặc “tuần trước”. | Kịch bản mặc định ra 72/100. Câu hỏi thời điểm gần đây không trích bản tin cũ. Câu hỏi ngày cụ thể giữ đúng trạm, kỳ, đơn vị và loại bản tin. |
| **19/11 · Hoàn thiện Cò Mạ và Kho CSV** | Đặt bước cần làm ở đầu câu trả lời. Tách rõ số đo do bà con cung cấp, căn cứ và thông tin còn thiếu. Mỗi nguồn hiển thị tên, trang hoặc đoạn trong tài liệu và kỳ áp dụng nếu có. Trên Kho CSV, đưa nhãn **Thực đo**, **Dự báo** và **Giả lập** gần tên bộ hoặc dòng dữ liệu thích hợp. | Bà con đọc được việc cần làm và mở đúng nguồn. Trường hợp thiếu giống, giai đoạn hoặc nơi đo có câu hỏi bổ sung. Dialog và bộ lọc dùng được bằng bàn phím và vừa màn hình 390 px. |
| **20/11 · Nối mô phỏng với Cò Mạ nếu các luồng ổn định** | Đặt nút **Hỏi Cò về kết quả này** ở cạnh CHI. Máy chủ đưa đầu vào đã kiểm tra cùng kết quả có phiên bản vào câu hỏi. Ưu tiên kết quả một kịch bản gồm giai đoạn, điểm CHI, rủi ro mặn/ngập và bước quan sát tiếp theo. | Cò Mạ đọc đúng giai đoạn và giá trị ở lần tính được chọn. Số đo kênh hoặc cống vẫn đứng riêng. Cò diễn giải CHI bằng điểm, và yêu cầu số đếm nếu bà con hỏi tỷ lệ sống. |
| **20/11 · Chốt bản demo** | Chạy thử trên URL deploy, cả lượt thường lẫn thiếu khóa Gemini hoặc hết hạn mức. Chuẩn bị kịch bản CSV cục bộ và mô phỏng để trình bày khi mạng chậm. | Diễn đàn, CSV, Mô phỏng và Cò Mạ hoạt động ở 1440, 1280 và 390 px. Có danh sách kết quả thực tế và lỗi còn mở trước 21/11. |

## Bộ câu hỏi và ca đo để kiểm tra độ chính xác

- Chuẩn bị khoảng 30 ca có đáp án hoặc nguồn mong đợi. Gồm câu hỏi trạm theo ngày và theo kỳ, trạm thiếu số đo, số đo kênh so với ruộng, câu hỏi nối tiếp, chuyển cây giữa cuộc chat, thiếu điều kiện chẩn đoán, và câu hỏi nằm ngoài phạm vi nguồn.
- Với Cò Mạ, chấm riêng **chọn đúng tài liệu** và **câu trả lời có được tài liệu hỗ trợ**. Mục tiêu demo là ít nhất 90% ca có nguồn phù hợp trong nhóm tài liệu được chọn. Các ca về số đo cần đúng chỉ tiêu, vị trí, ngày và đơn vị. Với số liệu lịch sử, ghi rõ thực đo hoặc dự báo và mở được trang gốc.
- Với mô phỏng, kiểm thử sát mốc giai đoạn, mốc mặn/ngập, tính lặp lại và mức rủi ro khi mực nước tăng. Quy tắc đang dùng tính từ một bộ đầu vào tức thời. Để đưa thời gian ngập/phơi mặn vào luật, cần định nghĩa dữ liệu tại ruộng, ca đối chiếu thực địa và phiên bản quy tắc mới.
- Sau demo, ưu tiên so sánh hai kịch bản song song, lưu hội thoại theo tài khoản có thao tác xóa, và hiệu chuẩn mô phỏng từ dữ liệu thực địa đã duyệt. Mọi thay đổi về hệ số cần được so với ca thực tế trước khi trình bày như dự báo.
