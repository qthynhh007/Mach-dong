# Hướng dẫn triển khai thu thập dữ liệu cho Kho CSV và Cò Mạ

Đọc `K:\Unihack\CONVENTIONS.md`, sau đó đọc [AGENTS.md](../AGENTS.md), [README](../README.md), [kiến trúc Flask](architecture.md) và [kế hoạch backend Cò Mạ](assistant-backend.md) trong `K:\Unihack\Mach-dong`. Kiểm tra `git status` trước khi sửa để giữ các thay đổi đang có của người dùng.

## Hai đầu ra cần triển khai

| Luồng | Thu thập | Đầu ra và nơi sử dụng |
|---|---|---|
| **A · Kho CSV** | Số đo ruộng, kênh, cống và trạm sông. Bản tin có thể chứa cả thực đo lẫn dự báo. | CSV số liệu đã kiểm tra và thông tin nguồn để người dùng xem, tải hoặc nhập ở `/community`. |
| **B · Hỏi đáp Cò Mạ** | Quy trình trồng, tài liệu đất và dinh dưỡng, hướng dẫn nhận diện và quản lý sâu bệnh, nghiên cứu về mặn và ngập trên nhiều loại cây. | JSON các đoạn căn cứ đã đối chiếu. Flask chọn đoạn theo cây, vấn đề và điều kiện trồng, gửi cùng request Gemini và trả nguồn trích dẫn. |

Mỗi luồng có danh sách nguồn, bước làm sạch và đầu ra riêng. Khi hỏi một con số cụ thể ở trạm hoặc trong ca giả lập, Flask đọc trực tiếp hàng CSV đúng kỳ và gắn bài nguồn. Câu hỏi canh tác dùng các đoạn JSON có phạm vi áp dụng trong request Gemini.

## Điểm xuất phát trong repo

- [CSV trạm lịch sử](../data/station-context/dbscl-man-muc-nuoc-2026.csv) có 22 dòng đã đối chiếu với bản tin. [Danh mục nguồn và quy tắc làm sạch](nguon-du-lieu-man-ngap.md) ghi rõ trang tài liệu, kỳ dữ liệu và các dòng cần kiểm tra lại.
- [CSV mẫu ruộng OM5451](../data/reference/long-huu-man-ngap-demo.csv) có 16 dòng giả lập. Dùng [hướng dẫn từng cột](du-lieu-mau-man-ngap.md) để thiết kế biểu mẫu lấy số đo thật.
- [JSON nguồn học thuật](../data/reference/lua-man-ngap-sources.json) có bốn nguồn về lúa. [Danh mục căn cứ Cò Mạ](../data/reference/co-ma-knowledge.json) có các đoạn đã đối chiếu về cách trồng, dinh dưỡng, sâu bệnh và mặn trên rau màu, cây ăn trái.
- `GET /api/community/datasets/<name>` đọc bộ đã công bố cho Kho CSV. `POST /api/community/preview` kiểm tra cú pháp tệp UTF-8 tối đa 1 MB để xem trước. Việc lưu bản nộp và duyệt nghiệp vụ cần luồng riêng.
- `POST /api/assistant/chat` nhận câu hỏi và lịch sử, trả `data.reply` cùng `data.sources`. [Hợp đồng API](assistant-backend.md#hợp-đồng-api)
- Chạy `fetch station`, `clean-stations`, `fetch knowledge` hoặc `check` qua `python -X utf8 -m scripts.agriculture_data`. [Lệnh đầy đủ và cách tái tạo](../README.md#thu-thập-và-tái-tạo-dữ-liệu)

## Luồng A · Thu thập và làm sạch số liệu cho Kho CSV

1. **Chọn nguồn.** Bắt đầu với bản tin mặn của Đài KTTV Vĩnh Long và bản tin nguồn nước của Viện Khoa học Thủy lợi miền Nam. Dùng MRC khi cần chuỗi mực nước trạm. Với mặn hoặc độ sâu ngập của từng thửa ở Long Hữu, lấy sổ đo được HTX hoặc nông hộ cho phép sử dụng. Danh sách URL gốc nằm trong [tài liệu nguồn dữ liệu](nguon-du-lieu-man-ngap.md).
2. **Tải và lưu dấu vết.** Ưu tiên API hoặc tệp tải chính thức, rồi đến bảng HTML hoặc PDF. Giữ tệp gốc, mã nguồn, URL, ngày phát hành, thời điểm tải và SHA-256. Ghi phương thức trích và trang hoặc tên bảng. Kiểm tra quyền tải và tái sử dụng theo điều khoản nguồn. Với PDF scan, so từng giá trị được chọn với bảng trên trang render.
3. **Chuẩn hóa theo loại bản ghi.** Dữ liệu trạm theo mẫu CSV lịch sử có `station_name`, `site_type`, `metric`, `unit`, `value`, `data_kind`, `value_status`, kỳ dữ liệu và thông tin nguồn. Với số đo ruộng, lưu `site_id`, `measured_at`, giống, giai đoạn, độ sâu tính từ mặt ruộng và thời gian ngập nếu có. Chuẩn ngày ISO 8601. Giữ múi giờ nếu tài liệu có giờ đo và giữ độ chính xác theo ngày nếu nguồn chỉ công bố ngày.
4. **Kiểm tra giá trị và nguồn.** Gắn `observed` hoặc `forecast` theo tiêu đề bảng. Giữ nhãn giả lập cho bộ demo. Giữ nguyên `‰`, `g/L`, EC nước, EC đất và mực nước theo mốc trạm. Mỗi đại lượng có chỉ tiêu riêng. Một cực đại theo kỳ là một bản ghi, kể cả khi có nhiều ngày xuất hiện. Giữ dòng “Nghỉ đo” với `value` trống. Giữ dòng thiếu đơn vị hoặc có ngày ngoài kỳ trong danh sách cần đối chiếu, kèm lý do.
5. **Xuất và nối Kho CSV.** Xuất CSV UTF-8, danh mục bộ dữ liệu và báo cáo số bản ghi theo trạng thái. Khi hiển thị ở `/community`, dùng mã bộ dữ liệu để tra tệp tải xuống ở server. Cho người xem thấy điểm đo, đơn vị, thực đo hay dự báo, kỳ dữ liệu và liên kết nguồn. Nếu nhận tệp người dùng nộp, giữ nó ở trạng thái chờ duyệt. Chỉ dùng bản ghi đã qua kiểm tra nghiệp vụ để bổ sung ngữ cảnh cho Cò Mạ.

Chạy lại cùng một tài liệu phải cho cùng kết quả. Nhận diện bản trùng bằng nguồn, trạm hoặc điểm đo, chỉ tiêu, loại dữ liệu và kỳ hoặc thời điểm đo. Nếu nguồn phát hành bản đính chính, lưu phiên bản mới cùng quan hệ với bản trước.

## Luồng B · Thu thập căn cứ cho request hỏi đáp

### Phạm vi tư vấn và cách trả lời

Cò Mạ hỗ trợ canh tác nhiều loại cây. Lô đầu ưu tiên lúa, rau ăn lá như cải, rau ăn quả như cà chua, ớt, dưa leo và cây ăn trái như xoài, ổi, sầu riêng. Bổ sung cây khác khi đã có nguồn tương ứng. Khi triển khai, cập nhật phạm vi trong `CO_MA_INSTRUCTION` ở `assistant_service.py`, lời chào và câu hỏi gợi ý ở `/assistant`. Phần mô phỏng tiếp tục dùng phạm vi lúa OM5451 như mô tả trong [kiến trúc Flask](architecture.md).

| Chủ đề | Dữ liệu cần crawl | Cách Cò Mạ xử lý câu hỏi |
|---|---|---|
| **Cách trồng và chăm sóc** | Tài liệu về chọn giống và mùa vụ, làm đất hoặc giá thể, gieo ươm, trồng, tưới, thoát nước, luân canh, tỉa tán và thu hoạch. Ghi điều kiện áp dụng cho ruộng, chậu hay nhà màng. | Hỏi cây gì, trồng ở đâu và trồng theo hình thức nào nếu câu trả lời phụ thuộc vào đó. Trình bày các bước theo giai đoạn. Khi đề cập thời vụ, lượng nước hoặc khoảng cách, kèm phạm vi áp dụng của nguồn. |
| **Cải tạo đất và tăng dinh dưỡng** | Hướng dẫn lấy mẫu đất, đọc pH và chất hữu cơ, sử dụng phân hữu cơ đã hoai, giữ ẩm, phủ đất, luân canh và bón phân theo giai đoạn. Thu cả hướng dẫn nhận diện thiếu hoặc thừa dinh dưỡng. | Xác định mục tiêu là cải tạo đất hay xử lý triệu chứng trên cây. Nếu cần tính lượng phân, thu cây, giai đoạn, diện tích hoặc số cây, kết quả đất nếu có, loại phân và hàm lượng. Giữ riêng lượng chất dinh dưỡng với lượng sản phẩm, đơn vị theo diện tích với đơn vị theo cây, và liều mỗi lần với tổng cả vụ. Khi thiếu dữ kiện, hướng dẫn kiểm tra trước rồi hỏi thêm để tính. |
| **Nhận diện sâu và bệnh hại** | Với từng cây, thu dấu hiệu trên lá, thân, rễ và quả, giai đoạn hay gặp, kiểu lan, nguyên nhân tương tự và biện pháp quản lý tổng hợp. Ví dụ tìm tài liệu theo cây và vấn đề như thán thư trên ổi, phấn trắng trên cây họ bầu bí, vàng lá hoặc thối rễ ở cây ăn trái. | Hỏi triệu chứng bắt đầu ở bộ phận nào, lan theo cụm hay đều, xuất hiện từ khi nào, có mưa/ngập hoặc thay đổi tưới và bón gần đây hay không. Phân biệt bệnh với côn trùng gây hại, thiếu hoặc thừa dinh dưỡng, úng, mặn, cháy nắng và tổn thương do hóa chất. Nêu các khả năng và dấu hiệu giúp phân biệt. Gợi ý quan sát, theo dõi, vệ sinh và biện pháp canh tác phù hợp với căn cứ. |
| **Mặn, hạn, ngập và phục hồi** | Nguồn về điều kiện đất và nước, giai đoạn cây, triệu chứng và mốc theo dõi sau stress. Giữ phần nghiên cứu trên lúa để dùng khi đúng đối tượng. | Hỏi nơi đo, chỉ tiêu và đơn vị. Giữ số đo kênh và mực nước trạm ở vai trò bối cảnh. Khi hỏi tỷ lệ cây sống, yêu cầu số đếm trước và sau trên cùng ô mẫu. |

Khi triệu chứng lan nhanh, cây chết thành cụm hoặc mô tả thiếu dấu hiệu phân biệt, Cò Mạ hướng dẫn chuẩn bị thông tin cho cán bộ khuyến nông hoặc bảo vệ thực vật. Gợi ý chụp toàn cây, phần bệnh và cây bên cạnh, rồi ghi số cây bị ảnh hưởng. Nếu trang hiện chỉ nhận văn bản, hướng dẫn người dùng mô tả các dấu hiệu quan sát được. Các thông tin về thuốc chỉ được lấy từ nguồn cập nhật, đúng cây và đối tượng đăng ký tại Việt Nam. Liều, cách áp dụng và thời gian cách ly cần dựa vào nhãn hợp lệ của sản phẩm. Khi thiếu dữ liệu nhãn hoặc chưa xác định được nguyên nhân, ưu tiên hướng dẫn quan sát và biện pháp canh tác. [Hướng dẫn IPM của FAO](https://www.fao.org/agriculture/crops/thematic-sitemap/theme/compendium/tools-guidelines/how-to-ipm/en/) · [Cục Trồng trọt và Bảo vệ thực vật](https://ppd.gov.vn/)

### Nguồn và cấu trúc JSON

- **Quy trình trồng theo điều kiện Việt Nam.** Bắt đầu từ tài liệu khuyến nông, các sổ tay VietGAP theo cây và hướng dẫn của địa phương. Ưu tiên tài liệu có vùng, mùa vụ và hình thức canh tác tương ứng. [Sổ tay VietGAP cho cây ăn quả](https://khuyennongvn.gov.vn/thu-vien-khuyen-nong/thu-vien-sach-kn/so-tay-huong-dan-ky-thuat-canh-tac-theo-vietgap-cho-10-loai-cay-an-qua-chu-luc-21683.html) · [Hướng dẫn kỹ thuật mùa khô ĐBSCL](https://khuyennongvn.gov.vn/data/documents/0/2026/10/06/hangweb/st-hanhan-muakho-2026-2027-full.pdf)
- **Đất và dinh dưỡng.** Lấy tài liệu có điều kiện đất, giai đoạn cây, tên chỉ tiêu và đơn vị. Nguồn từ vùng khác có thể dùng để giải thích nguyên lý. Mức bón thực tế cần căn cứ phù hợp với vùng và vụ của người hỏi. [Quy trình phối hợp phân hữu cơ và vô cơ cho rau ở các tỉnh phía Bắc](https://khuyennongvn.gov.vn/khoa-hoc-cong-nghe/khcn-trong-nuoc/quy-trinh-su-dung-phan-bon-huu-co-phoi-hop-phan-vo-co-cho-san-xuat-rau-an-toan-o-cac-tinh-phia-bac-21055.html)
- **Sâu bệnh và rối loạn sinh lý.** Dùng tài liệu chuyên ngành có dấu hiệu quan sát được, phần cây bị ảnh hưởng và trường hợp dễ nhầm. Tài liệu nước ngoài cần ghi rõ vùng và điều kiện. [Hướng dẫn thu thông tin chẩn đoán của UMN Extension](https://extension.umn.edu/agriculture/specialty-crops/diagnostic-help-for-fruit-and-vegetable-farmers)

Đọc bản gốc và lấy mỗi đoạn cho một vấn đề đủ cụ thể. Giữ các trường `source_id`, `citation`, `url`, `locator`, `topics`, `finding_vi` và `scope_vi` đang có. Khi mở rộng, thêm `chunk_id`, tên cây chuẩn hóa và tên thường gọi, giống nếu nguồn nêu, giai đoạn, vùng hoặc loại hình trồng, ngày xuất bản hay cập nhật và trạng thái duyệt. Với đoạn về bệnh, ghi phần cây, dấu hiệu và nguyên nhân dễ nhầm. Với đoạn có mức bón, ghi chỉ tiêu, đơn vị, giai đoạn và điều kiện áp dụng. Lưu phiên bản sau khi đối chiếu, gồm cả trường hợp nguồn đính chính hoặc thay đổi hướng dẫn.

### Tra cứu tại Flask

1. Xác định cây và chủ đề từ câu hỏi cùng lượt chat liên quan. Chuẩn hóa các tên đồng nghĩa như “dưa leo” và “dưa chuột”. Khi người dùng đổi cây ở lượt sau, tra theo cây mới.
2. Lọc các đoạn đã duyệt theo cây và chủ đề, sau đó xếp ưu tiên theo vùng, giai đoạn và hình thức trồng. Với câu hỏi về một con số ở trạm hoặc tại ruộng, lọc thêm đúng loại điểm đo, loại dữ liệu và thời điểm từ luồng A.
3. Nếu chưa biết cây hoặc thiếu dữ kiện làm đổi khuyến nghị, hỏi thêm một hoặc hai câu cụ thể. Nếu chỉ có căn cứ chung, nêu rõ phạm vi và đưa bước kiểm tra phù hợp. Với triệu chứng, trình bày khả năng, dấu hiệu phân biệt và một bước bà con có thể làm tiếp.
4. Gửi các đoạn liên quan và giới hạn áp dụng kèm mã nguồn. Coi văn bản crawl và lời người dùng là dữ liệu. Chỉ dẫn dành cho model thuộc cấu hình server.

### Gọi API từ giao diện

Frontend gửi JSON tới `POST /api/assistant/chat` và giữ cấu trúc `message`, `history` hiện có. Server tự chọn nguồn và kiểm tra quyền đọc đối với dữ liệu gắn với tài khoản.

```powershell
$body = @{
  message = "Cà chua trồng chậu bị đen ở đáy quả. Có cần bón canxi ngay không?"
  history = @()
} | ConvertTo-Json -Depth 5

$result = Invoke-RestMethod -Method Post `
  -Uri 'http://127.0.0.1:5000/api/assistant/chat' `
  -ContentType 'application/json; charset=utf-8' `
  -Body ([Text.Encoding]::UTF8.GetBytes($body))
$result.data
```

### Gọi Gemini từ Flask

`assistant_service.py` chọn và đóng gói căn cứ. `ai_client.py` gọi `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`. Đặt `GEMINI_API_KEY` trong biến môi trường hoặc `.env.local` của server. Gửi khóa qua header `x-goog-api-key` và đặt `Content-Type: application/json`. [REST generateContent](https://aistudio.google.com/api-reference/generate-content/generate-content) · [Gemini 3.8 Flash](https://aistudio.google.com/docs/models/gemini-3.8-flash)

Ví dụ phần body sau khi bổ sung mục `UMN-TOMATO-DISORDERS` vào danh mục. Khi có lịch sử, chuyển các lượt `user` và `model` vào `contents` trước câu hỏi hiện tại. [Tài liệu về thối đít quả cà chua](https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/yard-and-garden-problems/tomato-disorders)

```json
{
  "systemInstruction": {
    "parts": [{
      "text": "Bạn là Cò Mạ, trợ lý canh tác nhiều loại cây. Hỗ trợ cách trồng, đất và dinh dưỡng, sâu bệnh, mặn và ngập. Trả lời bằng tiếng Việt dựa vào căn cứ đúng cây và điều kiện. Khi mô tả thiếu, nêu khả năng và hỏi thêm dấu hiệu. Trả reply và danh sách source_ids thực sự dùng."
    }]
  },
  "contents": [{
    "role": "user",
    "parts": [
      {"text": "Căn cứ UMN-TOMATO-DISORDERS, mục Blossom-end rot. Cà chua có thể bị thối đít quả khi lượng canxi đến quả đang lớn không đủ. Độ ẩm đất thay đổi và tổn thương rễ có thể ảnh hưởng việc hấp thu. Dấu hiệu này riêng lẻ chưa xác định được lượng canxi trong đất."},
      {"text": "Câu hỏi. Cà chua trồng chậu bị đen ở đáy quả. Có cần bón canxi ngay không?"}
    ]
  }],
  "generationConfig": {
    "maxOutputTokens": 1024,
    "thinkingConfig": {"thinkingLevel": "LOW"},
    "responseMimeType": "application/json",
    "responseSchema": {
      "type": "OBJECT",
      "properties": {
        "reply": {"type": "STRING"},
        "source_ids": {"type": "ARRAY", "items": {"type": "STRING"}}
      },
      "required": ["reply", "source_ids"]
    }
  }
}
```

Trong chế độ trả JSON, cập nhật chỉ dẫn hiện yêu cầu “văn bản thuần”. Ghép các phần văn bản trả lời trong candidate, bỏ phần đánh dấu `thought`, rồi phân tích JSON và kiểm tra kiểu dữ liệu. Chỉ map các `source_ids` trùng với căn cứ đã gửi trong request. Server lấy tiêu đề và URL từ danh mục nguồn để tạo `data.sources`. Khi nhận cấu trúc hoặc mã nguồn sai, dùng phản hồi báo thiếu căn cứ hoặc báo lỗi theo [hợp đồng API hiện tại](assistant-backend.md#hợp-đồng-api). [Tài liệu chế độ JSON](https://aistudio.google.com/api-reference/generate-content/generate-content)

Ví dụ phản hồi Flask sau khi bổ sung trích dẫn. Frontend vẫn đọc `data.reply` và có thể hiển thị thêm `data.sources`.

```json
{
  "data": {
    "reply": "Nếu vết sẫm màu lõm đúng ở đầu quả đối diện cuống, có thể là thối đít quả. Bà con kiểm tra trước xem chậu có lúc khô kiệt rồi được tưới đẫm, hoặc có bị đọng nước không. Việc hấp thu canxi có thể bị ảnh hưởng khi độ ẩm thay đổi. Cò cần biết hình dạng vết và lịch tưới trước khi đề xuất bổ sung canxi.",
    "sources": [{
      "source_id": "UMN-TOMATO-DISORDERS",
      "title": "Tomato disorders · University of Minnesota Extension",
      "url": "https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/yard-and-garden-problems/tomato-disorders"
    }]
  },
  "error": null
}
```

## Bài tham khảo cho diễn đàn

Dùng [danh mục 20 bài đã xuất bản](blog-nguon-dien-dan.md) để chuẩn bị bài chia sẻ nguồn ở `/forum`. Các mục bao phủ cách trồng, đất và dinh dưỡng, sâu bệnh trên nhiều loại cây.

- Lấy **Admin** làm tên hiển thị của tài khoản đăng trên Mạch Đồng. Ghi tác giả gốc, đơn vị xuất bản, mốc nguồn và URL trong phần nội dung của từng bài.
- Giữ tiêu đề gốc và dùng URL trực tiếp tới bài. Nội dung dạng chia sẻ liên kết lấy từ thông tin đã kiểm chứng trong danh mục. Khi cần đăng lại toàn văn hoặc dùng ảnh gốc, kiểm tra quyền tái sử dụng của từng nguồn.
- Mỗi URL gốc tương ứng một mục. Flask đọc [danh mục JSON](../data/reference/forum-source-posts.json) khi khởi động, thêm các mục một lần vào nhóm **Bài tham khảo** bằng danh tính Admin của hệ thống. Giữ mã mục cố định trong danh mục.
- Với bài chứa liều phân hoặc thuốc, giữ nguyên thời điểm và phạm vi của nguồn. Khi dùng lại cho chatbot, duyệt từng đoạn theo luồng B và kiểm tra thông tin đang có hiệu lực trước khi đưa khuyến nghị.

## Thứ tự bàn giao và nghiệm thu

1. Chạy thử luồng A trên một bản tin cố định. Đối chiếu CSV với bảng gốc, mở tệp ở Kho CSV và kiểm tra danh mục tải về khi đã nối giao diện.
2. Chạy thử luồng B với các nguồn mặn và ngập hiện có, sau đó thêm nguồn cho ít nhất một cây rau ăn quả và một cây ăn trái. Kiểm tra đủ cả cách trồng, đất và dinh dưỡng, sâu bệnh. Kiểm thử backend bằng Gemini giả lập trước, sau đó gọi bằng khóa được cấu hình trên máy demo.
3. Nghiệm thu cả hai luồng với các ca dưới đây. Chạy `.\.venv\Scripts\python.exe -m unittest discover -s tests -v`. Bàn giao danh sách nguồn, tệp đầu ra, báo cáo các dòng cần đối chiếu và kết quả kiểm thử.

| Ca kiểm tra | Kết quả cần thấy |
|---|---|
| Cầu Quan có cùng giá trị 3,5‰ ở hai bảng | CSV giữ hai bản ghi theo kỳ và loại dữ liệu. Cò Mạ nêu rõ thực đo trong kỳ 07–14/05/2026 hoặc dự báo trong kỳ 14–23/05/2026, tùy câu hỏi. |
| Cái Muối ghi “Nghỉ đo” | CSV giữ dòng và để giá trị trống. Cò Mạ nói bản tin ghi nghỉ đo ở kỳ được hỏi. |
| Hỏi độ sâu ngập ruộng Long Hữu khi chỉ có mực nước trạm | Cò Mạ hỏi độ sâu tính từ mặt ruộng, thời gian ngập và giai đoạn lúa. |
| Hỏi cách theo dõi sau khi nước rút | Request chỉ kèm mục đã chọn. Phản hồi có link bài gốc và giữ đúng phạm vi nghiên cứu. |
| Hỏi cách trồng dưa leo trong chậu rồi chuyển sang hỏi xoài | Cò Mạ đổi sang đúng cây đang được hỏi và dùng nguồn phù hợp với hình thức trồng. |
| Hỏi bón bao nhiêu phân để cải tạo đất trồng cải khi thiếu diện tích và loại phân | Cò Mạ hỏi thêm và hướng dẫn kiểm tra đất trước khi đưa lượng bón. |
| Hỏi quả cà chua bị đen ở đáy hoặc ớt bị vàng lá | Cò Mạ nêu khả năng có căn cứ, hỏi dấu hiệu phân biệt và dùng đúng nguồn theo cây. |
| Gemini trả một mã nguồn lạ | Server chặn mã lạ và xử lý phản hồi thiếu căn cứ. |
| Đưa ca giả lập LH-03 vào ngữ cảnh | Cò Mạ gắn nhãn [Giả lập], đọc đúng số tại ruộng và giữ riêng số ngoài kênh. |
| Đăng thử một bài chia sẻ nguồn bằng tài khoản quản trị | Diễn đàn hiển thị người đăng **Admin**, đồng thời phần nội dung hiển thị tác giả hoặc đơn vị gốc và URL đúng bài. |
