const preview = document.querySelector("[data-auth-preview]");
const message = document.querySelector("[data-auth-message]");
preview?.addEventListener("submit", (event) => {
  event.preventDefault();
  const password = preview.querySelector("#secretInput");
  const confirmation = preview.querySelector("#confirmInput");
  if (confirmation && password.value !== confirmation.value) {
    message.textContent = "Mật khẩu xác nhận chưa khớp.";
    confirmation.focus();
    return;
  }
  preview.reset();
  message.textContent = "Biểu mẫu hợp lệ trong bản xem thử. Bạn có thể mở Kho CSV để xem tiếp.";
});
document.querySelectorAll("[data-show-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.showPassword);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.setAttribute("aria-pressed", String(show));
    button.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
  });
});
