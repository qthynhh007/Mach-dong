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
  const pending = byId("assistant-pending");
  const questions = document.querySelectorAll("[data-question]");
  const mode = status.textContent;

  // Tin nhắn mẫu để thử bố cục và trạng thái của khung chat.
  const sampleReplies = [
    [/\b(kich ban mau|doc kich ban)\b/,
      "Ví dụ, lúa OM5451 ngày 48 gặp nước ruộng có độ mặn 2,8 g/L. Lúa đang làm đòng, mình ghi lại thời điểm đo và theo dõi độ mặn tại ruộng nha."],
    [/\b(ty le (cay )?song|song sot|cay con song)\b/,
      "Bà con đếm số cây còn sống trên cùng ô ruộng qua từng lần đo. Cò cần những số đếm đó mới biết mình còn bao nhiêu cây."],
    [/\b(man|ngap|ung)\b/,
      "Cò muốn biết lúa bao nhiêu ngày sau gieo, mặn đo ở đâu và nước cao bao nhiêu so với mặt ruộng. Bà con ghi từng số đo để mình tiện theo dõi nha."],
    [/\b(csv|dong gop|chia se|dang bai)\b/,
      "Có số đo rồi thì tốt quá! Bà con ghi thêm giờ đo, địa điểm và đơn vị để người xem tệp CSV dễ hiểu."],
    [/\b(cam on|thank you|thanks)\b/,
      "Có gì bà con cứ hỏi Cò thêm nha. Chúc bà con một vụ lúa thuận lợi!"],
    [/^(?:(?:xin )?chao|hi|hello)(?: co(?: ma)?)?$/,
      "Cò Mạ chào bà con! Mình đang coi mặn, mực nước hay muốn đọc kịch bản mẫu?"],
  ];

  let waiting = false;

  function sampleReply(message) {
    const normalized = message
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const sample = sampleReplies.find(([pattern]) => pattern.test(normalized));
    return sample?.[1] ?? "Bà con thử hỏi Cò về mặn, ngập, tỷ lệ cây sống hoặc cách ghi CSV nha.";
  }

  function appendMessage(speaker, text) {
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
    entry.append(author, bubble);
    messages.append(entry);
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

  function sendMessage(message) {
    if (waiting || !message) return;
    appendMessage("Bạn", message);
    resetButton.hidden = false;
    setWaiting(true);
    showLatest();

    window.setTimeout(() => {
      appendMessage("Cò Mạ", sampleReply(message));
      setWaiting(false);
      showLatest();
    }, 500);
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
    resetButton.hidden = true;
    input.value = "";
    updateSend();
    input.focus({preventScroll: true});
  });
})();
