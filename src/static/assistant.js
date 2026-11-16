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
  const errorMessage = byId("assistant-error");
  const pending = byId("assistant-pending");
  const questions = document.querySelectorAll("[data-question]");
  const mode = status.textContent.trim();
  const chatUrl = form.dataset.chatUrl;
  const historyLimit = Number(form.dataset.historyLimit);
  const history = [];

  let waiting = false;

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
    sendButton.setAttribute("aria-disabled", String(waiting || !input.value.trim()));
  }

  function setWaiting(isWaiting) {
    waiting = isWaiting;
    pending.hidden = !waiting;
    status.textContent = waiting ? "Cò Mạ đang suy nghĩ…" : mode;
    resetButton.setAttribute("aria-disabled", String(waiting));
    for (const button of questions) button.setAttribute("aria-disabled", String(waiting));
    updateSend();
  }

  async function sendMessage(message) {
    if (waiting || !message) return;
    errorMessage.textContent = "";
    const entry = appendMessage("Bạn", message);
    resetButton.hidden = false;
    setWaiting(true);
    showLatest();

    try {
      const response = await fetch(chatUrl, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({message, history}),
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json();
      const reply = result.data?.reply;
      if (!response.ok || !reply) {
        errorMessage.textContent = result.error || "Cò Mạ chưa có câu trả lời. Bà con thử lại nha.";
      } else {
        history.push({role: "user", text: message}, {role: "model", text: reply});
        if (history.length > historyLimit) history.splice(0, 2);
        appendMessage("Cò Mạ", reply, result.data.sources ?? []);
      }
    } catch {
      errorMessage.textContent = "Chưa kết nối được với Cò Mạ. Bà con thử gửi lại nha.";
    } finally {
      if (errorMessage.textContent) {
        entry.remove();
        if (!input.value.trim()) input.value = message;
        resetButton.hidden = messages.children.length === 1;
      }
      setWaiting(false);
      showLatest();
    }
  }

  input.disabled = false;
  sendButton.disabled = false;
  updateSend();

  for (const button of questions) button.addEventListener("click", () => sendMessage(button.dataset.question));

  input.addEventListener("input", updateSend);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!waiting && input.value.trim()) form.requestSubmit();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (waiting || !message) return;
    input.value = "";
    sendMessage(message);
  });

  resetButton.addEventListener("click", () => {
    if (waiting) return;
    resetDialog.returnValue = "";
    resetDialog.showModal();
  });
  resetDialog.addEventListener("close", () => {
    if (resetDialog.returnValue !== "reset") return;
    while (messages.children.length > 1) messages.lastElementChild.remove();
    history.length = 0;
    errorMessage.textContent = "";
    resetButton.hidden = true;
    input.value = "";
    updateSend();
    input.focus({preventScroll: true});
  });
})();
