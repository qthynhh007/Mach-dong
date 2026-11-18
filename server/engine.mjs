import {simulationInput} from "./model.mjs";

export class simulationEngine {
  version = "RICE-EVIDENCE-2.0.0";
  constructor(catalog) { this.catalog = catalog; }

  evaluate(inputs, weather = null) {
    const evidence = [];
    const add = (id, level, title, description, sourceIds) => evidence.push({id, level, title, description, sourceIds});
    const missingInputs = [];
    let relativeYieldReferencePct = null;
    const parameters = this.catalog.parameters.faoRice;
    if (inputs.rootZoneEcDsM !== null && inputs.ecIsSeasonAverage && inputs.stage !== "seedling") {
      relativeYieldReferencePct = Math.round(Math.max(0, Math.min(100, 100 - parameters.slopePercentPerDsM * Math.max(0, inputs.rootZoneEcDsM - parameters.thresholdDsM))) * 10) / 10;
      add("fao-ec", "reference", "Đáp ứng mặn tham chiếu cho lúa nước", `Với EC nước đất vùng rễ trung bình vụ ${inputs.rootZoneEcDsM} dS/m, mô hình tham chiếu cho ${relativeYieldReferencePct}% năng suất tương đối so với đối chứng không mặn. Không phải dự báo riêng OM5451 hay tỷ lệ cây sống.`, ["fao-salinity"]);
    } else {
      missingInputs.push({id:"rootZoneEc",title:"EC nước đất vùng rễ trung bình vụ (dS/m), trong điều kiện ngập và lúa đã qua giai đoạn mạ"});
      add("missing-ec", "unknown", "Chưa đủ dữ liệu tính ảnh hưởng mặn lên năng suất", "Không đổi g/L nước ruộng hoặc nước kênh sang EC nước đất vùng rễ. Một số đo tức thời cũng không thay thế giá trị trung bình vụ.", ["fao-salinity"]);
    }
    add("salinity-context", "context", "Giữ đúng vị trí và đơn vị đo mặn", `Đầu vào ${inputs.salinityGl} g/L tại ${inputs.salinitySite === "fieldWater" ? "nước ruộng" : "nước kênh"} chỉ là điều kiện kịch bản. Nghiên cứu OM5451 cho thấy phản ứng phụ thuộc giai đoạn; chưa có hàm hiệu chuẩn để quy đổi thành thiệt hại ngoài đồng.`, ["ctu-om5451"]);
    const forecastRows = inputs.useWeather && weather ? weather.rows.slice(0, Math.min(inputs.exposureDays, 7)) : [];
    const usableTemperatures = forecastRows.map(row => row.tempMaxC).filter(Number.isFinite);
    const maximumTemperature = forecastRows.length ? (usableTemperatures.length ? Math.max(...usableTemperatures) : null) : inputs.tempMaxC;
    const heatConcern = inputs.stage === "flowering" && maximumTemperature !== null && maximumTemperature >= this.catalog.parameters.heatAlertC;
    if (heatConcern) {
      add("flowering-heat", "caution", "Cần theo dõi nóng lúc trổ", `Nhiệt độ cực đại của kịch bản đạt ${maximumTemperature}°C. Tài liệu IRRI ghi nhận nguy cơ tổn thương phấn quanh ngưỡng 35°C lúc trổ. Chưa đủ dữ liệu nhiệt độ bông và thời gian phơi nhiễm để tính tỷ lệ lép OM5451.`, ["irri-heat"]);
    } else {
      add("heat-context", "context", "Nhiệt độ và giai đoạn", "Kịch bản chưa kích hoạt cảnh báo nóng lúc trổ. Điều này không xác nhận cây an toàn trước mọi tác nhân; nhiệt độ không khí khác nhiệt độ bông.", ["irri-heat"]);
    }
    const submerged = inputs.plantHeightCm !== null && inputs.waterDepthCm >= inputs.plantHeightCm;
    if (inputs.plantHeightCm === null) missingInputs.push({id:"plantHeight",title:"Chiều cao cây thực đo để đối chiếu độ sâu ngập"});
    if (submerged) add("submerged", "caution", "Kịch bản ngập toàn bộ cây", `Mực nước ${inputs.waterDepthCm} cm bằng hoặc vượt chiều cao cây ${inputs.plantHeightCm} cm, kéo dài theo giả định ${inputs.exposureDays} ngày. Chưa có thông số chịu ngập đã kiểm định cho OM5451 nên không tính tỷ lệ sống.`, ["irri-flood"]);
    else add("water-context", "context", "Mực nước chưa đủ để dự đoán thiệt hại", "Độ sâu ngập bề mặt không thay thế mực nước trong ống AWD. Không suy ra độ sâu nước ruộng chỉ từ mưa và không suy ra phần trăm cây sống từ độ sâu.", ["irri-awd"]);
    if (inputs.stage === "seedling") add("seedling-study", "reference", "Có thí nghiệm mặn ở mạ OM5451 để đối chiếu", "Bảng thí nghiệm đo cây ở ngày 14 sau sạ, trong chậu. Tỷ phần lá cháy là chỉ tiêu lá trong thí nghiệm, không phải tỷ lệ cây chết ngoài ruộng.", ["vnua-seedling"]);
    const dailyScenario = Array.from({length: Math.min(inputs.exposureDays, 7)}, (_, index) => {
      const row = inputs.useWeather ? forecastRows[index] : null;
      const tempMaxC = inputs.useWeather ? (row?.tempMaxC ?? null) : inputs.tempMaxC;
      return {scenarioDay:index + 1,date:row?.date ?? null,tempMaxC,rainMm:row?.rainMm ?? null,
        et0Mm:row?.et0Mm ?? null,solarMjM2:row?.solarMjM2 ?? null,
        temperatureSource: inputs.useWeather ? (row ? "forecast" : "missingForecast") : "userScenario",
        heatConcern: tempMaxC === null ? null : (inputs.stage === "flowering" && tempMaxC >= this.catalog.parameters.heatAlertC),
        waterDepthCm:inputs.waterDepthCm,salinityGl:inputs.salinityGl};
    });
    return {engineVersion:this.version,dataVersion:this.catalog.version,inputs,
      stage:simulationInput.stages[inputs.stage],status:"referenceScenario",isFieldValidated:false,
      metrics:{relativeYieldReferencePct,fieldYieldTonnesHa:null,survivalRatePct:null,chi:null},
      evidence,missingInputs,dailyScenario,
      scene:{submerged,heatConcern,saltReferenceConcern:relativeYieldReferencePct !== null && relativeYieldReferencePct < 100},
      assumptions:["Giai đoạn, độ mặn và mực nước được giữ cố định trong kịch bản; không tính cộng dồn thiệt hại.","Biểu đồ tối đa 7 ngày. Dự báo thời tiết là dữ liệu mô hình ô lưới, không phải quan trắc ruộng.","Năng suất tương đối FAO chỉ phản ánh tác động mặn theo giả định của nguồn, không tổng hợp nóng/ngập/phân bón."],
      limitations:this.catalog.limitations,weather:weather ? {sourceId:weather.sourceId,retrievedAt:weather.retrievedAt,kind:weather.kind,sourceUrl:weather.sourceUrl,locationId:weather.locationId} : null,
      sources:this.catalog.sources.filter(source => evidence.some(item => item.sourceIds.includes(source.id)) || source.id === weather?.sourceId),
      experiment:inputs.stage === "seedling" ? this.catalog.seedlingExperiment : null,
    };
  }
}
