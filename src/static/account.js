(() => {
  const headerEl = document.querySelector(".app-header");
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
  document.querySelector("[data-copy-wallet]")?.addEventListener("click", async () => {
    const status = field("wallet-copy-status");
    try {
      await navigator.clipboard.writeText(document.querySelector("[data-profile-wallet]").textContent.trim());
      status.textContent = "Đã sao chép địa chỉ ví.";
    } catch { status.textContent = "Chưa sao chép được. Bà con chọn địa chỉ ở trên để sao chép nha."; }
  });

  const avatarInput = field("profile-avatar-file");
  const avatarChoose = field("profile-avatar-choose");
  avatarChoose?.addEventListener("click", () => avatarInput.click());
  avatarInput?.addEventListener("change", async () => {
    const file = avatarInput.files[0];
    if (!file) return;
    const status = field("profile-avatar-status");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 1_000_000) {
      status.textContent = "Chọn JPG, PNG hoặc WebP tối đa 1 MB."; return;
    }
    const payload = new FormData(); payload.append("avatar", file);
    avatarChoose.disabled = true; status.textContent = "Đang lưu ảnh lên máy chủ…";
    try {
      const response = await fetch("/api/auth/avatar", {method:"POST", headers:{"X-CSRF-Token":getCsrfToken()}, body:payload});
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(body.error || "Chưa lưu được ảnh.");
      for (const image of document.querySelectorAll("[data-user-avatar]")) image.src = body.data.avatar_url;
      status.textContent = "Đã lưu ảnh đại diện trên máy chủ.";
    } catch (error) { status.textContent = error.message; }
    finally { avatarChoose.disabled = false; avatarInput.value = ""; }
  });

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

  async function loadProfile() {
    let profile = readProfile();
    if (userId) {
      try {
        const response = await fetch("/api/auth/field-profile", {cache: "no-store"});
        const payload = await response.json();
        if (response.ok && payload.data) {
          const cloudProfile = {
            "farmer-address": payload.data.address || "",
            "farmer-cultivar": payload.data.cultivar || "",
            "farmer-area": payload.data.area || "",
            "hydrology-station": payload.data.hydrology_station || "",
          };
          if (Object.values(cloudProfile).every(value => !value) && Object.values(profile).some(Boolean)) {
            const csrf = getCsrfToken();
            const migrated = await fetch("/api/auth/field-profile", {
              method: "POST",
              headers: {"Content-Type": "application/json", "X-CSRF-Token": csrf},
              body: JSON.stringify({
                address: profile["farmer-address"] || "",
                cultivar: profile["farmer-cultivar"] || "",
                area: profile["farmer-area"] || "",
                hydrology_station: profile["hydrology-station"] || "",
              }),
            });
            if (migrated.ok) localStorage.removeItem(profileKey);
          } else {
            profile = cloudProfile;
            localStorage.removeItem(profileKey);
          }
        }
      } catch { /* The profile page remains usable when offline. */ }
    }
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
    if (event.persisted && userId) window.location.reload();
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

  // Export secp256k1 khóa riêng tư to import into Core Wallet / MetaMask
  btnExportPrivKey?.addEventListener("click", async () => {
    const csrf = getCsrfToken();
    if (!csrf) {
      if (walletBindMsg) {
        walletBindMsg.textContent = "Vui lòng đăng nhập để xem khóa riêng tư.";
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
          walletBindMsg.textContent = payload.error || "Không thể lấy khóa riêng tư.";
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

  // Credit Changer (One-way AVAX -> LÚA Simulation Credits on Avalanche Fuji)
  if (creditChangerBox && creditExchangeForm) {
    const rate = Number(creditChangerBox.dataset.creditsPerAvax || 100);
    const contractAddress = (creditChangerBox.dataset.contractAddress || "").trim();
    const chainIdNum = Number(creditChangerBox.dataset.chainId || 43113);
    const beneficiaryWallet = (creditChangerBox.dataset.walletAddress || "").trim();

    function updateExchangePreview() {
      const rawVal = Number(exchangeAmountInput?.value || 0);
      if (exchangeUnitLabel) exchangeUnitLabel.textContent = "AVAX";
      if (exchangeAmountInput) {
        exchangeAmountInput.step = "0.01";
        exchangeAmountInput.min = "0.01";
      }
      const credits = Math.max(0, Math.round(rawVal * rate));
      if (exchangePreviewOutput) {
        exchangePreviewOutput.textContent = `+${credits} LÚA`;
      }
    }

    exchangeAmountInput?.addEventListener("input", updateExchangePreview);
    updateExchangePreview();

    function applyBalanceAndTxUpdate(data) {
      const user = data?.user;
      const resolvedCredits = data?.onchain_credits ?? user?.simulation_credits;
      const resolvedAvax = data?.onchain_avax ?? user?.avax_balance;
      if (resolvedCredits !== undefined && resolvedCredits !== null) {
        document.querySelectorAll("[data-profile-credits]").forEach((el) => {
          el.textContent = String(resolvedCredits);
        });
        document.querySelectorAll("[data-header-credits]").forEach((el) => {
          el.textContent = `${resolvedCredits} LÚA`;
        });
      }
      if (resolvedAvax !== undefined && resolvedAvax !== null) {
        document.querySelectorAll("[data-profile-avax]").forEach((el) => {
          el.textContent = Number(resolvedAvax).toFixed(4);
        });
      }
      const tx = data?.transaction;
      if (tx && creditTxList) {
        field("credit-tx-empty")?.remove();
        const row = document.createElement("article");
        row.className = "wallet-transaction";
        const badgeText = `${tx.credit_delta >= 0 ? "+" : ""}${tx.credit_delta} LÚA`;
        const isRealOnchain =
          tx.note?.includes("(On-chain Fuji)") && /^0x[0-9a-fA-F]{64}$/.test(tx.tx_hash || "");
        const hashHtml = isRealOnchain
          ? `<a class="wallet-text-link" href="https://testnet.snowtrace.io/tx/${tx.tx_hash}" target="_blank" rel="noopener">Đã gửi Fuji · ${tx.tx_hash.slice(0, 8)}…${tx.tx_hash.slice(-6)}</a>`
          : `<small>Mã mô phỏng: ${String(tx.tx_hash || "").slice(0, 10)}…${String(tx.tx_hash || "").slice(-6)}</small>`;
        row.innerHTML = `<div><strong>${tx.note}</strong>${hashHtml}</div><b>${badgeText}</b>`;
        creditTxList.prepend(row);
      }
    }

    async function sendBrowserBuyCreditsTx(avaxAmount) {
      const provider = window.avalanche || window.ethereum;
      if (!provider || !contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(beneficiaryWallet)) {
        return null;
      }
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const from = accounts?.[0];
      if (!from) return null;
      const targetHexChain = "0x" + chainIdNum.toString(16);
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: targetHexChain }],
        });
      } catch (switchErr) {
        if (switchErr?.code === 4902) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: targetHexChain,
                chainName: "Avalanche Fuji C-Chain",
                nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
                rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
                blockExplorerUrls: ["https://testnet.snowtrace.io/"],
              },
            ],
          });
        } else {
          throw switchErr;
        }
      }
      const weiBigInt = BigInt(Math.round(avaxAmount * 1e6)) * 1000000000000n;
      const paddedAddr = beneficiaryWallet.slice(2).toLowerCase().padStart(64, "0");
      const data = "0xf1716b4c" + paddedAddr;
      return await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to: contractAddress,
            value: "0x" + weiBigInt.toString(16),
            data,
          },
        ],
      });
    }

    const btnSubmitExchange = field("btn-submit-exchange");
    let isSubmittingExchange = false;

    creditExchangeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (isSubmittingExchange) return;
      const csrf = getCsrfToken();
      if (!csrf) {
        if (exchangeStatusMsg) {
          exchangeStatusMsg.textContent = "Vui lòng đăng nhập để giao dịch AVAX → LÚA.";
          exchangeStatusMsg.style.color = "#b84245";
        }
        return;
      }
      isSubmittingExchange = true;
      if (btnSubmitExchange) btnSubmitExchange.disabled = true;
      const amount = Number(exchangeAmountInput?.value || 0);
      if (exchangeStatusMsg) {
        exchangeStatusMsg.textContent = "Đang gửi giao dịch lên Avalanche Fuji…";
        exchangeStatusMsg.style.color = "#1a654d";
      }
      try {
        let res = await fetch("/api/auth/exchange-credits", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({ direction: "AVAX_TO_CREDIT", amount }),
        });
        let payload = await res.json();

        if (res.status === 503 && (window.avalanche || window.ethereum) && contractAddress) {
          if (exchangeStatusMsg) {
            exchangeStatusMsg.textContent = "Đang mở ví Core / MetaMask để ký giao dịch Fuji…";
            exchangeStatusMsg.style.color = "#1a654d";
          }
          const browserTxHash = await sendBrowserBuyCreditsTx(amount);
          if (browserTxHash) {
            if (exchangeStatusMsg) {
              exchangeStatusMsg.textContent = "Đang xác minh giao dịch trên Avalanche Fuji…";
            }
            res = await fetch("/api/auth/exchange-credits", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrf,
              },
              body: JSON.stringify({
                direction: "AVAX_TO_CREDIT",
                amount,
                tx_hash: browserTxHash,
              }),
            });
            payload = await res.json();
          }
        }

        if (!res.ok || payload.error) {
          if (exchangeStatusMsg) {
            exchangeStatusMsg.textContent = payload.error || "Giao dịch Fuji thất bại.";
            exchangeStatusMsg.style.color = "#b84245";
          }
          return;
        }
        applyBalanceAndTxUpdate(payload.data);
        if (exchangeStatusMsg) {
          exchangeStatusMsg.textContent = "Đã hoàn tất giao dịch AVAX → LÚA trên Avalanche Fuji.";
          exchangeStatusMsg.style.color = "#1a654d";
        }
      } catch {
        if (exchangeStatusMsg) {
          exchangeStatusMsg.textContent = "Lỗi kết nối máy chủ hoặc ví trình duyệt.";
          exchangeStatusMsg.style.color = "#b84245";
        }
      } finally {
        isSubmittingExchange = false;
        if (btnSubmitExchange) btnSubmitExchange.disabled = false;
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
      if (userId) {
        const res = await fetch("/api/auth/field-profile", {
          method: "POST",
          headers: {"Content-Type": "application/json", "X-CSRF-Token": csrf},
          body: JSON.stringify({
            address: profile["farmer-address"],
            cultivar: profile["farmer-cultivar"],
            area: profile["farmer-area"],
            hydrology_station: profile["hydrology-station"],
          }),
        });
        const payload = await res.json();
        if (!res.ok || payload.error) { status.textContent = payload.error || "Không thể lưu thông tin ruộng trên máy chủ."; return; }
        localStorage.removeItem(profileKey);
      } else localStorage.setItem(profileKey, JSON.stringify(profile));
      renderProfile(profile);
      status.textContent = csrf
        ? "Đã lưu hồ sơ tài khoản và thông tin ruộng trên máy chủ."
        : "Đã lưu hồ sơ demo trên trình duyệt này.";
    } catch {
      status.textContent = "Trình duyệt đang chặn lưu hồ sơ.";
    }
  });

  if (document.querySelector("[data-header-credits]")) {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        const info = payload?.data?.wallet_info;
        if (!info) return;
        if (info.onchain_write_enabled && info.onchain_credits !== undefined && info.onchain_credits !== null) {
          document.querySelectorAll("[data-header-credits]").forEach((el) => {
            el.textContent = `${info.onchain_credits} LÚA`;
          });
          document.querySelectorAll("[data-profile-credits]").forEach((el) => {
            el.textContent = String(info.onchain_credits);
          });
        }
        if (info.onchain_avax !== undefined && info.onchain_avax !== null) {
          document.querySelectorAll("[data-profile-avax]").forEach((el) => {
            el.textContent = Number(info.onchain_avax).toFixed(4);
          });
        }
      })
      .catch(() => {});
  }

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
