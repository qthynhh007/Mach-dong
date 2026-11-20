# Kế hoạch Nâng cấp UX/UI Mạch Đồng · Hiện đại & Sinh động

Ngày lập: **19/11/2026**
Mục tiêu: Chuyển đổi toàn diện giao diện ứng dụng Mạch Đồng từ bảng điều khiển thông thường sang trải nghiệm web hiện đại, mượt mà chuẩn Google / Linear: hiệu ứng mờ nhòe ánh sáng (ambient glow / frosted glass), bố cục thoáng đãng, giảm thiểu chữ thừa, xóa bỏ nhãn "giả lập" thô cứng, và thiết kế lại hoàn toàn trang Đăng nhập & Đăng ký.

---

## 1. Triết lý Thiết kế & Ngôn ngữ Thị giác

### 1.1. Google Ambient Glow & Frosted Glass (Ánh sáng mờ & Thủy tinh mờ)
- **Ambient Aura Mesh**: Phía sau các khung thẻ (cards) và bề mặt làm việc là các đốm ánh sáng chuyển màu đa tầng (Multi-stop Radial Mesh Gradients) với hiệu ứng làm mờ lớn (`blur(40px - 80px)`), tạo cảm giác có ánh nắng và sương mờ trên đồng lúa đang thở nhẹ (`animation: aurora-float 12s ease-in-out infinite alternate`).
- **Lớp phủ Frosted Glass (Thủy tinh hữu cơ mờ)**:
  - Bề mặt: `backdrop-filter: blur(24px) saturate(190%)`.
  - Nền kính: `rgba(255, 255, 255, 0.72)` ở chế độ sáng kết hợp viền sáng tinh tế `1px solid rgba(255, 255, 255, 0.65)`.
  - Đổ bóng đa tầng: Bóng nông chống bệt + quầng sáng màu thương hiệu (`box-shadow: 0 4px 20px -2px rgba(16, 185, 129, 0.08), 0 12px 32px -4px rgba(14, 44, 36, 0.06)`).

### 1.2. Bảng màu Hiện đại (Modern Agri-Tech Palette)
- **Primary Emerald (Xanh ngọc mạ)**: `#10B981` / `#059669` – năng động, tươi sáng, tượng trưng cho lúa non và công nghệ xanh.
- **Deep Forest (Rêu đậm chiều sâu)**: `#0B271F` / `#133E31` – dùng cho thanh điều hướng rail bên trái và typography quan trọng.
- **Rice Amber Gold (Vàng lúa chín)**: `#F59E0B` / `#FBBF24` – điểm xuyết quầng sáng mặt trời, năng lượng và cảnh báo thông minh.
- **Atmospheric Cyan (Xanh nước mặt)**: `#06B6D4` – ánh sáng cho mực nước, kênh rạch và thời tiết.
- **Canvas Base**: `#F4F8F5` – nền sương dịu mắt, tương phản cao với chữ đậm mà không gây chói.

### 1.3. Micro-interactions & Chuyển động Mượt mà (Fluid Physics)
- Đường cong chuyển động chuẩn: `cubic-bezier(0.16, 1, 0.3, 1)` (spring-like deceleration).
- **Interactive Card Hover**: Nhẹ nhàng nâng nổi 3px, viền sáng chuyển sang gradient xanh ngọc, đốm sáng phía sau mở rộng độ mờ.
- **Button Shimmer & Ripple**: Nút chính có hiệu ứng quét sáng (light sheen) khi hover và phản hồi nhún nhẹ khi click.
- **Slider Aura & Halo**: Khi rê chuột hoặc kéo cần gạt nhiệt độ/mực nước/độ mặn, quầng sáng aura chạy theo con trượt và phát sóng xung kích (ripple waves).

---

## 2. Loại bỏ Chữ Thừa & Nhãn "Giả lập"

- **Vấn đề cũ**: Giao diện tràn ngập văn bản giải thích dài dòng, hộp cảnh báo to tướng, và từ `[Giả lập]` xuất hiện dày đặc khắp nơi, tạo cảm giác như một sản phẩm thử nghiệm chưa hoàn thiện.
- **Giải pháp chuyển đổi**:
  - Xóa bỏ toàn bộ từ `[Giả lập]` trên giao diện người dùng. Thay thế bằng các huy hiệu (badges) chuẩn công nghệ:
    - `[Giả lập] OM5451` $\rightarrow$ `🌾 Mô hình số OM5451`
    - `[Giả lập] Hồ sơ HTX Long Hữu` $\rightarrow$ `Tài khoản Nông hộ`
    - `[Giả lập] Số dư khởi tạo` $\rightarrow$ `Số dư kích hoạt ví Fuji`
    - `[Giả lập] Dữ liệu mẫu` $\rightarrow$ `Bộ dữ liệu thực nghiệm`
  - Chuyển hóa các đoạn văn bản hướng dẫn dài thành **Quick Feature Chips** (Icon + từ khóa xúc tích) hoặc thanh tiến trình trực quan.

---

## 3. Trọng tâm: Tái thiết kế Toàn diện Trang Đăng Nhập & Đăng Ký

### 3.1. Trang Đăng Nhập (`/login`)
- **Bố cục mới**:
  - Không gian hai phần cân bằng tỷ lệ vàng hoặc Card nổi trung tâm dạng kính nổi (Glass Floating Showcase).
  - Cột trái (Hero Brand Showcase): Không chỉ là hình tĩnh, mà là bản hòa ca thị giác với mặt trời lúa nước, quầng hào quang Google-style, các thẻ tính năng nổi (Floating Glass Feature Pills) như:
    - *⚡ Trợ lý AI Cò Mạ đồng hành 24/7*
    - *📊 Dự báo xâm nhập mặn & ngập úng sớm*
    - *🔗 Tích hợp ví điểm thưởng Web3 Fuji*
  - Cột phải (Auth Form):
    - Segmented Tab Switcher dạng viên thuốc trượt mềm mại: **Đăng nhập** / **Quên mật khẩu**.
    - Ô nhập liệu thiết kế lại: Icon tích hợp tinh tế bên trái, viền mờ sang trọng, khi focus sẽ phát sáng quầng xanh ngọc (`box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15)`).
    - Nút gửi mã OTP tích hợp ngay bên phải input với trạng thái đếm ngược trực quan.
    - Nút Đăng Nhập to bản, màu xanh ngọc gradient, hiệu ứng mũi tên trượt sang phải khi hover.
    - Cảnh báo lỗi/thành công xuất hiện dưới dạng thông báo snackbar nổi mượt mà, không làm giật khung hình.

### 3.2. Trang Đăng Ký (`/register`)
- **Bố cục mới**:
  - Cắt giảm sự nặng nề của form bằng cách chia nhóm thị giác rõ ràng:
    - **Nhóm 1: Thông tin tài khoản** (Họ tên & Tên đăng nhập).
    - **Nhóm 2: Xác thực danh tính** (Email nhận mã OTP 6 số + Số điện thoại).
    - **Nhóm 3: Mật khẩu bảo vệ**.
    - **Nhóm 4: Thẻ ví Web3 Avalanche Fuji hiện đại**:
      - Thay các đoạn văn bản dài bằng một card thẻ tín dụng kỹ thuật số (Digital Web3 Card) viền sáng tinh xảo, có logo Avalanche Fuji đỏ nổi bật.
      - Tùy chọn: *Tự động cấp ví theo Email (Khuyên dùng)* hoặc *Kết nối ví ngoài*.
      - Sau khi đăng ký thành công: Khung hiển thị địa chỉ ví bung nở với hiệu ứng chúc mừng (Celebration Reveal), hiển thị số dư LÚA và AVAX sáng rõ, không hề có chữ "[Giả lập]".

---

## 4. Hiện đại hóa Toàn bộ Giao diện Ứng dụng

### 4.1. Thanh Đầu Trang (Header) & Thanh Điều Hướng (Sidebar)
- **Header**: Bề mặt thủy tinh mờ cố định (`sticky`), hiệu ứng khúc xạ ánh sáng khi cuộn trang, logo Mạch Đồng với quầng sáng nhẹ, avatar người dùng có viền trạng thái trực tuyến xanh ngọc.
- **Sidebar Rail**: Gam màu xanh rêu trầm cao cấp (`#0B271F`), các mục menu được bo góc dạng viên thuốc (`pill`), khi hover có ánh sáng trượt mượt mà, mục đang chọn có nền xanh mạ sáng rực và icon đổi màu sắc sảo.

### 4.2. Màn hình Mô Phỏng Sinh Lý Ruộng Lúa (`/simulation`)
- Các thanh trượt thông số (Độ mặn, Mực nước, Nhiệt độ) bọc trong khung kính có quầng sáng màu tương ứng:
  - Độ mặn: Quầng hổ phách rực rỡ khi vượt ngưỡng nguy hiểm.
  - Mực nước: Quầng xanh cyan trong lành.
  - Nhiệt độ: Quầng vàng ấm áp.
- Con trượt có hiệu ứng vòng hào quang tỏa tròn (`aura-ripple`).
- Thẻ phim thời tiết (`weather-film`) bao phủ viền cong lớn 24px, video chạy liền mạch với lớp gradient sẫm ở cạnh để chữ nổi bật mà không cần hộp che.

### 4.3. Trợ Lý AI Cò Mạ (`/assistant`)
- Bong bóng tin nhắn nổi trên nền sương mờ với viền kính tinh tế.
- Khung soạn thảo tin nhắn hiện đại tích hợp icon đính kèm ảnh, đếm ký tự dạng số tròn, phím tắt nhanh và nút gửi gradient với hiệu ứng viền phát sáng.

### 4.4. Kho CSV Cộng Đồng (`/community`) & Diễn Đàn (`/forum`)
- Bỏ các dòng văn bản giải thích khô khan; thay bằng các thẻ dữ liệu tương tác có icon phân loại màu, số dòng hiển thị rõ nét, nút Xem thử và Tải về với viền hover đổi màu.

---

## 5. Kế hoạch Triển khai Chi tiết

| Bước | Hạng mục thực hiện | Tệp thay đổi |
|---|---|---|
| **1** | Thiết kế hệ thống CSS tokens, Ambient Aurora Glow & Frosted Glass | `src/static/shell.css` |
| **2** | Hiện đại hóa CSS khung Auth & chuyển động mượt | `src/static/auth-layout.css`, `src/static/auth.css` |
| **3** | Thiết kế lại hoàn toàn HTML Đăng nhập, Đăng ký & Hero | `src/views/auth/login.html`, `src/views/auth/register.html`, `src/views/auth/hero.html` |
| **4** | Dọn dẹp nhãn "[Giả lập]" và tối ưu chữ ở Profile, Simulation, Community | `src/views/auth/profile.html`, `src/views/simulation/index.html`, `src/views/community/datasets.html` |
| **5** | Nâng cấp hiệu ứng ánh sáng cho Mô phỏng, Con trượt & Trợ lý Cò Mạ | `src/static/simulation-view.css`, `src/static/assistant.css` |
| **6** | Kiểm thử hồi quy toàn diện (77 tests, linter, 8 routes) | `tests/`, Python unittest runner |
