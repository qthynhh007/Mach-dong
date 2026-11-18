(() => {
  const messageEl = document.querySelector("[data-auth-message]");
  const loginForm = document.getElementById("loginForm");
  const forgotPasswordForm = document.getElementById("forgotPasswordForm");
  const registerForm = document.getElementById("registerForm");
  const autoWalletPreviewBox = document.getElementById("autoWalletPreviewBox");
  const externalWalletInputBox = document.getElementById("externalWalletInputBox");
  const walletAddressInput = document.getElementById("walletAddressInput");
  const btnConnectBrowserWallet = document.getElementById("btnConnectBrowserWallet");

  const registeredWalletRevealBox = document.getElementById("registeredWalletRevealBox");
  const revealedWalletAddress = document.getElementById("revealedWalletAddress");
  const revealedCredits = document.getElementById("revealedCredits");
  const revealedAvax = document.getElementById("revealedAvax");

  const btnSendOtpLogin = document.getElementById("btnSendOtpLogin");
  const btnSendOtpForgot = document.getElementById("btnSendOtpForgot");
  const btnSendOtpRegister = document.getElementById("btnSendOtpRegister");
  const btnForgotPasswordLink = document.getElementById("btnForgotPasswordLink");

  function setStatus(text, isError = false) {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.style.color = isError ? "#b84245" : "#1a654d";
  }

  function revealWalletOnRegisterSuccess(user) {
    if (!user || !registeredWalletRevealBox) return;
    registeredWalletRevealBox.classList.remove("hidden");
    if (revealedWalletAddress) revealedWalletAddress.textContent = user.wallet_address || "";
    if (revealedCredits) revealedCredits.textContent = String(user.simulation_credits ?? 0);
    if (revealedAvax) {
      revealedAvax.textContent = Number(user.avax_balance ?? 0).toFixed(4);
    }
  }

  // Toggle password visibility
  document.querySelectorAll("[data-show-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.showPassword);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-pressed", String(show));
      button.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
    });
  });

  // Switch between Sign-In tab and Forgot Password tab on /login
  const loginTabs = document.querySelectorAll("[data-login-tab]");
  function switchLoginTab(tabName) {
    loginTabs.forEach((btn) => {
      const active = btn.dataset.loginTab === tabName;
      btn.setAttribute("aria-pressed", String(active));
    });
    if (tabName === "forgot") {
      loginForm?.classList.add("hidden");
      forgotPasswordForm?.classList.remove("hidden");
      const currentId = document.getElementById("identifierInput")?.value?.trim() || "";
      const forgotEmail = document.getElementById("forgotEmailInput");
      if (forgotEmail && currentId.includes("@") && !forgotEmail.value) {
        forgotEmail.value = currentId;
      }
      forgotEmail?.focus();
    } else {
      forgotPasswordForm?.classList.add("hidden");
      loginForm?.classList.remove("hidden");
    }
    setStatus("");
  }

  loginTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      switchLoginTab(btn.dataset.loginTab);
    });
  });

  btnForgotPasswordLink?.addEventListener("click", () => {
    switchLoginTab("forgot");
  });

  // Wallet mode radio toggle on /register (AUTO_EMAIL vs EXTERNAL)
  document.querySelectorAll("[data-wallet-mode-radio]").forEach((radio) => {
    radio.addEventListener("change", () => {
      const mode = document.querySelector("[data-wallet-mode-radio]:checked")?.value || "AUTO_EMAIL";
      if (mode === "EXTERNAL") {
        autoWalletPreviewBox?.classList.add("hidden");
        externalWalletInputBox?.classList.remove("hidden");
      } else {
        autoWalletPreviewBox?.classList.remove("hidden");
        externalWalletInputBox?.classList.add("hidden");
      }
    });
  });

  // Send 6-digit Email Confirmation Code (OTP) — never shows wallet code on login
  async function requestEmailOtp(emailOrUsername, otpInputEl, requireExisting = false) {
    const cleanInput = (emailOrUsername || "").trim();
    if (!cleanInput || (!requireExisting && !cleanInput.includes("@"))) {
      setStatus(
        requireExisting
          ? "Vui lòng nhập Email hoặc Tên đăng nhập trước khi bấm Gửi mã."
          : "Vui lòng nhập địa chỉ Email hợp lệ trước khi bấm Gửi mã.",
        true
      );
      return;
    }
    setStatus(`Đang kiểm tra và gửi mã xác nhận 6 số cho ${cleanInput}...`);
    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanInput,
          require_existing: requireExisting,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        setStatus(result.error || "Không thể gửi mã xác nhận Email.", true);
        return;
      }
      const data = result.data;
      if (data.smtp_sent) {
        setStatus(
          `Đã gửi mã xác nhận 6 số tới hộp thư ${data.email} (hiệu lực 5 phút). Vui lòng kiểm tra Email!`
        );
      } else if (data.dev_otp_code) {
        setStatus(
          `Đã gửi mã xác nhận cho ${data.email}: [${data.dev_otp_code}] (Chế độ thử nghiệm chưa cấu hình SMTP_APP_PASSWORD).`
        );
      }
      otpInputEl?.focus();
    } catch {
      setStatus("Lỗi kết nối máy chủ khi gửi mã xác nhận Email.", true);
    }
  }

  btnSendOtpLogin?.addEventListener("click", () => {
    requestEmailOtp(
      document.getElementById("identifierInput")?.value,
      document.getElementById("otpCodeInput"),
      false
    );
  });

  btnSendOtpForgot?.addEventListener("click", () => {
    requestEmailOtp(
      document.getElementById("forgotEmailInput")?.value,
      document.getElementById("forgotOtpInput"),
      true
    );
  });

  btnSendOtpRegister?.addEventListener("click", () => {
    requestEmailOtp(
      document.getElementById("emailInput")?.value,
      document.getElementById("registerOtpInput"),
      false
    );
  });

  // Connect Browser Wallet (Core / MetaMask) on /register
  btnConnectBrowserWallet?.addEventListener("click", async () => {
    const provider = window.avalanche || window.ethereum;
    if (!provider || typeof provider.request !== "function") {
      setStatus(
        "Không tìm thấy tiện ích ví trình duyệt. Bà con hãy chọn 'Tự động tạo địa chỉ ví mới gắn với Email' nhé!",
        true
      );
      return;
    }
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (accounts && accounts[0] && walletAddressInput) {
        walletAddressInput.value = accounts[0];
        setStatus(`Đã lấy địa chỉ ví từ trình duyệt: ${accounts[0]}`);
      }
    } catch {
      setStatus("Không thể kết nối ví trình duyệt.", true);
    }
  });

  // Handle Login Form Submit (No wallet code shown on login page)
  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const idVal = document.getElementById("identifierInput")?.value?.trim() || "";
    const password = document.getElementById("secretInput")?.value || "";
    const otpCode = document.getElementById("otpCodeInput")?.value?.trim() || "";
    const rememberMe = Boolean(document.getElementById("rememberMeInput")?.checked);

    const payload = {
      identifier: idVal,
      email: idVal.includes("@") ? idVal : "",
      password,
      otp_code: otpCode,
      remember_me: rememberMe,
    };

    setStatus("Đang xác thực đăng nhập...");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        setStatus(result.error || "Đăng nhập thất bại.", true);
        return;
      }
      const u = result.data.user;
      setStatus(
        `Đăng nhập thành công! Xin chào ${u.name} (${u.role}) · Điểm hiện có: ${u.simulation_credits} LÚA`
      );
      setTimeout(() => {
        window.location.href = "/profile";
      }, 700);
    } catch {
      setStatus("Lỗi kết nối máy chủ khi đăng nhập.", true);
    }
  });

  // Handle Forgot Password Submit (Verify 6-digit Email OTP & Set New Password)
  forgotPasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("forgotEmailInput")?.value?.trim() || "";
    const otpCode = document.getElementById("forgotOtpInput")?.value?.trim() || "";
    const newPassword = document.getElementById("forgotNewPassword")?.value || "";
    const confirmPassword = document.getElementById("forgotConfirmPassword")?.value || "";

    if (newPassword !== confirmPassword) {
      setStatus("Mật khẩu xác nhận chưa khớp.", true);
      document.getElementById("forgotConfirmPassword")?.focus();
      return;
    }

    setStatus("Đang kiểm tra mã xác nhận Email và cập nhật mật khẩu mới...");
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          otp_code: otpCode,
          new_password: newPassword,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        setStatus(result.error || "Không thể đặt lại mật khẩu.", true);
        return;
      }
      forgotPasswordForm.reset();
      switchLoginTab("signin");
      const idInput = document.getElementById("identifierInput");
      if (idInput) idInput.value = email;
      document.getElementById("secretInput")?.focus();
      setStatus(
        result.data?.message ||
          "Đã đặt lại mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới."
      );
    } catch {
      setStatus("Lỗi kết nối máy chủ khi đặt lại mật khẩu.", true);
    }
  });

  // Handle Register Form Submit (Shows generated Fuji wallet on screen after successful registration)
  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("displayName")?.value?.trim() || "";
    const username = document.getElementById("usernameInput")?.value?.trim() || "";
    const email = document.getElementById("emailInput")?.value?.trim() || "";
    const otpCode = document.getElementById("registerOtpInput")?.value?.trim() || "";
    const phone = document.getElementById("identifierInput")?.value?.trim() || "";
    const password = document.getElementById("secretInput")?.value || "";
    const confirm = document.getElementById("confirmInput")?.value || "";
    const walletMode =
      document.querySelector("[data-wallet-mode-radio]:checked")?.value || "AUTO_EMAIL";
    const walletAddress = walletAddressInput?.value?.trim() || "";

    if (password !== confirm) {
      setStatus("Mật khẩu xác nhận chưa khớp.", true);
      document.getElementById("confirmInput")?.focus();
      return;
    }

    setStatus("Đang kiểm tra mã xác nhận Email và khởi tạo ví Avalanche Fuji...");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          username,
          email,
          otp_code: otpCode,
          require_otp: true,
          phone,
          password,
          wallet_mode: walletMode,
          wallet_address: walletAddress,
          remember_me: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        setStatus(result.error || "Đăng ký tài khoản thất bại.", true);
        return;
      }
      const u = result.data.user;
      revealWalletOnRegisterSuccess(u);
      setStatus(
        `Đăng ký thành công! Địa chỉ ví Avalanche Fuji của bạn: ${u.wallet_address}`
      );
      setTimeout(() => {
        window.location.href = "/profile";
      }, 1500);
    } catch {
      setStatus("Lỗi kết nối máy chủ khi tạo tài khoản.", true);
    }
  });
})();
