(() => {
  const PROFILE_KEY = "mach-dong-demo-profile-v1";
  const SESSION_KEY = "mach-dong-auth-session-v1";

  const headerEl = document.querySelector(".app-header");
  const farmForm = document.getElementById("farm-info-form");
  const passwordForm = document.getElementById("password-change-form");
  const fields = [
    "farmer-fullname",
    "farmer-phone",
    "farmer-address",
    "farmer-cultivar",
    "farmer-area",
    "hydrology-station",
  ];
  const field = (id) => document.getElementById(id);

  function getCsrfToken() {
    const fromHeader = headerEl?.dataset?.csrfToken;
    if (fromHeader) return fromHeader;
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
      return saved.csrf_token || "";
    } catch {
      return "";
    }
  }

  function readProfile() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function renderProfile(profile) {
    for (const node of document.querySelectorAll("[data-profile-value]")) {
      const value = profile[node.dataset.profileValue];
      if (typeof value === "string" && value.trim()) {
        node.textContent = value;
      }
    }
  }

  function loadProfile() {
    const profile = readProfile();
    renderProfile(profile);
    if (!farmForm) return;
    for (const id of fields) {
      if (typeof profile[id] === "string" && field(id) && !headerEl?.dataset?.csrfToken) {
        field(id).value = profile[id];
      }
    }
  }

  // Logout handler across header and pages
  document.querySelectorAll("[data-logout-btn]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const csrf = getCsrfToken();
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({ csrf_token: csrf }),
        });
      } catch {
        // Ignore network errors on logout cleanup
      }
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {
        // Ignore
      }
      window.location.href = "/login";
    });
  });

  loadProfile();
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) loadProfile();
  });

  farmForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const profile = Object.fromEntries(
      fields.map((id) => [id, field(id)?.value?.trim() || ""])
    );
    const status = field("save-info-msg");
    if (!profile["farmer-fullname"] || !profile["farmer-phone"]) {
      status.textContent = "Hãy nhập họ tên và số điện thoại (+84).";
      return;
    }

    const csrf = getCsrfToken();
    if (csrf) {
      try {
        const res = await fetch("/api/auth/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            name: profile["farmer-fullname"],
            phone: profile["farmer-phone"],
          }),
        });
        const payload = await res.json();
        if (!res.ok || payload.error) {
          status.textContent = payload.error || "Không thể cập nhật hồ sơ.";
          return;
        }
        profile["farmer-phone"] = payload.data.user.phone;
        if (field("farmer-phone")) {
          field("farmer-phone").value = payload.data.user.phone;
        }
      } catch {
        status.textContent = "Lỗi kết nối máy chủ khi lưu hồ sơ.";
        return;
      }
    }

    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      renderProfile(profile);
      status.textContent = csrf
        ? "Đã lưu hồ sơ nông hộ vào cơ sở dữ liệu hệ thống."
        : "Đã lưu hồ sơ demo trên trình duyệt này.";
    } catch {
      status.textContent = "Trình duyệt đang chặn lưu hồ sơ.";
    }
  });

  if (!passwordForm) return;
  const current = field("current-password");
  const next = field("new-password");
  const confirm = field("confirm-password");
  const status = field("password-message");

  function updateStrength() {
    const value = next.value;
    const levels =
      value.length < 8 ? Number(value.length > 0) : value.length < 12 ? 2 : 3;
    field("pwd-strength-text").textContent = [
      "Chưa nhập",
      "Dưới 8 ký tự",
      "Từ 8 ký tự",
      "Từ 12 ký tự",
    ][levels];
    for (let index = 1; index <= 3; index++) {
      field("pwd-bar-" + index).style.backgroundColor =
        index <= levels ? ["", "#b84245", "#a87316", "#1a654d"][levels] : "";
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

  passwordForm.addEventListener("submit", async (event) => {
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

    const csrf = getCsrfToken();
    if (csrf) {
      try {
        const res = await fetch("/api/auth/password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            current_password: current.value,
            new_password: next.value,
          }),
        });
        const payload = await res.json();
        if (!res.ok || payload.error) {
          status.textContent = payload.error || "Đổi mật khẩu thất bại.";
          return;
        }
        passwordForm.reset();
        updateStrength();
        status.textContent = "Đã cập nhật mật khẩu mới (băm PBKDF2-SHA256) thành công!";
        return;
      } catch {
        status.textContent = "Lỗi kết nối máy chủ khi đổi mật khẩu.";
        return;
      }
    }

    passwordForm.reset();
    for (const button of passwordForm.querySelectorAll(".btn-toggle-eye")) {
      field(button.dataset.target).type = "password";
      button.setAttribute("aria-pressed", "false");
    }
    updateStrength();
    status.textContent =
      "Biểu mẫu hợp lệ trong chế độ demo. Hãy đăng nhập để lưu mật khẩu mới.";
  });
})();
