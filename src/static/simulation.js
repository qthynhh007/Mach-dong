class simulationApi {
  async request(path, payload, signal) {
    const response = await fetch(path, {method:payload ? "POST" : "GET",headers:{"Content-Type":"application/json"},body:payload ? JSON.stringify(payload) : undefined,signal});
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || "Chưa tải được dữ liệu.");
    return result.data;
  }
}

class simulationView {
  constructor() {
    this.api = new simulationApi(); this.form = document.getElementById("scenarioForm"); this.result = null; this.catalog = null; this.activeRequest = null;
    this.weatherRequest = null; this.revision = 0;
    this.byId("scenarioForm").addEventListener("submit", event => { event.preventDefault(); this.run(false); });
    this.byId("askAi").addEventListener("click", () => this.run(true));
    this.form.addEventListener("input", () => this.invalidate());
    this.byId("resetScenario").addEventListener("click", () => { this.form.reset(); this.invalidate(); });
    this.byId("loadWeather").addEventListener("click", () => this.loadWeather());
    this.byId("downloadReport").addEventListener("click", () => this.download());
    document.querySelectorAll("[data-panel]").forEach(button => button.addEventListener("click", () => this.showPanel(button.dataset.panel)));
    this.drawField(); this.updateLabels(); this.loadCatalog();
  }
  byId(id) { return document.getElementById(id); }
  number(value) { return value === null || value === undefined ? "Chưa có" : Number(value).toLocaleString("vi-VN",{maximumFractionDigits:2}); }
  setText(id, value) { this.byId(id).textContent = value; }
  status(message, error = false) { this.setText("pageStatus",message); this.byId("pageStatus").classList.toggle("is-error",error); }
  field(name) { return this.form.elements.namedItem(name); }
  inputs(requestAi) {
    const values = {varietyId:"OM5451",requestAi};
    for (const name of ["locationId","stage","salinitySite"]) values[name] = this.field(name).value;
    for (const name of ["dayAfterSowing","exposureDays","salinityGl","waterDepthCm","tempMaxC","plantHeightCm","rootZoneEcDsM"]) values[name] = this.field(name).value === "" ? null : Number(this.field(name).value);
    for (const name of ["ecIsSeasonAverage","useWeather"]) values[name] = this.field(name).checked;
    return values;
  }
  updateLabels() {
    this.setText("salinityLabel",this.number(this.field("salinityGl").value)+" g/L");
    this.setText("waterLabel",this.number(this.field("waterDepthCm").value)+" cm");
    this.setText("temperatureLabel",this.number(this.field("tempMaxC").value)+"°C");
    this.field("tempMaxC").disabled = this.field("useWeather").checked;
  }
  setBusy(busy) {
    this.byId("runSimulation").disabled = busy || !this.catalog;
    this.byId("askAi").disabled = busy || !this.catalog;
    this.setText("runSimulation",busy ? "Đang mô phỏng…" : "Mô phỏng kịch bản");
  }
  invalidate() {
    this.revision++; this.activeRequest?.abort(); this.weatherRequest?.abort(); this.result = null;
    this.setBusy(false); this.updateLabels(); this.byId("downloadReport").disabled = true;
    this.setText("relativeYield","Chưa có kết quả"); this.setText("riskSummary","Kịch bản đã thay đổi");
    this.setText("sceneLabel","Chưa chạy kịch bản mới"); this.setText("assistantAdvice","Chạy lại mô phỏng để lấy kết quả ứng với điều kiện mới.");
    this.setText("aiStatus","Chưa yêu cầu AI cho kịch bản mới."); this.setText("reportMeta","Điều kiện đã thay đổi. Chạy lại để xem báo cáo mới.");
    for (const id of ["evidenceList","scenarioRows","assumptionsList","weatherRows"]) this.byId(id).replaceChildren();
    this.byId("experimentBox").hidden = true; this.setText("weatherMeta","");
    this.paintField(null); this.status("Điều kiện đã thay đổi. Nhấn Mô phỏng kịch bản.");
  }
  async loadCatalog() {
    try {
      this.catalog = await this.api.request("/api/simulation/catalog");
      const select = this.byId("locationId"); select.replaceChildren();
      for (const location of this.catalog.locations) select.add(new Option(location.name,location.id));
      select.disabled = false; this.byId("loadWeather").disabled = false; this.setBusy(false);
      this.setText("cloudStatus","Dữ liệu trực tuyến · "+this.catalog.reviewedAt);
      this.setText("varietyInfo",`${this.catalog.varieties[0].name} · ${this.catalog.varieties[0].pedigree}. ${this.catalog.varieties[0].note}`);
      this.renderSources();
      const history = this.catalog.history;
      this.setText("historyMeta",`${this.number(history.rowCount)} dòng tại ${this.catalog.locations.length} địa điểm, năm ${history.year}. Phiên bản ${history.version}; thu thập ${history.retrievedAt}. Đây là dữ liệu khí tượng, chưa có nhãn năng suất/thất thoát để huấn luyện AI dự báo OM5451.`);
      const link = this.byId("downloadHistory"); link.href = "/api/simulation/history"; link.hidden = false;
      this.status("Đã tải dữ liệu có nguồn. Chọn điều kiện và chạy kịch bản.");
    } catch (error) { this.setText("cloudStatus","Chưa kết nối được"); this.status(error.message+" Tải lại trang để thử lại.",true); }
  }
  async run(requestAi) {
    if (!this.form.reportValidity()) return;
    this.invalidate();
    this.activeRequest?.abort(); const controller = new AbortController(); this.activeRequest = controller;
    const revision = this.revision; this.setBusy(true); this.status("Máy chủ đang tính kịch bản và đối chiếu nguồn…");
    try {
      const result = await this.api.request("/api/simulation",this.inputs(requestAi),controller.signal);
      if (controller.signal.aborted || revision !== this.revision) return;
      this.result = result; this.renderResult(); this.status("Đã tính xong. Xem Báo cáo & nguồn để kiểm tra từng kết luận.");
    } catch (error) {
      if (error.name !== "AbortError") { this.result = null; this.byId("downloadReport").disabled = true; this.status(error.message,true); }
    } finally { if (this.activeRequest === controller) this.setBusy(false); }
  }
  renderResult() {
    const result = this.result; const metric = result.metrics.relativeYieldReferencePct;
    this.setText("relativeYield",metric === null ? "Chưa đủ điều kiện tính" : `${this.number(metric)}% so với đối chứng`);
    const warnings = result.evidence.filter(item => item.level === "caution");
    this.setText("riskSummary",warnings.length ? `${warnings.length} điều kiện cần chú ý` : "Chưa thấy cảnh báo đã định nghĩa");
    this.setText("sceneLabel",`${result.stage} · Kịch bản ${result.inputs.exposureDays} ngày`);
    this.setText("assistantAdvice",warnings.length ? warnings.map(item => item.title).join(". ")+". Xem nguồn và giới hạn trong báo cáo." : "Chưa đủ căn cứ để kết luận cây an toàn hoặc dự đoán năng suất thực địa. Báo cáo ghi rõ những gì tính được và dữ liệu còn thiếu.");
    this.setText("aiStatus",result.ai.message);
    this.setText("reportMeta",`${result.engineVersion} · ${result.dataVersion} · OM5451 · Giai đoạn ${result.stage} · Mô phỏng tham chiếu, chưa kiểm định ngoài đồng.`);
    const list = this.byId("evidenceList"); list.replaceChildren();
    for (const item of result.evidence) {
      const article = document.createElement("article"); article.className = "sim-evidence "+item.level;
      const heading = document.createElement("h3"); heading.textContent = item.title+(result.ai.priorityEvidenceIds?.includes(item.id) ? " · AI chọn lưu ý" : ""); article.append(heading);
      const body = document.createElement("p"); body.textContent = item.description; article.append(body);
      for (const id of item.sourceIds) { const source = result.sources.find(source => source.id === id); if (source) article.append(this.sourceLink(source)); }
      list.append(article);
    }
    this.rows("scenarioRows",result.dailyScenario.map(row => [row.date || "Ngày "+row.scenarioDay,this.number(row.tempMaxC),this.number(row.rainMm),this.number(row.et0Mm),row.heatConcern === null ? "Thiếu dữ liệu" : row.heatConcern ? "Cần theo dõi" : "Chưa kích hoạt"]));
    const assumptions = this.byId("assumptionsList"); assumptions.replaceChildren();
    for (const text of [...result.assumptions,...result.missingInputs.map(item => "Cần bổ sung: "+item.title),...result.limitations]) { const li = document.createElement("li"); li.textContent = text; assumptions.append(li); }
    this.renderExperiment(result.experiment); this.paintField(result.scene); this.byId("downloadReport").disabled = false;
  }
  sourceLink(source) {
    const link = document.createElement("a"); link.textContent = source.title+" ↗ ";
    try { const url = new URL(source.url); if (url.protocol === "https:") { link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer"; } } catch { /* Invalid source URLs stay as plain text. */ }
    return link;
  }
  renderSources() {
    const target = this.byId("sourceList"); target.replaceChildren();
    for (const source of this.catalog.sources) {
      const article = document.createElement("article"); article.append(this.sourceLink(source));
      const description = document.createElement("p"); description.textContent = source.use; article.append(description);
      const note = document.createElement("small"); note.textContent = source.license; article.append(note); target.append(article);
    }
  }
  renderExperiment(experiment) {
    const target = this.byId("experimentBox"); target.replaceChildren(); target.hidden = !experiment;
    if (!experiment) return;
    const heading = document.createElement("h3"); heading.textContent = "Đối chiếu thí nghiệm mạ OM5451 (không phải kết quả ruộng của bạn)"; target.append(heading);
    const table = document.createElement("table"); const header = table.createTHead().insertRow();
    for (const text of ["Nghiệm thức ‰","Chiều cao cm","Rễ cm","Tỷ phần lá cháy"]) { const th = document.createElement("th"); th.textContent = text; header.append(th); }
    const body = table.createTBody();
    for (const row of experiment.rows) { const tr = body.insertRow(); for (const value of [row.salinityTreatment,row.plantHeightCm,row.rootLengthCm,row.scorchedLeafFraction]) tr.insertCell().textContent = this.number(value); }
    const wrap = document.createElement("div"); wrap.className = "sim-table-wrap"; wrap.append(table); target.append(wrap);
    for (const text of experiment.caveats) { const p = document.createElement("p"); p.textContent = text; target.append(p); }
  }
  rows(id, rows) { const body = this.byId(id); body.replaceChildren(); for (const row of rows) { const tr = document.createElement("tr"); for (const value of row) { const td = document.createElement("td"); td.textContent = value; tr.append(td); } body.append(tr); } }
  async loadWeather() {
    this.weatherRequest?.abort(); const controller = new AbortController(); this.weatherRequest = controller;
    this.setText("weatherMeta","Đang lấy dự báo mới từ máy chủ…");
    try {
      const result = await this.api.request("/api/simulation/weather?locationId="+encodeURIComponent(this.field("locationId").value),null,controller.signal);
      if (controller.signal.aborted) return;
      this.rows("weatherRows",result.rows.map(row => [row.date,...[row.tempMinC,row.tempMaxC,row.rainMm,row.et0Mm,row.solarMjM2].map(value => this.number(value))]));
      this.setText("weatherMeta",`Open-Meteo · Dự báo ô lưới · ${result.locationId} · Cập nhật ${result.retrievedAt} · CC BY 4.0`);
    } catch (error) { if (error.name !== "AbortError") { this.byId("weatherRows").replaceChildren(); this.setText("weatherMeta",error.message); } }
  }
  showPanel(id) { for (const button of document.querySelectorAll("[data-panel]")) { const selected = button.dataset.panel === id; button.setAttribute("aria-pressed",String(selected)); this.byId(button.dataset.panel).hidden = !selected; } }
  drawField() {
    const target = this.byId("ricePlants");
    for (let row=0; row<4; row++) for (let col=0; col<10; col++) { const plant = document.createElementNS("http://www.w3.org/2000/svg","use"); plant.setAttribute("href","#ricePlant"); plant.setAttribute("transform",`translate(${180+col*55+row*26},${205+row*23-col*3}) scale(${.6+row*.1})`); target.append(plant); }
  }
  paintField(scene) { this.byId("ricePlants").setAttribute("color",scene?.heatConcern || scene?.saltReferenceConcern ? "#a29043" : "#52864b"); this.byId("floodOverlay").setAttribute("opacity",scene?.submerged ? ".55" : "0"); this.byId("fieldSun").setAttribute("fill",scene?.heatConcern ? "#e9a15a" : "#edcf78"); }
  download() { if (!this.result) return; const url = URL.createObjectURL(new Blob([JSON.stringify(this.result,null,2)],{type:"application/json"})); const link = document.createElement("a"); link.href = url; link.download = "MachDong-Simulation.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
}
new simulationView();
