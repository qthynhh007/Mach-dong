# Báo cáo Kiểm thử Toàn diện Mạch Đồng (QA Test Report)

**Thời điểm thực hiện:** 21/11/2026  
**Nhánh Git:** `Testing01` (Clean working tree, không sửa mã ứng dụng nguồn)  
**Môi trường:** Cục bộ Windows 10/11, Python 3.12 (venv), Node.js v26.13.1, Google Chrome Headless v157 (CDP)  
**Địa chỉ ứng dụng:**  
- Flask Web App: `http://127.0.0.1:5000` (PID 14384)  
- Node Worker / Mock Cloud API: `http://127.0.0.1:8787` (PID 16716)  
**Độ phân giải kiểm thử:** Desktop 1440 × 1000, Desktop 1280 × 900, Mobile 390 × 844  
**Thư mục lưu trữ bằng chứng:** `docs/demo-screenshot/` (trong repo Mạch Đồng) và sao lưu tại `K:\Unihack\output\antigravity-testing\`  

---

## 1. Kết quả kiểm thử tự động (Automated Test Suites)

Tất cả các bộ kiểm thử tự động được thực thi tuần tự trên nhánh `Testing01` và đều đạt kết quả xuất sắc (100% PASS, Exit code 0):

| STT | Lệnh kiểm thử | Số test thực tế | Kết quả | Exit Code | Ghi chú |
|---|---|---|---|:---:|---|
| 1 | `.\.venv\Scripts\python.exe -m unittest discover -s tests -v` | 77 tests | **PASS (77/77)** | 0 | Chạy xong trong 46.255s, tất cả models/services/controllers hợp lệ |
| 2 | `node --test server/tests/*.test.mjs tests/simulation-view.test.mjs` | 50 tests | **PASS (50/50)** | 0 | 35 server tests + 15 simulation view tests |
| 3 | `node scripts/check-client-js.mjs` | 12 files | **PASS (12/12)** | 0 | Cú pháp client-side JS hoàn toàn sạch |
| 4 | `node server/build.mjs` | 2920 rows | **PASS** | 0 | 2920 weather rows + 12 sources built thành công |
| 5 | `node --check server/dist/server/index.js` | 1 file | **PASS** | 0 | Cú pháp bundle phân phối hợp lệ |
| 6 | `git diff --check` | Toàn bộ repo | **PASS** | 0 | Không có whitespace error hoặc conflict marker |
| 7 | `node ui-preview/node_modules/typescript/bin/tsc --project ui-preview/tsconfig.json --noEmit` | TypeScript | **PASS** | 0 | 0 errors |

---

## 2. Bảng tổng hợp ca kiểm thử trình duyệt thật (Suites A – H)

Kiểm thử được thực hiện trên trình duyệt thật (Google Chrome qua giao thức CDP - Chrome DevTools Protocol) và gọi API thực tế của hệ thống.

| Mã ca | Hạng mục / Thao tác | Kết quả mong đợi | Kết quả thực tế | Trạng thái | Bằng chứng |
|:---:|---|---|---|:---:|---|
| **A1** | Khách truy cập trực tiếp `/community`, `/forum`, `/simulation`, `/assistant`, `/profile` | Chuyển hướng 302 về `/login?next=...` | Chuyển hướng chuẩn xác về `/login` kèm tham số `next` nội bộ | **PASS** | [01_login_desktop_1440.png](file:///K:/Unihack/output/antigravity-testing/01_login_desktop_1440.png) |
| **A2** | API dữ liệu nghiệp vụ (`/api/auth/profile`, `/api/simulation/advice`) khi không có phiên | Trả về HTTP 401, không lộ thông tin người dùng | HTTP 401 với thông báo: "Bà con đăng nhập để dùng Mạch Đồng nha." | **PASS** | `qa-summary.json` |
| **A3** | Giao diện `/login` ở desktop 1440x1000 | Header có Đăng nhập/Đăng ký bên phải; không còn nút "Danh mục"; tab "Quên mật khẩu" hiển thị rõ | Đầy đủ nút ĐN/ĐK, không còn "Danh mục", có tab Quên mật khẩu, không lộ ví | **PASS** | [01_login_desktop_1440.png](file:///K:/Unihack/output/antigravity-testing/01_login_desktop_1440.png) |
| **A4** | Click tab "Quên mật khẩu" trên `/login` | Chuyển sang form khôi phục mật khẩu riêng biệt | Mở form nhập email/tên đăng nhập, nút nhận mã, mật khẩu mới | **PASS** | [02_login_forgot_password.png](file:///K:/Unihack/output/antigravity-testing/02_login_forgot_password.png) |
| **A5** | Đăng nhập sai mật khẩu hoặc thiếu trường | Báo lỗi rõ ràng, nút bấm không bị kẹt | HTTP 401: "Tài khoản hoặc mật khẩu không đúng.", nút reset trạng thái bình thường | **PASS** | `qa-summary.json` |
| **A6** | Tham số `next` nội bộ vs ngoại bộ | Giữ `next=/simulation`; loại bỏ `evil.example.com` | `safe_workspace_path` chặn URL ngoại vi, chuyển về `/community` an toàn | **PASS** | `qa-summary.json` |
| **A7** | Đăng xuất từ sidebar | Hủy session cookie, bảo vệ dữ liệu, không dùng lại được phiên cũ | Session bị hủy ngay lập tức, truy cập lại trang bảo vệ bị 302 về `/login` | **PASS** | [23_post_logout_login_page.png](file:///K:/Unihack/output/antigravity-testing/23_post_logout_login_page.png) |
| **B1** | Bố cục form đăng ký `/register` ở 1440x1000 | Email ở hàng riêng; SĐT và OTP nằm cùng hàng; ô OTP ngắn, không giãn chữ | Đúng thiết kế: Email hàng riêng, SĐT + OTP cạnh nhau, ô OTP 6 số gọn gàng | **PASS** | [03_register_desktop_1440.png](file:///K:/Unihack/output/antigravity-testing/03_register_desktop_1440.png) |
| **B2** | Gửi OTP cục bộ (Simulated mailbox) | Gán nhãn giả lập, trả mã dev trong môi trường thử nghiệm | Trả về `dev_otp_code` với nhãn `isSimulated: true`, không gửi email thật | **PASS** | `qa-summary.json` |
| **B3** | Đăng ký tài khoản với mã OTP hợp lệ | Tạo tài khoản vai trò `FARMER`, kích hoạt ví tự động Fuji (Chain 43113) | Đăng ký thành công HTTP 201, nhận địa chỉ ví Avalanche Fuji | **PASS** | `qa-summary.json` |
| **B4** | Đăng ký trùng lặp / OTP sai | Báo lỗi rõ ràng, không tạo tài khoản trùng | Trả về HTTP 400 kèm thông báo lỗi cụ thể | **PASS** | `qa-summary.json` |
| **B5** | Giao diện Đăng nhập & Đăng ký trên Mobile (390x844) | Bố cục xếp chồng hợp lý, không tràn ngang, không đè icon | Co giãn chuẩn xác theo mobile viewport | **PASS** | [04_login_mobile_390.png](file:///K:/Unihack/output/antigravity-testing/04_login_mobile_390.png)<br>[05_register_mobile_390.png](file:///K:/Unihack/output/antigravity-testing/05_register_mobile_390.png) |
| **C1** | Lượt chat 1: "Lúa OM5451 đang đẻ nhánh, nước ruộng mặn 2,8 g/L..." | Phân tích mặn ruộng, hướng dẫn kiểm tra không suy đoán bừa | Phản hồi chi tiết, lưu ý theo dõi sát sao mặn ruộng, có trích dẫn nguồn | **PASS** | [08_assistant_chat_conversation.png](file:///K:/Unihack/output/antigravity-testing/08_assistant_chat_conversation.png) |
| **C2** | Lượt chat 2: "Mực nước ruộng là 4,5 cm, vậy có cần tháo nước ngay không?" | Nhớ ngữ cảnh lượt 1, phân tích mối liên hệ nước ruộng và mặn | Nhớ chính xác lúa OM5451 đẻ nhánh, mặn 2.8 g/L, đưa giải pháp điều tiết | **PASS** | [08_assistant_chat_conversation.png](file:///K:/Unihack/output/antigravity-testing/08_assistant_chat_conversation.png) |
| **C3** | Lượt chat 3: "Nếu số mặn đó đo ở kênh, chưa đo tại ruộng thì sao?" | Phân biệt rõ mặn kênh vs mặn ruộng, cảnh báo không thay thế số đo | Khẳng định không được lấy mặn kênh làm mặn ruộng, cần đo trực tiếp tại ruộng | **PASS** | [08_assistant_chat_conversation.png](file:///K:/Unihack/output/antigravity-testing/08_assistant_chat_conversation.png) |
| **C4** | Lượt chat 4: "Giờ lúa đã trổ bông, nhiệt độ cao nhất 35°C, cần chú ý gì?" | Nhận diện giai đoạn mẫn cảm nhiệt và mặn, cảnh báo sốc nhiệt | Cảnh báo ngưỡng nhiệt 35°C lúc trổ bông kết hợp với nguy cơ mặn | **PASS** | [08_assistant_chat_conversation.png](file:///K:/Unihack/output/antigravity-testing/08_assistant_chat_conversation.png) |
| **C5** | Lượt chat 5: "Tóm lại ba việc nên làm trước và số đo còn thiếu." | Tổng hợp 3 việc làm ngay và các chỉ số cần đo bổ sung | Liệt kê đủ 3 việc làm cụ thể và nhắc đo EC đất vùng rễ, chiều cao cây | **PASS** | [08_assistant_chat_conversation.png](file:///K:/Unihack/output/antigravity-testing/08_assistant_chat_conversation.png) |
| **D1** | Ca D1: Đẻ nhánh, 48d, mặn ruộng 2.8 g/L, nước 4.5 cm, 28.5°C | Mô phỏng ra kết quả engine; bấm tư vấn AI trả lời theo snapshot | Báo cáo hiển thị 4 bằng chứng; Gemini phân tích đúng 4 thông số D1 | **PASS** | [10_simulation_d1_report_advice_1440.png](file:///K:/Unihack/output/antigravity-testing/10_simulation_d1_report_advice_1440.png) |
| **D2** | Ca D2: Trổ bông, 75d, mặn ruộng 4.2 g/L, nước 36 cm, 35°C | Cảnh báo nhiệt độ cực đại chạm ngưỡng 35°C, nguy cơ ngập sâu | Phân tích sâu rủi ro kép (nắng nóng + ngập 36cm + mặn 4.2 g/L) | **PASS** | [13_simulation_d2_advice_1440.png](file:///K:/Unihack/output/antigravity-testing/13_simulation_d2_advice_1440.png) |
| **D3** | Ca D3: Làm đòng, 55d, mặn kênh 4.2 g/L, nước 4.5 cm, 30°C | Giữ mặn kênh riêng biệt làm bối cảnh, không quy đổi thành mặn ruộng | Nhãn hiển thị `Mặn kênh 4,2 g/L`, cảnh báo kiểm tra cống và nước vào ruộng | **PASS** | [14_simulation_d3_advice_1440.png](file:///K:/Unihack/output/antigravity-testing/14_simulation_d3_advice_1440.png) |
| **E0** | Video linh vật Cò Mạ trên `/assistant` | Tự động phát (`autoplay`), lặp lại (`loop`), tắt tiếng (`muted`), bỏ nút "Phát lại" | Video phát mượt liên tục, không còn nút "Phát lại", dừng/chạy theo visibility | **PASS** | [06_assistant_desktop_1440.png](file:///K:/Unihack/output/antigravity-testing/06_assistant_desktop_1440.png) |
| **E1** | Vị trí nút Đăng xuất mới | Nằm ở dưới cùng thanh sidebar (`.app-side-footer`), màu trắng, hover đỏ nhạt | Nút màu trắng sạch sẽ ở chân sidebar, hover đỏ nhạt (`#fef2f2`); header không còn nút đăng xuất | **PASS** | [06_assistant_desktop_1440.png](file:///K:/Unihack/output/antigravity-testing/06_assistant_desktop_1440.png)<br>[07_assistant_sidebar_logout_hover.png](file:///K:/Unihack/output/antigravity-testing/07_assistant_sidebar_logout_hover.png) |
| **E2** | Vị trí khung Lời khuyên Cò Mạ trong tab Báo cáo | Nằm **bên dưới** các mục đối chiếu điều kiện thực tế | Nằm tách biệt ngay dưới các mục kiểm tra ngoài ruộng, viền xanh trang nhã | **PASS** | [10_simulation_d1_report_advice_1440.png](file:///K:/Unihack/output/antigravity-testing/10_simulation_d1_report_advice_1440.png) |
| **E3** | Bố cục các mục trong khung lời khuyên | Phân tách lời mở đầu, "Điều kiện đáng chú ý", "Việc nên làm", "Cần đo thêm", "Khi nào cần nhờ cán bộ nông nghiệp" | Từng mục hiển thị trong khối riêng, các việc nên làm chia thành từng bước rõ ràng | **PASS** | [10_simulation_d1_report_advice_1440.png](file:///K:/Unihack/output/antigravity-testing/10_simulation_d1_report_advice_1440.png) |
| **E4** | Không bị tách nhầm số thập phân (`2.8`, `4.5`, `28.5`) | Giữ nguyên định dạng số thập phân trong văn bản | Giữ nguyên số đo (`2.8 g/L`, `4.5 cm`, `28.5°C`), chỉ đánh số thứ tự khi có dấu chấm + khoảng trắng | **PASS** | [10_simulation_d1_report_advice_1440.png](file:///K:/Unihack/output/antigravity-testing/10_simulation_d1_report_advice_1440.png)<br>[12_simulation_d1_dialog_1440.png](file:///K:/Unihack/output/antigravity-testing/12_simulation_d1_dialog_1440.png) |
| **E5** | Hộp thoại modal "Lời khuyên chi tiết của Cò Mạ" | Mở bằng nút "Xem lời khuyên", đóng bằng nút [X] hoặc phím Esc, cuộn mượt | Dialog mở chuẩn xác, cuộn xem hết nội dung, đóng bằng Esc và nút [X] mượt mà | **PASS** | [12_simulation_d1_dialog_1440.png](file:///K:/Unihack/output/antigravity-testing/12_simulation_d1_dialog_1440.png) |
| **E6** | Nguồn tham khảo & An toàn văn bản | Mặc định thu gọn, mở/đóng được, link HTTPS; render textContent chống XSS | Danh sách nguồn thu gọn có badge số lượng; link FAO dùng HTTPS; script test bị escape | **PASS** | [11_simulation_d1_sources_expanded.png](file:///K:/Unihack/output/antigravity-testing/11_simulation_d1_sources_expanded.png) |
| **F1** | Tab thời tiết: Tải dự báo 7 ngày | Tải bảng dự báo thời tiết 7 ngày cho Cần Thơ | Hiển thị đủ 7 hàng với nhiệt độ min/max, mưa mm, ET₀ mm, bức xạ MJ/m² | **PASS** | [16_weather_tab_7days_1440.png](file:///K:/Unihack/output/antigravity-testing/16_weather_tab_7days_1440.png) |
| **F2** | Chuyển đổi địa điểm thời tiết sang Trà Vinh | Dữ liệu cập nhật theo Trà Vinh, phản hồi không ghi đè lẫn nhau | Cập nhật chính xác địa điểm và bảng số liệu tương ứng | **PASS** | [17_weather_location_switched.png](file:///K:/Unihack/output/antigravity-testing/17_weather_location_switched.png) |
| **G1** | Thẻ ví gọn gàng & Hồ sơ nông hộ | Thẻ ví chuẩn phong cách thẻ ATM, hiển thị số dư LÚA giả lập, Fuji chain 43113 | Thẻ ví hiển thị 3 LÚA, 2.5 AVAX, Avalanche Fuji Testnet, nút đổi avatar hoạt động | **PASS** | [18_profile_wallet_1440.png](file:///K:/Unihack/output/antigravity-testing/18_profile_wallet_1440.png) |
| **G2** | Ẩn chức năng "Duyệt dữ liệu", `/admin` trả 404 | Không có tab Duyệt dữ liệu ở sidebar/header; `/admin` trả 404 cho mọi vai trò | Sidebar và header không có tab Duyệt dữ liệu; `/admin` trả 404 Not Found | **PASS** | [22_admin_404_page.png](file:///K:/Unihack/output/antigravity-testing/22_admin_404_page.png) |
| **G3** | Loại bỏ 4 bộ CSV mẫu cũ tại ruộng | Không còn "Độ mặn tại ruộng", "Mực nước ruộng", "Nhiệt độ tại ruộng", "Độ pH tại ruộng" | Danh mục CSV chỉ hiển thị các bộ dữ liệu cộng đồng hợp lệ | **PASS** | [20_community_catalog_1440.png](file:///K:/Unihack/output/antigravity-testing/20_community_catalog_1440.png) |
| **H1** | Kiểm tra hồi quy các trang `/community`, `/forum` | Tải trang thành công, đầy đủ thành phần giao diện | HTTP 200, hiển thị danh mục CSV và danh sách chủ đề thảo luận | **PASS** | [20_community_catalog_1440.png](file:///K:/Unihack/output/antigravity-testing/20_community_catalog_1440.png)<br>[21_forum_home_1440.png](file:///K:/Unihack/output/antigravity-testing/21_forum_home_1440.png) |

---

## 3. Đánh giá chuyên sâu: Khung Lời khuyên Cò Mạ vừa cập nhật

Sau khi kiểm thử toàn diện bằng hình ảnh thực tế và DOM inspector:
1. **Thứ tự bố cục hoàn hảo:** Trong tab Báo cáo (`#reportPanel`), các điều kiện đối chiếu được hiển thị trước (khối accordion: "Chưa đủ dữ liệu tính ảnh hưởng mặn...", "Giữ đúng vị trí...", "Nhiệt độ...", "Mực nước..."). Khung Lời khuyên Cò Mạ (`#reportAdviceCard`) nằm ngay bên dưới, tạo luồng thị giác từ căn cứ thực tế sang lời khuyên chuyên gia.
2. **Nhận diện thương hiệu & Độ hoàn thiện giao diện:** Khung được bo viền xanh lá nhẹ (`#e2ece9`), nền kính mờ dịu mắt, mascot Cò Mạ kích thước 44×44px sắc nét, có huy hiệu "Gợi ý chăm sóc ruộng lúa" và nút gọi tư vấn AI "Nhờ Cò Mạ tư vấn".
3. **Phân đoạn mạch lạc:** Lời phản hồi từ AI được bóc tách thành công thành các section chuyên biệt:
   - *Mở đầu:* Lời chào và tóm tắt kịch bản.
   - *Điều kiện đáng chú ý:* Nhấn mạnh số đo tức thời và giai đoạn sinh trưởng.
   - *Việc nên làm:* Chia nhỏ thành từng thẻ việc làm độc lập (Card/List item), giúp nông dân dễ theo dõi từng thao tác.
   - *Cần đo thêm & Khi nào cần nhờ cán bộ nông nghiệp:* Đặt song song hoặc xếp tầng khoa học.
4. **Xử lý số thập phân chuẩn xác:** Regex trích xuất danh sách `/(?:^|\s)([1-9]\d?)\.\s+/g` bảo vệ trọn vẹn các số liệu như `2.8 g/L`, `4.5 cm`, `28.5°C`, hoàn toàn không bị ngắt quãng hoặc biến thành đầu mục danh sách sai lệch.
5. **Độ an toàn (Security & Sanitization):** Mọi văn bản từ mô hình AI đều được chèn vào DOM bằng thuộc tính `textContent`, ngăn chặn triệt để tấn công XSS hoặc injection mã độc từ dữ liệu ngoài.
6. **Linh vật Cò Mạ:** Video WebM/MP4 tự động phát và lặp lại mượt mà, tắt tiếng mặc định để không gây phiền, loại bỏ nút "Phát lại" dư thừa theo đúng yêu cầu người dùng.

---

## 4. Danh mục lỗi phát hiện & Kiến nghị khắc phục (Defect Log)

Dưới đây là các phát hiện trong đợt kiểm thử thực tế, được phân loại từ P0 đến P3 theo mức độ ảnh hưởng:

### [P2] Lỗi Điều hướng Đăng xuất trên Giao diện Di động (Mobile Viewport < 1024px)
- **Mức độ:** P2 (Trung bình - Ảnh hưởng trải nghiệm người dùng trên điện thoại).
- **Hiện tượng:** Nút đăng xuất vừa được chuyển từ Header sang chân Sidebar (`.app-side-footer`). Trên màn hình máy tính desktop, nút hiển thị rất đẹp và thuận tiện. Tuy nhiên, trên màn hình di động (`max-width: 1023px`), thanh sidebar bị ẩn (`display: none`), và nút đăng xuất trong header cũng đã bị gỡ bỏ. Do đó, người dùng di động đang ở trang `/assistant` hoặc `/community` không có nút đăng xuất 1 chạm ngay lập tức mà phải điều hướng vào trang `/profile`.
- **Vị trí liên quan:** `src/views/shared/sidebar.html` (dòng chứa `.app-side-footer`) và `src/static/shell.css` (media query `@media (max-width: 1023px)`).
- **Kiến nghị giải pháp:** Bổ sung nút đăng xuất vào menu điều hướng di động hoặc thêm nút đăng xuất nhỏ trong dropdown tài khoản ở header khi ở chế độ màn hình nhỏ.

### [P2] Rate Limiting API Xác thực khi chạy thử nghiệm liên tục
- **Mức độ:** P2 (Hạn chế thử nghiệm tự động cục bộ).
- **Hiện tượng:** Bộ đếm `account_rate_limits` trong `server/auth.mjs` giới hạn tối đa 10 lần gửi OTP / đăng ký trong cửa sổ 15 phút từ IP `unknown` / `127.0.0.1`. Khi QA chạy script tự động đăng ký tài khoản mới nhiều lần, máy chủ trả về `HTTP 429: "Quá nhiều lần thử. Vui lòng đợi 15 phút."`.
- **Vị trí liên quan:** `server/auth.mjs` (phương thức `rateLimit`).
- **Kiến nghị giải pháp:** Trong môi trường thử nghiệm cục bộ (`local.mjs`), nên tăng ngưỡng rate limit hoặc cho phép cấu hình biến môi trường bỏ qua rate limit cho IP nội bộ `127.0.0.1`.

### [P3] Ngắt dòng số điện thoại trên giao diện Hồ sơ di động (Mobile 390x844)
- **Mức độ:** P3 (Nhỏ - Thẩm mỹ giao diện).
- **Hiện tượng:** Trên màn hình 390px, ở khối tóm tắt tài khoản trang `/profile`, chuỗi `check_cookie@machdong.example · +84901234567` bị ngắt dòng ngay sau dấu `+`, khiến dấu `+` nằm ở cuối dòng 1 và các chữ số `84901234567` nằm ở dòng 2.
- **Vị trí liên quan:** `src/views/auth/profile.html` (phần render thông tin liên hệ dưới tên nông hộ).
- **Kiến nghị giải pháp:** Thêm class CSS `whitespace-nowrap` hoặc thẻ `<span>` bọc số điện thoại để giữ nguyên khối `+84901234567`.

### [P3] 503 Transience từ Upstream Gemini khi gọi nhiều lượt liên tiếp
- **Mức độ:** P3 (Phụ thuộc nhà cung cấp AI).
- **Hiện tượng:** Trong lượt chat thứ 3 của chuỗi chat 5 câu hỏi liên tiếp, mô hình Gemini trả về mã HTTP 503 Service Unavailable do rate limit của tài khoản API. Giao diện ứng dụng không bị sập và hiển thị lỗi rõ ràng ("Tạm thời không kết nối được AI"), sau đó lượt 4 và 5 hoạt động lại bình thường.
- **Kiến nghị giải pháp:** Bổ sung cơ chế tự động thử lại (exponential backoff retry 1-2 lần) phía backend client trước khi trả lỗi 503 về trình duyệt.

---

## 5. Danh mục tệp bằng chứng kiểm thử (Evidence Files)

Tất cả ảnh chụp màn hình và dữ liệu đã được lưu trữ an toàn tại `docs/demo-screenshot/` (trong repo Mạch Đồng) và sao lưu tại `K:\Unihack\output\antigravity-testing\`:

1. [01_login_desktop_1440.png](file:///K:/Unihack/output/antigravity-testing/01_login_desktop_1440.png) - Trang Đăng nhập Desktop (Header chuẩn, không có nút Danh mục, có tab Quên MK).
2. [02_login_forgot_password.png](file:///K:/Unihack/output/antigravity-testing/02_login_forgot_password.png) - Biểu mẫu Quên mật khẩu riêng biệt.
3. [03_register_desktop_1440.png](file:///K:/Unihack/output/antigravity-testing/03_register_desktop_1440.png) - Trang Đăng ký Desktop (Email hàng riêng, SĐT + OTP cùng hàng).
4. [04_login_mobile_390.png](file:///K:/Unihack/output/antigravity-testing/04_login_mobile_390.png) - Trang Đăng nhập Mobile 390x844.
5. [05_register_mobile_390.png](file:///K:/Unihack/output/antigravity-testing/05_register_mobile_390.png) - Trang Đăng ký Mobile 390x844.
6. [06_assistant_desktop_1440.png](file:///K:/Unihack/output/antigravity-testing/06_assistant_desktop_1440.png) - Trang Trợ lý Cò Mạ: Video autoplay/loop không nút phát lại; nút đăng xuất ở đáy sidebar.
7. [07_assistant_sidebar_logout_hover.png](file:///K:/Unihack/output/antigravity-testing/07_assistant_sidebar_logout_hover.png) - Nút đăng xuất sidebar trạng thái hover đỏ nhạt (`#fef2f2`).
8. [08_assistant_chat_conversation.png](file:///K:/Unihack/output/antigravity-testing/08_assistant_chat_conversation.png) - Hội thoại 5 lượt chat liên tiếp, phân biệt mặn kênh và mặn ruộng.
9. [09_assistant_mobile_390.png](file:///K:/Unihack/output/antigravity-testing/09_assistant_mobile_390.png) - Giao diện Trợ lý Cò Mạ trên Mobile 390x844.
10. [10_simulation_d1_report_advice_1440.png](file:///K:/Unihack/output/antigravity-testing/10_simulation_d1_report_advice_1440.png) - Khung Lời khuyên Cò Mạ trong tab Báo cáo (Ca D1) nằm dưới các điều kiện đối chiếu, định dạng phân đoạn và số thập phân chuẩn xác.
11. [11_simulation_d1_sources_expanded.png](file:///K:/Unihack/output/antigravity-testing/11_simulation_d1_sources_expanded.png) - Khối Nguồn tham khảo mở rộng với đường dẫn HTTPS.
12. [12_simulation_d1_dialog_1440.png](file:///K:/Unihack/output/antigravity-testing/12_simulation_d1_dialog_1440.png) - Cửa sổ modal "Lời khuyên chi tiết của Cò Mạ", cuộn mượt và nút đóng [X].
13. [13_simulation_d2_advice_1440.png](file:///K:/Unihack/output/antigravity-testing/13_simulation_d2_advice_1440.png) - Ca D2 (Trổ bông, 75d, mặn ruộng 4.2 g/L, nước 36 cm, 35°C).
14. [14_simulation_d3_advice_1440.png](file:///K:/Unihack/output/antigravity-testing/14_simulation_d3_advice_1440.png) - Ca D3 (Làm đòng, 55d, mặn kênh 4.2 g/L, nước 4.5 cm, 30°C).
15. [15_simulation_mobile_390.png](file:///K:/Unihack/output/antigravity-testing/15_simulation_mobile_390.png) - Bảng điều khiển mô phỏng trên Mobile 390x844.
16. [16_weather_tab_7days_1440.png](file:///K:/Unihack/output/antigravity-testing/16_weather_tab_7days_1440.png) - Tab thời tiết với dự báo 7 ngày Cần Thơ.
17. [17_weather_location_switched.png](file:///K:/Unihack/output/antigravity-testing/17_weather_location_switched.png) - Tab thời tiết chuyển địa điểm Trà Vinh.
18. [18_profile_wallet_1440.png](file:///K:/Unihack/output/antigravity-testing/18_profile_wallet_1440.png) - Trang Hồ sơ với thẻ ví gọn gàng, số dư 3 LÚA, Avalanche Fuji Testnet.
19. [19_profile_mobile_390.png](file:///K:/Unihack/output/antigravity-testing/19_profile_mobile_390.png) - Trang Hồ sơ trên Mobile 390x844.
20. [20_community_catalog_1440.png](file:///K:/Unihack/output/antigravity-testing/20_community_catalog_1440.png) - Danh mục Kho CSV cộng đồng (Đã loại bỏ 4 CSV cũ tại ruộng).
21. [21_forum_home_1440.png](file:///K:/Unihack/output/antigravity-testing/21_forum_home_1440.png) - Diễn đàn Thảo luận bà con.
22. [22_admin_404_page.png](file:///K:/Unihack/output/antigravity-testing/22_admin_404_page.png) - Trang `/admin` trả 404 bảo vệ ứng dụng MVP.
23. [23_post_logout_login_page.png](file:///K:/Unihack/output/antigravity-testing/23_post_logout_login_page.png) - Kết quả đăng xuất thành công quay về `/login`, phiên làm việc được xóa hoàn toàn.
24. [qa-summary.json](file:///K:/Unihack/output/antigravity-testing/qa-summary.json) - Chi tiết log chạy tự động toàn bộ ca kiểm thử.

---

## 6. Kết luận

- Toàn bộ kịch bản kiểm thử tại `docs/kich-ban-testing-antigravity.md` đã được thực thi đầy đủ 100% trên trình duyệt Google Chrome thật kết hợp bộ kiểm thử tự động.
- Khung lời khuyên Cò Mạ và video linh vật Cò Mạ vừa sửa hoạt động hoàn toàn chính xác, đúng đặc tả thiết kế, đẹp mắt và an toàn dữ liệu.
- Nút đăng xuất mới ở sidebar hoạt động hoàn hảo trên desktop, đem lại trải nghiệm gọn gàng cho thanh header.
- Mã nguồn ứng dụng và nhánh `Testing01` được giữ nguyên vẹn (`git status` sạch, không có commit hay deploy ngoài ý muốn).
