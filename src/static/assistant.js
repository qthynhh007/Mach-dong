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
  const waitFill = byId("assistant-wait-fill");
  const stopButton = byId("assistant-stop");
  const starters = byId("assistant-starters");
  const questions = document.querySelectorAll("[data-question]");
  const mode = status.textContent.trim();
  const waitingHint = pendingDetail.textContent;
  const chatUrl = form.dataset.chatUrl;
  const historyLimit = Number(form.dataset.historyLimit);
  const waitSeconds = Number(form.dataset.waitSeconds);
  const history = [];
  const imageInput = byId("assistant-image");
  const imageChoose = byId("assistant-image-choose");
  const imageRemove = byId("assistant-image-remove");
  const attachment = byId("assistant-attachment");
  const imagePreview = byId("assistant-image-preview");
  const uploadStatus = byId("assistant-upload-status");

  let activeRequest = null;
  let retryMessage = "";
  let retryImage = null;
  let selectedImage = null;
  let readingImage = false;
  window.addEventListener("workspace-session-ended", () => {
    activeRequest?.abort(); history.length = 0; messages.replaceChildren(); input.value = "";
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
    const body = document.createElement("p");
    body.textContent = text;
    bubble.append(body);
    if (basis === "general_knowledge" || basis === "reference_assisted") {
      const label = document.createElement("p");
      label.className = "assistant-answer-basis";
      label.textContent = basis === "general_knowledge"
        ? "Thông tin tham khảo bổ sung · Chưa đối chiếu tài liệu trong thư viện"
        : "Có tài liệu tham khảo · Xem nguồn bên dưới";
      bubble.append(label);
    }
    const list = document.createElement("ul");
    list.className = "assistant-sources";
    list.setAttribute("aria-label", "Nguồn tham khảo");
    for (const source of sources) {
      const url = new URL(source.url, window.location.origin);
      const localData = url.origin === window.location.origin && url.pathname.startsWith("/community/samples/");
      if (!localData && url.protocol !== "https:") continue;
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = url.href;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      link.textContent = source.title;
      item.append(link);
      list.append(item);
    }
    if (list.childElementCount) bubble.append(list);
    entry.append(author, bubble);
    messages.append(entry);
    return entry;
  }

  function showLatest() {
    transcript.scrollTop = transcript.scrollHeight;
  }

  function updateSend() {
    sendButton.disabled = Boolean(activeRequest) || readingImage || (!input.value.trim() && !selectedImage);
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
      setImage({mime_type: file.type, data: url.split(",")[1], name: file.name});
      uploadStatus.textContent = "";
    } catch { uploadStatus.textContent = "Không đọc được ảnh. Bà con chọn lại nha."; }
    finally { readingImage = false; imageChoose.disabled = false; updateSend(); }
  });

  function renderWaiting() {
    const waiting = Boolean(activeRequest);
    pending.hidden = !waiting;
    starters.hidden = waiting;
    status.textContent = waiting ? "Đang chờ câu trả lời" : mode;
    resetButton.setAttribute("aria-disabled", String(waiting));
    imageChoose.disabled = waiting || readingImage;
    sendButton.setAttribute("aria-busy", String(waiting));
    byId("assistant-send-label").textContent = waiting ? "Đang gửi…" : "Gửi";
    updateSend();
  }

  function renderElapsed(seconds) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
    const remainder = String(seconds % 60).padStart(2, "0");
    elapsed.textContent = minutes + ":" + remainder;
    elapsed.dateTime = "PT" + seconds + "S";
    waitFill.style.width = (seconds / waitSeconds * 100) + "%";
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

  async function sendMessage(message, image = null) {
    if (activeRequest || !message) return;
    clearFeedback();
    const entry = appendMessage("Bạn", message, [], image);
    resetButton.hidden = false;
    const controller = new AbortController();
    activeRequest = controller;
    renderElapsed(0);
    renderWaiting();
    showLatest();
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const seconds = Math.floor((performance.now() - startedAt) / 1000);
      renderElapsed(Math.min(seconds, waitSeconds));
    }, 1000);
    let timedOut = false;
    const deadline = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, waitSeconds * 1000);

    try {
      const response = await fetch(chatUrl, {
        method: "POST",
        headers: {"Content-Type": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || ""},
        body: JSON.stringify({message, history, ...(image ? {image: {mime_type: image.mime_type, data: image.data}} : {})}),
        signal: controller.signal,
      });
      const result = await response.json();
      const reply = result.data?.reply;
      if (!response.ok || !reply) {
        feedback.hidden = false;
        errorMessage.textContent = result.error || "Cò Mạ chưa có câu trả lời. Bà con thử lại nha.";
      } else {
        history.push({role: "user", text: message}, {role: "model", text: reply});
        while (history.length > historyLimit) history.splice(0, 2);
        appendMessage("Cò Mạ", reply, result.data.sources ?? [], null, result.data.answer_basis);
      }
    } catch {
      feedback.hidden = false;
      if (timedOut) {
        errorMessage.textContent = "Đã hết thời gian chờ. Bà con có thể gửi lại câu hỏi.";
      } else if (controller.signal.aborted) {
        notice.textContent = "Đã dừng chờ. Bà con có thể gửi lại câu hỏi.";
      } else {
        errorMessage.textContent = "Chưa kết nối được với Cò Mạ. Bà con thử gửi lại nha.";
      }
    } finally {
      window.clearTimeout(deadline);
      window.clearInterval(timer);
      if (!feedback.hidden) {
        entry.remove();
        retryMessage = message;
        retryImage = image;
        if (image) setImage(image);
        if (!input.value.trim()) input.value = message;
        resetButton.hidden = messages.children.length === 1;
      }
      const returnFocus = document.activeElement === stopButton;
      activeRequest = null;
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
  stopButton.addEventListener("click", () => activeRequest?.abort());
  retryButton.addEventListener("click", () => {
    if (activeRequest || !retryMessage) return;
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
    if (!activeRequest && !readingImage && (input.value.trim() || selectedImage)) form.requestSubmit();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = input.value.trim() || (selectedImage ? "Nhờ Cò Mạ xem ảnh cây trồng này và chỉ giúp dấu hiệu cần kiểm tra." : "");
    if (activeRequest || readingImage || !message) return;
    const image = selectedImage;
    setImage(null);
    uploadStatus.textContent = "";
    input.value = "";
    sendMessage(message, image);
  });

  resetButton.addEventListener("click", () => {
    if (activeRequest) return;
    resetDialog.returnValue = "";
    resetDialog.showModal();
  });
  resetDialog.addEventListener("close", () => {
    if (resetDialog.returnValue !== "reset") return;
    while (messages.children.length > 1) messages.lastElementChild.remove();
    history.length = 0;
    clearFeedback();
    resetButton.hidden = true;
    input.value = "";
    setImage(null);
    uploadStatus.textContent = "";
    updateSend();
    input.focus({preventScroll: true});
  });
})();
