export class simulationError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export class simulationInput {
  static stages = {seedling:"Mạ",tillering:"Đẻ nhánh",panicle:"Làm đòng",flowering:"Trổ bông",ripening:"Chín"};
  static parse(payload, catalog) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new simulationError("Cần gửi một kịch bản hợp lệ.");
    const allowed = new Set(["varietyId","locationId","stage","dayAfterSowing","salinityGl","salinitySite","waterDepthCm","plantHeightCm","tempMaxC","rootZoneEcDsM","ecIsSeasonAverage","exposureDays","useWeather","requestAi"]);
    if (Object.keys(payload).some(key => !allowed.has(key))) throw new simulationError("Kịch bản chứa trường không hỗ trợ.");
    const result = new simulationInput();
    for (const [key, min, max, nullable] of [
      ["dayAfterSowing",0,150,false],["salinityGl",0,20,false],["waterDepthCm",0,150,false],
      ["plantHeightCm",1,200,true],["tempMaxC",5,55,false],["rootZoneEcDsM",0,20,true],["exposureDays",1,30,false],
    ]) {
      const value = payload[key] ?? null;
      if (value === null && nullable) { result[key] = null; continue; }
      if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new simulationError(`Giá trị ${key} phải từ ${min} đến ${max}.`);
      if (["dayAfterSowing","exposureDays"].includes(key) && !Number.isInteger(value)) throw new simulationError(`${key} phải là số nguyên.`);
      result[key] = value;
    }
    if (payload.varietyId !== "OM5451") throw new simulationError("Hiện chỉ có bằng chứng cho OM5451.");
    if (!catalog.locations.some(item => item.id === payload.locationId)) throw new simulationError("Địa điểm chưa được hỗ trợ.");
    if (!Object.hasOwn(this.stages, payload.stage)) throw new simulationError("Hãy xác nhận giai đoạn sinh trưởng.");
    if (!["fieldWater","canalWater"].includes(payload.salinitySite)) throw new simulationError("Cần xác định nơi đo độ mặn.");
    for (const key of ["ecIsSeasonAverage","useWeather","requestAi"]) {
      if (typeof payload[key] !== "boolean") throw new simulationError(`${key} phải là đúng/sai.`);
      result[key] = payload[key];
    }
    for (const key of ["varietyId","locationId","stage","salinitySite"]) result[key] = payload[key];
    return result;
  }
}
