(() => {
  const launcher = document.getElementById("co-ma-launcher");
  const dialog = document.getElementById("co-ma-quickchat");
  const frame = dialog?.querySelector("iframe");
  if (!launcher || !frame || typeof dialog.showModal !== "function") return;

  launcher.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dialog.showModal();
    launcher.setAttribute("aria-expanded", "true");
    if (!frame.hasAttribute("src")) frame.src = frame.dataset.chatSrc;
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus({preventScroll: true});
  });

  frame.addEventListener("load", () => {
    const chatDocument = frame.contentDocument;
    chatDocument?.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && dialog.open && !chatDocument.querySelector("dialog[open]")) {
        event.preventDefault();
        dialog.close();
      }
    });
  });
})();
