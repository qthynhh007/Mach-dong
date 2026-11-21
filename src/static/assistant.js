import {AssistantSession} from "./assistant-session.js";
import {renderCoMaReply,safeAssistantSources} from "./co-ma-reply.js";

(() => {
  const byId = (id) => document.getElementById(id);
  const form = byId("assistant-form");
  const input = byId("assistant-input");
  const sendButton = byId("assistant-send");
  const resetButton = byId("assistant-reset");
  const resetDialog = byId("assistant-reset-dialog");
  const transcript = byId("assistant-transcript");
  const messages = byId("assistant-messages");
  const status = byId("assistant-status");
  const feedback = byId("assistant-feedback");
  const errorMessage = byId("assistant-error");
  const notice = byId("assistant-notice");
  const retryButton = byId("assistant-retry");
  const pending = byId("assistant-pending");
  const pendingDetail = byId("assistant-pending-detail");
  const elapsed = byId("assistant-elapsed");
  const stopButton = byId("assistant-stop");
  const starters = byId("assistant-starters");
  const questions = document.querySelectorAll("[data-question]");
  const mode = status.textContent.trim();
  const waitingHint = pendingDetail.textContent;
  const chatUrl = form.dataset.chatUrl;
  const historyLimit = Number(form.dataset.historyLimit);
  const waitSeconds = Number(form.dataset.waitSeconds);
  const session=new AssistantSession(historyLimit);
  const history=session.history;
  const imageInput = byId("assistant-image");
  const imageChoose = byId("assistant-image-choose");
  const imageRemove = byId("assistant-image-remove");
  const attachment = byId("assistant-attachment");
  const imagePreview = byId("assistant-image-preview");
  const uploadStatus = byId("assistant-upload-status");

  let pendingTurn = null;
  let retryMessage = "";
  let retryImage = null;
  let selectedImage = null;
  let readingImage = false;
  window.addEventListener("workspace-session-ended", () => {
    session.end();
    if(pendingTurn) {window.clearTimeout(pendingTurn.deadline);window.clearInterval(pendingTurn.timer);pendingTurn=null;}
    messages.replaceChildren(); input.value = "";setImage(null);clearFeedback();renderWaiting();input.disabled=true;
  });

  function appendMessage(speaker, text, sources = [], image = null, basis = "") {
    const entry = document.createElement("li");
    entry.className = "assistant-message " + (speaker === "Bạn" ? "assistant-message--you" : "assistant-message--co-ma");
    const author = document.createElement("span");
    author.className = "assistant-speaker";
    author.textContent = speaker;
    const bubble = document.createElement("div");
    bubble.className = "assistant-bubble";
    if (image) {
      const photo = document.createElement("img");
      photo.className = "assistant-message-photo";
      photo.src = `data:${image.mime_type};base64,${image.data}`;
      photo.alt = "Ảnh cây trồng bạn gửi: " + image.name;
      photo.width = 320;
      photo.height = 240;
      bubble.append(photo);
    }
    const body = document.createElement("div");
    body.className="assistant-reply";
    if(speaker === "Bạn") {const paragraph=document.createElement("p");paragraph.textContent=text;body.append(paragraph);}
    else renderCoMaReply(document,body,text);
    bubble.append(body);
    const citations=safeAssistantSources(sources,window.location.origin);
    if (basis === "general_knowledge" || basis === "reference_assisted") {
      const label = document.createElement("p");
      label.className = "assistant-answer-basis";
      label.textContent = basis === "general_knowledge"
        ? "Thông tin tham khảo bổ sung · Chưa đối chiếu tài liệu trong thư viện"
        : citations.length ? "Có tài liệu tham khảo · Xem nguồn bên dưới" : "Thông tin tham khảo · Cần đối chiếu với tình trạng cây thực tế";
      bubble.append(label);
    }
    const sourceFold=document.createElement("details");sourceFold.className="assistant-source-fold";
    const summary=document.createElement("summary");summary.textContent=`Nguồn tham khảo (${citations.length})`;
    const list = document.createElement("ul");
    list.className = "assistant-sources";
    list.setAttribute("aria-label", "Nguồn tham khảo");
    for (const source of citations) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      link.textContent = source.title;
      item.append(link);
      list.append(item);
    }
    if (list.childElementCount) {sourceFold.append(summary,list);bubble.append(sourceFold);}
    entry.append(author, bubble);
    messages.append(entry);
    return entry;
  }

  function showLatest() {
    transcript.scrollTop = transcript.scrollHeight;
  }

  function updateSend() {
    sendButton.disabled = session.closed || Boolean(session.request) || readingImage || (!input.value.trim() && !selectedImage);
    byId("assistant-character-count").textContent = `${input.value.length} / ${input.maxLength}`;
  }

  function setImage(image) {
    selectedImage = image;
    attachment.hidden = !image;
    if (image) {
      imagePreview.src = `data:${image.mime_type};base64,${image.data}`;
      byId("assistant-image-name").textContent = image.name;
    } else imagePreview.removeAttribute("src");
    imageInput.value = "";
    updateSend();
  }

  imageChoose.addEventListener("click", () => imageInput.click());
  imageRemove.addEventListener("click", () => { setImage(null); uploadStatus.textContent = ""; input.focus(); });
  imageInput.addEventListener("change", async () => {
    const file = imageInput.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      uploadStatus.textContent = "Chọn ảnh JPG, PNG hoặc WebP có dung lượng tối đa 5 MB nha.";
      imageInput.value = "";
      return;
    }
    readingImage = true;
    imageChoose.disabled = true;
    uploadStatus.textContent = "Đang chuẩn bị ảnh…";
    updateSend();
    try {
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Không đọc được ảnh."));
        reader.readAsDataURL(file);
      });
      if(session.closed) return;
      setImage({mime_type: file.type, data: url.split(",")[1], name: file.name});
      uploadStatus.textContent = "";
    } catch { uploadStatus.textContent = "Không đọc được ảnh. Bà con chọn lại nha."; }
    finally { readingImage = false; imageChoose.disabled = session.closed || Boolean(session.request); updateSend(); }
  });

  function renderWaiting() {
    const waiting = Boolean(session.request);
    pending.hidden = !waiting;
    starters.hidden = waiting;
    status.textContent = waiting ? "Đang chờ câu trả lời" : mode;
    resetButton.setAttribute("aria-disabled", String(waiting));
    resetButton.disabled=waiting || session.closed;
    imageChoose.disabled = waiting || readingImage || session.closed;
    sendButton.setAttribute("aria-busy", String(waiting));
    byId("assistant-send-label").textContent = waiting ? "Đang gửi…" : "Gửi";
    updateSend();
  }

  function renderElapsed(seconds) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
    const remainder = String(seconds % 60).padStart(2, "0");
    elapsed.textContent = minutes + ":" + remainder;
    elapsed.dateTime = "PT" + seconds + "S";
    const hint = seconds >= 8 ? "Cò Mạ đang tổng hợp câu trả lời…" : waitingHint;
    if (pendingDetail.textContent !== hint) pendingDetail.textContent = hint;
  }

  function clearFeedback() {
    feedback.hidden = true;
    errorMessage.textContent = "";
    notice.textContent = "";
    retryMessage = "";
    retryImage = null;
  }

  function restoreQuestion(turn) {
    turn.entry.remove();retryMessage=turn.message;retryImage=turn.image;
    if(turn.image) setImage(turn.image);
    if(!input.value.trim()) input.value=turn.message;
    resetButton.hidden=messages.children.length<=1;
  }
  function stopCurrent(timedOut=false) {
    const turn=pendingTurn;if(!turn) return;
    window.clearTimeout(turn.deadline);window.clearInterval(turn.timer);
    session.cancel();pendingTurn=null;restoreQuestion(turn);feedback.hidden=false;
    errorMessage.textContent=timedOut ? "Cò Mạ chưa trả lời kịp. Bà con có thể gửi lại câu hỏi." : "";
    notice.textContent=timedOut ? "" : "Đã dừng chờ. Câu hỏi được giữ lại để bà con gửi tiếp.";
    renderWaiting();input.focus({preventScroll:true});
  }

  async function sendMessage(message, image = null) {
    if (session.request || session.closed || !message) return;
    const controller=session.begin();if(!controller) return;
    clearFeedback();
    const entry = appendMessage("Bạn", message, [], image);
    resetButton.hidden = false;
    const turn={controller,entry,message,image,timer:null,deadline:null};pendingTurn=turn;
    renderElapsed(0);
    renderWaiting();
    showLatest();
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      if(!session.isCurrent(controller)) return;
      const seconds = Math.floor((performance.now() - startedAt) / 1000);
      renderElapsed(Math.min(seconds, waitSeconds));
    }, 1000);
    const deadline = window.setTimeout(() => {
      if(session.isCurrent(controller)) stopCurrent(true);
    }, waitSeconds * 1000);
    turn.timer=timer;turn.deadline=deadline;

    try {
      const response = await fetch(chatUrl, {
        method: "POST",
        headers: {"Content-Type": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || ""},
        body: JSON.stringify({message, history, ...(image ? {image: {mime_type: image.mime_type, data: image.data}} : {})}),
        signal: controller.signal,
      });
      if(!session.isCurrent(controller)) return;
      const result = await response.json();
      if(!session.isCurrent(controller)) return;
      const reply = result.data?.reply;
      if (!response.ok || typeof reply!=="string" || !reply.trim() || reply.length>4096) throw Object.assign(new Error(result.error || "Chưa nhận được lời đáp đầy đủ. Bà con thử lại nha."),{userFacing:true});
      appendMessage("Cò Mạ",reply,result.data.sources ?? [],null,result.data.answer_basis);
      session.commit(controller,message,reply);
    } catch(error) {
      if(!session.isCurrent(controller)) return;
      feedback.hidden = false;
      errorMessage.textContent=error.userFacing ? error.message : "Chưa kết nối được với Cò Mạ. Câu hỏi đã được giữ lại để gửi tiếp.";
    } finally {
      window.clearTimeout(deadline);
      window.clearInterval(timer);
      if(!session.isCurrent(controller)) return;
      if (!feedback.hidden) restoreQuestion(turn);
      const returnFocus = document.activeElement === stopButton;
      session.finish(controller);pendingTurn=null;
      renderWaiting();
      if (returnFocus) input.focus({preventScroll: true});
      showLatest();
    }
  }

  input.disabled = false;
  updateSend();

  const mascotVideo = byId("assistant-mascot-video");
  if (mascotVideo) {
    const still = byId("assistant-mascot-still");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let alphaSupported = true;
    const showStill = () => { mascotVideo.hidden = true; still.hidden = false; };
    const play = async () => {
      if (!alphaSupported || reducedMotion.matches || document.hidden) {
        mascotVideo.pause();
        showStill();
        return;
      }
      try {
        mascotVideo.src ||= mascotVideo.dataset.source;
        mascotVideo.loop = true;
        await mascotVideo.play();
      } catch { showStill(); }
    };
    mascotVideo.addEventListener("loadeddata", () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(mascotVideo, 0, 0);
      if (context.getImageData(0, 0, 1, 1).data[3] === 0) return;
      alphaSupported = false;
      mascotVideo.pause();
      showStill();
    }, {once: true});
    mascotVideo.addEventListener("playing", () => {
      if (!mascotVideo.paused && alphaSupported && !reducedMotion.matches) {
        still.hidden = true;
        mascotVideo.hidden = false;
      }
    });
    mascotVideo.addEventListener("ended", () => {
      if (!reducedMotion.matches) play();
      else showStill();
    });
    mascotVideo.addEventListener("error", showStill);
    if (mascotVideo.canPlayType('video/webm; codecs="vp9"')) {
      if (!reducedMotion.matches) play();
    }
    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches) { mascotVideo.pause(); showStill(); }
      else play();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) mascotVideo.pause();
      else if (!reducedMotion.matches) play();
    });
  }

  for (const button of questions) {
    button.addEventListener("click", () => {
      input.value = button.dataset.question;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      updateSend();
    });
  }
  stopButton.addEventListener("click", () => stopCurrent());
  retryButton.addEventListener("click", () => {
    if (session.request || session.closed || !retryMessage) return;
    const message = retryMessage;
    const image = retryImage;
    if (input.value.trim() === retryMessage) input.value = "";
    setImage(null);
    input.focus({preventScroll: true});
    sendMessage(message, image);
  });

  input.addEventListener("input", updateSend);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!session.request && !session.closed && !readingImage && (input.value.trim() || selectedImage)) form.requestSubmit();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = input.value.trim() || (selectedImage ? "Nhờ Cò Mạ xem ảnh cây trồng này và chỉ giúp dấu hiệu cần kiểm tra." : "");
    if (session.request || session.closed || readingImage || !message) return;
    const image = selectedImage;
    setImage(null);
    uploadStatus.textContent = "";
    input.value = "";
    sendMessage(message, image);
  });

  resetButton.addEventListener("click", () => {
    if (session.request || session.closed) return;
    resetDialog.returnValue = "";
    resetDialog.showModal();
  });
  resetDialog.addEventListener("close", () => {
    if (resetDialog.returnValue !== "reset") return;
    while (messages.children.length > 1) messages.lastElementChild.remove();
    session.reset();
    clearFeedback();
    resetButton.hidden = true;
    input.value = "";
    setImage(null);
    uploadStatus.textContent = "";
    updateSend();
    input.focus({preventScroll: true});
  });
})();
