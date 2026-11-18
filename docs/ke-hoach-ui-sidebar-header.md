# Kế hoạch thử giao diện sidebar và header Mạch Đồng

## Phạm vi

1. Hoàn tất tích hợp trên `Testing` và chạy lại bộ kiểm thử trước khi mở nhánh `codex/ui-shell-preview`.
2. Giữ bố cục sidebar bên trái, header bên trên và vùng nội dung hiện có. Giữ các mục điều hướng, URL, trạng thái khách và tài khoản, số dư LÚA và hành động đăng xuất.
3. Tham khảo nền sáng, đường phân cách mảnh, biểu tượng nét và vạch dọc đánh dấu trang hiện tại từ dashboard Pivora trong video. Dùng xanh lá mạ và xanh rêu của Mạch Đồng cho nút chính và mục đang chọn. Phạm vi tham khảo gồm bố cục, nút, sidebar, header và hiệu ứng tương tác.

## Cách triển khai

- Chỉnh `src/views/shared/header.html`, `src/views/shared/sidebar.html` và `src/static/shell.css`. Bản web và EXE dùng chung hai template. Header đọc dữ liệu tài khoản từ Flask.
- Dùng TypeScript, React 19 và Next.js cho bản thử riêng của hai thành phần. Tailwind CSS v4 định nghĩa token màu và khoảng cách, shadcn/ui cung cấp primitive cho menu và Motion xử lý chuyển trạng thái. Bản thử dùng dữ liệu tài khoản có nhãn **[Giả lập]**.
- Ưu tiên hiệu ứng đổi màu, độ trong và dịch chuyển nhẹ khi tương tác. Hỗ trợ bàn phím, trạng thái focus, `aria-current` và tùy chọn giảm chuyển động của hệ điều hành.

## Asset có thể dùng lại

| Asset | Đường dẫn | Nguồn trong repo |
|---|---|---|
| Logo Cò Mạ | `src/static/assets/stitch-simulation/co-ma-logo.png` | Bộ asset của giao diện Stitch |
| Sprite và hình cảnh báo Cò Mạ | `src/static/assets/co-ma/` | `co-ma.css` khai báo các khung sprite |
| Ảnh đồng và rễ lúa | `src/static/assets/stitch-forum-field.jpg`, `src/static/assets/stitch-forum-roots.jpg` | Asset diễn đàn đi kèm bản xuất Stitch |
| Ảnh đăng nhập và ảnh hồ sơ | `src/static/assets/stitch-login-hero.jpg`, `src/static/assets/stitch-profile-portrait.jpg` | Asset tài khoản đi kèm bản xuất Stitch |
| Font và icon font | `src/static/assets/stitch-simulation/fonts.css` và các file `.woff2` cùng thư mục | Các tên font và URL được khai báo trong CSS |
| HTML và ảnh chụp thiết kế | `docs/stitch/` | [Danh mục bản xuất Stitch](stitch/README.md) |

Flask phục vụ các file dưới `src/static/` qua URL `/static/`. Khi mang font sang app khác, giữ các file `.woff2` cùng CSS hoặc cập nhật lại `url(...)` tương ứng.

## Kiểm tra

- Chạy bộ test Flask và Worker mô phỏng sau merge. Kiểm tra trang đăng nhập, CSV, diễn đàn, mô phỏng, Cò Mạ, quản trị và hồ sơ.
- Thử giao diện ở 1440, 1280 và 390 px. Kiểm tra trạng thái trang hiện tại, điều hướng bàn phím, mở và đóng menu, hiển thị tài khoản và giảm chuyển động.

## Chạy bản thử

Tại gốc checkout `Mach-dong`, chạy các lệnh sau rồi mở `http://localhost:3059`. Các nút điều hướng đổi mục đang chọn và tiêu đề của vùng nội dung ngay trong bản thử.

```powershell
cd ui-preview
npm ci
npm run dev -- --port 3059
```

Bản Flask và EXE tiếp tục nạp header và sidebar qua template dùng chung. Mở `/community` trên Flask để thử giao diện với các route của app.

[Tailwind CSS với Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs) · [shadcn/ui Sheet](https://ui.shadcn.com/docs/components/sheet) · [Motion và tùy chọn giảm chuyển động](https://motion.dev/docs/react-use-reduced-motion)
