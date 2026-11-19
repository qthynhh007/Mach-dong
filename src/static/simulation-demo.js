import {connectFieldScene} from "./simulation-field.js";

const byId = (id) => document.getElementById(id);
const controls = {
  salinity_gl: byId("inputSalinity"),
  water_depth_cm: byId("inputWater"),
  day_after_sowing: byId("inputStage"),
  temp_c: byId("inputTemp"),
};
const field = connectFieldScene(byId("field-scene"), byId("plant-study"));
const summary = byId("sim-advice-summary");
const steps = byId("sim-advice-steps");
const adviceDialog = byId("sim-advice-dialog");
const openAdvice = byId("open-advice");
const staleAdvice = byId("sim-advice-stale");
const status = byId("simulation-status");
const lowerSalt = byId("lowerSalt");
const storageKey = "mach-dong-simulation";
const format = (number) => number.toLocaleString("vi-VN", {maximumFractionDigits: 1});
let timer;
let frame;
let activeRequest;
let hasResult = false;
let confirmedDay;
let lastScenario;
let adviceRequest;
let explainedScenario;

const moods = [
  {min: 95, key: "excited", label: "Cò Mạ vui quá!"},
  {min: 78, key: "calm", label: "Cò Mạ yên tâm"},
  {min: 60, key: "watch", label: "Cò Mạ đang để ý"},
  {min: 40, key: "worried", label: "Cò Mạ hơi lo"},
  {min: 0, key: "alert", label: "Cò Mạ báo động"},
];

function updateLabels() {
  const values = Object.fromEntries(Object.entries(controls).map(([key, node]) => [key, Number(node.value)]));
  const depth = values.water_depth_cm;
  const water = (depth > 0 ? "+" : "") + format(depth) + " cm";
  const day = values.day_after_sowing + " ngày";
  const salinity = format(values.salinity_gl) + " g/L";
  const temperature = format(values.temp_c) + " °C";
  for (const [id, label] of [
    ["valSalinity", salinity], ["valWater", water], ["valStage", day], ["valTemp", temperature],
  ]) {
    const output = byId(id);
    if (output.value !== label) output.value = label;
  }
  for (const [key, input] of Object.entries(controls)) {
    const min = Number(input.min);
    const fraction = (values[key] - min) / (Number(input.max) - min);
    input.style.setProperty("--range-progress", (100 * fraction) + "%");
    input.closest(".sim-control").style.setProperty("--range-fraction", String(fraction));
  }
  byId("sim-water-hint").textContent = depth === 0
    ? "Ngang mặt ruộng."
    : depth > 0 ? "Nước phủ mặt ruộng." : "Dưới mặt ruộng · Báo cáo ghi 0 cm ngập.";
  byId("sim-heat-hint").textContent = values.temp_c > 35
    ? "Vượt ngưỡng nóng của mô hình."
    : "Ngưỡng nóng của mô hình là 35 °C.";
  if (values.day_after_sowing !== confirmedDay) byId("sim-stage-hint").textContent = "Đang xác định giai đoạn…";
  byId("sim-salt-hint").textContent = "Đang tính rủi ro theo giai đoạn…";
  controls.salinity_gl.setAttribute("aria-valuetext", salinity);
  controls.water_depth_cm.setAttribute("aria-valuetext", depth === 0
    ? "Ngang mặt ruộng"
    : format(Math.abs(depth)) + " cm " + (depth > 0 ? "trên" : "dưới") + " mặt ruộng");
  controls.day_after_sowing.setAttribute("aria-valuetext", day + " sau sạ");
  controls.temp_c.setAttribute("aria-valuetext", temperature);
  lowerSalt.disabled = values.salinity_gl <= 1;
  field.setConditions(values);
  return values;
}

function renderAdvice(data, values) {
  summary.replaceChildren(...data.advice_steps.map(({title}) => {
    const item = document.createElement("li");
    item.textContent = title;
    return item;
  }));
  steps.replaceChildren(...data.advice_steps.map(({title, body}, index) => {
    const item = document.createElement("li");
    const detail = document.createElement("details");
    detail.className = "field-check";
    detail.open = index === 0;
    const heading = document.createElement("summary");
    const paragraph = document.createElement("p");
    heading.textContent = title;
    paragraph.textContent = body;
    detail.append(heading, paragraph);
    item.append(detail);
    return item;
  }));
  const depth = values.water_depth_cm;
  const water = (depth > 0 ? "+" : "") + format(depth);
  byId("sim-advice-context").textContent =
    data.stage + " · Ngày " + values.day_after_sowing + " sau sạ · Mặn " + format(values.salinity_gl)
    + " g/L · Mực nước " + water + " cm · " + format(values.temp_c) + " °C";
  staleAdvice.hidden = true;
}

function renderMood(chi) {
  const mood = moods.find(({min}) => chi >= min);
  byId("sim-mascot").dataset.mood = mood.key;
  byId("sim-mood").textContent = mood.label;
}

function renderPhysiology(stage, physiology) {
  const {signals, mechanisms} = physiology;
  field.setResult(stage, signals);
  const cues = [{dry: "Đất khô", moist: "Đất ẩm hoặc nước nông", flooded: "Nước dâng"}[signals.soil]];
  if (signals.leaf_roll >= .3) cues.push("Lá cuốn");
  if (signals.leaf_droop >= .35) cues.push("Lá rũ");
  if (signals.tip_burn >= .2) cues.push("Vàng nâu đầu lá");
  byId("sim-plant-cues").textContent = cues.join(" · ");
  byId("sim-mechanisms").replaceChildren(...mechanisms.map((item) => {
    const section = document.createElement("div");
    const title = document.createElement("h3");
    const body = document.createElement("p");
    const source = document.createElement("a");
    title.textContent = item.title;
    body.textContent = item.body;
    source.href = item.source_url;
    source.textContent = item.source_title;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    section.append(title, body, source);
    return section;
  }));
}

async function getResult(values) {
  const request = new AbortController();
  activeRequest = request;
  try {
    const response = await fetch("/api/simulation/preview", {
      method: "POST",
      headers: {"Content-Type": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || ""},
      body: JSON.stringify(values),
      signal: request.signal,
    });
    if (!response.ok) throw new Error();
    const {data} = await response.json();
    if (request.signal.aborted) return;
    renderPhysiology(data.stage, data.physiology);
    byId("sceneStage").textContent = data.stage + " · ngày " + values.day_after_sowing + " sau sạ";
    confirmedDay = values.day_after_sowing;
    byId("sim-stage-hint").textContent = data.stage;
    controls.day_after_sowing.setAttribute("aria-valuetext", confirmedDay + " ngày sau sạ · " + data.stage);
    byId("sim-salt-hint").textContent = "Rủi ro theo giai đoạn: " + data.salinity_risk.toLowerCase() + ".";
    byId("chiScore").textContent = format(data.chi) + "/100";
    renderMood(data.chi);
    for (const [id, risk] of [["sim-salt-risk", data.salinity_risk], ["sim-flood-risk", data.flood_risk]]) {
      const node = byId(id);
      node.dataset.level = risk;
      node.textContent = risk;
    }
    renderAdvice(data, values);
    lastScenario = values;
    hasResult = true;
    openAdvice.disabled = false;
    status.textContent = "Đã cập nhật kết quả.";
  } catch {
    if (!request.signal.aborted) {
      openAdvice.disabled = !hasResult;
      staleAdvice.hidden = !hasResult;
      if (values.day_after_sowing !== confirmedDay) byId("sim-stage-hint").textContent = "Chưa xác định được giai đoạn.";
      byId("sim-salt-hint").textContent = "Chưa tính lại được mức rủi ro.";
      status.textContent = hasResult
        ? "Chưa thể tính lại. Kết quả đang hiển thị thuộc lần tính trước."
        : "Chưa tải được kết quả. Hãy đổi thông số hoặc đặt lại để thử lại.";
    }
  }
}

function scheduleUpdate() {
  adviceRequest?.abort();
  byId("preview-gemini-status").textContent = "";
  byId("preview-gemini-text").textContent = "";
  clearTimeout(timer);
  activeRequest?.abort();
  openAdvice.disabled = true;
  const pending = hasResult ? "Đang tính lại. Kết quả đang hiển thị thuộc lần tính trước." : "Đang tính kịch bản…";
  if (status.textContent !== pending) status.textContent = pending;
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    const values = updateLabels();
    timer = setTimeout(() => {
      try { sessionStorage.setItem(storageKey, JSON.stringify(values)); } catch { /* The sliders work without storage. */ }
      getResult(values);
    }, 140);
  });
}

Object.values(controls).forEach((node) => node.addEventListener("input", scheduleUpdate));
openAdvice.addEventListener("click", async () => {
  adviceDialog.showModal();
  if (!lastScenario || explainedScenario === lastScenario || !staleAdvice.hidden) return;
  adviceRequest?.abort();
  const request = new AbortController();
  adviceRequest = request;
  const scenario = lastScenario;
  const label = byId("preview-gemini-status");
  label.textContent = "Đang hỏi Gemini về kịch bản này…";
  try {
    const response = await fetch("/api/simulation/advice", {
      method: "POST", headers: {"Content-Type": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || ""},
      body: JSON.stringify(scenario), signal: request.signal,
    });
    if (!response.ok) throw new Error();
    const {data} = await response.json();
    if (request.signal.aborted || lastScenario !== scenario) return;
    label.textContent = data.status;
    if (data.mode === "gemini") {
      byId("preview-gemini-text").textContent = data.text;
      explainedScenario = scenario;
    }
  } catch {
    if (!request.signal.aborted) label.textContent = "Chưa kết nối được Gemini. Bà con xem hướng dẫn tại chỗ bên dưới.";
  }
});
byId("btnReset").addEventListener("click", () => {
  Object.values(controls).forEach((node) => { node.value = node.defaultValue; });
  scheduleUpdate();
});
lowerSalt.addEventListener("click", () => {
  controls.salinity_gl.value = Math.min(1, Number(controls.salinity_gl.value));
  controls.salinity_gl.dispatchEvent(new Event("input", {bubbles: true}));
});
try {
  const stored = JSON.parse(sessionStorage.getItem(storageKey));
  for (const [key, input] of Object.entries(controls)) {
    if (Number.isFinite(stored?.[key])) input.value = stored[key];
  }
} catch { /* Use the default scenario. */ }
scheduleUpdate();
