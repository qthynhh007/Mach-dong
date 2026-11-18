import {simulationError} from "./model.mjs";

export class weatherClient {
  constructor(catalog, fetcher = fetch) {
    this.catalog = catalog;
    // Workers fetch cannot be called with a client instance as its receiver.
    this.fetcher = (...args) => fetcher(...args);
  }
  async forecast(locationId) {
    const location = this.catalog.locations.find(item => item.id === locationId);
    if (!location) throw new simulationError("Địa điểm không hợp lệ.");
    const query = new URLSearchParams({latitude:location.latitude,longitude:location.longitude,
      daily:"temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,shortwave_radiation_sum",
      timezone:"Asia/Bangkok",forecast_days:"7"});
    const sourceUrl = `https://api.open-meteo.com/v1/forecast?${query}`;
    const response = await this.fetcher(sourceUrl,{signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new simulationError("Nguồn thời tiết tạm không phản hồi. Hãy dùng kịch bản nhập tay hoặc thử lại.",503);
    const payload = await response.json();
    const units = payload.daily_units;
    const expected = {temperature_2m_max:"°C",temperature_2m_min:"°C",precipitation_sum:"mm",et0_fao_evapotranspiration:"mm",shortwave_radiation_sum:"MJ/m²"};
    if (!units || Object.entries(expected).some(([key,value]) => units[key] !== value) || !Array.isArray(payload.daily?.time)) throw new simulationError("Nguồn thời tiết thay đổi định dạng hoặc đơn vị.",502);
    const daily = payload.daily;
    const numeric = (key,index) => Number.isFinite(daily[key]?.[index]) ? daily[key][index] : null;
    const rows = daily.time.map((date,index) => ({date,tempMaxC:numeric("temperature_2m_max",index),
      tempMinC:numeric("temperature_2m_min",index),rainMm:numeric("precipitation_sum",index),
      et0Mm:numeric("et0_fao_evapotranspiration",index),solarMjM2:numeric("shortwave_radiation_sum",index)}));
    if (!rows.length || rows.some(row => !/^\d{4}-\d{2}-\d{2}$/.test(row.date))) throw new simulationError("Thiếu chuỗi dự báo hợp lệ.",502);
    return {locationId,sourceId:"open-meteo",sourceUrl,retrievedAt:new Date().toISOString(),kind:"forecast",timezone:"Asia/Bangkok",license:"CC BY 4.0; Open-Meteo, API phi thương mại",units:{tempMaxC:"°C",tempMinC:"°C",rainMm:"mm",et0Mm:"mm",solarMjM2:"MJ/m²"},rows};
  }
}
