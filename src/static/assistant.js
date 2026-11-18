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

  let activeRequest = null;
  let retryMessage = "";

  function appendMessage(speaker, text, sources = []) {
    const entry = document.createElement("li");
    entry.className = "assistant-message " + (speaker === "Bạn" ? "assistant-message--you" : "assistant-message--co-ma");
    const author = document.createElement("span");
    author.className = "assistant-speaker";
    author.textContent = speaker;
    const bubble = document.createElement("div");
    bubble.className = "assistant-bubble";
    const body = document.createElement("p");
    body.textContent = text;
    bubble.append(body);
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
    sendButton.disabled = Boolean(activeRequest) || !input.value.trim();
  }

  function renderWaiting() {
    const waiting = Boolean(activeRequest);
    pending.hidden = !waiting;
    starters.hidden = waiting;
    status.textContent = waiting ? "Đang chờ câu trả lời" : mode;
    resetButton.setAttribute("aria-disabled", String(waiting));
    updateSend();
  }

  function renderElapsed(seconds) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
    const remainder = String(seconds % 60).padStart(2, "0");
    elapsed.textContent = minutes + ":" + remainder;
    elapsed.dateTime = "PT" + seconds + "S";
    waitFill.style.width = (seconds / waitSeconds * 100) + "%";
    const hint = seconds >= 8 ? "Cò Mạ đang kiểm tra thêm tài liệu…" : waitingHint;
    if (pendingDetail.textContent !== hint) pendingDetail.textContent = hint;
  }

  function clearFeedback() {
    feedback.hidden = true;
    errorMessage.textContent = "";
    notice.textContent = "";
    retryMessage = "";
  }

  async function sendMessage(message) {
    if (activeRequest || !message) return;
    clearFeedback();
    const entry = appendMessage("Bạn", message);
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
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({message, history}),
        signal: controller.signal,
      });
      const result = await response.json();
      const reply = result.data?.reply;
      if (!response.ok || !reply) {
        feedback.hidden = false;
        errorMessage.textContent = result.error || "Cò Mạ chưa có câu trả lời. Bà con thử lại nha.";
      } else {
        history.push({role: "user", text: message}, {role: "model", text: reply});
        if (history.length > historyLimit) history.splice(0, 2);
        appendMessage("Cò Mạ", reply, result.data.sources ?? []);
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
    const replay = byId("assistant-mascot-replay");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const showStill = () => { mascotVideo.hidden = true; still.hidden = false; };
    const play = async () => {
      try {
        mascotVideo.src ||= mascotVideo.dataset.source;
        mascotVideo.currentTime = 0;
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
      mascotVideo.pause();
      replay.hidden = true;
      showStill();
    }, {once: true});
    mascotVideo.addEventListener("playing", () => {
      if (!mascotVideo.paused) { still.hidden = true; mascotVideo.hidden = false; }
    });
    mascotVideo.addEventListener("ended", showStill);
    mascotVideo.addEventListener("error", () => { replay.hidden = true; showStill(); });
    replay.addEventListener("click", play);
    if (mascotVideo.canPlayType('video/webm; codecs="vp9"')) {
      replay.hidden = false;
      if (!reducedMotion.matches) play();
    }
    reducedMotion.addEventListener("change", event => {
      if (event.matches) { mascotVideo.pause(); showStill(); }
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
    if (input.value.trim() === retryMessage) input.value = "";
    input.focus({preventScroll: true});
    sendMessage(retryMessage);
  });

  input.addEventListener("input", updateSend);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!activeRequest && input.value.trim()) form.requestSubmit();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (activeRequest || !message) return;
    input.value = "";
    sendMessage(message);
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
    updateSend();
    input.focus({preventScroll: true});
  });
})();
