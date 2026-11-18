# Mô phỏng OM5451, dữ liệu trực tuyến và bản Windows

## Người dùng tải gì và chạy thế nào?

Người dùng Windows 64-bit chỉ cần **MachDong.exe**. Nhấp đúp file để mở cửa sổ Mạch Đồng; ứng dụng tự mở giao diện bằng trình duyệt mặc định. Nút **Mở ứng dụng** mở lại giao diện, đóng cửa sổ Mạch Đồng để thoát hoàn toàn. Không cần Python, Node, Ollama, GPU hay API key trên máy người dùng. Báo cáo và dữ liệu thời tiết cần kết nối Internet.

File đã dựng ở `dist/MachDong.exe`. Đây là ứng dụng desktop dùng giao diện web trên loopback; không phải bộ cài và chưa ký chứng thư phát hành Windows. Kiểm tra nguồn tải/chữ ký khi phân phối; không tắt bảo vệ Windows. Bản này chỉ dành Windows x64; macOS/Linux cần bản dựng riêng.

**Deploy máy chủ không tự tạo nơi tải EXE.** Khi phát hành, tải file EXE lên GitHub Releases hoặc kênh phân phối của nhóm. Người dùng tải EXE trong **Assets**, không tải “Source code” nếu chỉ muốn chạy. Workflow `.github/workflows/windows-release.yml` dựng file và checksum trên Windows khi chạy thủ công hoặc đẩy tag `desktop-v*`; với tag, workflow tạo bản prerelease có EXE. Không cần đưa EXE vào lịch sử Git.

Repository riêng tư chỉ cho người có quyền tải bản phát hành. Muốn phát EXE cho mọi người mà vẫn giữ mã nguồn riêng tư, nhóm có thể dùng một repository phân phối công khai riêng hoặc kho tải file công khai. Chưa có bản GitHub Release/đường dẫn tải EXE công khai được tạo; file hiện có sẵn trên máy phát triển để chia sẻ.

Nếu lập trình viên pull code: tạo `.venv`, cài `requirements.txt`, chạy `python main.py` hoặc `python desktop.py`. API mặc định đã nằm trong cấu hình; không cần cấu hình khóa riêng cho từng người.

Trang `/simulation` có bốn thanh trượt, cảnh cánh đồng và Cò Mạ dùng kịch bản giả lập cục bộ. Nút **Báo cáo & nguồn** mở `/simulation/report` để nhập điều kiện chạy báo cáo cloud, xem dự báo và dùng AI.

## Máy chủ đã triển khai

- Trang dịch vụ: https://mach-dong-rice-data.artfulmica6.chatgpt.site
- `GET /api/health`: phiên bản, số dòng lịch sử, nhà cung cấp AI và trạng thái cấu hình khóa.
- `GET /api/catalog`: giống, nguồn, tham số, giới hạn và phiên bản dữ liệu.
- `GET /api/datasets/weather-history`: bộ dữ liệu NASA POWER đã chuẩn hóa, còn nguồn, đơn vị, ngày lấy và SHA-256 bản gốc cho từng điểm.
- `GET /api/weather?locationId=can-tho`: dự báo 7 ngày, lấy Open-Meteo phía máy chủ; cache tối đa một giờ trong mỗi Worker và không dùng lại ngày đầu cũ.
- `POST /api/simulation`: kiểm tra kịch bản, tính kết quả có nguồn; gọi nhà cung cấp AI đã chọn khi `requestAi=true` và đã cấu hình khóa máy chủ. Hiện dùng Groq.

API đọc dữ liệu và mô phỏng là công khai theo lựa chọn của chủ dự án. Không có endpoint công khai sửa dữ liệu. Dữ liệu nhập kịch bản được gửi lên máy chủ; nếu bật AI, các thông số này và bằng chứng được gửi nhà cung cấp đã cấu hình (hiện là Groq). Không gửi tên, email, nội dung diễn đàn hay tọa độ chính xác của người dùng; địa điểm là điểm đại diện có sẵn.

## Những gì tính được và chưa tính được

| Kết quả | Căn cứ | Giới hạn bắt buộc |
|---|---|---|
| Năng suất tương đối do mặn | FAO: `max(0, 100 - 12 × max(0, EC - 3))` | Chỉ nhận EC **nước đất vùng rễ khi ngập**, trung bình vụ, lúa qua giai đoạn mạ; giống lúa nước chung, chưa hiệu chuẩn OM5451 |
| Cảnh báo nóng lúc trổ | IRRI ORYZA2000, khoảng 35°C | Cảnh báo định tính; nhiệt độ không khí không phải nhiệt độ bông; không đưa tỷ lệ lép |
| Kịch bản ngập toàn cây | Độ sâu so với chiều cao cây do người dùng nhập | Chưa có đường đáp ứng ngập OM5451; không mượn khả năng chịu ngập SUB1 |
| Diễn biến tối đa 7 ngày | Nhiệt độ nhập tay hoặc dự báo Open-Meteo | Giữ cố định giai đoạn, mặn và nước; không tích lũy thiệt hại hay suy độ ngập từ lượng mưa |
| Đối chiếu mạ OM5451 | Bảng 8, nghiên cứu 2022 | Số trung bình thí nghiệm chậu; không nội suy sang năng suất ngoài đồng |

`fieldYieldTonnesHa`, `survivalRatePct` và `chi` trả `null`. Không còn công thức CHI, năng suất minh họa, số quang hợp/hút nước hoặc tỷ lệ phát triển tốt không có nguồn của bản trước. **Chưa có mô hình ML dự báo năng suất OM5451 đã huấn luyện và kiểm định.** Không thể tạo mô hình đáng tin chỉ bằng ghép thời tiết với vài trung bình nghiệm thức; còn thiếu quan trắc ruộng và nhãn kết quả thực tế.

Số ngày sau sạ không tự quyết định giai đoạn. Người dùng xác nhận giai đoạn quan sát vì lịch sinh trưởng phụ thuộc vụ và điều kiện. Mặn g/L ở nước kênh/ruộng không tự đổi thành EC vùng rễ. Không đổi ‰ trong thí nghiệm thành g/L đầu vào. Mực nước ngập bề mặt khác mực nước dưới đất trong ống AWD.

## AI hoạt động như thế nào?

Engine tham chiếu chạy **trên cloud**, tạo kết quả và các thẻ bằng chứng. Groq hoặc Gemini nhận thông số cùng các thẻ đã tính, chọn ID bằng chứng cần chú ý và ID dữ liệu còn thiếu. JSON trả về chỉ được chứa ID nằm trong danh sách cho phép; sai schema, ID lạ, con số mới, phản hồi bị cắt hoặc lỗi quota đều không được hiển thị như kết quả AI thành công. Giao diện lấy nội dung/số liệu từ thẻ nguồn của engine, không từ văn bản tự sinh.

Đây là **AI hỗ trợ đọc bằng chứng**, không phải mô hình ML đã học quan hệ năng suất OM5451. Cách này hạn chế bịa số/citation trong phần hiển thị nhưng không bảo đảm dữ liệu gốc hay công thức phù hợp mọi ruộng. Kết quả luôn ghi phạm vi và phần còn thiếu.

**Groq đã được kích hoạt ngày 18/11/2026**, dùng model `openai/gpt-oss-20b`; khóa lưu dạng secret trên máy chủ. Đã kiểm thử lời gọi thật qua API và nút **Nhờ AI chọn bằng chứng** trong giao diện: báo cáo tự mở, hiện thông báo Groq thành công và nhãn **AI chọn lưu ý**. Người dùng không cần nhập khóa hoặc cài AI cục bộ. Nút **Mô phỏng và xem báo cáo** chạy engine tham chiếu không gọi AI; cả hai nút đều tự mở báo cáo.

Việc bật hoặc thay khóa chỉ cần cập nhật secret và triển khai lại máy chủ. Bản EXE hiện có đã dùng URL cloud này nên không cần dựng lại hoặc tải lại EXE chỉ vì đổi khóa.

### Cấu hình miễn phí một lần cho quản trị viên

**Lựa chọn Groq đã tích hợp:** model `openai/gpt-oss-20b` với Structured Outputs. Tạo tài khoản và API key tại [Groq Console](https://console.groq.com/keys); giữ tài khoản ở **Free**, không nâng cấp Developer. Theo [Groq Billing FAQs](https://console.groq.com/docs/billing-faqs), nâng cấp Developer mới dùng thanh toán theo lượt. [Hạn mức](https://console.groq.com/docs/rate-limits) vẫn áp dụng theo tổ chức, gồm số yêu cầu và token. Không có cam kết miễn phí không giới hạn.

Đặt `AI_PROVIDER=groq`, **secret** `GROQ_API_KEY` và `GROQ_MODEL=openai/gpt-oss-20b` trong runtime environment của Site. Deploy lại saved version để áp dụng; kiểm tra `/api/health` có `aiProvider=groq`, `aiConfigured=true`, rồi thử nút AI. Cấu hình này đã áp dụng cho API công khai. Health chỉ xác nhận khóa có mặt; `ai.status=ready` từ lời gọi mô phỏng thật mới xác nhận AI trả kết quả hợp lệ. Khóa chỉ thuộc máy chủ, không nằm trong EXE hoặc code JavaScript trình duyệt.

**Lựa chọn Gemini vẫn được giữ:**

1. Tạo khóa trong [Google AI Studio](https://aistudio.google.com/api-keys), chọn dự án đủ điều kiện dùng free tier; không bật thanh toán nếu nhóm muốn giới hạn ở gói miễn phí.
2. Đặt **secret** `GEMINI_API_KEY` trong runtime environment của Site `appgprj_6afcfbe9375c8191af0a348ebb094ff8`. Dùng công cụ quản lý biến môi trường Sites; không gửi khóa vào chat, commit, template hay file EXE.
3. Đặt `AI_PROVIDER=gemini`, `GEMINI_MODEL=gemini-2.5-flash-lite` hoặc model có free tier mà dự án thực sự được cấp; kiểm tra lại model/hạn mức tại thời điểm cấu hình.
4. Deploy lại saved version để áp dụng revision môi trường mới. Kiểm tra `/api/health` có `aiConfigured=true`, rồi chạy một kịch bản bằng nút AI.

[Bảng giá Gemini](https://ai.google.dev/gemini-api/docs/pricing) có free tier giới hạn; free-tier data có thể được dùng cải thiện sản phẩm theo điều khoản Google. Không cam kết quota hay miễn phí vĩnh viễn. API demo giới hạn AI tối đa 3 yêu cầu/phút/IP và 2 lời gọi đồng thời **trong từng Worker isolate**; đây không phải quota toàn cục. Trước khi cấu hình khóa có thanh toán hoặc phát hành quy mô lớn, cần cơ chế hạn mức toàn cục và xác thực phía gateway. Kết quả không có nguồn sẽ không được dùng làm phương án dự phòng khi AI lỗi.

## Bộ dữ liệu mới so với bản cũ

Bản cũ có đúng 4 CSV mẫu, mỗi file một dòng giả lập: mặn nước ruộng, nhiệt độ, pH, mực nước. Không đưa bốn dòng đó vào dữ liệu huấn luyện hay bộ dữ liệu mới.

| Nguồn mới | Dữ liệu đã dùng | Phạm vi / quyền dùng |
|---|---|---|
| [NASA POWER Daily](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) | **2.920 ngày-địa điểm**, năm 2025 × 8 điểm: Cần Thơ, Long Mỹ, Ba Tri, Gò Công, Trà Vinh, Sóc Trăng, Châu Đốc, Cà Mau. Nhiệt độ min/max/trung bình, mưa, RH, gió 2m, bức xạ | MERRA2/SYN1DEG/POWER dạng lưới; đơn vị API gốc giữ trong metadata; fill -999 chuyển thành null; không gọi đây là cảm biến ruộng |
| [Open-Meteo](https://open-meteo.com/en/docs) | API dự báo 7 ngày: nhiệt độ min/max, mưa, ET0, bức xạ | CC BY 4.0; API free chỉ phi thương mại và có hạn mức theo [điều khoản](https://open-meteo.com/en/terms) |
| [FAO crop salt tolerance](https://www.fao.org/4/y4263e/y4263e0e.htm) | Hai tham số ngưỡng/dốc của lúa nước và chú thích §§ | Không áp dụng nhầm EC nước kênh hoặc nhầm đơn vị; không lưu toàn văn |
| [IRRI ORYZA2000](https://books.irri.org/9712201716_content.pdf) | Cảnh báo nóng lúc trổ, trang 61 | Không dùng hệ số giống Akihikari cho OM5451 |
| [IRRI AWD](https://ghgmitigation.irri.org/mitigation-technologies/alternate-wetting-and-drying) | Phân biệt mực nước ống AWD với ngập mặt đất | Hướng dẫn quản lý nước; không dùng thành đường cong năng suất |
| [IRRI SUB1](https://www.ricetoday.irri.org/thinking-beyond-the-sub1-gene-making-rice-survive-longer-and-yield-more/) | Giới hạn chuyển bằng chứng chịu ngập giữa các giống | Không gán khả năng SUB1 cho OM5451 |
| [Viện Lúa ĐBSCL, luận án 2019](https://clrri.org/uploads/Toan%20van%20luan%20an.pdf) | Phả hệ OM5451 và khoảng 88–93 ngày được tài liệu báo cáo, trang in 39 | Khoảng tham khảo, không phải lịch sinh lý cố định |
| [Tạp chí KHNN Việt Nam 2022](https://tapchi.vnua.edu.vn/wp-content/uploads/2022/08/tap-chi-so-8.2.pdf) | Bảng 8: bốn nghiệm thức mặn, chiều cao cây/rễ, tỷ phần lá cháy OM5451 | Trung bình 3 lặp; đo ngày 14 sau sạ, phơi nhiễm khoảng 10–11 ngày. Bài không nhất quán bắt đầu tưới ngày 3/4; đã ghi caveat. Không có raw replicate hay confidence interval |
| [ĐH Cần Thơ 2016](https://ctujsvn.ctu.edu.vn/index.php/ctujsvn/article/view/2727) | Bằng chứng phản ứng OM5451 phụ thuộc thời điểm mặn | Nhà lưới, ngày sau cấy không phải ngày sau sạ; không lưu toàn văn |
| [TNU Long Mỹ 2018](https://jst.tnu.edu.vn/jst/article/view/268) | Nghiên cứu đạm/tưới OM5451 tại vùng mặn | Trung bình theo nhân tố không phải các mẫu huấn luyện độc lập; không khuyến nghị liều đạm chung |
| SIWRR, MRC WQ (link trong catalog) | Danh mục nguồn thủy văn/mặn để nhóm tham khảo | **Chưa nhập/mirror dữ liệu** vì quyền tái sử dụng chưa xác minh; không tính là dòng dữ liệu đã thu thập |

Các số liệu nghiên cứu được trích dưới dạng dữ kiện có dẫn nguồn; không sao chép bài báo lên máy chủ. Xem `server/data/catalog.json` để biết metadata, giới hạn và loại nguồn. Thời tiết và những bảng này **chưa tạo thành tập training có nhãn thiệt hại**.

## Cập nhật dữ liệu mà không phát hành lại app

Bản EXE dùng API cloud theo mặc định. Khi chạy từ mã nguồn Windows, `scripts/run-local.ps1` có thể mở cùng bộ máy tính và dữ liệu `server/data` trên `127.0.0.1:8787`. Chế độ cục bộ dùng được danh mục và báo cáo với thông số nhập tay. Dự báo Open-Meteo và AI cần kết nối tới nhà cung cấp.

- **Dự báo mới:** Worker lấy từ Open-Meteo khi người dùng yêu cầu; cache một giờ. Không phải tác vụ nền định kỳ.
- **Nguồn/tham số mới:** sửa `server/data/catalog.json`, tăng `version` và `reviewedAt`, bổ sung nguồn/đơn vị/phạm vi. Chạy test, build và deploy lại **cùng Site**. Lần tải dữ liệu tiếp theo của app dùng bản mới.
- **Dữ liệu lịch sử:** `python scripts/collect_weather.py --year 2025` lấy trọn một năm đã kết thúc. Chọn năm khác sau khi năm đó hoàn tất. Collector xác minh đơn vị, đủ ngày, giữ URL gốc và hash; chỉ thay bundle khi tất cả điểm thành công. Chạy test (cập nhật kỳ vọng năm/số ngày nếu đổi năm), build và deploy.
- **Không trộn số mẫu với số thật**, không tự điền null, không chuyển số liệu kênh/cống thành số đo ruộng.

Site ID trong `server/.openai/hosting.json` phải giữ nguyên. Dùng workflow nguồn/đóng gói của Sites từ thư mục máy chủ, lưu version rồi deploy public; source chính của app vẫn ở GitHub. Không tạo Site mới cho mỗi lần cập nhật. Thư mục checkout triển khai tại máy phát triển: `D:/UniHack/sites/mach-dong-data`; cần đồng bộ nguồn `server/` vào checkout trước khi build/publish. Không copy `.git` hoặc secret. Có thể quay lại saved version trước nếu dữ liệu mới sai. Không có trang quản trị sửa dữ liệu công khai.

Không tạo tài nguyên trả phí hay mua gói hosting riêng trong lần triển khai này. Sites sử dụng quyền hosting hiện có của tài khoản; hạn mức nền tảng và nguồn API vẫn áp dụng. Không nên mô tả hệ thống là không giới hạn/miễn phí vĩnh viễn.

## Kiến trúc và class chính

`simulationView → simulationController → simulationService → simulationInput → aiClient/cloudClient → HTTPS cloud → simulationController → simulationEngine/weatherClient/aiClient`.

| Thành phần | Hàm chính / vai trò |
|---|---|
| `src/static/simulation.js`: `simulationView` | `inputs`, `run`, `invalidate`, `renderResult`, `loadWeather`; hủy request cũ khi sửa kịch bản, báo cáo có nguồn, xuất JSON |
| `src/controllers/simulation_controller.py`: `simulationController` | `simulate`, `catalog`, `weather`, `history`; request/response, lỗi `{data,error}` |
| `src/models/simulation.py`: `simulationInput` | `parse`; chặn bool/NaN/vượt miền, giữ metadata điểm đo |
| `simulationService`, `cloudClient`, `aiClient`, `weatherClient` | Điều phối và HTTPS phía ứng dụng, không tính AI cục bộ, không chứa khóa nhà cung cấp AI |
| `server/model.mjs`: `simulationInput` | Kiểm tra lại đầu vào tại máy chủ, không tin máy khách |
| `server/engine.mjs`: `simulationEngine.evaluate` | Engine thuần, version hóa, kết quả xác định từ đầu vào và snapshot dữ liệu |
| `server/ai.mjs`: `aiClient.explain` | Groq/Gemini REST, timeout, schema chỉ-ID, loại phản hồi không có bằng chứng |
| `server/weather.mjs`: `weatherClient.forecast` | Open-Meteo, kiểm tra đơn vị, null không đổi thành 0 |
| `desktop.py`: `desktopApplication.run` | Launcher EXE; UI loopback, dữ liệu riêng của app trong `%LOCALAPPDATA%/MachDong` |

Server sử dụng JavaScript Worker ES module để chạy trên hosting hiện có; lớp MVC + Service Python của ứng dụng được giữ. Tên class/hàm/biến mới dùng camelCase theo yêu cầu của nhóm (ngoại trừ API bắt buộc của thư viện).

**Cộng đồng/tài khoản:** lần này chỉ đưa dữ liệu và mô phỏng lên cloud. SQLite diễn đàn của bản EXE vẫn là dữ liệu trên từng máy; đăng nhập hiện vẫn demo. Chưa phải một diễn đàn nhiều người dùng dùng chung cloud. Cần backend tài khoản và cộng đồng riêng để phát hành toàn bộ sản phẩm cho nhiều người.

## Kiểm tra và build

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\ruff.exe check src tests scripts/collect_weather.py desktop.py
node --test server/tests/simulation.test.mjs
node --test tests/simulation-view.test.mjs
node server/build.mjs
.\.venv\Scripts\python.exe -m pip install -r requirements-build.txt
.\scripts\build-desktop.ps1
```

Windows launcher có chế độ `--smoke-output <path>` kiểm tra resource trong EXE mà không mở cửa sổ. Các test tự động dùng transport giả lập để kiểm tra lỗi và validation, không tiêu thụ quota AI.

Kiểm thử trực tiếp ngày 18/11/2026 sau khi áp dụng secret Groq:

- API công khai trả `aiConfigured=true`; POST kịch bản OM5451 tại Cần Thơ, trổ bông, 38°C, EC vùng rễ trung bình vụ 5 dS/m trả `ai.status=ready`, provider `Groq`, model `openai/gpt-oss-20b`. Năng suất tương đối tham chiếu vẫn là 76% theo FAO; AI chỉ trả ID bằng chứng, không tạo con số dự báo.
- Thử nút **Nhờ AI chọn bằng chứng** trong ứng dụng với kịch bản thiếu EC/chiều cao: báo cáo 7 ngày vẫn hiện, đánh dấu ba bằng chứng AI chọn và nêu dữ liệu còn thiếu; không gán năng suất khi thiếu điều kiện tính.
- Gemini chưa được cấu hình hoặc kiểm thử lời gọi thật trong lần kích hoạt này.

## Nếu bấm mô phỏng mà không thấy báo cáo

Bản sửa giao diện ngày 18/11/2026 tự chuyển sang báo cáo, cuộn và đưa tiêu điểm vào tiêu đề. Kết quả thiếu EC vẫn có báo cáo nhiệt độ/nước, không hiện màn hình trống. Trạng thái/lỗi xuất hiện cả cạnh nút bấm; yêu cầu quá 45 giây dừng và cho thử lại. Lỗi tải danh mục có nút **Kết nối lại dữ liệu**. JavaScript/CSS có phiên bản URL để tránh dùng bản cũ từ bộ nhớ đệm.

Nếu đang chạy source, khởi động lại ứng dụng rồi tải lại trang. Nếu đang dùng EXE, đóng cửa sổ Mạch Đồng cũ, thay bằng file mới trong `dist`, mở lại. Tab đã mở từ phiên bản trước vẫn giữ JavaScript cũ cho đến khi tải lại. Thiếu khóa AI không chặn mô phỏng hoặc báo cáo.
