class adviceWaitController {
  constructor(onTick,onFallback,{now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}={}) {
    Object.assign(this,{onTick,onFallback,now,schedule,cancel,startedAt:null,timer:null});
  }
  start() { if(this.startedAt !== null) return; this.startedAt=this.now(); this.tick(); }
  tick() {
    if(this.startedAt === null) return;
    const elapsed=this.now()-this.startedAt;
    if(elapsed >= 270000) { this.stop(); this.onFallback(); return; }
    this.onTick(Math.floor(elapsed/1000));
    this.timer=this.schedule(()=>this.tick(),Math.min(1000,270000-elapsed));
  }
  stop() { if(this.timer !== null) this.cancel(this.timer); this.timer=null; this.startedAt=null; }
}

class simulationApi {
  async request(path, payload, signal) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); },path === "/api/simulation/advice" ? 270000 : 45000);
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
    this.adviceAnswer=null; this.adviceError=null;
    document.addEventListener("simulationAdviceOpen",()=>this.explainReport(true));
    document.querySelectorAll("[data-cancel-advice]").forEach(button=>button.addEventListener("click",()=>this.cancelAdvice()));
    this.byId("scenarioForm").addEventListener("submit", event => { event.preventDefault(); this.run(false); });
    this.byId("askAi").addEventListener("click", async () => {
      if (!this.result) await this.run(false);
      if (this.result) await this.explainReport();
    });
    this.byId("explainReport").addEventListener("click", () => this.explainReport());
    this.form.addEventListener("input", event => {
      if (event.target.name === "locationId" && this.byId("weatherLocation")) this.byId("weatherLocation").value = event.target.value;
      this.invalidate();
    });
    this.form.addEventListener("invalid", () => this.status("Có điều kiện chưa hợp lệ. Hãy sửa ô được đánh dấu rồi chạy lại.",true),true);
    const reset = this.byId(this.fieldPreview ? "btnReset" : "resetScenario");
    reset.addEventListener("click", () => { this.form.reset(); this.invalidate(); });
    this.byId("loadWeather").addEventListener("click", () => this.loadWeather());
    this.byId("weatherLocation")?.addEventListener("change", () => {
      this.field("locationId").value = this.byId("weatherLocation").value;
      this.invalidate(); this.loadWeather();
    });
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
    if (!this.fieldPreview && this.byId("ricePlants")) this.drawField();
    this.updateLabels(); this.loadCatalog();
  }
  byId(id) { return document.getElementById(id); }
  number(value) { return value === null || value === undefined ? "Chưa có" : Number(value).toLocaleString("vi-VN",{maximumFractionDigits:2}); }
  setText(id, value) { const element = this.byId(id); if (element) element.textContent = value; }
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
    this.weatherLoaded = false;
    this.revision++; this.activeRequest?.abort(); this.weatherRequest?.abort(); this.result = null;
    this.adviceRequest?.abort(); this.adviceRequest=null;
    this.adviceWait?.stop(); this.adviceAnswer=null; this.adviceError=null;
    this.byId("reportAdviceCard").setAttribute("aria-busy","false");
    this.byId("reportAdviceCard").classList.remove("is-error","is-fallback");
    this.byId("reportAdviceWait").hidden=true; this.byId("reportAdviceCancel").hidden=true;
    this.setBusy(false); this.updateLabels(); this.byId("downloadReport").disabled = true;
    this.setText("relativeYield","Chưa có kết quả"); this.setText("riskSummary","Kịch bản đã thay đổi");
    if (!this.fieldPreview) {
      this.setText("sceneLabel","Chưa chạy kịch bản mới"); this.setText("assistantAdvice","Chạy lại mô phỏng để lấy kết quả ứng với điều kiện mới.");
      this.setText("aiStatus","Chưa có tư vấn cho điều kiện mới.");
    }
    this.setText("reportMeta","Điều kiện đã thay đổi. Chạy lại để xem báo cáo mới.");
    this.setText("reportSummary","Chưa có báo cáo cho điều kiện mới."); this.setText("reportAiStatus","");
    this.byId("reportAdvice").hidden = true;
    for (const id of ["evidenceList","scenarioRows","assumptionsList","weatherRows"]) this.byId(id).replaceChildren();
    this.byId("experimentBox").hidden = true; this.setText("weatherMeta","Tải dự báo để xem số liệu từng ngày tại địa điểm đã chọn.");
    this.paintField(null);
    this.byId("explainReport").disabled = true;
    this.setText("reportExplanation", ""); this.setText("reportExplanationStatus", "");
    this.byId("reportAdviceSources")?.replaceChildren();
    this.byId("reportAdviceContext")?.replaceChildren();
    this.byId("reportAdviceSourcesFold").hidden = true;
    document.dispatchEvent(new CustomEvent("simulationAdvice",{detail:null}));
    if (this.catalog) this.status("Điều kiện đã thay đổi. Chạy lại để xem báo cáo mới.");
  }
  async loadCatalog(loadInitialWeather = true) {
    this.byId("retryCatalog").hidden = true;
    this.status("Đang kết nối máy chủ dữ liệu…");
    try {
      this.catalog = await this.api.request("/api/simulation/catalog");
      const select = this.byId("locationId"); select.replaceChildren();
      for (const location of this.catalog.locations) select.add(new Option(location.name,location.id));
      const weatherLocation = this.byId("weatherLocation");
      if (weatherLocation) {
        weatherLocation.replaceChildren();
        for (const location of this.catalog.locations) weatherLocation.add(new Option(location.name,location.id));
        weatherLocation.value = select.value; weatherLocation.disabled = false;
      }
      select.disabled = false; this.byId("loadWeather").disabled = false; this.setBusy(false);
      const source = this.catalog.localService ? "Máy chủ cục bộ" : "Dữ liệu trực tuyến";
      this.setText("cloudStatus",source+" · "+this.catalog.reviewedAt);
      this.setText("varietyInfo",`${this.catalog.varieties[0].name} · ${this.catalog.varieties[0].pedigree}. ${this.catalog.varieties[0].note}`);
      this.renderSources();
      const history = this.catalog.history;
      this.setText("historyMeta",`${this.number(history.rowCount)} dòng tại ${this.catalog.locations.length} địa điểm, năm ${history.year}. Đây là dữ liệu khí tượng tham khảo, không phải kết quả đo năng suất tại ruộng.`);
      const link = this.byId("downloadHistory"); link.href = "/api/simulation/history"; link.hidden = false;
      this.status("Đã tải dữ liệu có nguồn. Chọn điều kiện và chạy kịch bản.");
      if (loadInitialWeather && this.tabs.find(tab=>tab.getAttribute("aria-selected") === "true")?.dataset.panel === "weatherPanel") await this.loadWeather();
    } catch (error) { this.catalog = null; this.setBusy(false); this.byId("retryCatalog").hidden = false; this.setText("cloudStatus","Chưa kết nối được"); this.status(error.message,true); this.setText("weatherMeta",error.message+" Bấm Tải dự báo để thử kết nối lại."); }
    finally { this.byId("loadWeather").disabled = false; }
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
      this.setText("assistantAdvice","Nhờ Cò Mạ tư vấn để nhận đề xuất chăm sóc theo thông số vừa nhập.");
      this.setText("aiStatus","Báo cáo đã sẵn sàng.");
    }
    this.setText("reportAiStatus","Báo cáo đã sẵn sàng. Bà con có thể nhờ Cò Mạ đề xuất cách chăm ruộng.");
    const advice = result.evidence.map(item => ({title:item.title, body:item.description}));
    this.byId("reportAdvice").hidden = false;
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
      const heading = document.createElement("summary"); heading.textContent = item.title+(result.ai.priorityEvidenceIds?.includes(item.id) ? " · Cần chú ý" : ""); article.append(heading);
      const body = document.createElement("p"); body.textContent = item.description; article.append(body);
      for (const id of item.sourceIds) { const source = result.sources.find(source => source.id === id); if (source) article.append(this.sourceLink(source)); }
      list.append(article);
    }
    this.rows("scenarioRows",result.dailyScenario.map(row => [row.date || "Ngày "+row.scenarioDay,this.number(row.tempMaxC),this.number(row.rainMm),this.number(row.et0Mm),row.heatConcern === null ? "Thiếu dữ liệu" : row.heatConcern ? "Cần theo dõi" : "Chưa kích hoạt"]));
    const assumptions = this.byId("assumptionsList"); assumptions.replaceChildren();
    for (const text of [...result.assumptions,...result.missingInputs.map(item => "Cần bổ sung: "+item.title),...result.limitations]) { const li = document.createElement("li"); li.textContent = text; assumptions.append(li); }
    this.renderExperiment(result.experiment);
    this.paintField(result.scene);
    document.dispatchEvent(new CustomEvent("simulationScene", {detail:result}));
    this.byId("explainReport").disabled = false;
    this.byId("downloadReport").disabled = false;
  }
  startAdviceWait(revision) {
    if(!this.adviceWait || this.adviceWait.startedAt === null) {
      this.adviceWait=new adviceWaitController(seconds=>{
        if(revision !== this.revision) return;
        const detail={pending:Boolean(this.adviceRequest),waiting:true,error:this.adviceError,elapsedSeconds:seconds};
        this.updateAdviceWait(detail);
        document.dispatchEvent(new CustomEvent("simulationAdvice",{detail}));
      },()=>{
        if(revision !== this.revision || !this.result || this.adviceAnswer) return;
        this.adviceRequest?.abort(); this.adviceRequest=null;
        this.setAdviceAnswer(this.fallbackAdvice());
      });
      this.adviceWait.start();
    }
  }
  updateAdviceWait(detail) {
    const waiting=this.byId("reportAdviceWait");
    waiting.hidden=false; waiting.classList.toggle("is-paused",Boolean(detail.error));
    waiting.querySelector("strong").textContent=detail.error ? "Chưa hoàn tất tư vấn" : "Đang chuẩn bị lời khuyên";
    this.byId("reportAdviceCancel").hidden=false;
    const seconds=detail.elapsedSeconds || 0;
    this.setText("reportAdviceElapsed",`Đã chờ ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`);
  }
  cancelAdvice() {
    this.adviceRequest?.abort(); this.adviceRequest=null; this.adviceWait?.stop();
    this.adviceError=null;
    this.byId("reportAdviceCard").setAttribute("aria-busy","false");
    this.byId("reportAdviceWait").hidden=true; this.byId("reportAdviceCancel").hidden=true;
    this.byId("explainReport").disabled=!this.result;
    this.setText("reportExplanationStatus","Đã dừng chờ. Bà con có thể yêu cầu tư vấn lại.");
    document.dispatchEvent(new CustomEvent("simulationAdvice",{detail:{cancelled:true}}));
  }
  fallbackAdvice() {
    const result=this.result;
    return {reply:"Phân tích chi tiết đang mất nhiều thời gian hơn dự kiến. Bà con có thể tham khảo tạm thời các bước kiểm tra dưới đây.\n\nĐiều kiện đáng chú ý: "+result.evidence.map(item=>item.title).join("; ")+".\n\nViệc nên làm: 1. Đo lại độ mặn ngay tại ruộng và nguồn nước cấp trước khi quyết định lấy hoặc thay nước. 2. Ghi lại tình trạng lá, bông và chiều cao cây để đối chiếu với độ sâu nước. 3. Trao đổi với cán bộ nông nghiệp khi có dấu hiệu bất thường; chưa tự dùng thuốc hoặc tăng phân từ các thông số mô phỏng.\n\nCần đo thêm: "+(result.missingInputs || []).map(item=>item.title).join("; ")+".\n\nKhi nào cần nhờ cán bộ nông nghiệp: Khi cây héo, cháy lá, bông bất thường hoặc nước cấp đang mặn mà chưa có phương án xử lý phù hợp.",sources:[],inputSnapshot:result.inputs,provider:"Gợi ý tạm thời",isFallback:true,limitation:"Gợi ý tham khảo tạm thời theo thông tin đối chiếu; chưa phải phân tích riêng cho ruộng này."};
  }
  setAdviceAnswer(answer) {
    this.adviceAnswer=answer; this.adviceWait?.stop(); this.adviceError=null;
    this.renderAdvice(answer);
    this.setText("reportAiStatus",answer.isFallback ? "Đang hiển thị gợi ý tham khảo tạm thời." : "Cò Mạ đã chuẩn bị đề xuất cho ruộng của bà con.");
    this.setText("reportExplanationStatus",answer.isFallback ? "Gợi ý tham khảo tạm thời" : "Đề xuất dành cho ruộng của bà con");
    this.setText("reportAdviceLimitation",answer.limitation);
    const target=this.byId("reportAdviceSources"); target.replaceChildren();
    for(const source of answer.sources || []) target.append(this.sourceLink(source));
    this.byId("reportAdviceSourcesFold").hidden=!answer.sources?.length;
    this.setText("reportAdviceSourceCount",String(answer.sources?.length || 0));
    this.byId("reportAdviceCard").classList.toggle("is-fallback",Boolean(answer.isFallback));
    this.byId("reportAdviceCard").classList.remove("is-error");
    this.byId("reportAdviceCard").setAttribute("aria-busy","false");
    this.byId("reportAdviceWait").hidden=true; this.byId("reportAdviceCancel").hidden=true;
    this.byId("explainReport").disabled=false;
    document.dispatchEvent(new CustomEvent("simulationAdvice",{detail:answer}));
  }
  async explainReport(reuse=false) {
    if(reuse && this.adviceAnswer) { document.dispatchEvent(new CustomEvent("simulationAdvice",{detail:this.adviceAnswer})); return; }
    if (!this.result || this.adviceRequest) return;
    const snapshot = {...this.result.inputs};
    const revision = this.revision;
    const controller = new AbortController(); this.adviceRequest = controller;
    this.adviceAnswer=null; this.adviceError=null;
    this.setText("reportExplanation",""); this.byId("reportAdviceSourcesFold").hidden=true;
    this.byId("explainReport").disabled = true;
    this.byId("reportAdviceCard").setAttribute("aria-busy","true");
    this.byId("reportAdviceCard").classList.remove("is-error");
    this.byId("reportAdviceCard").classList.remove("is-fallback");
    this.setText("reportExplanationStatus","Cò Mạ đang phân tích điều kiện và kiểm tra căn cứ…");
    document.dispatchEvent(new CustomEvent("simulationAdvice",{detail:{pending:true,waiting:true,elapsedSeconds:this.adviceWait?.startedAt === null || !this.adviceWait ? 0 : Math.floor((Date.now()-this.adviceWait.startedAt)/1000)}}));
    this.startAdviceWait(revision);
    try {
      const answer = await this.api.request("/api/simulation/advice",snapshot,controller.signal);
      if (controller.signal.aborted || revision !== this.revision) return;
      this.setAdviceAnswer(answer);
    } catch (error) {
      if (error.name !== "AbortError" && !controller.signal.aborted && revision === this.revision) {
        this.adviceError=error.message+" Bà con có thể thử lại hoặc tiếp tục chờ đề xuất.";
        this.setText("reportExplanationStatus",this.adviceError);
        this.byId("reportAdviceCard").classList.add("is-error");
        document.dispatchEvent(new CustomEvent("simulationAdvice",{detail:{waiting:true,error:this.adviceError}}));
      }
    } finally {
      if (this.adviceRequest === controller) {
        this.adviceRequest = null; this.byId("explainReport").disabled = !this.result;
        this.byId("reportAdviceCard").setAttribute("aria-busy","false");
      }
    }
  }
  adviceParts(reply) {
    const text = String(reply || "").trim();
    const markers = [...text.matchAll(/\*{0,2}(Điều kiện đáng chú ý|Việc nên làm|Cần đo thêm|Khi nào cần nhờ cán bộ nông nghiệp)\*{0,2}\s*:\s*\*{0,2}/giu)];
    const parts = [];
    const intro = text.slice(0,markers[0]?.index ?? text.length).trim();
    if (intro) parts.push({heading:"",body:intro});
    markers.forEach((marker,index) => {
      const body = text.slice(marker.index+marker[0].length,markers[index+1]?.index ?? text.length).trim();
      const part = {heading:marker[1],body};
      if (marker[1].toLocaleLowerCase("vi") === "việc nên làm") {
        // A numbered step needs whitespace after its dot; decimal readings stay intact.
        const steps = [...body.matchAll(/(?:^|\s)([1-9]\d?)\.\s+/g)];
        if (steps.length && !body.slice(0,steps[0].index).trim()) {
          part.steps = steps.map((step,i)=>body.slice(step.index+step[0].length,steps[i+1]?.index ?? body.length).trim());
        }
      }
      parts.push(part);
    });
    return parts;
  }
  renderAdvice(answer) {
    const target = this.byId("reportExplanation"); target.replaceChildren();
    for (const part of this.adviceParts(answer.reply)) {
      const section = document.createElement(part.heading ? "section" : "div");
      const kind = part.heading.toLocaleLowerCase("vi");
      section.className = "co-ma-advice-section"+(!part.heading ? " co-ma-advice-intro" : kind === "việc nên làm" ? " co-ma-advice-actions" : kind === "điều kiện đáng chú ý" ? " co-ma-advice-conditions" : "");
      if (part.heading) { const heading = document.createElement("h4"); heading.textContent = part.heading; section.append(heading); }
      if (part.steps) {
        const list = document.createElement("ol");
        for (const step of part.steps) { const item = document.createElement("li"); item.textContent = step; list.append(item); }
        section.append(list);
      } else {
        for (const text of part.body.split(/\n\s*\n/).filter(Boolean)) { const paragraph = document.createElement("p"); paragraph.textContent = text; section.append(paragraph); }
      }
      target.append(section);
    }
    const inputs = answer.inputSnapshot || this.result.inputs;
    const context = this.byId("reportAdviceContext"); context.replaceChildren();
    const chips = [this.result.stage,
      `${inputs.salinitySite === "canalWater" ? "Mặn kênh" : "Mặn ruộng"} ${this.number(inputs.salinityGl)} g/L`,
      `Nước ruộng ${this.number(inputs.waterDepthCm)} cm`,
      inputs.useWeather ? "Có dữ liệu dự báo" : `${this.number(inputs.tempMaxC)}°C`];
    for (const label of chips.filter(Boolean)) { const chip = document.createElement("span"); chip.textContent = label; context.append(chip); }
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
    if (!this.catalog) { await this.loadCatalog(false); if (!this.catalog) return; }
    this.weatherRequest?.abort(); const controller = new AbortController(); this.weatherRequest = controller;
    this.byId("loadWeather").disabled = true;
    const meta = this.byId("weatherMeta");
    meta.className = "is-loading";
    meta.textContent = "Đang lấy dự báo mới từ máy chủ…";
    try {
      const locId = this.byId("weatherLocation")?.value || this.field("locationId").value;
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
    } finally { if (this.weatherRequest === controller) this.byId("loadWeather").disabled = false; }
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
  paintField(scene) {
    if (!scene) document.dispatchEvent(new CustomEvent("simulationScene", {detail:null}));
    if (!this.byId("ricePlants")) return;
    this.byId("ricePlants").setAttribute("color",scene?.heatConcern || scene?.saltReferenceConcern ? "#a29043" : "#52864b");
    this.byId("floodOverlay").setAttribute("opacity",scene?.submerged ? ".55" : "0");
    this.byId("fieldSun").setAttribute("fill",scene?.heatConcern ? "#e9a15a" : "#edcf78");
  }
  download() { if (!this.result) return; const url = URL.createObjectURL(new Blob([JSON.stringify(this.result,null,2)],{type:"application/json"})); const link = document.createElement("a"); link.href = url; link.download = "MachDong-Simulation.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
}
if (typeof document !== "undefined") new simulationView();
