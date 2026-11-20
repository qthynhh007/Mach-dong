import {generateGroundedReply} from "./generative.mjs";

export async function adviseScenario(env,fetcher,result) {
  const sources = result.sources.map(source=>({source_id:source.id,title:source.title,url:source.url,
    finding_vi:result.evidence.filter(item=>item.sourceIds.includes(source.id)).map(item=>item.description).join("\n"),
    scope_vi:source.use || "Chỉ áp dụng trong phạm vi mô hình tham chiếu; chưa kiểm định ngoài đồng."}));
  const valuesWithUnits={salinity:`${result.inputs.salinityGl} g/L`,waterDepth:`${result.inputs.waterDepthCm} cm`,
    manualTemperature:`${result.inputs.tempMaxC} °C`,rootZoneEc:result.inputs.rootZoneEcDsM === null ? null : `${result.inputs.rootZoneEcDsM} dS/m`};
  const forecastValuesWithUnits=result.weather ? result.dailyScenario.map(row=>({date:row.date,temperature:row.tempMaxC === null ? null : `${row.tempMaxC} °C`,rain:row.rainMm === null ? null : `${row.rainMm} mm`})) : null;
  const context = JSON.stringify({isSimulated:true,inputs:result.inputs,valuesWithUnits,forecastValuesWithUnits,stage:result.stage,
    units:{salinityGl:"g/L",waterDepthCm:"cm",tempMaxC:"°C",rootZoneEcDsM:"dS/m"},
    metrics:result.metrics,evidence:result.evidence,missingInputs:result.missingInputs,limitations:result.limitations,weather:result.weather,dailyScenario:result.dailyScenario});
  const answer = await generateGroundedReply(env,fetcher,[{role:"user",text:"Phân tích điều kiện ruộng trong dữ liệu dưới đây và tư vấn cải thiện việc chăm lúa dựa trên các căn cứ.\n"+context}],sources,
    "Phân tích riêng cho thông số đã nhập. Nếu useWeather=true, dùng nhiệt độ dự báo trong dailyScenario, không dùng nhiệt độ thủ công. Viết theo các mục: Điều kiện đáng chú ý; Việc nên làm (tối đa 4 việc, kèm lý do và điều kiện áp dụng); Cần đo thêm; Khi nào cần nhờ cán bộ nông nghiệp. Không tự thêm ngưỡng/liều lượng và không kết luận từ mặn kênh ra mặn ruộng. Nếu thiếu căn cứ cho can thiệp, hướng dẫn kiểm tra phù hợp thay vì bịa cách xử lý.",true);
  return {...answer,sources:sources.filter(item=>answer.source_ids.includes(item.source_id)),inputSnapshot:result.inputs,
    engineVersion:result.engineVersion,isSimulated:true,limitation:"Lời khuyên AI tham khảo dựa trên kịch bản giả lập, cần đối chiếu ngoài ruộng; chưa thay thế đánh giá của cán bộ nông nghiệp."};
}
