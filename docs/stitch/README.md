# Bản xuất Stitch

Các thư mục tại đây chứa nguyên bản HTML, ảnh chụp và tài liệu thiết kế tìm được trong Mạch Đồng. App chạy từ các template trong views.

| Bản xuất | Màn hình đang dùng |
|---|---|
| community/code.html | Kho CSV tại /community |
| simulation/code.html | Sinh lý lúa tại /simulation |
| login/code.html và login/screen.png | Đăng nhập tại /login |
| Mẫu login | Đăng ký tại /register, dựng thêm theo cùng khung hình và bố cục biểu mẫu |
| profile/code.html | Quản lý tài khoản tại /profile |
| forum-feed/code.html | Danh sách thảo luận tại /forum |
| forum-compose/code.html | Đăng bài chia sẻ tại /forum/new |
| forum-post-detail/code.html | Chi tiết bài và khung trao đổi tại /forum/muong-lo |
| overview, discussion | Bản tham chiếu của các phiên bản trước |
| biophysica-oryza, mach-dong, mach-dong-design | Quy chuẩn thiết kế đi kèm. Bản mach-dong-design trùng nội dung với mach-dong |

Bản chạy đã nối header và sidebar chung, dùng CSS Tailwind đã biên dịch và bổ sung tương tác. Bản xuất gốc lưu các số liệu, nội dung và nút minh họa của Stitch để đối chiếu.

Ba template diễn đàn trong `views/forum/` lấy trực tiếp các khối HTML từ `forum-feed`, `forum-compose` và `forum-post-detail`. Các vùng nhập liệu và nội dung mẫu được nối với dữ liệu của app. Chạy `npm run build:css` khi sửa lớp Tailwind của các màn này.
