# Bộ dữ liệu mẫu mặn và ngập trên ruộng lúa OM5451

Chọn [CSV mẫu](../server/data/reference/long-huu-man-ngap-demo.csv) trong Kho CSV của Mạch Đồng để xem trước 16 dòng thuộc 5 ca. Mỗi dòng mang `is_simulated=true`. Mã nguồn `MD-DEMO-MAN-NGAP-01` chỉ bộ số liệu giả lập dùng để thử phần mềm. Long Hữu là địa bàn minh họa.

## Đọc năm ca

| Ca | Tình huống giả lập | Dữ liệu tại ruộng |
|---|---|---|
| `LH-01` | Lớp nước canh tác | 3,5 cm, mặn 0,2 g/L, tán lá ở trên mặt nước |
| `LH-02` | Ngập một phần trong nước ngọt | 35 cm, 0,2 g/L, đã ngập 24 giờ |
| `LH-03` | Ngập một phần kèm mặn | Mốc đầu 35 cm, 2,8 g/L, đã ngập 24 giờ. Lần sau 22 cm, 1,7 g/L, tổng thời gian ngập 48 giờ. Số đo kênh 4,1 g/L có mã điểm riêng. |
| `LH-04` | Ngập toàn bộ trong nước ngọt | 55 cm, 0,2 g/L, đã ngập 12 giờ. Quan sát lúc đo cho thấy tán lá chìm hết. |
| `LH-05` | Chỉ có số đo ngoài kênh | Chưa có số đo tại ruộng. Kênh có độ mặn 3,6 g/L. |

`LH-02` và mốc đầu của `LH-03` có cùng độ sâu, thời gian ngập và giai đoạn lúa để minh họa cách báo cáo chênh lệch độ mặn. `LH-03` có hai lần đo trên cùng ruộng để luyện đọc diễn biến. Các giá trị trong bảng là tình huống được tạo cho demo.

## Cần ghi gì khi lấy số liệu thật

Mỗi dòng CSV ghi **một chỉ tiêu tại một điểm và một thời điểm**. Dùng cùng `case_id`, `site_id` và `measured_at` để nối ba dòng độ sâu, độ mặn và thời gian ngập của cùng lần đo.

| Cột | Cách ghi |
|---|---|
| `case_id`, `case_type` | Mã đợt theo dõi và tình huống. Khi chưa biết nước ngọt hay mặn, giữ loại tình huống ở trạng thái chưa xác định đến khi có số đo. Các tên tình huống trong mẫu là nhãn demo. |
| `site_type`, `site_id`, `locality` | Ghi riêng `field` (ruộng), `canal` (kênh) hoặc `sluice` (cống), mã điểm cố định và địa bàn. Giữ nguyên mã điểm khi quay lại đo. |
| `measured_at` | Ngày giờ đo theo ISO 8601, có múi giờ `+07:00` với giờ Việt Nam. |
| `variety`, `day_after_sowing`, `growth_stage` | Ghi giống, số ngày sau gieo và giai đoạn quan sát được. Để trống khi chưa biết hoặc ở dòng đo nước ngoài kênh. |
| `metric=water_depth` | Đo từ mặt đất ruộng lên mặt nước ở điểm đo. Mẫu dùng `cm`. |
| `metric=flood_duration` | Ghi số giờ từ khi đợt ngập bắt đầu đến mốc theo dõi, theo nhật ký hoặc thời gian ước tính có ghi chú. Hai mốc 24 giờ và 48 giờ của cùng đợt là thời gian tích lũy. |
| `metric=salinity` | Mẫu ghi độ mặn nước bằng `g/L`. Khi thu thập thật, chép đúng đại lượng và đơn vị của thiết bị hoặc tài liệu. Ghi EC nước và EC đất thành chỉ tiêu riêng. |
| `canopy_status` | Ghi trực tiếp phần lá bị nước che tại lúc quan sát. `above_water` là tán lá ở trên mặt nước, `partial` là còn phần lá nhô lên, `full` là toàn bộ tán chìm. Dòng kênh để trống. |
| `value`, `unit`, `source_id`, `is_simulated` | Lưu trị số, đơn vị gốc, mã nhật ký đo hoặc tài liệu và cờ giả lập. Để trống trường chưa có số đo. Với số liệu thực địa, đính kèm mã sổ đo hoặc tệp nguồn cùng phương pháp, thiết bị và người ghi trong hồ sơ đợt đo. |

Nếu cần **tỷ lệ cây sống**, bổ sung mã ô mẫu cố định, ngày đếm, số cây sống ban đầu và số cây còn sống ở lần kiểm tra sau nước rút trên cùng ô. Ghi lại trường hợp có gieo dặm hoặc thay đổi ô mẫu để biết hai lần đếm có so sánh được hay không. CSV demo tập trung vào phơi nhiễm nên phần trăm cây sống cần số đếm riêng.

## Nguồn để Cò Mạ giải thích

[JSON nguồn học thuật](../server/data/reference/lua-man-ngap-sources.json) có bốn bản tóm tắt tiếng Việt để thử bước tra cứu. Mỗi mục có mã trích dẫn, URL, mục cần đối chiếu, kết quả và phạm vi của nghiên cứu.

- **Độ sâu và mặn là hai thông tin cần đo riêng.** Zeng và cộng sự thay đổi cả độ sâu nước và EC nước trong thí nghiệm nhà kính trên ba giống lúa. [Zeng và cộng sự](https://www.ars.usda.gov/arsuserfiles/20361500/pdf_pubs/P1801.pdf)
- **Thời gian và kiểu ngập ảnh hưởng cách đọc số đo.** Thí nghiệm ngập kéo dài của Singh và cộng sự tăng dần mực nước và theo dõi đến thu hoạch. Thí nghiệm ngập toàn cây mạ của Sazali và cộng sự ghi riêng mốc trước ngập, sau khi đưa cây khỏi nước và thời điểm phục hồi. [Singh và cộng sự](https://link.springer.com/article/10.1186/s12284-017-0154-5) · [Sazali và cộng sự](https://journal.unisza.edu.my/agrobiotechnology/index.php/agrobiotechnology/article/view/257)
- **Kết quả trên OM5451 cần giữ đúng giai đoạn.** Nghiên cứu của Vũ Thị Xuân Nhường và cộng sự so sánh chịu mặn ở giai đoạn nảy mầm và mạ trong nhà lưới. Muốn ước lượng ảnh hưởng trên ruộng đang đẻ nhánh cần dữ liệu đúng giai đoạn và đúng điều kiện phơi nhiễm. [Vũ Thị Xuân Nhường và cộng sự](https://vie.vjas.vn/index.php/vjasvn/article/view/1042)

Khi nối backend, để Flask chọn các dòng theo `case_id`, `site_type` và thời điểm, sau đó gửi cùng các mục học thuật phù hợp. Cò Mạ nên ghi rõ [Giả lập] khi đọc CSV mẫu và dẫn mã bài báo khi giải thích kiến thức. Route hỏi đáp hiện có thể thử thủ công bằng cách dán một đoạn tóm tắt ca vào câu hỏi.

**Ca kiểm tra.** Hỏi “Ca LH-03, sau 48 giờ nước sâu bao nhiêu và mặn bao nhiêu?” với các dòng của ca đó. Câu trả lời cần dẫn đúng mốc 22 cm và 1,7 g/L tại ruộng, cùng nhãn [Giả lập]. Với `LH-05`, Cò Mạ cần hỏi thêm số đo tại ruộng khi người dùng muốn biết lúa trong ruộng đã gặp mặn bao nhiêu.
