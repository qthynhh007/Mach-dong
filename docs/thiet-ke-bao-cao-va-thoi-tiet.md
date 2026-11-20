# Thiết kế tab Báo cáo & nguồn và Dữ liệu thời tiết

Hai tab dùng chung mẫu `report-panels.html` và stylesheet `simulation-reading.css` tại cả trang mô phỏng và trang báo cáo.

## Chữ và số liệu

Dùng Be Vietnam Pro có sẵn trong ứng dụng, gồm bộ ký tự tiếng Việt. Tiêu đề thẻ dùng cỡ 20–26 px, mục con 17 px, nội dung 15 px, bảng 14 px và ghi chú nguồn 13 px. Số liệu trong bảng dùng chữ số có chiều rộng bằng nhau và căn phải để dễ so sánh giữa các ngày. Đơn vị nằm trong tiêu đề cột.

## Báo cáo & nguồn

Đặt tên báo cáo và hai thao tác sửa điều kiện, tải JSON cùng hàng khi đủ chỗ. Tóm tắt nằm ngay bên dưới. Khi chưa chạy mô phỏng, hiển thị hướng dẫn chạy lần đầu. Bảng diễn biến và mục giả định xuất hiện khi có nội dung. Mỗi tài liệu tham khảo có tên liên kết, phạm vi áp dụng và ghi chú sử dụng. Danh mục nguồn chuyển từ hai cột xuống một cột ở màn hình hẹp.

## Dữ liệu thời tiết

Nút tải dự báo nằm cạnh tiêu đề. Dòng trạng thái thông báo hướng dẫn ban đầu, tiến trình tải, nguồn dự báo hoặc lỗi từ dịch vụ. Bảng chỉ xuất hiện khi có số liệu. Dữ liệu lịch sử NASA POWER có thẻ riêng để phân biệt với dự báo Open-Meteo.

## Tương tác

Nút cao tối thiểu 44 px. Nhóm nút được xuống hàng và bảng rộng cuộn ngang trong thẻ. Thông báo tải dự báo dùng vùng trạng thái để trình đọc màn hình nhận thay đổi. Bảng có tên và tiêu đề cột có ngữ nghĩa. [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
