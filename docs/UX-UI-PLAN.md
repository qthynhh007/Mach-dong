# Kế hoạch nâng cấp UX/UI Mạch Đồng

Ngày lập: **19/11/2026** · Mốc demo: **21/11/2026**  
Người phụ trách: Lead Frontend & UI/UX Designer  
Mục tiêu: một dashboard nông nghiệp đẹp, có chiều sâu và dễ dùng trên laptop; mọi hiệu ứng đều giúp người xem hiểu ruộng và dữ liệu nhanh hơn.

## 1. Hướng thiết kế

**Cánh đồng số, gần gũi mà hiện đại.** Nền xanh sương, bề mặt sáng, chữ xanh rêu, điểm nhấn vàng lúa. Hình ruộng, ảnh lá và Cò Mạ tạo bản sắc. Bảng số liệu, nguồn và trạng thái hệ thống vẫn phải đọc được ngay.

- Ưu tiên desktop **1280, 1440 và 1920 px**. Sidebar cố định, vùng làm việc rộng, panel thông tin bên phải khi đủ chỗ.
- Mỗi trang có một tiêu đề rõ, một hành động chính và một khu vực kết quả.
- Các khung có đốm sáng màu ở bên phải; hover làm sáng viền và tăng độ nổi vừa phải.
- Trạng thái rủi ro có cả chữ, biểu tượng và màu. Đốm trang trí không mang ý nghĩa rủi ro.
- Mô phỏng, dự báo, số đo thực địa và dữ liệu giả lập có nhãn riêng.

## 2. Hiện trạng cần giữ khi sửa

Repo ứng dụng đang chạy là **`Mach-dong/`**, dùng Flask, Jinja và JavaScript module. Giao diện chính ở `src/views/`, CSS/JS ở `src/static/`; API cloud nằm trong `server/`. Thư mục cha có cấu hình Next.js nhưng không phải lý do để chuyển toàn bộ ứng dụng trong đợt sửa này.

Đã có shell chung, tab mô phỏng/báo cáo/thời tiết, bản vẽ ruộng SVG, trợ lý chat và dữ liệu có nguồn. Việc nâng cấp nên bám vào các phần này. Nếu sau hackathon chuyển sang React/Next.js, khi đó mới dùng Shadcn UI và React Three Fiber cho phần tương ứng.

Các điểm cần giải quyết trước:

1. Kết thúc xử lý conflict và kiểm tra lại hợp đồng giữa giao diện mới với dịch vụ cloud.
2. Thống nhất spacing, độ bo, chiều cao input, checkbox và khung mở rộng.
3. Bổ sung trạng thái đang tải, mất kết nối, kết quả cũ và dữ liệu còn thiếu.
4. Dùng media có mục đích; giữ dữ liệu chính ở HTML để đọc được khi media lỗi.

## 3. Bộ quy chuẩn giao diện

| Thành phần | Đề xuất | Mục đích |
|---|---|---|
| Màu chính | `#1A654D` | Hành động chính, liên kết, trạng thái chọn |
| Màu chữ đậm | `#0E2C24` | Tiêu đề và nội dung quan trọng |
| Nền | `#E7EFE7` | Giảm độ chói khi đọc lâu |
| Bề mặt | `#F5FAF5`, trắng | Phân lớp thông tin |
| Điểm sáng | xanh mạ, xanh nước, vàng nhạt | Trang trí nhẹ ở mép phải khung |
| Cảnh báo | `#F59E0B`, `#EF4444` | Luôn đi cùng nhãn rủi ro |
| Khoảng cách | 4, 8, 12, 16, 24, 32 px | Giữ nhịp bố cục |
| Độ bo | 12 px input, 16–20 px card | Đồng bộ toàn app |
| Chữ | Be Vietnam Pro đang có | Đọc tiếng Việt rõ, tải tại máy |
| Cỡ chữ | 14–16 px nội dung, 28–36 px tiêu đề | Không để chữ chú thích quá nhỏ |
| Điều khiển | vùng bấm mục tiêu 44 × 44 px | Thuận tiện cho nông hộ và màn cảm ứng |

Các giá trị trên là **mục tiêu thiết kế**, cần kiểm tra tương phản trên nền thật. Không coi bảng này là kết quả đã kiểm định khả năng tiếp cận.

## 4. Hiệu ứng khung và hover

Áp dụng trước cho bảng điều chỉnh thông số, bốn ô mặn/nước/ngày/nhiệt độ, thẻ dữ liệu và khung báo cáo.

- Đốm sáng đặt ở góc phải phía trên, chuyển dần về trong suốt, không phủ chữ hoặc số đo.
- Mỗi nhóm dùng một sắc độ phù hợp: xanh nước cho mực nước, xanh mạ cho giai đoạn, vàng nhạt cho nhiệt độ. Nhãn cảnh báo vẫn lấy từ kết quả mô phỏng.
- Hover: độ sáng tăng nhẹ, viền rõ hơn; chỉ nâng các card có thể bấm tối đa 2 px. Không khiến input đang kéo bị dịch chuyển.
- Focus bàn phím rõ tương đương hover, có outline riêng. Không thêm `tabindex` vào khung thuần trang trí.
- Thời gian đề xuất 160–220 ms. Ưu tiên thay đổi `opacity` và `transform`; tránh blur lớn chạy liên tục.
- Với `prefers-reduced-motion`, giữ hình tĩnh, bỏ nâng/nhún và chuyển động nền.

CSS đủ để làm phần này. Three.js dành cho cảnh ruộng 3D ở mục 8. [Hướng dẫn hiệu năng animation của web.dev](https://web.dev/articles/animations-guide).

## 5. Làm lại từng màn hình

### 5.1. Mô phỏng

- Dòng đầu: tên trang, nhãn `[Giả lập]`, địa điểm và tình trạng kết nối.
- Bốn thông số chính cùng chiều cao; số đo nổi bật, đơn vị luôn đi cùng giá trị.
- Tách “Điều chỉnh cảnh ruộng” và “Điều kiện lập báo cáo” bằng tiêu đề, khoảng cách và lời giải thích ngắn.
- Giữ khu vực ruộng và panel Cò Mạ đặt cạnh nhau trên desktop.
- Nút chính “Mô phỏng và xem báo cáo”; nút AI là hành động phụ, nêu rõ đang chờ khi chạy.
- Khi sửa đầu vào, đánh dấu báo cáo cũ; không để kết quả cũ trông như vẫn áp dụng.
- Cho so sánh hai lịch sạ song song sau khi luồng một kịch bản đã ổn định.

### 5.2. Báo cáo & nguồn

- Đầu trang có tóm tắt: đã nhập gì, điều kiện nào cần chú ý, dữ liệu nào còn thiếu.
- Dùng khung mở rộng có icon/chỉ báo mở, vùng bấm lớn và nền đổi nhẹ khi mở.
- Thêm ảnh minh họa nằm **bên trong** nội dung mở rộng: quan sát cây, đo nước, diễn biến thời tiết và nguồn dữ liệu.
- Ảnh có dòng “Minh họa”; ảnh đo thực tế cần thời gian, vị trí và tác giả. Không dùng ảnh đẹp để ngụ ý kết luận khoa học.
- Nhóm “Việc cần kiểm tra ngoài ruộng” ưu tiên trước bảng dài.
- Nguồn có tên, ngày, phạm vi áp dụng và liên kết gốc. Giữ tải báo cáo JSON.
- Lỗi tải nguồn có nút thử lại; phần còn thiếu không dùng số 0 để thay thế.

### 5.3. Dự báo thời tiết

- Một khung video rộng minh họa trời nắng, nhiều mây hoặc mưa trên cánh đồng.
- Video **tự chạy, tắt tiếng, lặp, không có nút phát**, có poster và lớp chữ HTML bên ngoài.
- Nhãn cố định “Video minh họa · Giả lập”. Số liệu dự báo nằm ở bảng bên dưới với địa điểm, thời điểm cập nhật và nguồn.
- Khi đã tải dự báo, chọn cảnh minh họa phù hợp với ngày đang xem; không suy ra độ mặn hoặc mức ngập từ video.
- Tạm dừng video khi chuyển tab, trang bị ẩn hoặc người dùng bật giảm chuyển động. Poster vẫn hiện nếu autoplay bị chặn.
- Trước demo chỉ cần khung video và bảng 7 ngày; chọn từng ngày, biểu đồ xu hướng và so sánh lịch sử là bước tiếp theo.

### 5.4. Trợ lý Cò Mạ

- Khung chat ưu tiên nội dung, các câu hỏi gợi ý ngắn và bám trang đang mở.
- Nút đính kèm ảnh nằm cạnh ô nhập. Có xem trước, tên ảnh, gỡ ảnh, giới hạn và trạng thái gửi.
- Gửi được ảnh kèm chữ hoặc chỉ ảnh; lỗi mạng vẫn giữ nội dung để gửi lại.
- Cò Mạ phân biệt dấu hiệu nhìn thấy trong ảnh với nhận định cần thêm căn cứ.
- Hiển thị đang đọc tài liệu/đang soạn, thời gian chờ và dừng chờ.
- Ảnh chỉ được gửi đến dịch vụ phân tích khi người dùng bấm gửi. Kế hoạch lưu ảnh lâu dài cần thiết kế riêng.
- Cò Mạ ở panel phải dùng animation ngắn theo trạng thái, tránh liên tục che khuất nội dung.

### 5.5. Cộng đồng, diễn đàn, tài khoản

- Kho CSV: bộ lọc dễ quét, preview dạng bảng, badge nguồn/giả lập và nút tải nhất quán.
- Diễn đàn: ảnh cùng tỷ lệ, ghi credit, trạng thái bài rõ; nội dung dài có mở rộng.
- Đăng bài: nhắc đơn vị và loại điểm đo đúng lúc nhập, giữ bản nháp nếu có lỗi.
- Hồ sơ: thông tin cá nhân và ruộng tách nhóm; thông báo lưu thành công chỉ hiện sau khi máy chủ xác nhận.
- Ví: Fuji testnet và giao dịch giả lập phải phân biệt rõ; không dùng hiệu ứng để che trạng thái chưa gửi.

## 6. Checkbox, dropdown và khung mở rộng

| Điều khiển | Cách làm | Trạng thái phải có |
|---|---|---|
| Checkbox | ô chọn 20–22 px, cả nhãn bấm được, nền card nhẹ | chưa chọn, đã chọn, focus, disabled |
| Select | cao tối thiểu 44 px, mũi tên rõ, nhãn phía trên | chờ tải, chọn, không có dữ liệu, lỗi |
| Khung mở rộng | giữ HTML `details/summary`, chevron xoay khi mở | đóng, mở, hover, focus |
| Slider | số đo nổi bật, track đúng tỷ lệ, thumb dễ kéo | mặc định, kéo, focus, rủi ro |

Giữ select gốc trong giai đoạn demo để có hỗ trợ bàn phím và màn cảm ứng sẵn có. Nếu cần combobox tìm kiếm địa điểm, làm thành hạng mục riêng có kiểm thử bàn phím, Escape, focus và screen reader.

## 7. Công nghệ nên dùng

| Công nghệ | Vị trí dùng | Thứ tự |
|---|---|---|
| CSS variables, gradient, pseudo-element | token, đốm sáng, viền, hover | Làm ngay |
| CSS transition, Web Animations API | mở nội dung, phản hồi thao tác | Làm ngay khi cần |
| SVG + JavaScript hiện có | ruộng nhẹ, icon, ảnh minh họa | Giữ cho demo và làm fallback |
| HTML video MP4 | nền thời tiết tự chạy | Làm ngay, media lưu tại máy |
| Three.js | một cảnh ruộng 3D chủ đạo | Thử nghiệm sau khi P0 ổn định |
| Motion bản JavaScript | chuỗi chuyển động nhiều bước | Chỉ thêm nếu CSS/WAAPI không đủ |
| Thư viện chart | nhiệt độ, mưa, so sánh kịch bản | Chọn sau khi chốt yêu cầu biểu đồ |
| React Three Fiber, Shadcn UI | nhánh React/Next.js trong tương lai | Sau hackathon nếu chuyển stack |

Motion có bản JavaScript hỗ trợ HTML và SVG, nên không bắt buộc đổi framework để dùng. Chỉ chọn một công cụ điều phối animation nếu thật sự cần. [Tài liệu Motion](https://motion.dev/docs/animate).

## 8. Cảnh ruộng Three.js

**Trải nghiệm mong muốn:** ruộng dạng mô hình nhìn xéo, hàng lúa có chiều sâu, nước có phản sáng nhẹ, nắng/mưa đổi theo kịch bản. Người xem vẫn thao tác bằng các điều khiển HTML quen thuộc.

### Cách tích hợp

1. Tạo `src/static/simulation-three.js` dưới dạng module riêng, tải động khi khung ruộng xuất hiện.
2. Bổ sung bước build asset cục bộ bằng bundler; ghim phiên bản Three.js trong lockfile. Không phụ thuộc CDN cho bản Windows.
3. Bắt đầu bằng camera trực giao, một vùng đất, hàng lúa bằng mesh lặp và lớp nước đơn giản.
4. Dùng `InstancedMesh` cho các khóm lúa giống nhau để giảm draw call. [Tài liệu Three.js](https://threejs.org/docs/pages/InstancedMesh.html).
5. Tạo adapter từ **kết quả engine đã có** sang trạng thái hình ảnh; renderer không tự tính CHI, rủi ro hoặc năng suất.
6. Hiển thị cùng nhãn `[Giả lập]` và giới hạn mô hình như cảnh SVG.
7. Có nút về góc nhìn ban đầu; giới hạn xoay/zoom để người xem không lạc khỏi ruộng.

### Hiệu năng và phương án dự phòng

- Chỉ một canvas 3D chủ đạo. Kích thước theo khung chứa; tránh render theo toàn bộ độ phân giải màn hình mật độ cao.
- Giới hạn pixel ratio đề xuất ở 1–1,5 cho laptop phổ thông; đo thực tế trước khi chốt.
- Khi cảnh đứng yên, render theo yêu cầu; khi gió đang bật, dùng vòng lặp có giới hạn và dừng ngoài viewport. [Rendering on Demand](https://threejs.org/manual/pages/rendering-on-demand.html), [Responsive Design](https://threejs.org/manual/pages/responsive.html).
- Kiểm tra WebGL 2, xử lý mất context, giải phóng geometry/material/texture khi rời trang. Nếu không đáp ứng, dùng SVG hoặc poster. [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer).
- Mục tiêu đề xuất: cảnh đạt ít nhất 30 fps trên máy demo, thao tác form vẫn phản hồi nhanh. Đây là tiêu chí phải đo, chưa phải kết quả benchmark.
- Shader nước phức tạp, bóng đổ thời gian thực và WebGPU là phần thử sau; chỉ đưa vào khi đã đo được lợi ích và độ ổn định.

## 9. Lộ trình trước ngày demo

| Mức | Hạng mục | Điều kiện hoàn thành |
|---|---|---|
| P0 · 19/11 | conflict, cloud profile, luồng mô phỏng | Git hết unmerged, test liên quan qua |
| P0 · 19/11 | đốm màu, hover, checkbox/select/details | dùng được chuột và bàn phím, không che số liệu |
| P0 · 19–20/11 | đính kèm ảnh Cò Mạ | gửi, xem trước, gỡ, lỗi, retry hoạt động |
| P1 · 20/11 | video thời tiết, ảnh báo cáo | autoplay tắt tiếng, nhãn rõ, poster/fallback tốt |
| P1 · 20/11 | chỉnh màn 1280/1440/1920 | không tràn ngang, thông tin chính dễ quét |
| P2 · sau P0/P1 | thử cảnh Three.js | đạt ngân sách, có SVG fallback |
| Khóa giao diện · 21/11 | chạy thử toàn luồng demo | không thêm dependency hoặc đổi kiến trúc sát giờ |

Nếu thiếu thời gian, hoàn thiện SVG, video và bố cục trước. Prototype Three.js có thể trình bày riêng sau demo, không trở thành phụ thuộc bắt buộc của luồng chính.

## 10. Kiểm tra trước khi chốt

- [ ] Mở được cộng đồng, diễn đàn, mô phỏng, báo cáo, thời tiết, trợ lý và hồ sơ.
- [ ] Tab/Shift+Tab rõ focus; select dùng được phím; Space chọn checkbox; Enter/Space mở khung.
- [ ] Zoom 200% vẫn thao tác được, không mất nút chính hoặc nội dung lỗi.
- [ ] Text nhỏ đủ tương phản; rủi ro không chỉ diễn đạt bằng màu.
- [ ] Ảnh bị lỗi, video không chạy hoặc mất WebGL vẫn đọc được kết quả.
- [ ] Thử giảm chuyển động, chặn autoplay, chuyển tab và mất mạng.
- [ ] Gửi ảnh sai định dạng/quá lớn không làm mất câu hỏi; Gemini chưa bật có thông báo rõ.
- [ ] Không có số đo, tỷ lệ sống hay nhận định khoa học được tạo từ hiệu ứng trang trí.
- [ ] Chạy Python unit tests, Node tests và browser smoke test các luồng vừa sửa.
- [ ] Ghi rõ phiên bản đang chạy tại máy, đã commit, đã push hay đã deploy; không đánh đồng các trạng thái này.

Mục tiêu vùng bấm 44 px là lựa chọn thiết kế của dự án. WCAG 2.2 có tiêu chí tối thiểu 24 px cùng các ngoại lệ về khoảng cách; cần đánh giá đúng trường hợp. [Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum). Dùng focus rõ và kiểm tra thêm [Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance) như mức nâng cao, không tự tuyên bố đạt WCAG khi chưa audit.

## 11. File dự kiến thay đổi

- `src/static/shell.css`: token và bề mặt chung, hiệu ứng khung.
- `src/static/simulation-view.css`: thông số, checkbox và ô chọn.
- `src/static/simulation-reading.css`: báo cáo, khung mở rộng, media.
- `src/views/simulation/report-panels.html`: cấu trúc báo cáo và thời tiết.
- `src/static/simulation.js`: trạng thái dữ liệu, video và tương tác tab.
- `src/static/assets/weather/`: video và poster tự dựng.
- `src/static/assets/report/`: minh họa gốc, có nhãn và alt.
- `src/views/assistant/index.html`, `src/static/assistant.js`, `src/static/assistant.css`: luồng gửi ảnh.
- `src/services/assistant_images.py`, `src/services/ai_client.py`: kiểm tra ảnh và gửi ảnh qua backend.
- `src/static/simulation-three.js`: hạng mục thử nghiệm, chỉ tạo khi bắt đầu P2.

Tài liệu này là kế hoạch và tiêu chí nghiệm thu. Trạng thái triển khai thực tế được đối chiếu bằng diff, test và lần chạy trên máy demo.

## 12. Khung soạn tin và chuyển động tương tác

- Khung chat dùng một vùng soạn liền khối: ảnh xem trước, nội dung, thanh công cụ và nút Gửi. Bộ đếm ký tự và hướng dẫn phím đặt ở vị trí phụ.
- Hover nút/thẻ tương tác có zoom nhẹ, trở về kích thước ban đầu khi rời chuột. Không phóng toàn bộ bảng nhập liệu.
- Nút kéo có quầng sáng theo đúng vị trí giá trị, kèm hai vòng sáng lan ra khi hover hoặc thao tác bằng bàn phím.
- Giữ slider gốc, vùng bấm và focus bàn phím; chuyển động trang trí không can thiệp số đo hoặc kết quả engine.
- Áp dụng bố cục và khả năng thao tác theo [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md); kiểm tra riêng màn desktop và cửa sổ chat nhỏ.
