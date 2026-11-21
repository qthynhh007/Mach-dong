# Kế hoạch sửa chức năng Mạch Đồng

Lập ngày 20/11/2026, cập nhật theo phạm vi đã chốt ngày 21/11/2026.

**Phạm vi:** hoàn thiện bản cục bộ tại `Mach-dong/`, chưa phát hành lên cloud. Bắt buộc đăng nhập để dùng ứng dụng. MVP ẩn tab Duyệt dữ liệu với mọi vai trò, chưa triển khai hàng chờ duyệt CSV. Tài khoản dùng để nghiệm thu là nông hộ thường, không giữ quyền admin. Không ghi mật khẩu hoặc API key vào tài liệu.

Các đường dẫn dưới đây tính từ `Mach-dong/`. Ứng dụng đang dùng Flask + Worker; không chuyển sang Next.js/Supabase trong lần sửa này.

## 1. Bắt buộc đăng nhập

**Nguyên nhân:** trước đây chỉ `/` chuyển khách sang `/login`; các trang và API vẫn có thể mở trực tiếp.

- Tập trung kiểm tra phiên tại `src/controllers/session_guard.py` và đăng ký ở `src/main.py`.
- Đăng nhập thường chỉ dùng tên tài khoản/email/số điện thoại và mật khẩu, không gửi hoặc kiểm tra OTP. Tab Quên mật khẩu luôn hiển thị và dùng luồng khôi phục riêng.
- Công khai trang đăng nhập/đăng ký, API gửi mã/khôi phục/đăng nhập và tài nguyên cần thiết. Các trang làm việc chuyển khách sang đăng nhập; API trả 401 theo `{ data, error }`.
- Kiểm tra CSRF cho thao tác ghi; dùng cùng token tài khoản cho diễn đàn và các phần còn lại.
- Chuyển tiếp phiên sang Worker và kiểm tra ở cloud trước khi cấp dữ liệu hoặc gọi AI. Giữ phân quyền tác giả của diễn đàn.
- Trở lại đường dẫn nội bộ sau đăng nhập; không chấp nhận `next` trỏ ra ngoài ứng dụng.
- Phiên hết hạn dẫn về đăng nhập, xóa nội dung chat đang giữ; trang riêng tư không được cache. Lỗi kho tài khoản trả 503, không coi là phiên khách.

**Tệp chính:** `src/main.py`, `src/controllers/session_guard.py`, `src/controllers/auth_controller.py`, `src/services/cloud_session.py`, các cloud client, `server/worker.mjs`, `src/static/workspace-session.js`.

**Nghiệm thu:** URL/API trực tiếp bị chặn khi chưa đăng nhập; đăng nhập, đăng xuất, hết phiên, CSRF sai, kho tài khoản mất kết nối và chuyển hướng sai đều có test.

## 2. Gửi và nhập mã xác nhận email

**Nguyên nhân:** template ẩn nút và ô OTP khi dịch vụ email chưa cấu hình; Worker còn bỏ qua xác minh trong trường hợp này.

- Luôn hiển thị nút gửi mã và ô 6 chữ số trên màn đăng ký. Email chiếm trọn hàng; SĐT và ô OTP ngắn ở hàng dưới. Không có placeholder “6 chữ số”.
- Nút Đăng nhập/Đăng ký ở bên phải header; bỏ menu Danh mục, giữ điều hướng tới các trang làm việc.
- Có trạng thái gửi, gửi lại sau 60 giây và thông báo lỗi. Đổi email xóa mã đang nhập.
- Worker bắt buộc xác minh OTP trước khi tạo tài khoản. Thiếu cấu hình mail trả lỗi dịch vụ, không tự bỏ bước xác nhận.
- Giữ mã có hạn dùng, giới hạn số lần sai, gắn với đúng email và tiêu thụ một lần bằng cập nhật có điều kiện.
- Kiểm tra tài khoản trùng trước khi tiêu thụ mã. Không trả mã thử nghiệm trong dịch vụ production.

**Cấu hình production:** `AUTH_EMAIL_API_KEY`, `AUTH_FROM_EMAIL`. Bản chạy cục bộ có hộp thư giả lập khi thiếu cấu hình này; giao diện phải ghi `[Giả lập cục bộ]` và nói rõ chưa gửi email thật.

**Tệp chính:** `src/views/auth/register.html`, `src/static/auth.js`, `server/auth.mjs`, `server/local.mjs`.

**Nghiệm thu:** mã thiếu/sai/hết hạn/đã dùng/khác email đều không đăng ký được; thiếu dịch vụ email không tạo tài khoản. Kiểm thử mail transport giả tách biệt với việc gửi email thật.

## 3. Hội thoại Cò Mạ nhiều lượt

**Nguyên nhân:** Worker cũ chỉ dùng AI chọn mã nguồn rồi ghép nguyên đoạn tài liệu, nên câu trả lời lặp và ít sát câu hỏi. Lỗi upstream có thể khiến người dùng tưởng chỉ hỏi được một lượt.

- Cho AI soạn lời đáp theo câu hỏi hiện tại và lịch sử, với căn cứ đã được chọn đúng cây và ngữ cảnh.
- Giữ cửa sổ lịch sử bốn cặp hỏi đáp, gửi được nhiều lượt liên tiếp; dữ kiện mới của người dùng được ưu tiên.
- Kiểm tra trạng thái gửi, dừng chờ, gửi lại và bắt đầu lại. Lỗi một lượt không khóa câu tiếp theo.
- Trả lời bằng tiếng Việt, đi thẳng vào tình huống: nhận định, lý do, việc cần làm và điều cần hỏi thêm.
- Kiểm tra schema, mã nguồn, văn bản rỗng/quá dài và những định lượng không có trong dữ kiện/căn cứ. Theo yêu cầu bổ sung ngày 21/11, chat được trả lời bằng kiến thức chung khi tài liệu không có hoặc không đủ; không chặn API chỉ vì không chọn được tài liệu.
- Chat gọi Gemini với lịch sử và tài liệu phù hợp nếu có. Không ép trích nguồn không liên quan. Câu trả lời có nhãn `general_knowledge` (kiến thức chung AI, chưa đối chiếu tài liệu) hoặc `reference_assisted` (AI có tham khảo tài liệu); phần bổ sung ngoài tài liệu được yêu cầu ghi rõ trong lời đáp.
- Không tự nhận đã tìm Internet hay có dữ liệu thời gian thực. Báo cáo mô phỏng vẫn dùng chế độ có căn cứ riêng; việc mở rộng chat không thay đổi engine hoặc bỏ giới hạn của tư vấn kịch bản.
- Không tự đổi mặn kênh thành mặn ruộng hoặc g/L thành EC đất/nước. Không bịa liều phân/thuốc, tỷ lệ sống, năng suất hay chẩn đoán chắc chắn.

**Tệp chính:** `server/generative.mjs`, `server/assistant.mjs`, `src/services/assistant_service.py`, `src/services/cloud_assistant_service.py`, `src/static/assistant.js`.

**Nghiệm thu:** năm lượt liên tiếp, câu hỏi nối tiếp, đổi thông số/chủ đề, nguồn giả, định lượng không có căn cứ và lỗi API được kiểm tra. Kiểm tra nội dung thực tế bên cạnh test cấu trúc; citation hợp lệ không tự chứng minh mọi câu AI viết đều đúng.

**Bổ sung nghiệm thu chat ngoài tài liệu (21/11):** kiểm tra không có nguồn, tài liệu không liên quan, thử lại bằng model dự phòng và giữ chế độ mô phỏng có căn cứ. Đã gọi Gemini thật trên bản cục bộ với câu hỏi về cây cà phê ngoài kho tài liệu, rồi hỏi tóm tắt tiếp: có lời đáp, nhớ chủ đề và hiện nhãn kiến thức chung, không gắn nguồn giả. Ảnh: `K:\Unihack\output\co-ma-tra-loi-ngoai-file.jpg`. Bộ Python đạt 78 test; JavaScript đạt 53 test. Khóa vẫn nằm ở server; chưa phát hành cloud.

## 4. Gemini tư vấn theo thông số ruộng

- Tạo `POST /api/simulation/advice`, tách khỏi việc chạy mô phỏng.
- Khi người dùng yêu cầu, gửi snapshot giống lúa, địa điểm, giai đoạn quan sát, ngày sau gieo, thời gian phơi nhiễm, mặn và nơi đo, mực nước, nhiệt độ, EC vùng rễ nếu có và lựa chọn dùng dự báo.
- Server validate lại đầu vào, tính lại kết quả xác định và gửi cùng căn cứ tới Gemini. Không tin điểm/rủi ro client tự gửi.
- Nếu dùng dự báo, tái sử dụng dữ liệu dự báo đã lấy cho kịch bản; hết hiệu lực thì yêu cầu chạy lại, không âm thầm thay dữ liệu khi tư vấn.
- Lời đáp có điều kiện đáng chú ý, việc nên làm cùng lý do/điều kiện áp dụng, thông tin cần đo thêm và lúc nên nhờ cán bộ nông nghiệp.
- Hiển thị nguồn và giới hạn của mô phỏng. Dữ liệu mang `isSimulated: true`; Gemini nằm ngoài engine thuần và không sửa các chỉ số đã tính.
- Khóa ở server; hạn mức theo tài khoản. Mặc định `gemini-3.1-flash-lite`; khi quá tải hoặc timeout, thử `gemini-2.5-flash` đúng một lần. Hai lần có tổng thời gian chờ phù hợp với proxy; không thử vòng lặp vô hạn.
- Bỏ phản hồi nếu người dùng đổi thông số trong lúc chờ. Kéo slider không tự gọi AI.

**Tệp chính:** `server/advice.mjs`, `server/generative.mjs`, `server/worker.mjs`, `src/services/simulation_service.py`, controller và giao diện mô phỏng.

**Cấu hình:** `GEMINI_API_KEY`, tùy chọn `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`. Schema và mã nguồn được kiểm tra theo [hướng dẫn structured output của Gemini](https://aistudio.google.com/docs/structured-output). Cần tiếp tục duyệt chuyên môn trước khi dùng lời khuyên ngoài phạm vi demo.

## 5. Dự báo thời tiết

**Điểm cần sửa:** nút bị phụ thuộc danh mục; mở thẳng tab không tự tải dự báo sau khi danh mục sẵn sàng, còn lỗi danh mục dễ để nút bị khóa.

- Tải dự báo sau khi danh mục sẵn sàng nếu đang mở tab thời tiết.
- Đặt bộ chọn địa điểm ngay trong tab, đồng bộ với địa điểm kịch bản; không yêu cầu điền đủ mô phỏng mới xem dự báo.
- Nút có thể thử lại sau lỗi danh mục hoặc dự báo. Chỉ khóa trong lúc tải.
- Đổi địa điểm hủy/bỏ kết quả cũ; hiển thị nguồn, thời gian cập nhật và đơn vị.
- Dữ liệu ô lưới, lịch sử và giả lập phải có nhãn phân biệt.

**Tệp chính:** `src/static/simulation.js`, `src/views/simulation/report-panels.html`, `src/static/simulation-reading.css`.

**Nghiệm thu:** mở thẳng URL tab, tải lần đầu, đổi địa điểm, lỗi danh mục, dự báo chậm và phản hồi đến sai thứ tự. Đã thử dữ liệu Open-Meteo thật qua bản cục bộ.

## 6. Phạm vi MVP của kho CSV và điều hướng

- Bỏ bốn bộ mẫu trong ảnh khỏi danh mục và URL tải: Độ mặn tại ruộng, Mực nước ruộng, Nhiệt độ tại ruộng, Độ pH tại ruộng.
- Giữ các bộ dữ liệu còn lại và nguồn tham chiếu phục vụ mô phỏng/Cò Mạ.
- Ẩn tab Duyệt dữ liệu với cả admin lẫn người dùng, gồm bản xem trước điều hướng React.
- Không đăng ký trang placeholder `/admin`; URL trực tiếp trả 404.
- Chưa xây dựng hàng chờ, xác thực hay duyệt đăng CSV. Tải tệp hiện chỉ dùng để xem trước, phải ghi đúng chức năng này.

**Tệp chính:** `src/services/csv_library.py`, `src/views/shared/workspace-links.html`, `src/views/shared/header.html`, `src/main.py`, `ui-preview/components/shell-preview.tsx`.

## 7. Thiết kế lại ví

- Thẻ ví xanh có đường may, chốt và chip minh họa; ưu tiên số điểm, chủ ví và số dư AVAX.
- Đưa địa chỉ dài, thông tin mạng, quy đổi và lịch sử vào các mục mở rộng.
- Có sao chép địa chỉ, liên kết biên nhận và trạng thái thao tác rõ ràng.
- Giữ nhãn số dư/quy đổi giả lập; phân biệt giao dịch thật trên Fuji.
- Dùng SVG có kích thước cố định, chừa khoảng cho icon trong ô nhập, không để icon che chữ.
- Giữ thẻ hồ sơ, đổi ảnh đại diện và các chức năng tài khoản hiện có.

**Tệp chính:** `src/views/auth/wallet.html`, `src/views/auth/profile-summary.html`, `src/views/auth/profile.html`, `src/static/wallet.css`, `src/static/account.js`.

## 8. Chính tả và câu chữ

- Rà các màn đăng nhập/đăng ký, hồ sơ, ví, diễn đàn, mô phỏng, thời tiết, trợ lý và thông báo JavaScript.
- Thống nhất cách viết hoa tiêu đề, nhãn email, tên đăng nhập, khóa riêng tư; thay tiếng Anh không cần thiết trên giao diện. Không thay tên biến khi chỉnh câu chữ.
- Đã sửa lỗi cú pháp trong `requestEmailOtp` làm form đăng nhập không chạy. Form tài khoản dùng POST để thông tin không rơi vào query string khi JavaScript lỗi. Bổ sung `npm run check:js` kiểm tra toàn bộ 12 tệp JavaScript client.
- Sửa câu còn mô tả bản xem thử dù chức năng đã hoạt động; không gọi dữ liệu tham chiếu là dữ liệu thời gian thực.
- Giữ nguyên tên nguồn, đơn vị và nội dung bài của người dùng; không sửa nội dung công bố chỉ để đồng nhất câu chữ giao diện.

## 9. Chạy và nghiệm thu cục bộ

```powershell
cd K:\Unihack\Mach-dong
.\.venv\Scripts\python.exe scripts/run-local.py
```

Mở `http://127.0.0.1:5000`. Bản này dùng adapter D1/R2 riêng tại `data/local-preview/`, không ghi vào dữ liệu cloud. Mật khẩu chỉ lưu dưới dạng hash. Tài khoản nghiệm thu có tên đăng nhập `nongho`, vai trò `FARMER`; mật khẩu bàn giao riêng trong chat. Không còn tài khoản admin trong kho thử này.

Khi chạy lần đầu ở một checkout mới, có thể đặt `MACH_DONG_LOCAL_USER_PASSWORD` trong môi trường để tạo người dùng thường cho bản cục bộ; không ghi giá trị vào source. Nếu đã có tài khoản, launcher không đổi mật khẩu.

Launcher chỉ nghe loopback và xác nhận đúng instance API, tránh dùng nhầm tiến trình cũ. Cấu hình production không tự chuyển sang kho cục bộ khi cloud lỗi.

### Kiểm tra tự động

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node --test server/tests/*.test.mjs tests/*.test.mjs
node scripts/check-client-js.mjs
node server/build.mjs
node --check server/dist/server/index.js
cd ui-preview
node node_modules/typescript/bin/tsc --noEmit
```

Đã đạt: 81 test Python, 86 test JavaScript. Cú pháp 15 tệp client, build Worker và kiểm tra cú pháp Worker đã đạt; kiểm tra kiểu của bản xem trước React đã đạt ở đợt trước và đợt này không sửa React. Đã thử đăng nhập `nongho` bằng mật khẩu, khôi phục mật khẩu mở đúng form, gửi OTP qua hộp thư cục bộ, Cò Mạ nhiều lượt và dự báo Open-Meteo thật. Gemini có thể quá tải tạm thời; đã kiểm tra thử lại sau lỗi. Bug kiểm soát truy cập đã có test tái hiện trước khi sửa; test cũ cho phép khách dùng app được đổi sang phiên đăng nhập thật trong fixture.

### Kiểm tra giao diện và dịch vụ thật

- Đăng nhập/đăng xuất, truy cập URL trực tiếp, hồ sơ nông hộ và ví gọn; mở các mục chi tiết, kiểm tra icon ở màn hình rộng.
- Đăng ký có nút gửi và ô nhập mã; hộp thư cục bộ gắn nhãn giả lập. **Chưa nghiệm thu gửi email thật** vì chưa có cấu hình dịch vụ mail.
- Chat nhiều lượt, lời khuyên theo snapshot và dự báo Open-Meteo; kiểm tra khi upstream quá tải, hủy yêu cầu và thử lại.
- Ghi kết quả quan sát trong bàn giao; không coi một lần thử gọi dịch vụ thành công là bảo đảm tính sẵn sàng hoặc độ đúng tuyệt đối.

**Không phát hành cloud trong đợt này theo lựa chọn của người dùng.** Khi được yêu cầu phát hành sau này, cần truy cập đúng dự án Sites, cấu hình mail và triển khai đồng bộ backend với client để phiên được chuyển tiếp đúng.

### Bổ sung khung lời khuyên Cò Mạ

- Đặt lời khuyên AI bên dưới các mục đối chiếu điều kiện tại ruộng trong cửa sổ chi tiết; dùng chung thẻ tư vấn với tab báo cáo.
- Tách lời chào và bốn mục: Điều kiện đáng chú ý, Việc nên làm, Cần đo thêm, Khi nào cần nhờ cán bộ nông nghiệp. Tách từng việc thành danh sách; giữ nguyên số đo thập phân.
- Thẻ có thông số kịch bản, nguồn tham khảo thu gọn, trạng thái đang tải/lỗi và ghi chú phạm vi áp dụng. Tạo nội dung bằng textContent để không thực thi HTML từ lời đáp.
- Hai kiểm thử tách đoạn mới đã đạt. Đã kiểm tra lại trên trình duyệt ngày 21/11 ở 1440 và 1280 px, dùng lời đáp Gemini thật cho kịch bản làm đòng: thẻ nằm dưới các mục đối chiếu, nguồn mở/đóng được và dùng HTTPS; cửa sổ cuộn, đóng được, không tràn ngang ở 1280 px.
- Phát hiện CSS reset làm mất số thứ tự dù DOM đã có danh sách: computed list-style là `none`. Đã đặt lại `decimal outside`; xác nhận bốn số thứ tự hiển thị trong báo cáo và cửa sổ lời khuyên. Kiểm tra lại 15 test simulation-view, cú pháp 12 tệp client và 77 test Python đều đạt.
- Kiểm tra hồ sơ `nongho`: còn nút đổi ảnh đại diện, thông tin ví và lịch sử mở được; ví chưa liên kết hiển thị `UNLINKED`, không phát sinh giao dịch. Không thay đổi tài khoản hoặc phát hành cloud.
- Ảnh nghiệm thu bổ sung tại `K:\Unihack\output\`: `co-ma-bao-cao-1440-sau-sua.jpg`, `co-ma-bao-cao-1280-sau-sua.jpg`, `co-ma-cua-so-1280-sau-sua.jpg`, `vi-nongho-1280-sau-sua.jpg`. Báo cáo kiểm thử riêng của Antigravity được giữ nguyên.
- Tệp chính: `src/views/simulation/co-ma-advice.html`, `src/static/co-ma-advice.css`, `src/static/simulation.js`, `src/static/simulation-demo.js`.

### Khắc phục bốn mục sau kiểm thử Gemini (21/11)

- P2 đăng xuất mobile: thêm nút 44 × 44 px vào header dùng chung khi viewport dưới 1024 px. Desktop giữ nút ở sidebar. Dùng luồng POST/CSRF hiện có, không chuyển đăng xuất sang GET. Đã kiểm tra `/assistant`, `/community` tại 390 px, ngưỡng 1023/1024 px và thao tác một chạm về `/login`.
- P2 hạn mức dev: launcher loopback đặt hệ số 10 cho bộ đếm theo IP/hành động, tương ứng OTP/đăng ký/khôi phục là 50 lần mỗi 15 phút. Production không có binding nội bộ này nên giữ mức cũ 5 lần cho các hành động đó. Có thể đặt `MACH_DONG_LOCAL_AUTH_RATE_MULTIPLIER` từ 1–20 khi chạy cục bộ. Header từ client không đổi được hệ số; không bỏ cooldown 60 giây, giới hạn nhập sai OTP hay khóa tài khoản. Test dùng SQLite trong bộ nhớ, không reset bộ đếm dữ liệu người dùng.
- P3 số điện thoại: bọc riêng thành inline-block, `white-space: nowrap` và `word-break: normal`; đã kiểm tra dấu `+` đi liền dãy số ở 390 px.
- P3 Gemini 503: server đã có một lần thử model dự phòng. Bổ sung chờ 350 ms cho 503/504/timeout và vẫn retry được khi model dự phòng trùng model chính. Giữ tối đa hai API call (một retry), thời gian chờ Node khoảng 28,35 giây; không retry 429. Client Python cũng chờ ngắn trước lần dự phòng. Không hứa loại bỏ hoàn toàn lỗi quá tải của nhà cung cấp.
- Kết quả: 78 test Python, 57 test JavaScript, cú pháp 12 tệp client và build Worker đạt. Gemini thật trả lời thành công câu hỏi về trụ thanh long; 503 → thành công, 503 kéo dài và 429 được kiểm tra bằng upstream giả lập. Ảnh tại `K:\Unihack\output\`: `dang-xuat-mobile-390.jpg`, `profile-sdt-mobile-390.jpg`, `gemini-mobile-sau-kiem-thu.jpg`, `dang-xuat-mobile-thanh-cong.jpg`.
- Bản chạy cục bộ đã khởi động lại; không phát hành cloud. Báo cáo Antigravity ban đầu được giữ nguyên để đối chiếu.

### Lời khuyên thực hành, mốc dự phòng và hiệu ứng tải (21/11)

- Khu vực lời khuyên chỉ dùng phản hồi thực tế của Gemini. Các đoạn bằng chứng xác định được chuyển vào mục đối chiếu thu gọn, không trình bày thành lời khuyên mới. Tóm tắt ở cạnh cánh đồng lấy từ các việc nên làm trong chính lời đáp; mở lại cửa sổ dùng lại lời đáp đó, không gọi lại chỉ để xem.
- Prompt yêu cầu ưu tiên việc làm cụ thể: làm gì, kiểm tra ở đâu, vì sao, điều kiện áp dụng và dấu hiệu theo dõi. Được bổ sung nguyên lý chung nhưng không tự quy đổi mặn kênh thành mặn ruộng hoặc bịa ngưỡng/liều lượng. Không khuyên phun/bón chế phẩm chỉ từ mặn, nước và nhiệt độ; đã thêm kiểm tra phản hồi cho trường hợp đó.
- Chỉ hiện gợi ý tham khảo tạm thời khi chưa có câu trả lời sau 270 giây (hiểu yêu cầu 4,5 phút là 4 phút 30 giây). Lỗi sớm hiển thị lỗi/thử lại, không lập tức đổi sang mẫu. Dừng chờ, đổi kịch bản hoặc nhận được lời đáp sẽ hủy đồng hồ dự phòng; thử lại sau lỗi không kéo dài mốc ban đầu.
- Riêng tư vấn mô phỏng cho phép mỗi lượt gọi model chờ tối đa 120 giây và một lần dự phòng; proxy cục bộ dành tối đa 275 giây, giao diện dùng deadline 270 giây. Các request khác giữ timeout cũ. Chưa kiểm chứng giới hạn request dài trên hosting cloud vì đợt này chỉ chạy cục bộ.
- Thêm hiệu ứng mở/chuyển trang, thanh tải và thông báo chờ chung cho fetch, spinner cho nút đang xử lý, skeleton và thời gian đã chờ trong khung tư vấn. Các request song song được đếm riêng; lỗi cũng kết thúc trạng thái bận, request nhanh không nhấp nháy; có giới hạn an toàn cho hiệu ứng chuyển trang và hỗ trợ giảm chuyển động.
- Câu chữ sản phẩm: không hiển thị tên Gemini, AI, API, model hay chính sách dùng đoạn mẫu trong giao diện. Dùng tên Cò Mạ, “Đang chuẩn bị lời khuyên”, thời gian đã chờ và “Gợi ý tham khảo tạm thời”. Vẫn giữ nguồn tham khảo, nhãn dữ liệu giả lập và giới hạn áp dụng; không tự nhận đã có chuyên gia trực tiếp kiểm tra ruộng. Prompt cũng yêu cầu không tự giới thiệu công nghệ trong lời khuyên, nhưng giải thích trung thực khi được hỏi về hệ thống.
- Kiểm chứng: 79 test Python, 65 test JavaScript, cú pháp 13 tệp client và build Worker đạt. Đã gọi Gemini thật với kịch bản trổ bông, mặn ruộng 4,2 g/L, nước 36 cm, nhiệt độ 35°C và chiều cao 90 cm; phản hồi có `isFallback: false`, bảo toàn snapshot. Kết quả ở `K:\Unihack\output\co-ma-api-practical.json`. Script `scripts/check-live-advice.py` nhận mật khẩu qua đầu vào bảo mật, không ghi credentials vào source/kết quả và tự đăng xuất phiên kiểm thử.
- Kiểm tra trình duyệt đã thấy khung chờ, đồng hồ và nút dừng; phiên điều khiển bị ngắt khi chụp ảnh nên chưa lưu được ảnh nghiệm thu mới cho bản chữ cuối. Không dùng ảnh cũ để khẳng định đã kiểm tra thị giác toàn bộ thay đổi mới. Chưa phát hành cloud.

### Nâng cấp hội thoại Cò Mạ sau kiểm tra thực tế (21/11)

- Sửa nhánh trả lời cố định về số đo ruộng: khi người dùng đã cung cấp số đo trong câu hiện tại hoặc lịch sử, chuyển đầy đủ ngữ cảnh sang dịch vụ soạn câu trả lời. Vẫn giữ câu hỏi làm rõ khi chưa có số đo và truy xuất dữ liệu trạm/bộ demo có nguồn.
- Phân biệt “nước sâu” với sâu hại trong chọn tài liệu: câu chỉ hỏi mặn và mực nước không kéo tài liệu bệnh đạo ôn vào lời khuyên. Có test tái hiện và kiểm tra lại các câu bệnh/sâu hiện có.
- Giữ bốn cặp hội thoại hoàn chỉnh; sửa giới hạn UTF-8 của Worker từ 32 KB thành 96 KiB để các câu trả lời tiếng Việt dài không chặn lượt kế tiếp. Không tăng giới hạn 400 ký tự câu hỏi, 4096 ký tự lời đáp hoặc chín tin nhắn mỗi request.
- Tách lời đáp thành Nhận định, Việc nên làm, Cần kiểm tra thêm và Khi cần hỗ trợ khi phù hợp. Mỗi việc thành một mục; nguồn tham khảo thu gọn. Văn bản tạo bằng textContent, URL nguồn được kiểm tra riêng; nguồn lỗi không làm mất câu trả lời. Câu hỏi đơn giản và yêu cầu tóm tắt vẫn được trả lời ngắn.
- Dừng chờ giải phóng nút gửi ngay và giữ câu hỏi để gửi lại, không ghi đè bản nháp mới. Phản hồi sau khi dừng, bắt đầu lượt khác hoặc đăng xuất không được sửa lịch sử. Đăng xuất xóa ngữ cảnh; tệp ảnh đọc xong muộn không khôi phục dữ liệu vào phiên đã đóng.
- Thêm skeleton, thời gian đã chờ và thanh chuyển động khi soạn lời đáp; hỗ trợ giảm chuyển động. Bỏ phần trăm tiến độ giả và icon chờ trùng trên nút gửi. Không hiển thị tên nhà cung cấp hay chi tiết kỹ thuật trong UI.
- Chat dành tối đa 45 giây cho mỗi lần sinh câu trả lời và một lần thử lại; transport 105 giây, giao diện 120 giây. Khi lỗi vẫn hiện nút thử lại; không đổi sang đoạn hướng dẫn mẫu để giả làm câu trả lời mới.
- Phát hiện qua API thật: một số lời đáp coi số mặn đơn lẻ là “khá an toàn” hoặc khuyên giữ nguyên nước 36 cm chỉ vì đó là số đo hiện tại. Đã bổ sung hướng dẫn, kiểm tra phản hồi và test tái hiện. Số đo người dùng không tự thành mức khuyến cáo giữ nước; câu trả lời bị loại được yêu cầu soạn lại với chỉ dẫn sửa cụ thể, vẫn tối đa một lần thử lại.
- Phát hiện thêm qua log cục bộ: model dự phòng mặc định gemini-2.5-flash bị tài khoản hiện tại từ chối bằng HTTP 404. Mặc định mới thử lại chính model đang hoạt động; vẫn cho cấu hình GEMINI_FALLBACK_MODEL riêng. Đã thử và chọn mặc định Gemini 3.5 Flash cho soạn chat/tư vấn, thống nhất với client Python; model này đã trả lời trường hợp ngập sâu phù hợp hơn Flash-Lite trong lượt kiểm tra trực tiếp. Vẫn ưu tiên GEMINI_MODEL do môi trường cấu hình. Đã đối chiếu tài liệu chính thức về [vòng đời model](https://aistudio.google.com/docs/deprecations) và [Gemini 3.1 Flash-Lite](https://aistudio.google.com/docs/models/gemini-3.1-flash-lite).
- Kiểm thử tự động: 81 Python, 77 JavaScript đạt; kiểm tra cú pháp 15 tệp client, build và cú pháp Worker đạt. Các test mới bao gồm ngữ cảnh số đo, lịch sử dài UTF-8, dừng/đăng xuất, tách đoạn/số thập phân, nguồn lỗi, nội dung HTML và khuyến cáo nước thiếu căn cứ.
- Script scripts/check-live-chat.py nhận mật khẩu qua đầu vào bảo mật, gọi qua Flask rồi Worker, ghi từng lượt vào K:\Unihack\output\co-ma-chat-upgraded.json và đăng xuất phiên kiểm thử. Không ghi mật khẩu hay session token vào source/kết quả. Các lượt kiểm tra đầu phát hiện lỗi nội dung và model dự phòng nêu trên.
- Bản cuối đã hoàn thành năm lượt gọi thật qua toàn bộ luồng: câu hỏi lúa trổ bông/mặn/ngập sâu; sửa vị trí đo thành kênh; chuyển sang cà phê ngoài thư viện; tóm tắt hai câu; quay lại lúa với số đo mới. Cả năm HTTP 200, câu trả lời có độ dài 1427/1389/1163/248/1429 ký tự. Đã đọc lại nội dung: giữ ngữ cảnh, dùng số đo mới, phân biệt kênh/ruộng, không lặp khuyến cáo giữ nguyên nước 36 cm hoặc gọi mặn 0,5 g/L là an toàn. Đây là nghiệm thu chức năng và một nhóm tình huống, không phải bảo đảm mọi lời đáp đều đúng chuyên môn. Cần kiểm thử lại trên địa chỉ phát hành, cấu hình khóa/phiên và giới hạn request hosting trước khi nghiệm thu cloud.
- Chưa nghiệm thu thị giác giao diện mới bằng trình duyệt trong đợt này vì công cụ điều khiển trình duyệt không khả dụng. Không dùng ảnh cũ làm bằng chứng cho giao diện chat mới. Giữ bản cục bộ, chưa phát hành cloud.

### Đồng bộ biểu tượng ứng dụng (21/11)

- Dùng ảnh avatar mặc định `src/static/assets/co-ma/avatar-co-ma.webp` làm logo header và favicon trên các trang app. Giữ nguyên ảnh đại diện riêng người dùng đã tải lên. Không chỉnh bản Stitch gốc.
- Đã kiểm tra HTML đăng nhập/đăng ký và tài nguyên ảnh qua HTTP 200, đúng Content-Type image/webp. Đây là thay đổi biểu tượng giao diện web; chưa đóng gói lại file EXE.

### Sửa đồng hồ chờ và đổi thông số trong mô phỏng (21/11)

- Tái hiện bằng Chrome thật: khung lời khuyên hiện 0:00 nhưng chưa gửi request tư vấn. Console báo `TypeError: Illegal invocation` tại `adviceWaitController.tick`.
- Nguyên nhân: gán trực tiếp hàm native `setTimeout`/`clearTimeout` vào thuộc tính controller rồi gọi như method, khiến browser nhận sai receiver. Unit test cũ dùng hàm giả không kiểm tra receiver nên không phát hiện. Sửa bằng các hàm bao gọi timer trong ngữ cảnh global đúng; áp dụng cho cả lập lịch và hủy lịch.
- Đã thêm test tái hiện trước khi sửa; sau sửa 21 test simulation-view, tổng 78 test JavaScript, cú pháp 15 tệp client và `git diff --check` đạt. Không sửa engine hoặc backend nên không chạy lại bộ Python đã đạt 81 test ở đợt trước.
- Script `scripts/check-simulation-controls.mjs` kiểm tra trên Chrome headless: bốn thanh kéo đổi nhãn; kéo chuột thật thay nước từ 5 lên 13 cm; payload mô phỏng chứa đúng 13 cm. Đồng hồ báo cáo và cửa sổ lời khuyên cùng tăng lên 0:02. Dừng chờ rồi yêu cầu lại được; đổi thông số khi đang chờ hủy lời khuyên cũ và cập nhật nhãn, không có exception.
- Lượt kiểm tra này dùng backend mô phỏng thật và chặn request tư vấn bằng promise chờ giả lập để kiểm tra đồng hồ/hủy yêu cầu; không dùng kết quả đó để khẳng định chất lượng lời khuyên mới. Phiên kiểm thử riêng được đăng xuất, không sửa tài khoản. CLI Playwright không khả dụng nên dùng Chrome CDP. Ảnh tại `K:\Unihack\output\simulation-controls-fixed.png`.
- Bản cục bộ đã phục vụ JavaScript mới; tab đang mở cần tải lại để nhận sửa lỗi. Chưa phát hành cloud.

### Đồng bộ số hiển thị bốn ô và góc thương hiệu (21/11)

- Phần nhãn bốn thanh kéo trước đây nằm trong simulation-demo.js, phụ thuộc import và khởi tạo module vẽ cảnh. Khi module đó không chạy, số HTML ban đầu như +4,5 cm vẫn đứng nguyên dù thanh kéo đã đổi. Đã chuyển đồng bộ nhãn, aria-valuetext, phần tô thanh kéo, Đặt lại và nút giảm mặn sang simulationView chính; cập nhật ngay lúc nhận input trước khi hủy kết quả cũ. Không đổi số liệu engine.
- Cả bốn ô dùng định dạng Việt Nam và đơn vị gốc; mực nước dương có dấu +, mốc mặt ruộng là 0 cm. Test mới tái hiện việc view chính chưa cập nhật các nhãn trước sửa, sau sửa kiểm tra 3,2 g/L, +76,5 cm, 63 ngày, 37,5 °C và 0 cm.
- Thêm phiên bản URL cho hai script mô phỏng và stylesheet shell để tab tải lại lấy đúng bản mới. Module minh họa không còn quyết định việc số của thanh kéo có được cập nhật hay không.
- Header dùng wordmark rộng chữ hơn, màu xanh trầm, dòng phụ Cùng nhà nông và logo Cò Mạ 44 px trong khung bo góc, viền nhẹ. Mobile rút gọn để giữ khoảng trống cho tài khoản/đăng xuất. Dùng ảnh avatar đã có, không thay ảnh riêng của tài khoản.
- Chrome thật tại 1440 px đạt ở hai chế độ: bình thường và chặn tải simulation-scene.js. Bốn ô đổi nhãn; kéo chuột làm mực nước thành +13 cm và payload mô phỏng là 13 cm; Đặt lại về +4,5 cm; nút giảm mặn hiện 1 g/L. Chế độ đầy đủ vẫn đồng bộ đồng hồ báo cáo/cửa sổ ở 0:02, dừng và đổi điều kiện trong lúc chờ được.
- Tổng 79 test JavaScript, 22 test simulation-view, cú pháp 15 tệp client và kiểm tra cú pháp script QA đạt. Không sửa nghiệp vụ Python. Ảnh tại K:\Unihack\output\simulation-controls-values.png và K:\Unihack\output\mach-dong-brand.png. Chỉ cập nhật bản cục bộ, chưa phát hành cloud.

### Sửa lời khuyên bị loại nhầm vì kiểm tra định lượng (21/11)

- Gọi thật đã tái hiện hai phản hồi đầy đủ bị loại với thông báo nguồn không hợp lệ. Nguyên nhân xác định: input có plantHeightCm=90 nhưng valuesWithUnits không có 90 cm, khiến lời đáp nhắc đúng chiều cao cây bị coi là bịa số đo. Bổ sung chiều cao với đúng đơn vị; vẫn loại lời đáp tự đổi thành 91 cm. Không bỏ kiểm tra định lượng hoặc sửa engine.
- Bộ kiểm tra phun/bón cũng loại nhầm câu phủ định Không nên tự ý bón phân. Sửa nhận diện các dạng không/chưa/tránh và chuỗi nên/tự/ý; giữ chặn đề xuất dùng phân/thuốc khi thiếu dữ kiện. Chuyển kiểm tra này vào chu trình sinh để được yêu cầu soạn lại đúng một lần, thay vì kết thúc ngay ở lớp advice.
- Lần soạn lại có hướng dẫn cụ thể theo lỗi: định lượng, giữ nước thiếu căn cứ, đề xuất phân/thuốc, lời hứa an toàn, JSON, độ dài hoặc phản hồi bị cắt. Lỗi kiểm tra chất lượng không còn bị gọi chung là lỗi nguồn; mã nguyên nhân cố định giữ nội bộ, không ghi nội dung người dùng hay khóa vào thông báo.
- Prompt yêu cầu tư vấn ngắn theo bốn mục, phân biệt việc làm ngay và việc phải chờ số đo; đánh giá nguồn cấp/thoát nước trước khi điều chỉnh. Không lấy độ sâu đang có thành mục tiêu giữ nước; không coi EC trung bình vụ là điều kiện để bắt đầu kiểm tra nguồn cấp. Nếu dùng dự báo, không gửi nhiệt độ thủ công như một giá trị có thể dùng thay dự báo.
- UI lỗi không nói đang tiếp tục chờ phân tích khi request đã kết thúc: giải thích yêu cầu trước chưa hoàn tất và cách thử lại. Giữ đồng hồ dự phòng 270 giây theo yêu cầu trước; không dùng đoạn mẫu ngay khi lỗi. Hai script mô phỏng đổi phiên bản URL để tải bản mới.
- Phát hiện thêm một tiến trình main.py của repo ở cổng 5000 khi khởi động lại. Đã dừng đúng tiến trình này và chạy scripts/run-local.py để Flask/Worker dùng đồng bộ bản cục bộ đã sửa. Không sửa cấu hình cloud hoặc phát hành.
- Test mới tái hiện trước sửa và đạt sau sửa: chiều cao có đơn vị đúng, vẫn chặn chiều cao bịa, các câu phủ định phân/thuốc, một lần soạn lại sau đề xuất thiếu căn cứ. Tổng 82 test JavaScript đạt, cú pháp 15 tệp client, build/cú pháp Worker và git diff --check đạt. Không sửa nghiệp vụ Python.
- scripts/check-live-advice.py kiểm tra qua Flask tại 5000 rồi Worker cục bộ, nhận mật khẩu qua getpass và tự đăng xuất phiên test. Kết quả từng ca được lưu vào K:\Unihack\output\co-ma-advice-regression.json; có thể tiếp tục từ ca chưa đạt bằng MACH_DONG_QA_START_CASE mà không gọi lại các ca đã đạt.
- Hai ca qua toàn bộ Flask/Worker đã đạt HTTP 200: làm đòng (2706 ký tự, 4 nguồn) và trổ bông với nước 36 cm/cây 90 cm/nhiệt độ 35°C (2789 ký tự, 4 nguồn). Cả hai isFallback=false, bảo toàn snapshot và đủ bốn mục. Đã đọc nội dung thực tế; lời đáp có điều kiện trước khi thay/lấy nước và không tự đưa liều phân/thuốc. Đây là kiểm chứng hai tình huống, không phải bảo đảm mọi câu đều đúng chuyên môn hay hết lỗi diễn đạt.
- Ca thứ ba (mặn đo ở kênh) và một lần thử lại bị Google trả 429; log xác nhận hạn mức generate_content_free_tier_requests, limit 20, không phải lỗi kiểm tra nguồn. Một request chẩn đoán rất ngắn giữa hai lần có HTTP 200 nên chưa kết luận hạn mức bị khóa cả ngày; chưa nghiệm thu được ca thứ ba. Giữ hành vi không tự retry 429, không đổi billing, tài khoản hoặc tự phát hành. Cần cấu hình hạn mức đủ và kiểm tra lại trước nghiệm thu production.

### Hoàn thiện fallback 429 và form đăng ký trong một màn hình (21/11)

- Kế hoạch, nguyên nhân và nghiệm thu chi tiết: [Khắc phục tư vấn và đăng ký](khac-phuc-tu-van-va-dang-ky-2026-11-21.md).
- Đã bật dự phòng model có kiểm soát khi model chính trả 429; giữ tối đa hai lần gọi và kiểm tra đầu ra. Ca mặn kênh đã trả lời thật, lời khuyên đã hiển thị trên Chrome. Yêu cầu lỗi không còn giữ đồng hồ chờ giả; dùng lại phản hồi API khi snapshot không đổi.
- Đăng ký mặc định vừa màn laptop 1366×768 và desktop 1440×900, không có khung cuộn bên trong form; tùy chọn ví thu gọn và vẫn sử dụng được. Mobile cuộn tự nhiên, không tràn ngang.
- main.py ở chế độ local và launcher PowerShell dùng chung launcher Python; nhận diện đúng instance khi mở lại, tránh chạy nhầm backend. WSGI import không đổi. 81 test Python và 86 test JavaScript đạt. Bản cục bộ đang chạy; chưa phát hành cloud.
