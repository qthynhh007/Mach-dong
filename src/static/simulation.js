const byId = (id) => document.getElementById(id);
const controls = {
  salinity_gl: byId("inputSalinity"),
  water_depth_cm: byId("inputWater"),
  day_after_sowing: byId("inputStage"),
  temp_c: byId("inputTemp"),
};
let timer;
let activeRequest;
let hasResult = false;
const status = byId("simulation-status");
const initial = [2.8, 4.5, 48, 28.5];
const storageKey = "mach-dong-simulation";
const format = (number) => number.toLocaleString("vi-VN", {maximumFractionDigits: 1});

function inputs() {
  return Object.fromEntries(Object.entries(controls).map(([key, node]) => [key, Number(node.value)]));
}

function updateLabels() {
  const values = inputs();
  const salinity = format(values.salinity_gl) + " g/L";
  const water = (values.water_depth_cm > 0 ? "+" : "") + format(values.water_depth_cm) + " cm";
  const temp = format(values.temp_c) + " °C";
  byId("valSalinity").textContent = salinity;
  byId("sceneSalinity").textContent = salinity;
  byId("valWater").textContent = water;
  byId("sceneWater").textContent = water + " (mực nước ruộng)";
  byId("valTemp").textContent = temp;
  byId("valStage").textContent = "Ngày " + values.day_after_sowing + "/95";
  byId("sceneStage").textContent = "Ngày " + values.day_after_sowing;
  return values;
}

async function getResult(values) {
  const request = new AbortController();
  activeRequest = request;
  try {
    const response = await fetch("/api/simulation", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(values),
      signal: request.signal,
    });
    if (!response.ok) throw new Error();
    const {data} = await response.json();
    if (request.signal.aborted) return;
    byId("valStage").textContent = "Ngày " + values.day_after_sowing + "/95 · " + data.stage;
    byId("sceneStage").textContent = data.stage + " · ngày " + values.day_after_sowing;
    byId("growthRate").textContent = format(data.chi) + "%";
    byId("illustrativeYield").textContent = format(data.illustrative_yield_tonnes_ha);
    byId("riskSummary").textContent = "Mặn " + data.salinity_risk.toLowerCase() + " · Ngập " + data.flood_risk.toLowerCase();
    byId("assistantAdvice").textContent = data.advice;
    hasResult = true;
    status.textContent = "Đã cập nhật kết quả.";
  } catch (error) {
    if (!request.signal.aborted) {
      status.textContent = hasResult
        ? "Chưa thể tính lại. Kết quả đang hiển thị thuộc lần tính trước."
        : "Chưa tải được kết quả. Hãy đổi thông số hoặc đặt lại để thử lại.";
    }
  }
}

function scheduleUpdate() {
  const values = updateLabels();
  try { sessionStorage.setItem(storageKey, JSON.stringify(values)); } catch { /* The sliders work without storage. */ }
  clearTimeout(timer);
  activeRequest?.abort();
  const pending = hasResult ? "Đang tính lại. Kết quả đang hiển thị thuộc lần tính trước." : "Đang tính kết quả…";
  if (status.textContent !== pending) status.textContent = pending;
  timer = setTimeout(() => getResult(values), 120);
}

Object.values(controls).forEach((node) => node.addEventListener("input", scheduleUpdate));
byId("btnReset").addEventListener("click", () => {
  Object.values(controls).forEach((node, index) => { node.value = initial[index]; });
  scheduleUpdate();
});
byId("lowerSalt").addEventListener("click", () => {
  controls.salinity_gl.value = Math.min(1, Number(controls.salinity_gl.value));
  scheduleUpdate();
});
try {
  const stored = JSON.parse(sessionStorage.getItem(storageKey));
  for (const [key, input] of Object.entries(controls)) {
    if (Number.isFinite(stored?.[key])) input.value = stored[key];
  }
} catch { /* Use the default scenario. */ }
scheduleUpdate();
