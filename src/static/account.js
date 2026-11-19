(() => {
  const headerEl = document.querySelector(".app-header");
  const moreLinks = headerEl?.querySelector(".app-more-links");
  const userId = headerEl?.dataset.userId;
  const profileKey = userId ? `mach-dong-farm-profile-v1:${userId}` : "mach-dong-demo-profile-v1";
  const farmForm = document.getElementById("farm-info-form");
  const passwordForm = document.getElementById("password-change-form");
  const creditChangerBox = document.getElementById("credit-changer-box");
  const creditExchangeForm = document.getElementById("credit-exchange-form");
  const btnFaucetAvax = document.getElementById("btn-faucet-avax");
  const exchangeAmountInput = document.getElementById("exchange-amount-input");
  const exchangeUnitLabel = document.getElementById("exchange-unit-label");
  const exchangePreviewOutput = document.getElementById("exchange-preview-output");
  const exchangeStatusMsg = document.getElementById("exchange-status-msg");
  const creditTxList = document.getElementById("credit-tx-list");
  const walletBindForm = document.getElementById("wallet-bind-form");
  const customWalletInput = document.getElementById("custom-wallet-input");
  const walletBindMsg = document.getElementById("wallet-bind-msg");
  const btnExportPrivKey = document.getElementById("btn-export-privkey");
  const exportedPrivKeyBox = document.getElementById("exported-privkey-box");
  const exportedPrivKeyValue = document.getElementById("exported-privkey-value");

  const fields = [
    "farmer-fullname",
    "farmer-phone",
    "farmer-address",
    "farmer-cultivar",
    "farmer-area",
    "hydrology-station",
  ];
  const field = (id) => document.getElementById(id);

  if (moreLinks) {
    document.addEventListener("pointerdown", (event) => {
      if (moreLinks.open && !moreLinks.contains(event.target)) moreLinks.open = false;
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !moreLinks.open) return;
      moreLinks.open = false;
      moreLinks.querySelector("summary").focus();
    });
  }

  function getCsrfToken() {
    return headerEl?.dataset.csrfToken || "";
  }

  function readProfile() {
    try {
      return JSON.parse(localStorage.getItem(profileKey)) || {};
    } catch {
      return {};
    }
  }

  function renderProfile(profile) {
    for (const node of document.querySelectorAll("[data-profile-value]")) {
      const value = profile[node.dataset.profileValue];
      if (typeof value === "string") {
        node.textContent = value || "—";
      }
    }
  }

  function loadProfile() {
    const profile = readProfile();
    renderProfile(profile);
    if (!farmForm) return;
    for (const id of fields) {
      if (typeof profile[id] === "string" && field(id)) {
        field(id).value = profile[id];
      }
    }
  }

  // Logout handler across header and pages
  document.querySelectorAll("[data-logout-btn]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const csrf = getCsrfToken();
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      try {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({ csrf_token: csrf }),
        });
        if (!response.ok && response.status !== 401) {
          btn.textContent = "Thử lại đăng xuất";
          return;
        }
        window.location.href = "/login";
      } catch {
        btn.textContent = "Thử lại đăng xuất";
      } finally {
        btn.removeAttribute("aria-busy");
        btn.disabled = false;
      }
    });
  });

  loadProfile();
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) loadProfile();
  });

  // Inline Dropdown Privacy & Security Panel (drops directly from the label)
  const privacyPanel = document.getElementById("privacy-slide-panel");
  const privacyToggleBtn = document.getElementById("btn-toggle-privacy-dropdown");
  const privacyChevron = document.getElementById("privacy-dropdown-chevron");
  const btnSendWalletOtp = document.getElementById("btn-send-wallet-otp");
  const walletOtpInput = document.getElementById("wallet-otp-input");

  function setPrivacyDropdown(open) {
    if (!privacyPanel) return;
    privacyPanel.classList.toggle("hidden", !open);
    privacyPanel.setAttribute("aria-hidden", String(!open));
    privacyToggleBtn?.setAttribute("aria-expanded", String(open));
    if (privacyChevron) {
      privacyChevron.style.transform = open ? "rotate(180deg)" : "";
    }
  }

  privacyToggleBtn?.addEventListener("click", () => {
    const isHidden = privacyPanel?.classList.contains("hidden");
    setPrivacyDropdown(Boolean(isHidden));
  });

  document.getElementById("btn-open-privacy-panel")?.addEventListener("click", () => {
    setPrivacyDropdown(true);
    document.getElementById("privacy-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Send 6-digit Email OTP before saving a new wallet address
  btnSendWalletOtp?.addEventListener("click", async () => {
    const userEmail = (walletBindForm?.dataset?.userEmail || "").trim();
    if (!userEmail) {
      if (walletBindMsg) {
        walletBindMsg.textContent = "Vui lòng đăng nhập để nhận mã xác nhận Email.";
        walletBindMsg.style.color = "#b84245";
      }
      return;
    }
    if (walletBindMsg) {
      walletBindMsg.textContent = `Đang gửi mã xác nhận tới ${userEmail}...`;
      walletBindMsg.style.color = "#1a654d";
    }
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, require_existing: true }),
      });
      const payload = await res.json();
      if (!res.ok || payload.error) {
        if (walletBindMsg) {
          walletBindMsg.textContent = payload.error || "Không thể gửi mã xác nhận.";
          walletBindMsg.style.color = "#b84245";
        }
        return;
      }
      if (walletBindMsg) {
        if (payload.data?.smtp_sent) {
          walletBindMsg.textContent = `Đã gửi mã 6 số tới ${payload.data.email}.`;
        } else if (payload.data?.dev_otp_code) {
          walletBindMsg.textContent = `Mã xác nhận (Dev): [${payload.data.dev_otp_code}]`;
        }
        walletBindMsg.style.color = "#1a654d";
      }
      walletOtpInput?.focus();
    } catch {
      if (walletBindMsg) {
        walletBindMsg.textContent = "Lỗi kết nối máy chủ khi gửi mã Email.";
        walletBindMsg.style.color = "#b84245";
      }
    }
  });

  // Export secp256k1 Private Key to import into Core Wallet / MetaMask
  btnExportPrivKey?.addEventListener("click", async () => {
    const csrf = getCsrfToken();
    if (!csrf) {
      if (walletBindMsg) {
        walletBindMsg.textContent = "Vui lòng đăng nhập để xem Private Key.";
        walletBindMsg.style.color = "#b84245";
      }
      return;
    }
    try {
      const res = await fetch("/api/auth/export-wallet-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({password: document.getElementById("wallet-export-password")?.value || ""}),
      });
      const payload = await res.json();
      if (!res.ok || payload.error) {
        if (walletBindMsg) {
          walletBindMsg.textContent = payload.error || "Không thể lấy Private Key.";
          walletBindMsg.style.color = "#b84245";
        }
        return;
      }
      if (exportedPrivKeyBox && exportedPrivKeyValue) {
        exportedPrivKeyValue.textContent = payload.data.private_key;
        exportedPrivKeyBox.classList.remove("hidden");
      }
    } catch {
      if (walletBindMsg) {
        walletBindMsg.textContent = "Lỗi kết nối máy chủ.";
        walletBindMsg.style.color = "#b84245";
      }
    }
  });

  // Bind / Update Manually Created C-Chain Fuji Wallet Address on /profile
  const btnConnectInjected = document.getElementById("btn-connect-injected-wallet");
  if (btnConnectInjected && customWalletInput) {
    btnConnectInjected.addEventListener("click", async () => {
      if (typeof window.ethereum !== "undefined") {
        try {
          const accounts = await window.ethereum.request({
            method: "eth_requestAccounts",
          });
          if (accounts && accounts.length > 0) {
            customWalletInput.value = accounts[0];
            if (walletBindMsg) {
              walletBindMsg.textContent = `Đã nhận địa chỉ từ ví Core / MetaMask: ${accounts[0].slice(
                0,
                6
              )}...${accounts[0].slice(-4)}. Nhấn 'Gửi mã Email' để xác nhận.`;
              walletBindMsg.style.color = "#1a654d";
            }
          }
        } catch (err) {
          if (walletBindMsg) {
            walletBindMsg.textContent =
              "Từ chối kết nối ví hoặc lỗi: " + (err.message || err);
            walletBindMsg.style.color = "#b84245";
          }
        }
      } else {
        if (walletBindMsg) {
          walletBindMsg.textContent =
            "Không tìm thấy tiện ích Core hoặc MetaMask trong trình duyệt. Bạn có thể dán thủ công địa chỉ 0x.";
          walletBindMsg.style.color = "#a87316";
        }
      }
    });
  }

  walletBindForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const csrf = getCsrfToken();
    if (!csrf) {
      if (walletBindMsg) {
        walletBindMsg.textContent = "Vui lòng đăng nhập để lưu địa chỉ ví.";
        walletBindMsg.style.color = "#b84245";
      }
      return;
    }
    const addr = (customWalletInput?.value || "").trim();
    const otpCode = (walletOtpInput?.value || "").trim();
    try {
      const res = await fetch("/api/auth/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          wallet_address: addr,
          wallet_mode: addr ? "EXTERNAL" : "AUTO_EMAIL",
          otp_code: otpCode,
          password: document.getElementById("wallet-change-password")?.value || "",
        }),
      });
      const payload = await res.json();
      if (!res.ok || payload.error) {
        if (walletBindMsg) {
          walletBindMsg.textContent = payload.error || "Địa chỉ ví không hợp lệ.";
          walletBindMsg.style.color = "#b84245";
        }
        return;
      }
      const updatedUser = payload.data.user;
      document.querySelectorAll("[data-profile-wallet]").forEach((el) => {
        el.textContent = updatedUser.wallet_address;
      });
      document.querySelectorAll("[data-profile-wallet-type]").forEach((el) => {
        el.textContent = updatedUser.wallet_type;
      });
      if (walletBindMsg) {
        walletBindMsg.textContent = "Đã cập nhật địa chỉ ví C-Chain Fuji!";
        walletBindMsg.style.color = "#1a654d";
      }
    } catch {
      if (walletBindMsg) {
        walletBindMsg.textContent = "Lỗi kết nối máy chủ.";
        walletBindMsg.style.color = "#b84245";
      }
    }
  });

  // Credit Changer (AVAX <-> LÚA Simulation Credits)
  if (creditChangerBox && creditExchangeForm) {
    const rate = Number(creditChangerBox.dataset.creditsPerAvax || 100);

    function getDirection() {
      return (
        creditExchangeForm.querySelector('input[name="exchange_direction"]:checked')?.value ||
        "AVAX_TO_CREDIT"
      );
    }

    function updateExchangePreview() {
      const dir = getDirection();
      const rawVal = Number(exchangeAmountInput?.value || 0);
      if (dir === "AVAX_TO_CREDIT") {
        if (exchangeUnitLabel) exchangeUnitLabel.textContent = "AVAX";
        if (exchangeAmountInput) {
          exchangeAmountInput.step = "0.01";
          exchangeAmountInput.min = "0.01";
        }
        const credits = Math.max(0, Math.round(rawVal * rate));
        if (exchangePreviewOutput) {
          exchangePreviewOutput.textContent = `+${credits} LÚA`;
        }
      } else {
        if (exchangeUnitLabel) exchangeUnitLabel.textContent = "LÚA";
        if (exchangeAmountInput) {
          exchangeAmountInput.step = "1";
          exchangeAmountInput.min = "1";
        }
        const avax = Math.max(0, rawVal / rate);
        if (exchangePreviewOutput) {
          exchangePreviewOutput.textContent = `+${avax.toFixed(4)} AVAX`;
        }
      }
    }

    creditExchangeForm
      .querySelectorAll('input[name="exchange_direction"]')
      .forEach((radio) => {
        radio.addEventListener("change", () => {
          if (getDirection() === "AVAX_TO_CREDIT") {
            exchangeAmountInput.value = "0.50";
          } else {
            exchangeAmountInput.value = "10";
          }
          updateExchangePreview();
        });
      });

    exchangeAmountInput?.addEventListener("input", updateExchangePreview);
    updateExchangePreview();

    function applyBalanceAndTxUpdate(data) {
      const user = data?.user;
      if (user) {
        document.querySelectorAll("[data-profile-credits]").forEach((el) => {
          el.textContent = String(user.simulation_credits);
        });
        document.querySelectorAll("[data-header-credits]").forEach((el) => {
          el.textContent = `${user.simulation_credits} LÚA`;
        });
        document.querySelectorAll("[data-profile-avax]").forEach((el) => {
          el.textContent = Number(user.avax_balance).toFixed(4);
        });
      }
      const tx = data?.transaction;
      if (tx && creditTxList) {
        const row = document.createElement("div");
        row.className =
          "p-2.5 rounded-lg bg-surface-container-low flex items-center justify-between gap-2";
        const isPositive = tx.credit_delta >= 0;
        const badgeText =
          tx.direction === "FAUCET_TOPUP"
            ? `+${Number(tx.avax_amount).toFixed(2)} AVAX`
            : tx.credit_delta >= 0
            ? `+${tx.credit_delta} LÚA`
            : `${tx.credit_delta} LÚA`;
        const isRealOnchain =
          tx.note?.endsWith("(On-chain Fuji)") && /^0x[0-9a-fA-F]{64}$/.test(tx.tx_hash || "");
        const hashHtml = isRealOnchain
          ? `On-chain Fuji: <a href="https://testnet.snowtrace.io/tx/${tx.tx_hash}" target="_blank" rel="noopener" class="underline font-bold text-primary hover:text-primary/80"><code>${tx.tx_hash.slice(
              0,
              10
            )}...${tx.tx_hash.slice(-6)} ↗</code></a>`
          : `Mã mô phỏng: <code>${tx.tx_hash.slice(0, 14)}...${tx.tx_hash.slice(-6)}</code>`;
        row.innerHTML = `
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-7 h-7 rounded-full bg-primary-fixed text-primary flex items-center justify-center font-bold text-sm shrink-0">${
              isPositive ? "↓" : "↑"
            }</span>
            <div class="flex flex-col min-w-0">
              <span class="font-body-sm text-body-sm font-semibold text-on-surface truncate">${tx.note}</span>
              <span class="font-label-sm text-label-sm text-on-surface-variant truncate">${hashHtml}</span>
            </div>
          </div>
          <span class="font-label-md text-label-md font-bold ${
            isPositive ? "text-primary" : "text-secondary"
          } shrink-0">${badgeText}</span>
        `;
        creditTxList.prepend(row);
      }
    }

    creditExchangeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const csrf = getCsrfToken();
      if (!csrf) {
        if (exchangeStatusMsg) {
          exchangeStatusMsg.textContent = "Vui lòng đăng nhập để giao dịch điểm với AVAX.";
          exchangeStatusMsg.style.color = "#b84245";
        }
        return;
      }
      const direction = getDirection();
      const amount = Number(exchangeAmountInput?.value || 0);
      if (exchangeStatusMsg) {
        exchangeStatusMsg.textContent = "Đang quy đổi giả lập…";
        exchangeStatusMsg.style.color = "#1a654d";
      }
      try {
        const res = await fetch("/api/auth/exchange-credits", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({ direction, amount }),
        });
        const payload = await res.json();
        if (!res.ok || payload.error) {
          if (exchangeStatusMsg) {
            exchangeStatusMsg.textContent = payload.error || "Giao dịch thất bại.";
            exchangeStatusMsg.style.color = "#b84245";
          }
          return;
        }
        applyBalanceAndTxUpdate(payload.data);
        if (exchangeStatusMsg) {
          exchangeStatusMsg.textContent = "Đã quy đổi số dư giả lập.";
          exchangeStatusMsg.style.color = "#1a654d";
        }
      } catch {
        if (exchangeStatusMsg) {
          exchangeStatusMsg.textContent = "Lỗi kết nối máy chủ.";
          exchangeStatusMsg.style.color = "#b84245";
        }
      }
    });

    btnFaucetAvax?.addEventListener("click", async () => {
      const csrf = getCsrfToken();
      if (!csrf) {
        if (exchangeStatusMsg) {
          exchangeStatusMsg.textContent = "Vui lòng đăng nhập để nhận AVAX thử nghiệm.";
          exchangeStatusMsg.style.color = "#b84245";
        }
        return;
      }
      try {
        const res = await fetch("/api/auth/exchange-credits", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({ direction: "FAUCET_TOPUP", amount: 1.0 }),
        });
        const payload = await res.json();
        if (!res.ok || payload.error) {
          if (exchangeStatusMsg) {
            exchangeStatusMsg.textContent = payload.error || "Không thể nhận AVAX.";
            exchangeStatusMsg.style.color = "#b84245";
          }
          return;
        }
        applyBalanceAndTxUpdate(payload.data);
        if (exchangeStatusMsg) {
          exchangeStatusMsg.textContent = "Đã cộng 1 AVAX giả lập.";
          exchangeStatusMsg.style.color = "#1a654d";
        }
      } catch {
        if (exchangeStatusMsg) {
          exchangeStatusMsg.textContent = "Lỗi kết nối máy chủ.";
          exchangeStatusMsg.style.color = "#b84245";
        }
      }
    });
  }

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
      const localProfile = { ...profile };
      if (userId) {
        delete localProfile["farmer-fullname"];
        delete localProfile["farmer-phone"];
      }
      localStorage.setItem(profileKey, JSON.stringify(localProfile));
      renderProfile(profile);
      status.textContent = csrf
        ? "Đã lưu hồ sơ tài khoản và thông tin ruộng trên trình duyệt này."
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
