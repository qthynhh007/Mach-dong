(() => {
  const SESSION_STORAGE_KEY = "mach-dong-auth-session-v1";
  const PROFILE_STORAGE_KEY = "mach-dong-demo-profile-v1";

  const messageEl = document.querySelector("[data-auth-message]");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const emailWalletPreviewText = document.getElementById("emailWalletPreviewText");
  const autoWalletPreviewBox = document.getElementById("autoWalletPreviewBox");
  const externalWalletInputBox = document.getElementById("externalWalletInputBox");
  const walletAddressInput = document.getElementById("walletAddressInput");
  const btnConnectBrowserWallet = document.getElementById("btnConnectBrowserWallet");

  const btnSendOtpLogin = document.getElementById("btnSendOtpLogin");
  const btnSendOtpFull = document.getElementById("btnSendOtpFull");
  const btnSendOtpRegister = document.getElementById("btnSendOtpRegister");

  let signinMode = "quick";

  function setStatus(text, isError = false) {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.style.color = isError ? "#b84245" : "#1a654d";
  }

  function saveClientSession(authData) {
    try {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          csrf_token: authData.csrf_token,
          expires_at: authData.expires_at,
          user: authData.user,
        })
      );
      if (authData.user) {
        const existingProfile = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "{}");
        existingProfile["farmer-fullname"] = authData.user.name;
        existingProfile["farmer-phone"] = authData.user.phone;
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(existingProfile));
      }
    } catch {
      // Ignore storage quota errors
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

  // Toggle Quick Sign-In vs Full Sign-In on /login
  const modeButtons = document.querySelectorAll("[data-signin-mode]");
  const quickIdentifierGroup = document.getElementById("quickIdentifierGroup");
  const fullSigninFields = document.getElementById("fullSigninFields");
  const identifierInput = document.getElementById("identifierInput");

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      signinMode = btn.dataset.signinMode;
      modeButtons.forEach((b) => {
        const active = b.dataset.signinMode === signinMode;
        b.classList.toggle("bg-primary", active);
        b.classList.toggle("text-on-primary", active);
        b.classList.toggle("font-bold", active);
      });
      if (signinMode === "full") {
        quickIdentifierGroup?.classList.add("hidden");
        fullSigninFields?.classList.remove("hidden");
        if (identifierInput) identifierInput.removeAttribute("required");
      } else {
        quickIdentifierGroup?.classList.remove("hidden");
        fullSigninFields?.classList.add("hidden");
        if (identifierInput) identifierInput.setAttribute("required", "required");
      }
    });
  });

  // Wallet mode radio toggle (AUTO_EMAIL vs EXTERNAL)
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

  // Live preview of Email-bound Avalanche Fuji Wallet
  async function updateWalletPreview(emailValue, targetElement) {
    const clean = (emailValue || "").trim();
    if (!targetElement) return;
    if (!clean || !clean.includes("@")) {
      targetElement.textContent = "Nhập Email để xem địa chỉ ví Avalanche Fuji 0x...";
      return;
    }
    try {
      const res = await fetch(`/api/auth/wallet-preview?email=${encodeURIComponent(clean)}`);
      const payload = await res.json();
      if (payload?.data?.preview_wallet_address) {
        targetElement.textContent = payload.data.preview_wallet_address;
      }
    } catch {
      // Ignore network preview error
    }
  }

  document.querySelectorAll("[data-wallet-email-source]").forEach((input) => {
    input.addEventListener("input", () => {
      updateWalletPreview(input.value, emailWalletPreviewText);
    });
  });

  if (identifierInput && loginForm) {
    identifierInput.addEventListener("input", () => {
      if (identifierInput.value.includes("@")) {
        updateWalletPreview(identifierInput.value, emailWalletPreviewText);
      }
    });
  }

  // Send 6-digit Email Confirmation Code (OTP)
  async function requestEmailOtp(emailValue, otpInputEl) {
    const cleanEmail = (emailValue || "").trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setStatus("Vui lòng nhập địa chỉ Email hợp lệ trước khi bấm Gửi mã.", true);
      return;
    }
    setStatus(`Đang gửi mã xác nhận 6 số tới ${cleanEmail}...`);
    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        setStatus(result.error || "Không thể gửi mã xác nhận Email.", true);
        return;
      }
      const data = result.data;
      if (data.preview_wallet_address && emailWalletPreviewText) {
        emailWalletPreviewText.textContent = data.preview_wallet_address;
      }
      if (data.smtp_sent) {
        setStatus(
          `Đã gửi mã xác nhận 6 số tới hộp thư ${data.email} (hiệu lực 5 phút). Vui lòng kiểm tra Email!`
        );
      } else if (data.dev_otp_code) {
        setStatus(
          `Đã tạo mã xác nhận cho ${data.email}: [${data.dev_otp_code}] (Chế độ thử nghiệm chưa cấu hình SMTP_APP_PASSWORD).`
        );
      }
      otpInputEl?.focus();
    } catch {
      setStatus("Lỗi kết nối máy chủ khi gửi mã xác nhận Email.", true);
    }
  }

  btnSendOtpLogin?.addEventListener("click", () => {
    requestEmailOtp(identifierInput?.value, document.getElementById("otpCodeInput"));
  });

  btnSendOtpFull?.addEventListener("click", () => {
    requestEmailOtp(
      document.getElementById("loginEmail")?.value,
      document.getElementById("otpCodeInput")
    );
  });

  btnSendOtpRegister?.addEventListener("click", () => {
    requestEmailOtp(
      document.getElementById("emailInput")?.value,
      document.getElementById("registerOtpInput")
    );
  });

  // Connect Browser Wallet (Core / MetaMask)
  btnConnectBrowserWallet?.addEventListener("click", async () => {
    const provider = window.avalanche || window.ethereum;
    if (!provider || typeof provider.request !== "function") {
      setStatus(
        "Không tìm thấy tiện ích ví trình duyệt. Bà con hãy chọn 'Tự động tạo ví mới gắn với Email' nhé!",
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

  // Handle Login Form Submit
  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const walletMode =
      document.querySelector("[data-wallet-mode-radio]:checked")?.value || "AUTO_EMAIL";
    const password = document.getElementById("secretInput")?.value || "";
    const otpCode = document.getElementById("otpCodeInput")?.value?.trim() || "";
    const rememberMe = Boolean(document.getElementById("rememberMeInput")?.checked);
    const walletAddress = walletAddressInput?.value?.trim() || "";

    let payload = {
      password,
      otp_code: otpCode,
      wallet_mode: walletMode,
      wallet_address: walletAddress,
      remember_me: rememberMe,
    };

    if (signinMode === "full") {
      const name = document.getElementById("loginFullName")?.value?.trim() || "";
      const username = document.getElementById("loginUsername")?.value?.trim() || "";
      const email = document.getElementById("loginEmail")?.value?.trim() || "";
      const phone = document.getElementById("loginPhone")?.value?.trim() || "";
      payload = {
        ...payload,
        identifier: email || username || phone,
        name,
        username,
        email,
        phone,
        auto_create_on_full_profile: true,
      };
    } else {
      const idVal = identifierInput?.value?.trim() || "";
      payload.identifier = idVal;
      if (idVal.includes("@")) {
        payload.email = idVal;
      }
    }

    setStatus("Đang xác thực mã Email / mật khẩu và kiểm tra ví Avalanche Fuji...");
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
      saveClientSession(result.data);
      const u = result.data.user;
      setStatus(
        `Đăng nhập thành công! Xin chào ${u.name} (${u.role}) · Ví Fuji: ${u.wallet_address} · Điểm: ${u.simulation_credits}`
      );
      setTimeout(() => {
        window.location.href = "/profile";
      }, 700);
    } catch {
      setStatus("Lỗi kết nối máy chủ khi đăng nhập.", true);
    }
  });

  // Handle Register Form Submit
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
      saveClientSession(result.data);
      const u = result.data.user;
      setStatus(
        `Xác thực Email & Tạo tài khoản thành công! Ví Avalanche Fuji gắn với ${u.email}: ${u.wallet_address}`
      );
      setTimeout(() => {
        window.location.href = "/profile";
      }, 800);
    } catch {
      setStatus("Lỗi kết nối máy chủ khi tạo tài khoản.", true);
    }
  });
})();
