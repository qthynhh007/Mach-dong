import {generateGroundedReply} from "./generative.mjs";

function validateScenarioAdvice(answer) {
  const prescriptions=[...answer.reply.matchAll(/(?:phun|bón|rải)\s+(?:(?:bổ sung|thêm|tăng)\s+)?(?:phân|thuốc|canxi|silic|chế phẩm)/giu)];
  if(prescriptions.some(item=>!/(?:không|chưa|tránh|hạn chế)(?:\s+(?:nên|tự|ý|được|vội|cần)){0,5}\s*$/iu.test(answer.reply.slice(Math.max(0,item.index-50),item.index)))) {
    throw new Error("Unsupported prescription");
  }
}

export async function adviseScenario(env,fetcher,result) {
  const sources = result.sources.map(source=>({source_id:source.id,title:source.title,url:source.url,
    finding_vi:result.evidence.filter(item=>item.sourceIds.includes(source.id)).map(item=>item.description).join("\n"),
    scope_vi:source.use || "Chỉ áp dụng trong phạm vi mô hình tham chiếu; chưa kiểm định ngoài đồng."}));
  const valuesWithUnits={salinity:`${result.inputs.salinityGl} g/L`,waterDepth:`${result.inputs.waterDepthCm} cm`,
    plantHeight:result.inputs.plantHeightCm === null ? null : `${result.inputs.plantHeightCm} cm`,
    manualTemperature:result.inputs.useWeather ? null : `${result.inputs.tempMaxC} °C`,rootZoneEc:result.inputs.rootZoneEcDsM === null ? null : `${result.inputs.rootZoneEcDsM} dS/m`};
  const forecastValuesWithUnits=result.weather ? result.dailyScenario.map(row=>({date:row.date,temperature:row.tempMaxC === null ? null : `${row.tempMaxC} °C`,rain:row.rainMm === null ? null : `${row.rainMm} mm`})) : null;
  const context = JSON.stringify({isSimulated:true,inputs:result.inputs,valuesWithUnits,forecastValuesWithUnits,stage:result.stage,
    units:{salinityGl:"g/L",waterDepthCm:"cm",tempMaxC:"°C",rootZoneEcDsM:"dS/m"},
    metrics:result.metrics,evidence:result.evidence,missingInputs:result.missingInputs,limitations:result.limitations,weather:result.weather,dailyScenario:result.dailyScenario});
  const answer = await generateGroundedReply(env,fetcher,[{role:"user",text:"Phân tích điều kiện ruộng trong dữ liệu dưới đây và tư vấn cải thiện việc chăm lúa dựa trên các căn cứ.\n"+context}],sources,
    `Tư vấn thực hành riêng cho ruộng này, không chép hay diễn đạt lại nguyên các đoạn evidence thành câu trả lời mẫu.
Viết khoảng 1600–2600 ký tự, tối đa 3600 ký tự, chia đoạn rõ. Mở đầu ngắn, không chào dài. Các số đo là thông số giả lập do người dùng thiết lập, không gọi là quan trắc thực địa.
Nếu useWeather=true, dùng nhiệt độ dự báo trong dailyScenario, không dùng nhiệt độ thủ công.
Viết đúng bốn mục có dấu hai chấm: Điều kiện đáng chú ý; Việc nên làm; Cần đo thêm; Khi nào cần nhờ cán bộ nông nghiệp.
Việc nên làm: đánh số tối đa 4 việc theo thứ tự ưu tiên. Mỗi việc nói rõ bà con làm gì, kiểm tra ở đâu, vì sao, điều kiện nào mới nên làm và dấu hiệu nào để đánh giá lại. Phân biệt việc có thể làm ngay với việc phải chờ số đo. Không chỉ viết chung chung “theo dõi sát” hoặc lặp lại các thông số.
Nếu nước có mặn, cân nhắc kiểm tra nguồn cấp trước khi lấy nước/thay nước, tránh khuyên bơm thêm nguồn mặn. Nếu chưa có chiều cao cây thì không kết luận ngập toàn cây. Khi trổ bông và có cảnh báo nhiệt, giải thích cần quan sát bông và thời điểm thay vì bảo đảm tỷ lệ đậu.
Không lấy mực nước đang có làm mục tiêu khuyến cáo giữ nước. Khi nước sâu, ưu tiên đánh giá khả năng thoát và nguồn cấp thay thế trước khi quyết định điều chỉnh; không tự đặt một độ sâu đích. Không chuyển sang chẩn đoán bệnh khi không có mô tả triệu chứng.
Mục Cần đo thêm chỉ ưu tiên thông tin giúp quyết định ngay: mặn nguồn cấp, vị trí đo, chiều cao cây, diễn biến nước và dấu hiệu trên cây. EC trung bình vụ phục vụ đánh giá năng suất tham chiếu, không phải điều kiện bắt buộc để bắt đầu kiểm tra nguồn cấp.
Đầu vào này không có phân tích dinh dưỡng hoặc chẩn đoán sâu bệnh. Không đề xuất phun, bón hay rải phân/thuốc/chế phẩm, kể cả canxi hoặc silic, chỉ từ mặn/ngập/nhiệt độ. Không tự đặt giờ trong ngày cho thao tác nếu căn cứ không nêu.
Được bổ sung nguyên lý canh tác từ kiến thức chung khi tài liệu chưa đủ, ghi rõ phần bổ sung đó. Chỉ gắn nguồn thực sự phù hợp. Không tự thêm liều phân/thuốc, ngưỡng, số đo hay tỷ lệ thiệt hại, không đổi mặn kênh thành mặn ruộng.
Nếu chưa đủ căn cứ cho một can thiệp, đề xuất cách kiểm tra để ra quyết định, không bịa giải pháp.`,false,0,true,120000,validateScenarioAdvice);
  return {...answer,sources:sources.filter(item=>answer.source_ids.includes(item.source_id)),inputSnapshot:result.inputs,
    engineVersion:result.engineVersion,isSimulated:true,isFallback:false,limitation:"Đề xuất theo kịch bản giả lập và thông tin tham khảo. Cần đối chiếu thực địa; chưa thay thế đánh giá của cán bộ nông nghiệp."};
}
