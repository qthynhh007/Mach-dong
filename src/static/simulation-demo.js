// Codex field presentation, driven exclusively by the shared cloud result.
import "./simulation-scene.js";
const form = document.getElementById("scenarioForm");
const byId = id => document.getElementById(id);
const labels = [["inputSalinity", "valSalinity", "g/L"], ["inputWater", "valWater", "cm"],
  ["inputStage", "valStage", "ngày"], ["inputTemp", "valTemp", "°C"]];
function updateLabels() {
  for (const [inputId, outputId, unit] of labels) {
    const input = byId(inputId);
    const value = Number(input.value).toLocaleString("vi-VN") + " " + unit;
    byId(outputId).textContent = value;
    input.setAttribute("aria-valuetext", value);
    input.style.setProperty("--range-progress", `${100 * (input.value - input.min) / (input.max - input.min)}%`);
  }
  byId("sceneStage").textContent = `Ngày ${byId("inputStage").value} sau sạ · ${form.elements.stage.selectedOptions[0].textContent}`;
  byId("lowerSalt").disabled = Number(byId("inputSalinity").value) <= 1;
}
function list(id, evidence) {
  byId(id).replaceChildren(...evidence.map(item => {
    const li = document.createElement("li");
    const title = document.createElement("strong"); title.textContent = item.title;
    const body = document.createElement("p"); body.textContent = item.description;
    li.append(title, body); return li;
  }));
}
document.addEventListener("simulationScene", event => {
  const result = event.detail;
  const evidence = result?.evidence || [];
  const concerns = evidence.filter(item => item.level === "warning");
  byId("chiScore").textContent = result ? `${concerns.length} lưu ý` : "Chờ báo cáo";
  byId("sim-salt-risk").textContent = !result ? "Chưa đánh giá" : result.scene?.saltReferenceConcern ? "Có cảnh báo tham chiếu" : "Xem điều kiện trong báo cáo";
  byId("sim-flood-risk").textContent = !result ? "Chưa đánh giá" : result.scene?.submerged ? "Ngập toàn cây" : "Xem số đo và bằng chứng";
  byId("sim-mood").textContent = result ? "Cò Mạ đối chiếu bằng chứng" : "Chờ chạy mô phỏng";
  byId("simulation-status").textContent = result ? result.ai.message : "Điều kiện đã thay đổi. Chạy mô phỏng để nhận đánh giá mới.";
  byId("sim-advice-context").textContent = result ? `${result.engineVersion} · ${result.dataVersion}` : "Chưa có báo cáo cho điều kiện hiện tại.";
  byId("open-advice").disabled = !result;
  list("sim-advice-summary", evidence.slice(0, 2));
  list("sim-advice-steps", evidence);
  byId("sim-plant-cues").textContent = "Minh họa cảnh báo của mô hình tham chiếu; không phải dự đoán hình dạng cây thực tế.";
});
form.addEventListener("input", updateLabels);
byId("btnReset").addEventListener("click", updateLabels);
byId("lowerSalt").addEventListener("click", () => {
  byId("inputSalinity").value = Math.min(1, Number(byId("inputSalinity").value));
  byId("inputSalinity").dispatchEvent(new Event("input", {bubbles:true}));
});
byId("open-advice").addEventListener("click", () => byId("sim-advice-dialog").showModal());
updateLabels();
