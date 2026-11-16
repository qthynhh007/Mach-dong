(() => {
  const key = "mach-dong-demo-profile-v1";
  const farmForm = document.getElementById("farm-info-form");
  const passwordForm = document.getElementById("password-change-form");
  const fields = [
    "farmer-fullname", "farmer-phone", "farmer-address", "farmer-cultivar",
    "farmer-area", "hydrology-station",
  ];
  const field = (id) => document.getElementById(id);

  function readProfile() {
    try {
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch {
      return {};
    }
  }

  function renderProfile(profile) {
    for (const node of document.querySelectorAll("[data-profile-value]")) {
      const value = profile[node.dataset.profileValue];
      if (typeof value === "string") node.textContent = value || "—";
    }
  }

  function loadProfile() {
    const profile = readProfile();
    renderProfile(profile);
    if (!farmForm) return;
    for (const id of fields) {
      if (typeof profile[id] === "string") field(id).value = profile[id];
    }
  }

  loadProfile();
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) loadProfile();
  });

  farmForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const profile = Object.fromEntries(fields.map((id) => [id, field(id).value.trim()]));
    const status = field("save-info-msg");
    if (!profile["farmer-fullname"] || !profile["farmer-phone"]) {
      status.textContent = "Hãy nhập họ tên và số điện thoại mẫu.";
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(profile));
      renderProfile(profile);
      status.textContent = "Đã lưu hồ sơ demo trên trình duyệt này.";
    } catch {
      status.textContent = "Trình duyệt đang chặn lưu hồ sơ demo.";
    }
  });

  if (!passwordForm) return;
  const current = field("current-password");
  const next = field("new-password");
  const confirm = field("confirm-password");
  const status = field("password-message");

  function updateStrength() {
    const value = next.value;
    const levels = value.length < 8 ? Number(value.length > 0) : value.length < 12 ? 2 : 3;
    field("pwd-strength-text").textContent = ["Chưa nhập", "Dưới 8 ký tự", "Từ 8 ký tự", "Từ 12 ký tự"][levels];
    for (let index = 1; index <= 3; index++) {
      field("pwd-bar-" + index).style.backgroundColor = index <= levels ? ["", "#b84245", "#a87316", "#1a654d"][levels] : "";
    }
  }

  next.addEventListener("input", updateStrength);
  for (const button of passwordForm.querySelectorAll(".btn-toggle-eye")) {
    button.addEventListener("click", () => {
      const input = field(button.dataset.target);
      const showing = input.type === "password";
      input.type = showing ? "text" : "password";
      button.setAttribute("aria-pressed", String(showing));
    });
  }
  passwordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (next.value === current.value) {
      status.textContent = "Mật khẩu mới phải khác mật khẩu hiện tại.";
      next.focus();
      return;
    }
    if (next.value !== confirm.value) {
      status.textContent = "Mật khẩu xác nhận chưa khớp.";
      confirm.focus();
      return;
    }
    passwordForm.reset();
    for (const button of passwordForm.querySelectorAll(".btn-toggle-eye")) {
      field(button.dataset.target).type = "password";
      button.setAttribute("aria-pressed", "false");
    }
    updateStrength();
    status.textContent = "Biểu mẫu hợp lệ trong chế độ demo. Thông tin mật khẩu không được lưu.";
  });
})();
