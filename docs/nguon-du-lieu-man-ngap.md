# Nguồn dữ liệu mặn và mực nước ở Đồng bằng sông Cửu Long

[CSV đã làm sạch](../data/station-context/dbscl-man-muc-nuoc-2026.csv) chứa 22 bản ghi lịch sử. Trong đó có 7 giá trị mặn thực đo tổng hợp theo kỳ, 9 giá trị dự báo mặn, 4 giá trị mực nước lớn nhất ngày và 2 dòng nghỉ đo. Chọn tệp ở Kho CSV để xem trước. Với Cò Mạ, dùng số liệu này để trả lời câu hỏi về trạm và kỳ báo cáo. Số đo ở ruộng Long Hữu cần sổ đo thực địa của HTX hoặc nông hộ.

## Điểm bắt đầu để thu thập thêm

| Nguồn | Lấy dữ liệu gì | Cách lấy |
|---|---|---|
| Đài KTTV tỉnh Vĩnh Long, qua Sở Nông nghiệp và Môi trường | Mặn tại các trạm sông, có bảng hiện trạng và dự báo trong cùng bản tin | Theo dõi mục Phòng chống thiên tai & TKCN. Lưu PDF từng kỳ và nhận diện hai bảng qua tiêu đề trước khi trích cột Smax. [Danh mục bản tin](https://snnmt.vinhlong.gov.vn/Default.aspx) · [PDF đã dùng](https://snnmt.vinhlong.gov.vn/Portals/1041/2026/5/19/VILO_XMAN_20260514_1700%20%281%29.pdf?ver=ULoxeqRZg5BrKdp7JslwyA%3D%3D) |
| Viện Khoa học Thủy lợi miền Nam | Mực nước tại trạm, dự báo triều và xâm nhập mặn vùng ĐBSCL | Duyệt mục Dự báo chuyên ngành và lấy tệp PDF gốc theo tuần. Với bảng scan, đối chiếu từng số sau khi nhận dạng chữ. [Kho bản tin](https://www.siwrr.org.vn/?gid=94) · [PDF đã dùng](https://www.siwrr.org.vn/docs/2023/files/20260409-20-VKHTLMN-Bantintuan-DubaoNguonnuoc-09_04_2026.pdf) |
| Ủy hội sông Mê Công (MRC) | Mực nước và mưa theo trạm. Tân Châu có mã `019803`, Châu Đốc có mã `039801`. | Tìm trạm trên cổng giám sát. Dùng cột quan trắc trong bản tin và lưu mốc chuẩn trạm nếu nguồn có ghi. Kiểm tra điều khoản của bộ dữ liệu trước khi tải hàng loạt hoặc công bố lại. [Giám sát theo trạm](https://monitoring.mrcmekong.org/) · [Bảng bản tin MRC](https://ffw.mrcmekong.org/bulletin.php) · [Điều khoản Data Portal](https://portal.mrcmekong.org/about/terms-of-service) |
| HTX hoặc nông hộ ở Long Hữu | Độ sâu và thời gian ngập, độ mặn tại ruộng, giai đoạn lúa | Thu qua biểu mẫu hoặc sổ đo có mã điểm. Giữ đơn vị gốc và ghi riêng ruộng, kênh, cống. [Mẫu cột thu thập](du-lieu-mau-man-ngap.md) |
| Tạp chí khoa học | Kết quả nghiên cứu để giải thích phản ứng của lúa với mặn và ngập | Dùng bài gốc, giữ tên giống, giai đoạn, đơn vị và phạm vi thí nghiệm. [Danh mục JSON học thuật](../data/reference/lua-man-ngap-sources.json) |

## Lô đã trích và cách đối chiếu

Chạy `fetch station` rồi `clean-stations` theo [lệnh trong README](../README.md#thu-thập-và-tái-tạo-dữ-liệu). Tệp tái tạo từ hai PDF khớp SHA-256 với CSV công bố.

- **`VILO-XMAN-18-20260514`.** Bản tin số XMAN-18/17h00/VILO phát ngày 14/05/2026. Chọn 9 trạm trên sông Tiền, Hậu và Cổ Chiên. Trang 2 là bảng hiện trạng 07–14/05/2026. Trang 4–5 là bảng dự báo 14–23/05/2026. SHA-256 `86659fb79a628f37647d685e61253ad1769ffe0ac11194eab15c7256977994d6`. [PDF gốc](https://snnmt.vinhlong.gov.vn/Portals/1041/2026/5/19/VILO_XMAN_20260514_1700%20%281%29.pdf?ver=ULoxeqRZg5BrKdp7JslwyA%3D%3D)
- **`SIWRR-20260409`.** Bản tin phát ngày 09/04/2026. Trang 3, Bảng 2 ghi mực nước lớn nhất ngày 08/04/2026 tại Tân Châu, Châu Đốc, Mỹ Thuận và Cần Thơ. Bảng scan được chép và đối chiếu từ bản render. SHA-256 `3585bdfdc2df73ddd4ea157122e5604ba64c34edb49b6a0f9a4beaf316d0d31d`. [PDF gốc](https://www.siwrr.org.vn/docs/2023/files/20260409-20-VKHTLMN-Bantintuan-DubaoNguonnuoc-09_04_2026.pdf)

Việc chuẩn hóa gồm chuẩn tên sông, đổi dấu phẩy thập phân sang dấu chấm, ghi ngày theo ISO 8601 và gắn trang PDF theo dòng. Giữ đơn vị mặn `‰` và mực nước trạm `m`. Dòng Cái Muối và Đồng Phú ở bảng hiện trạng có nhãn “Nghỉ đo” nên `value` để trống và `value_status=not_measured`.

`period_start` và `period_end` là kỳ của bản ghi. `peak_dates` lưu ngày xuất hiện giá trị cực đại mà bản tin nêu. Dấu `|` ngăn cách các ngày hoặc khoảng rời nhau, dấu `/` ngăn hai đầu của khoảng tính cả hai ngày. Một giá trị cực đại theo kỳ vẫn là một hàng.

Khi mở rộng, giữ các dòng mâu thuẫn trong bản gốc để kiểm tra riêng. Ví dụ, dòng Long Toàn ở trang 2 ghi ngày xuất hiện “18” dù bảng hiện trạng chỉ đến ngày 14/05. Dòng Tân Phú ở trang 4 ghi “04–23” trong bảng dự báo bắt đầu ngày 14/05. Hai dòng này nằm ngoài phạm vi lô đã chọn và cần đối chiếu đơn vị phát hành trước khi dùng ngày.

## Dùng làm bối cảnh cho Cò Mạ

Lọc theo `station_name`, `metric`, `data_kind`, khoảng ngày và `value_status=reported`. Kèm `unit`, kỳ, mã nguồn, trang và URL khi dựng ngữ cảnh. Có thể lưu các phiên bản dự báo khác nhau bằng khóa gồm nguồn, trạm, chỉ tiêu, loại dữ liệu và kỳ. Khi xử lý lần chạy lại của cùng nguồn, đối chiếu SHA-256 và khóa này trước khi thêm dòng.

Ví dụ, Cầu Quan có cực đại **thực đo 3,5‰** trong kỳ 07–14/05 và cực đại **dự báo 3,5‰** trong kỳ 14–23/05. Nếu hỏi mực nước ngập của một thửa ruộng, cần đo độ sâu từ mặt ruộng. Mực nước trạm trong bảng SIWRR chỉ cung cấp bối cảnh thủy văn. [Bản tin mặn Vĩnh Long](https://snnmt.vinhlong.gov.vn/Portals/1041/2026/5/19/VILO_XMAN_20260514_1700%20%281%29.pdf?ver=ULoxeqRZg5BrKdp7JslwyA%3D%3D) · [Bảng 2 của SIWRR](https://www.siwrr.org.vn/docs/2023/files/20260409-20-VKHTLMN-Bantintuan-DubaoNguonnuoc-09_04_2026.pdf#page=3)
