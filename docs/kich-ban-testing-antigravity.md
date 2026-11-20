# Kịch bản gửi Antigravity kiểm thử Mạch Đồng

Hãy đóng vai QA Engineer và kiểm thử bản cục bộ Mạch Đồng theo kịch bản bên dưới. Thực hiện các bước, ghi bằng chứng và báo cáo lỗi; không chỉ trả lại kế hoạch kiểm thử. Đợt này chỉ kiểm thử, chưa sửa mã ứng dụng hoặc phát hành cloud.

## 1. Chuẩn bị đúng dự án

- Workspace: `K:\Unihack`. Ứng dụng đang sửa nằm trong `K:\Unihack\Mach-dong`, dùng Flask + JavaScript và Node Worker. Không chạy nhầm prototype Next.js ở thư mục ngoài.
- Đọc `K:\Unihack\CONVENTIONS.md`, các `AGENTS.md` áp dụng, `README.md`, `docs/architecture.md` và `docs/ke-hoach-sua-chuc-nang-2026-11-20.md` trong ứng dụng.
- Xem `git status` trước khi làm; giữ nguyên các thay đổi đang có của người dùng và agent khác.
- URL cục bộ: `http://127.0.0.1:5000`. Tài khoản nông dân: `nongho`, vai trò `FARMER`. Người dùng cung cấp mật khẩu riêng hoặc đăng nhập giúp; không ghi mật khẩu, OTP, cookie hay API key vào báo cáo, ảnh hoặc source.
- Nếu app đã chạy, xác nhận đúng bản cục bộ trước khi dùng. Nếu chưa chạy, mở terminal riêng:

```powershell
Set-Location K:\Unihack\Mach-dong
.\.venv\Scripts\python.exe scripts/run-local.py
```

Launcher dùng Flask ở cổng 5000 và API cục bộ ở 8787. Nếu trùng cổng, xác định đúng tiến trình và báo nguyên nhân; không tắt hàng loạt Python/Node. Không sửa cấu hình để chuyển sang dữ liệu cloud.

## 2. Chạy kiểm thử tự động

Chạy lần lượt tại `K:\Unihack\Mach-dong`, ghi exit code và số test thực tế:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node --test server/tests/*.test.mjs tests/simulation-view.test.mjs
node scripts/check-client-js.mjs
node server/build.mjs
node --check server/dist/server/index.js
git diff --check
```

Nếu dependencies của `ui-preview` đã có, kiểm tra thêm:

```powershell
Set-Location K:\Unihack\Mach-dong\ui-preview
node node_modules/typescript/bin/tsc --noEmit
```

Mốc tham khảo: bộ Python trước thay đổi UI cuối có 77 test đạt; bộ JavaScript gần nhất có 50 test đạt. Phải chạy và ghi kết quả hiện tại, không sao chép mốc cũ thành kết quả mới. Test treo phải ghi tên test, thời gian chờ và thông tin chẩn đoán; không bỏ qua âm thầm.

## 3. Kiểm thử trên trình duyệt thật

Dùng DevTools để kiểm tra console/network khi gặp lỗi. Ưu tiên desktop 1440 × 1000 và 1280 × 900; kiểm tra thêm 390 × 844 cho lỗi tràn/chồng nội dung. Các ca cần tài khoản thứ hai dùng tài khoản thử riêng trong kho cục bộ, không đổi mật khẩu tài khoản `nongho`.

### A. Đăng nhập và bảo vệ ứng dụng

1. Mở phiên khách, truy cập trực tiếp `/community`, `/forum`, `/simulation`, `/assistant`, `/profile`: phải chuyển đến đăng nhập. API dữ liệu ứng dụng phải trả 401 khi không có phiên, không lộ dữ liệu.
2. Đăng nhập bằng tên đăng nhập và mật khẩu: không yêu cầu OTP/email xác nhận trong luồng đăng nhập. Thử sai mật khẩu, thiếu trường và gửi liên tiếp: thông báo rõ, nút không kẹt.
3. Đăng nhập từ URL có `next`: quay lại đúng đường dẫn nội bộ; không chuyển đến website ngoài theo tham số này.
4. Đăng xuất rồi dùng Back hoặc mở URL riêng tư: không dùng lại được dữ liệu/phiên cũ. Mật khẩu không xuất hiện trong URL.
5. Header có Đăng nhập/Đăng ký ở bên phải khi chưa đăng nhập; không còn nút “Danh mục”. Tab/link “Quên mật khẩu” luôn tìm thấy được và mở đúng form riêng.

### B. Đăng ký và khôi phục mật khẩu

1. Email là ô dài ở hàng riêng; điện thoại và mã xác nhận nằm cùng hàng ở desktop. Ô OTP ngắn, không có placeholder “6 chữ số” bị giãn chữ.
2. Thử email dài, tên tiếng Việt, số điện thoại và mật khẩu/xác nhận không khớp. Không cắt mất nội dung hoặc đè icon.
3. Gửi OTP, kiểm tra thời gian chờ gửi lại, mã sai, thiếu mã, mã hết hạn, dùng lại mã và đổi email sau khi nhận mã. Máy chủ phải kiểm tra mã gắn với đúng email; không chỉ kiểm tra phía trình duyệt.
4. Ô OTP chỉ nhận tối đa 6 chữ số; kiểm tra cả gõ và dán chuỗi có chữ/ký tự đặc biệt.
5. Tạo một tài khoản thử mới: đăng ký có OTP hợp lệ rồi đăng xuất, đăng nhập lại chỉ bằng mật khẩu.
6. Kiểm tra khôi phục mật khẩu bằng tài khoản thử riêng: đúng email/mã mới đặt lại được; sau đó mật khẩu cũ không còn dùng được. Không thay mật khẩu của tài khoản bàn giao.

**Lưu ý môi trường:** OTP của launcher cục bộ là giả lập và phải có nhãn rõ ràng. Không báo “gửi Gmail thành công” nếu chưa có dịch vụ mail thật. Dùng email thử thuộc `example.com`/`.example`, không gửi thư đến người thật. Kiểm tra mã sai/hết hạn bằng fixture hoặc đồng hồ kiểm thử, không sửa dữ liệu người dùng để vượt xác thực.

### C. Chat Cò Mạ nhiều lượt

Gửi lần lượt trong cùng một cuộc trò chuyện:

1. “Lúa OM5451 đang đẻ nhánh, nước ruộng mặn 2,8 g/L, tôi nên kiểm tra gì?”
2. “Mực nước ruộng là 4,5 cm, vậy có cần tháo nước ngay không?”
3. “Nếu số mặn đó đo ở kênh, chưa đo tại ruộng thì sao?”
4. “Giờ lúa đã trổ bông, nhiệt độ cao nhất 35°C, cần chú ý gì?”
5. “Tóm lại ba việc nên làm trước và số đo còn thiếu.”

Kỳ vọng: mỗi lượt đều có phản hồi phù hợp, nhớ và cập nhật ngữ cảnh; không lặp một câu mẫu. Phân biệt mặn kênh với mặn ruộng, không tự suy ra năng suất/tỷ lệ sống, không hứa “an toàn tuyệt đối”, không bịa nguồn hay liều lượng. Kiểm tra trạng thái chờ, câu hỏi rỗng, quá tải/timeout và nút thử lại. Lỗi nhà cung cấp phải hiện đúng, không giả thành câu trả lời thành công. Không gọi lặp vô hạn khi hết quota.

### D. Mô phỏng và tư vấn Gemini theo thông số

Thử tối thiểu các ca sau; các số đo này là **kịch bản giả lập**:

| Ca | Giai đoạn | Ngày sau sạ | Mặn | Nơi đo | Nước trên mặt ruộng | Nhiệt độ cực đại |
|---|---|---:|---:|---|---:|---:|
| D1 | Đẻ nhánh | 48 | 2,8 g/L | Ruộng | 4,5 cm | 28,5°C |
| D2 | Trổ bông | 75 | 4,2 g/L | Ruộng | 36 cm | 35°C |
| D3 | Làm đòng | 55 | 4,2 g/L | Kênh | 4,5 cm | 30°C |

- Chọn giai đoạn quan sát rõ ràng; không tự suy giai đoạn chỉ từ ngày sau sạ. Thử bỏ trống trường bắt buộc và giá trị ngoài giới hạn.
- Chạy mô phỏng thường: có báo cáo dù không yêu cầu AI. Cùng đầu vào/phiên bản phải cho cùng kết quả engine.
- Bấm “Nhờ Cò Mạ tư vấn”: kiểm tra request gửi đúng snapshot, đơn vị, nơi đo và giai đoạn của lần chạy. Key Gemini không được gửi xuống client.
- Bật dùng dự báo: tư vấn dùng dữ liệu dự báo của kịch bản, không tiếp tục dựa vào nhiệt độ thủ công đã bị vô hiệu hóa.
- Khi AI đang trả lời, sửa thông số rồi chạy lại: phản hồi cũ không được ghi đè kịch bản mới. Kiểm tra bấm hai lần, lỗi mạng, 503 và thử lại.
- Không quy đổi g/L tại ruộng/kênh thành EC đất vùng rễ. Khi thiếu dữ liệu chiều cao cây, không kết luận ngập toàn cây chỉ từ độ sâu nước.

### E. Giao diện lời khuyên — ưu tiên kiểm tra phần vừa sửa

Kiểm tra cả tab Báo cáo và cửa sổ “Lời khuyên chi tiết của Cò Mạ”:

- Các mục đối chiếu điều kiện nằm trước; lời khuyên AI phải nằm **bên dưới các mục này**, trong một khung riêng.
- Khung có tiêu đề, khoảng đệm, viền và màu xanh phù hợp tổng thể. Avatar/icon đúng kích thước, không chồng chữ hoặc nút đóng.
- Tách lời mở đầu và các mục “Điều kiện đáng chú ý”, “Việc nên làm”, “Cần đo thêm”, “Khi nào cần nhờ cán bộ nông nghiệp”. Từng việc nên làm là một bước riêng, không dồn thành đoạn dài.
- Các số `2.8`, `4.5`, `42.5` trong lời đáp không bị tách nhầm thành số thứ tự. Lời đáp không theo mẫu vẫn phải hiển thị đầy đủ, giữ các đoạn gốc.
- Thông số trên khung đúng lần chạy; nguồn tham khảo mặc định thu gọn, mở/đóng được và link dùng HTTPS. Kiểm tra lời đáp dài và tên nguồn dài.
- Cửa sổ cuộn được đến cuối, đóng được bằng nút và Esc, không kẹt focus hoặc tràn ngang. Trạng thái đang tải/lỗi không phá bố cục.
- Nội dung AI được hiển thị như văn bản; chuỗi HTML/script từ fixture không được thực thi.

### F. Thời tiết

- Mở trực tiếp tab thời tiết trước khi danh mục tải xong: dự báo vẫn tải sau khi sẵn sàng.
- Bấm tải dự báo 7 ngày, đổi địa điểm, thử lại sau lỗi. Không bắt buộc điền đủ mô phỏng mới xem thời tiết.
- Đổi địa điểm nhanh: phản hồi cũ không ghi đè địa điểm mới. Có nguồn, thời gian cập nhật, đơn vị và trạng thái thiếu dữ liệu đúng.

### G. Ví, hồ sơ và điều hướng MVP

- Ví có hình thức thẻ ví gọn, ưu tiên số dư/chủ ví; địa chỉ, mạng, quy đổi và lịch sử mở rộng được. Địa chỉ dài không phá bố cục.
- Kiểm tra sao chép địa chỉ khi có địa chỉ; trường hợp chưa liên kết phải hiển thị đúng, không tạo địa chỉ/số dư thật giả.
- Giữ nhãn số dư/quy đổi giả lập. Không gửi giao dịch thật trong đợt kiểm thử UI. Mọi cấu hình blockchain chỉ Fuji, chain ID 43113.
- Hồ sơ vẫn có điều khiển đổi ảnh đại diện. Kiểm tra lưu thông tin bằng tài khoản thử, dữ liệu còn sau tải lại trang.
- Không có tab “Duyệt dữ liệu” ở header/sidebar hay bản xem trước, với cả USER/FARMER và ADMIN. Dùng fixture admin để kiểm tra, không nâng quyền tài khoản `nongho`. `/admin` trả 404.
- Bốn CSV mẫu “Độ mặn tại ruộng”, “Mực nước ruộng”, “Nhiệt độ tại ruộng”, “Độ pH tại ruộng” không còn trong danh mục hoặc URL tải công bố. Nguồn nội bộ phục vụ mô phỏng không bị xóa nhầm.
- Tải CSV lên hiện chỉ để xem trước. Không coi thiếu luồng duyệt CSV là lỗi MVP và không tự xây lại chức năng này.

### H. Kiểm tra hồi quy các trang còn lại

- Mở kho CSV, diễn đàn, trang đăng bài/chi tiết và trợ lý; thử tìm kiếm, bộ lọc, điều hướng và nút chính.
- Với bài viết/ảnh/bình luận, chỉ tạo dữ liệu thử có nhãn `[Kiểm thử]` trong kho cục bộ. Không sửa hoặc xóa nội dung có sẵn của người dùng.
- Rà chính tả trên nhãn, thông báo lỗi, placeholder và trạng thái rỗng. Ghi rõ chuỗi và vị trí còn sai; không sửa tên nguồn công bố chỉ để đồng nhất câu chữ.

## 4. Kết quả cần bàn giao

Tạo báo cáo `K:\Unihack\Mach-dong\docs\bao-cao-testing-antigravity.md` và bằng chứng tại `K:\Unihack\output\antigravity-testing\`.

Trong báo cáo cần có:

1. Phiên bản/working tree, thời điểm, môi trường, viewport và dịch vụ thật/giả lập đã dùng.
2. Bảng từng ca: mã ca, thao tác, kết quả mong đợi, kết quả thực tế, PASS/FAIL/BLOCKED và đường dẫn bằng chứng.
3. Mỗi lỗi: mức độ P0–P3, bước tái hiện, kết quả thực tế, ảnh/log đã che thông tin nhạy cảm; nguyên nhân chỉ ghi nếu có căn cứ, kèm tệp/dòng liên quan khi xác định được.
4. Kết quả lệnh tự động và exit code. Phân biệt lỗi ứng dụng, lỗi môi trường và upstream Gemini quá tải.
5. Ảnh khung tư vấn trong báo cáo và cửa sổ chi tiết ở desktop; ảnh đăng ký và ví; ảnh breakpoint có lỗi nếu có.
6. Các ca chưa chạy và lý do. Không đánh PASS dựa trên đọc source hoặc mock test khi ca yêu cầu kiểm tra giao diện/dịch vụ thật.

Kết thúc bằng danh sách lỗi cần sửa theo mức độ ảnh hưởng. Chưa commit, deploy, đổi quyền tài khoản hoặc thay đổi chức năng ngoài phạm vi kiểm thử.
