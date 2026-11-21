// Codex field presentation, driven exclusively by the shared cloud result.
import "./simulation-scene.js";
const byId = id => document.getElementById(id);
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
  const concerns = evidence.filter(item => item.level === "warning" || item.level === "caution");
  byId("chiScore").textContent = result ? `${concerns.length} lưu ý` : "Chờ báo cáo";
  byId("sim-salt-risk").textContent = !result ? "Chưa đánh giá" : result.scene?.saltReferenceConcern ? "Có cảnh báo tham chiếu" : "Xem điều kiện trong báo cáo";
  byId("sim-flood-risk").textContent = !result ? "Chưa đánh giá" : result.scene?.submerged ? "Ngập toàn cây" : "Xem số đo và bằng chứng";
  byId("sim-mood").textContent = result ? "Cò Mạ đối chiếu bằng chứng" : "Chờ chạy mô phỏng";
  byId("simulation-status").textContent = result ? "Chọn Xem lời khuyên để nhận đề xuất chăm sóc ruộng." : "Điều kiện đã thay đổi. Chạy mô phỏng để nhận đánh giá mới.";
  byId("sim-advice-context").textContent = result ? `${result.engineVersion} · ${result.dataVersion}` : "Chưa có báo cáo cho điều kiện hiện tại.";
  byId("open-advice").disabled = !result;
  byId("sim-advice-summary").replaceChildren();
  list("sim-advice-steps", evidence);
  byId("sim-plant-cues").textContent = "Minh họa cảnh báo của mô hình tham chiếu; không phải dự đoán hình dạng cây thực tế.";
});
byId("open-advice").addEventListener("click", () => {
  byId("sim-advice-dialog").showModal();
  document.dispatchEvent(new CustomEvent("simulationAdviceOpen"));
});
document.addEventListener("simulationAdvice", event => {
  const answer = event.detail;
  const card = byId("previewAdviceCard");
  card.setAttribute("aria-busy",String(Boolean(answer?.pending)));
  card.classList.toggle("is-error",Boolean(answer?.error));
  card.classList.toggle("is-fallback",Boolean(answer?.isFallback));
  card.querySelector("[data-retry-advice]").hidden=!answer?.error;
  const wait=byId("previewAdviceWait"); wait.hidden=!(answer?.waiting && answer?.pending && !answer?.error);
  wait.classList.toggle("is-paused",Boolean(answer?.error));
  wait.querySelector("strong").textContent=answer?.error ? "Chưa hoàn tất tư vấn" : "Đang chuẩn bị lời khuyên";
  wait.querySelector("p").textContent=answer?.error ? "Yêu cầu trước chưa hoàn tất. Chọn Nhờ Cò Mạ tư vấn để nhận phân tích mới." : "Cò Mạ đang xem xét giai đoạn lúa và điều kiện ruộng để đề xuất việc nên làm.";
  if(answer?.elapsedSeconds !== undefined) byId("previewAdviceElapsed").textContent=`Đã chờ ${Math.floor(answer.elapsedSeconds/60)}:${String(answer.elapsedSeconds%60).padStart(2,"0")}`;
  byId("previewExplanationStatus").textContent = !answer ? "Chạy mô phỏng để Cò Mạ tư vấn theo điều kiện mới." : answer.cancelled ? "Đã dừng chờ. Bà con có thể yêu cầu tư vấn lại." : answer.error || (answer.pending ? "Cò Mạ đang chuẩn bị lời khuyên…" : answer.isFallback ? "Gợi ý tham khảo tạm thời" : "Đề xuất dành cho ruộng của bà con");
  for (const suffix of ["Explanation","AdviceContext","AdviceSources"]) {
    const target = byId("preview"+suffix); target.replaceChildren();
    if (answer?.reply) for (const node of byId("report"+suffix).childNodes) target.append(node.cloneNode(true));
  }
  byId("previewAdviceSourcesFold").hidden = !answer?.sources?.length;
  byId("previewAdviceSourceCount").textContent = String(answer?.sources?.length || 0);
  if (answer?.limitation) byId("previewAdviceLimitation").textContent = answer.limitation;
  if(answer?.reply) {
    byId("simulation-status").textContent=answer.isFallback ? "Gợi ý tham khảo tạm thời đã sẵn sàng." : "Cò Mạ đã chuẩn bị lời khuyên cho ruộng của bà con.";
    const actions=[...byId("reportExplanation").querySelectorAll(".co-ma-advice-actions li")];
    list("sim-advice-summary",actions.slice(0,2).map((item,index)=>({title:`Ưu tiên ${index+1}`,description:item.textContent})));
  } else if(answer?.pending) byId("simulation-status").textContent="Cò Mạ đang chuẩn bị lời khuyên…";
});
