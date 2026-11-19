class simulationApi {
  async request(path, payload, signal) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); },45000);
    signal?.addEventListener("abort",cancel,{once:true});
    if (signal?.aborted) cancel();
    try {
      const response = await fetch(path, {method:payload ? "POST" : "GET",headers:{"Content-Type":"application/json","X-CSRF-Token":globalThis.document?.querySelector('meta[name="csrf-token"]')?.content || ""},body:payload ? JSON.stringify(payload) : undefined,signal:controller.signal,cache:"no-store"});
      let result;
      try { result = await response.json(); }
      catch { throw new Error(`Máy chủ không trả dữ liệu hợp lệ (HTTP ${response.status}). Hãy mở lại ứng dụng hoặc thử lại.`); }
      if (!response.ok || result?.error) throw new Error(result?.error || "Chưa tải được dữ liệu.");
      if (!result?.data || typeof result.data !== "object") throw new Error("Máy chủ trả kết quả rỗng. Hãy thử lại.");
      return result.data;
    } catch (error) {
      if (timedOut) throw new Error("Máy chủ phản hồi quá lâu. Kiểm tra Internet rồi thử lại; chưa có báo cáo cho lần chạy này.");
      if (error instanceof TypeError) throw new Error("Mất kết nối ứng dụng hoặc máy chủ. Hãy mở lại ứng dụng và thử lại.");
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener("abort",cancel); }
  }
}

class simulationView {
  constructor() {
    this.api = new simulationApi(); this.form = document.getElementById("scenarioForm"); this.result = null; this.catalog = null; this.activeRequest = null;
    this.fieldPreview = this.form.hasAttribute("data-field-preview");
    this.weatherRequest = null; this.revision = 0;
    this.byId("scenarioForm").addEventListener("submit", event => { event.preventDefault(); this.run(false); });
    this.byId("askAi").addEventListener("click", () => this.run(true));
    this.byId("explainReport").addEventListener("click", () => this.explainReport());
    this.form.addEventListener("input", () => this.invalidate());
    this.form.addEventListener("invalid", () => this.status("Có điều kiện chưa hợp lệ. Hãy sửa ô được đánh dấu rồi chạy lại.",true),true);
    const reset = this.byId(this.fieldPreview ? "btnReset" : "resetScenario");
    reset.addEventListener("click", () => { this.form.reset(); this.invalidate(); });
    this.byId("loadWeather").addEventListener("click", () => this.loadWeather());
    this.byId("downloadReport").addEventListener("click", () => this.download());
    this.byId("retryCatalog").addEventListener("click", () => this.loadCatalog());
    this.byId("editScenario").addEventListener("click", () => { this.showPanel("scenarioPanel"); this.byId("runSimulation").focus(); });
    this.tabs = [...document.querySelectorAll(".sim-tabs [role=tab]")];
    this.initialTab = this.tabs.find(tab => tab.getAttribute("aria-selected") === "true");
    this.tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => this.showPanel(tab.dataset.panel));
      tab.addEventListener("keydown", event => {
        const last = this.tabs.length - 1;
        const target = {ArrowLeft: index === 0 ? last : index - 1,
          ArrowRight: index === last ? 0 : index + 1, Home: 0, End: last}[event.key];
        if (target === undefined) return;
        event.preventDefault();
        this.tabs[target].focus();
        this.showPanel(this.tabs[target].dataset.panel);
      });
    });
    window.addEventListener("popstate", () => {
      const key = new URL(location.href).searchParams.get("tab");
      const tab = this.tabs.find(item => item.dataset.tab === key) || this.initialTab;
      this.showPanel(tab.dataset.panel, false);
    });
    if (!this.fieldPreview) this.drawField();
    this.updateLabels(); this.loadCatalog();
  }
  byId(id) { return document.getElementById(id); }
  number(value) { return value === null || value === undefined ? "Chưa có" : Number(value).toLocaleString("vi-VN",{maximumFractionDigits:2}); }
  setText(id, value) { this.byId(id).textContent = value; }
  status(message, error = false) {
    for (const id of ["pageStatus","formStatus"]) {
      const target = this.byId(id);
      if (!target) continue;
      if (target.textContent !== message) target.textContent = message;
      target.classList.toggle("is-error", error);
    }
  }
  field(name) { return this.form.elements.namedItem(name); }
  inputs(requestAi) {
    const values = {varietyId:"OM5451",requestAi};
    for (const name of ["locationId","stage","salinitySite"]) values[name] = this.field(name).value;
    for (const name of ["dayAfterSowing","exposureDays","salinityGl","waterDepthCm","tempMaxC","plantHeightCm","rootZoneEcDsM"]) values[name] = this.field(name).value === "" ? null : Number(this.field(name).value);
    for (const name of ["ecIsSeasonAverage","useWeather"]) values[name] = this.field(name).checked;
    if (this.fieldPreview) {
      values.waterDepthCm = Math.max(0, values.waterDepthCm);
      if (values.salinitySite === "canalWater") {
        values.salinityGl = this.field("canalSalinityGl").valueAsNumber;
      }
      if (!values.stage) {
        const stage = Array.from(this.field("stage").options).find(
          option => option.value && values.dayAfterSowing <= Number(option.dataset.throughDay)
        );
        values.stage = stage.value;
      }
    }
    return values;
  }
  updateLabels() {
    if (this.fieldPreview) {
      const usesCanalWater = this.field("salinitySite").value === "canalWater";
      this.byId("sim-canal-salinity").hidden = !usesCanalWater;
      this.field("canalSalinityGl").disabled = !usesCanalWater;
      return;
    }
    this.setText("salinityLabel",this.number(this.field("salinityGl").value)+" g/L");
    this.setText("waterLabel",this.number(this.field("waterDepthCm").value)+" cm");
    this.setText("temperatureLabel",this.number(this.field("tempMaxC").value)+"°C");
    this.field("tempMaxC").disabled = this.field("useWeather").checked;
  }
  setBusy(busy) {
    this.byId("runSimulation").disabled = busy || !this.catalog;
    this.byId("askAi").disabled = busy || !this.catalog;
    this.setText("runSimulation",busy ? "Đang mô phỏng…" : "Mô phỏng và xem báo cáo");
  }
  invalidate() {
    this.revision++; this.activeRequest?.abort(); this.weatherRequest?.abort(); this.result = null;
    this.setBusy(false); this.updateLabels(); this.byId("downloadReport").disabled = true;
    this.setText("relativeYield","Chưa có kết quả"); this.setText("riskSummary","Kịch bản đã thay đổi");
    if (!this.fieldPreview) {
      this.setText("sceneLabel","Chưa chạy kịch bản mới"); this.setText("assistantAdvice","Chạy lại mô phỏng để lấy kết quả ứng với điều kiện mới.");
      this.setText("aiStatus","Chưa yêu cầu AI cho kịch bản mới.");
    }
    this.setText("reportMeta","Điều kiện đã thay đổi. Chạy lại để xem báo cáo mới.");
    this.setText("reportSummary","Chưa có báo cáo cho điều kiện mới."); this.setText("reportAiStatus","");
    this.byId("reportAdvice").hidden = true;
    for (const id of ["evidenceList","scenarioRows","assumptionsList","weatherRows"]) this.byId(id).replaceChildren();
    this.byId("experimentBox").hidden = true; this.setText("weatherMeta","Tải dự báo để xem số liệu từng ngày tại địa điểm đã chọn.");
    if (!this.fieldPreview) this.paintField(null);
    if (this.catalog) this.status("Điều kiện đã thay đổi. Chạy lại để xem báo cáo mới.");
  }
  async loadCatalog() {
    this.byId("retryCatalog").hidden = true;
    this.status("Đang kết nối máy chủ dữ liệu…");
    try {
      this.catalog = await this.api.request("/api/simulation/catalog");
      const select = this.byId("locationId"); select.replaceChildren();
      for (const location of this.catalog.locations) select.add(new Option(location.name,location.id));
      select.disabled = false; this.byId("loadWeather").disabled = false; this.setBusy(false);
      const source = this.catalog.localService ? "Máy chủ cục bộ" : "Dữ liệu trực tuyến";
      this.setText("cloudStatus",source+" · "+this.catalog.reviewedAt);
      this.setText("varietyInfo",`${this.catalog.varieties[0].name} · ${this.catalog.varieties[0].pedigree}. ${this.catalog.varieties[0].note}`);
      this.renderSources();
      const history = this.catalog.history;
      this.setText("historyMeta",`${this.number(history.rowCount)} dòng tại ${this.catalog.locations.length} địa điểm, năm ${history.year}. Phiên bản ${history.version}; thu thập ${history.retrievedAt}. Đây là dữ liệu khí tượng, chưa có nhãn năng suất/thất thoát để huấn luyện AI dự báo OM5451.`);
      const link = this.byId("downloadHistory"); link.href = "/api/simulation/history"; link.hidden = false;
      this.status("Đã tải dữ liệu có nguồn. Chọn điều kiện và chạy kịch bản.");
    } catch (error) { this.catalog = null; this.setBusy(false); this.byId("retryCatalog").hidden = false; this.setText("cloudStatus","Chưa kết nối được"); this.status(error.message,true); }
  }
  async run(requestAi) {
    if (!this.form.reportValidity()) { this.status("Có điều kiện chưa hợp lệ. Hãy sửa ô được đánh dấu rồi chạy lại.",true); return; }
    this.invalidate();
    this.activeRequest?.abort(); const controller = new AbortController(); this.activeRequest = controller;
    const revision = this.revision; this.setBusy(true); this.status("Máy chủ đang tính kịch bản và đối chiếu nguồn…");
    try {
      const result = await this.api.request("/api/simulation",this.inputs(requestAi),controller.signal);
      if (controller.signal.aborted || revision !== this.revision) return;
      this.result = result; this.renderResult(); this.status("Đã tạo báo cáo cho điều kiện bạn vừa nhập.");
      this.showPanel("reportPanel");
      this.byId("reportTitle").focus({preventScroll:true});
      this.byId("reportPanel").scrollIntoView({block:"start"});
    } catch (error) {
      if (error.name !== "AbortError") { this.result = null; this.byId("downloadReport").disabled = true; this.status(error.message,true); }
    } finally { if (this.activeRequest === controller) this.setBusy(false); }
  }
  renderResult() {
    const result = this.result; const metric = result.metrics.relativeYieldReferencePct;
    this.byId("explainReport").disabled = false;
    this.setText("reportExplanationStatus","");
    this.setText("reportExplanation","");
    this.setText("relativeYield",metric === null ? "Chưa đủ điều kiện tính" : `${this.number(metric)}% so với đối chứng`);
    const warnings = result.evidence.filter(item => item.level === "caution");
    this.setText("riskSummary",warnings.length ? `${warnings.length} điều kiện cần chú ý` : "Chưa thấy cảnh báo đã định nghĩa");
    if (!this.fieldPreview) {
      this.setText("sceneLabel",`${result.stage} · Kịch bản ${result.inputs.exposureDays} ngày`);
      this.setText("assistantAdvice",result.fieldAdvice?.[0]?.body || "Xem bằng chứng và các điều kiện cần kiểm tra trong báo cáo.");
      this.setText("aiStatus",result.ai.message);
    }
    this.setText("reportAiStatus",result.ai.message);
    const advice = result.fieldAdvice || [];
    this.byId("reportAdvice").hidden = advice.length === 0;
    this.byId("reportAdviceSteps").replaceChildren(...advice.map(step => {
      const detail = document.createElement("details");
      detail.className = "field-check";
      const title = document.createElement("summary");
      const body = document.createElement("p");
      title.textContent = step.title;
      body.textContent = step.body;
      detail.append(title, body);
      return detail;
    }));
    this.setText("reportSummary",`Đã tính ${result.dailyScenario.length} ngày kịch bản. ${warnings.length ? warnings.length+" điều kiện cần chú ý." : "Chưa kích hoạt cảnh báo trong phạm vi mô hình."} ${metric === null ? "Chưa đủ điều kiện để tính năng suất tương đối do mặn; báo cáo vẫn có đối chiếu nhiệt độ, nước và nguồn dữ liệu." : "Năng suất tương đối tham chiếu do mặn: "+this.number(metric)+"% so với đối chứng."}`);
    this.setText("reportMeta",`${result.engineVersion} · ${result.dataVersion} · OM5451 · Giai đoạn ${result.stage} · Mô phỏng tham chiếu, chưa kiểm định ngoài đồng.`);
    const list = this.byId("evidenceList"); list.replaceChildren();
    this.setText("evidenceCount",String(result.evidence.length));
    for (const item of result.evidence) {
      const article = document.createElement("details"); article.className = "sim-evidence field-check "+item.level;
      const heading = document.createElement("summary"); heading.textContent = item.title+(result.ai.priorityEvidenceIds?.includes(item.id) ? " · AI chọn lưu ý" : ""); article.append(heading);
      const body = document.createElement("p"); body.textContent = item.description; article.append(body);
      for (const id of item.sourceIds) { const source = result.sources.find(source => source.id === id); if (source) article.append(this.sourceLink(source)); }
      list.append(article);
    }
    this.rows("scenarioRows",result.dailyScenario.map(row => [row.date || "Ngày "+row.scenarioDay,this.number(row.tempMaxC),this.number(row.rainMm),this.number(row.et0Mm),row.heatConcern === null ? "Thiếu dữ liệu" : row.heatConcern ? "Cần theo dõi" : "Chưa kích hoạt"]));
    const assumptions = this.byId("assumptionsList"); assumptions.replaceChildren();
    for (const text of [...result.assumptions,...result.missingInputs.map(item => "Cần bổ sung: "+item.title),...result.limitations]) { const li = document.createElement("li"); li.textContent = text; assumptions.append(li); }
    this.renderExperiment(result.experiment);
    if (!this.fieldPreview) this.paintField(result.scene);
    this.byId("downloadReport").disabled = false;
  }
  async explainReport() {
    const result = this.result;
    if (!result) return;
    const button = this.byId("explainReport");
    button.disabled = true;
    this.setText("reportExplanationStatus","Đang hỏi Gemini về kịch bản này…");
    try {
      const answer = await this.api.request("/api/simulation/advice",this.inputs(false));
      if (this.result !== result) return;
      this.setText("reportExplanationStatus",answer.status);
      this.setText("reportExplanation",answer.mode === "gemini" ? answer.text : "");
    } catch (error) {
      if (this.result === result) this.setText("reportExplanationStatus",error.message);
    } finally {
      if (this.result === result) button.disabled = false;
    }
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
    const heading = document.createElement("summary"); heading.textContent = "Đối chiếu với thí nghiệm mạ OM5451"; target.append(heading);
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
    const meta = this.byId("weatherMeta");
    meta.className = "is-loading";
    meta.textContent = "Đang lấy dự báo mới từ máy chủ…";
    try {
      const locId = this.field("locationId") ? this.field("locationId").value : "can-tho";
      const result = await this.api.request("/api/simulation/weather?locationId="+encodeURIComponent(locId),null,controller.signal);
      if (controller.signal.aborted) return;
      this.rows("weatherRows",result.rows.map(row => [row.date,...[row.tempMinC,row.tempMaxC,row.rainMm,row.et0Mm,row.solarMjM2].map(value => this.number(value))]));
      meta.className = "is-success";
      this.weatherLoaded = true;
      const isSample = result.sourceId === "weather-history-sample";
      const badge = isSample ? "Dữ liệu mẫu tham khảo (ngoại tuyến)" : "Open-Meteo · Dự báo ô lưới";
      const updatedTime = result.retrievedAt ? new Date(result.retrievedAt).toLocaleDateString("vi-VN") : "";
      meta.textContent = `${badge} · ${result.locationId} ${updatedTime ? '· Cập nhật ' + updatedTime : ''} · ${result.license || 'CC BY 4.0'}`;
    } catch (error) {
      if (error.name !== "AbortError") {
        this.byId("weatherRows").replaceChildren();
        meta.className = "is-error";
        meta.textContent = error.message;
      }
    }
  }
  showPanel(id, updateUrl = true) {
    const tab = this.tabs.find(button => button.dataset.panel === id);
    const focusedPanel = document.activeElement?.closest("[role=tabpanel]");
    for (const button of this.tabs) {
      const selected = button === tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      this.byId(button.dataset.panel).hidden = !selected;
    }
    if (focusedPanel?.hidden) tab.focus({preventScroll: true});
    if (id === "weatherPanel" && !this.weatherLoaded && this.catalog) {
      this.loadWeather();
    }
    if (!updateUrl) return;
    const url = new URL(location.href);
    if (url.searchParams.get("tab") === tab.dataset.tab) return;
    url.searchParams.set("tab", tab.dataset.tab);
    history.pushState(null, "", url);
  }
  drawField() {
    const target = this.byId("ricePlants");
    for (let row=0; row<4; row++) for (let col=0; col<10; col++) { const plant = document.createElementNS("http://www.w3.org/2000/svg","use"); plant.setAttribute("href","#ricePlant"); plant.setAttribute("transform",`translate(${180+col*55+row*26},${205+row*23-col*3}) scale(${.6+row*.1})`); target.append(plant); }
  }
  paintField(scene) { this.byId("ricePlants").setAttribute("color",scene?.heatConcern || scene?.saltReferenceConcern ? "#a29043" : "#52864b"); this.byId("floodOverlay").setAttribute("opacity",scene?.submerged ? ".55" : "0"); this.byId("fieldSun").setAttribute("fill",scene?.heatConcern ? "#e9a15a" : "#edcf78"); }
  download() { if (!this.result) return; const url = URL.createObjectURL(new Blob([JSON.stringify(this.result,null,2)],{type:"application/json"})); const link = document.createElement("a"); link.href = url; link.download = "MachDong-Simulation.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
}
if (typeof document !== "undefined") new simulationView();
