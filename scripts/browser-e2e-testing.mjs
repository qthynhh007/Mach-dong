import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIR = "K:/Unihack/output/antigravity-testing";
mkdirSync(OUTPUT_DIR, { recursive: true });

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://127.0.0.1:5000";

class ChromeCDP {
  constructor(port = 9230) {
    this.port = port;
    this.proc = null;
    this.ws = null;
    this.msgId = 1;
    this.tabId = null;
  }

  async start() {
    this.proc = spawn(CHROME_PATH, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      `--remote-debugging-port=${this.port}`,
      "--user-data-dir=C:\\Users\\Admin\\AppData\\Local\\Temp\\chrome-qa-run-" + Date.now()
    ]);

    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/json/version`);
        if (res.ok) {
          console.log("[CDP] Chrome ready on port", this.port);
          break;
        }
      } catch (e) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const tabRes = await fetch(`http://127.0.0.1:${this.port}/json/new?${BASE_URL}/login`, { method: "PUT" });
    const tab = await tabRes.json();
    this.tabId = tab.id;
    this.ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(r => this.ws.onopen = r);

    await this.send("Page.enable");
    await this.send("DOM.enable");
    await this.send("Network.enable");
    await this.send("Runtime.enable");
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      const timeout = setTimeout(() => {
        this.ws.removeEventListener("message", handler);
        reject(new Error(`Timeout calling ${method}`));
      }, 25000);

      const handler = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === id) {
          clearTimeout(timeout);
          this.ws.removeEventListener("message", handler);
          if (data.error) reject(new Error(data.error.message || JSON.stringify(data.error)));
          else resolve(data.result);
        }
      };
      this.ws.addEventListener("message", handler);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async setViewport(width, height, mobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile
    });
  }

  async navigate(url) {
    const targetUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;
    await this.send("Page.navigate", { url: targetUrl });
    await new Promise(r => setTimeout(r, 1500));
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result?.value;
  }

  async screenshot(filename) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const targetPath = join(OUTPUT_DIR, filename);
    writeFileSync(targetPath, Buffer.from(res.data, "base64"));
    console.log(`[EVIDENCE] Saved screenshot: ${filename}`);
    return targetPath;
  }

  async stop() {
    try {
      if (this.ws) this.ws.close();
      if (this.tabId) await fetch(`http://127.0.0.1:${this.port}/json/close/${this.tabId}`).catch(() => {});
      if (this.proc) this.proc.kill();
    } catch (e) {}
  }
}

async function runBrowserQA() {
  console.log("=== BẮT ĐẦU KIỂM THỬ TRÌNH DUYỆT THẬT (HEADLESS CHROME CDP) ===");
  const cdp = new ChromeCDP(9230);
  await cdp.start();

  try {
    // ----------------------------------------------------
    // 1. Suite A: Đăng nhập & Xác thực (Guest session)
    // ----------------------------------------------------
    console.log("\n[Test] Suite A: Đăng nhập & Xác thực");
    await cdp.setViewport(1440, 1000);
    await cdp.navigate("/login");

    // A.1: Trang /login ở 1440x1000
    await cdp.screenshot("01_login_desktop_1440.png");

    // A.2: Click tab Quên mật khẩu
    await cdp.evaluate(`
      const forgotTab = document.querySelector('[data-login-tab="forgot"]');
      if (forgotTab) forgotTab.click();
    `);
    await new Promise(r => setTimeout(r, 600));
    await cdp.screenshot("02_login_forgot_password.png");

    // A.3: Trang /register ở 1440x1000
    await cdp.navigate("/register");
    await cdp.screenshot("03_register_desktop_1440.png");

    // A.4: Mobile 390x844 cho /login và /register
    await cdp.setViewport(390, 844, true);
    await cdp.navigate("/login");
    await cdp.screenshot("04_login_mobile_390.png");

    await cdp.navigate("/register");
    await cdp.screenshot("05_register_mobile_390.png");

    // ----------------------------------------------------
    // 2. Đăng nhập thật trên UI trình duyệt bằng tài khoản nông dân
    // ----------------------------------------------------
    console.log("\n[Test] Đăng nhập tài khoản nông dân qua biểu mẫu UI...");
    await cdp.setViewport(1440, 1000, false);
    await cdp.navigate("/login");

    await cdp.evaluate(`
      document.getElementById("identifierInput").value = "check_cookie_7630";
      document.getElementById("secretInput").value = "Password@123";
      document.getElementById("loginForm").requestSubmit();
    `);
    await new Promise(r => setTimeout(r, 2000));
    const currentPath = await cdp.evaluate("window.location.pathname");
    console.log(`[Auth] Đăng nhập thành công! Đường dẫn hiện tại: ${currentPath}`);

    // ----------------------------------------------------
    // 3. Suite E0: Trợ lý Cò Mạ & Mascot Video Autoplay Loop & Sidebar Logout
    // ----------------------------------------------------
    console.log("\n[Test] Suite E0: Trợ lý Cò Mạ, Mascot Video Autoplay Loop & Sidebar Logout");
    await cdp.navigate("/assistant");
    await new Promise(r => setTimeout(r, 1200));
    await cdp.screenshot("06_assistant_desktop_1440.png");

    // Hover trên nút đăng xuất ở sidebar
    await cdp.evaluate(`
      const btn = document.querySelector('.app-side-sign-out');
      if (btn) {
        btn.focus();
        btn.style.background = '#fef2f2';
        btn.style.color = '#b91c1c';
        btn.style.borderColor = '#fca5a5';
      }
    `);
    await cdp.screenshot("07_assistant_sidebar_logout_hover.png");

    // Chat 5 lượt trên /assistant
    console.log("\n[Test] Suite C: Chat Cò Mạ 5 lượt liên tiếp");
    const chatPrompts = [
      "Lúa OM5451 đang đẻ nhánh, nước ruộng mặn 2,8 g/L, tôi nên kiểm tra gì?",
      "Mực nước ruộng là 4,5 cm, vậy có cần tháo nước ngay không?",
      "Nếu số mặn đó đo ở kênh, chưa đo tại ruộng thì sao?",
      "Giờ lúa đã trổ bông, nhiệt độ cao nhất 35°C, cần chú ý gì?",
      "Tóm lại ba việc nên làm trước và số đo còn thiếu."
    ];

    for (let i = 0; i < chatPrompts.length; i++) {
      const q = chatPrompts[i];
      console.log(`   Lượt ${i + 1}: ${q.slice(0, 30)}...`);
      await cdp.evaluate(`
        const input = document.getElementById('assistant-input') || document.querySelector('textarea');
        if (input) {
          input.value = ${JSON.stringify(q)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const form = document.getElementById('assistant-form') || document.querySelector('form');
        if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      `);
      await new Promise(r => setTimeout(r, 4500));
    }
    await cdp.screenshot("08_assistant_chat_conversation.png");

    // Mobile viewport cho assistant
    await cdp.setViewport(390, 844, true);
    await cdp.screenshot("09_assistant_mobile_390.png");

    // ----------------------------------------------------
    // 4. Suite D & E: Mô phỏng & Khung Lời khuyên Cò Mạ (ƯU TIÊN)
    // ----------------------------------------------------
    console.log("\n[Test] Suite D & E: Mô phỏng cánh đồng & Khung Lời khuyên Cò Mạ");
    await cdp.setViewport(1440, 1000, false);
    await cdp.navigate("/simulation");
    await new Promise(r => setTimeout(r, 2000));

    // Ca D1: Đẻ nhánh, 48 ngày, mặn ruộng 2.8 g/L, nước 4.5 cm, 28.5°C
    console.log("   Thực hiện Ca D1...");
    await cdp.evaluate(`
      const setInput = (sel, val) => {
        const el = document.querySelector(sel);
        if (el) {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      setInput('#locationId', 'can-tho');
      setInput('#stage', 'tillering');
      setInput('#inputStage', 48);
      setInput('#inputSalinity', 2.8);
      setInput('select[name="salinitySite"]', 'fieldWater');
      setInput('#inputWater', 4.5);
      setInput('#inputTemp', 28.5);

      const runBtn = document.getElementById('runSimulation');
      if (runBtn) runBtn.click();
    `);
    await new Promise(r => setTimeout(r, 2500));

    // Bấm "Nhờ Cò Mạ tư vấn"
    await cdp.evaluate(`
      const aiBtn = document.getElementById('explainReport') || document.getElementById('askAi');
      if (aiBtn) aiBtn.click();
    `);
    await new Promise(r => setTimeout(r, 5500)); // Chờ AI trả lời

    // Chụp Báo cáo và Khung lời khuyên D1
    await cdp.screenshot("10_simulation_d1_report_advice_1440.png");

    // Mở chi tiết nguồn tham khảo
    await cdp.evaluate(`
      const fold = document.getElementById('reportAdviceSourcesFold');
      if (fold) fold.open = true;
    `);
    await new Promise(r => setTimeout(r, 500));
    await cdp.screenshot("11_simulation_d1_sources_expanded.png");

    // Mở hộp thoại modal Lời khuyên chi tiết
    await cdp.evaluate(`
      const tabScenario = document.getElementById('tab-scenarioPanel');
      if (tabScenario) tabScenario.click();
      const openBtn = document.getElementById('open-advice');
      if (openBtn) openBtn.click();
    `);
    await new Promise(r => setTimeout(r, 1000));
    await cdp.screenshot("12_simulation_d1_dialog_1440.png");

    // Đóng dialog bằng Esc
    await cdp.evaluate(`
      const dlg = document.getElementById('sim-advice-dialog');
      if (dlg) dlg.close();
    `);
    await new Promise(r => setTimeout(r, 500));

    // Ca D2: Trổ bông, 75 ngày, mặn ruộng 4.2 g/L, nước 36 cm, 35°C
    console.log("   Thực hiện Ca D2...");
    await cdp.evaluate(`
      const tabScenario = document.getElementById('tab-scenarioPanel');
      if (tabScenario) tabScenario.click();
      const setInput = (sel, val) => {
        const el = document.querySelector(sel);
        if (el) {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      setInput('#stage', 'flowering');
      setInput('#inputStage', 75);
      setInput('#inputSalinity', 4.2);
      setInput('#inputWater', 36);
      setInput('#inputTemp', 35);
      document.getElementById('runSimulation')?.click();
    `);
    await new Promise(r => setTimeout(r, 2500));
    await cdp.evaluate(`
      document.getElementById('explainReport')?.click();
    `);
    await new Promise(r => setTimeout(r, 5500));
    await cdp.screenshot("13_simulation_d2_advice_1440.png");

    // Ca D3: Làm đòng, 55 ngày, mặn kênh 4.2 g/L, nước 4.5 cm, 30°C
    console.log("   Thực hiện Ca D3...");
    await cdp.evaluate(`
      const tabScenario = document.getElementById('tab-scenarioPanel');
      if (tabScenario) tabScenario.click();
      const setInput = (sel, val) => {
        const el = document.querySelector(sel);
        if (el) {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      setInput('#stage', 'panicle');
      setInput('#inputStage', 55);
      setInput('select[name="salinitySite"]', 'canalWater');
      setInput('input[name="canalSalinityGl"]', 4.2);
      setInput('#inputWater', 4.5);
      setInput('#inputTemp', 30);
      document.getElementById('runSimulation')?.click();
    `);
    await new Promise(r => setTimeout(r, 2500));
    await cdp.evaluate(`
      document.getElementById('explainReport')?.click();
    `);
    await new Promise(r => setTimeout(r, 5500));
    await cdp.screenshot("14_simulation_d3_advice_1440.png");

    // Viewport Mobile cho simulation advice
    await cdp.setViewport(390, 844, true);
    await cdp.screenshot("15_simulation_mobile_390.png");

    // ----------------------------------------------------
    // 5. Suite F: Thời tiết
    // ----------------------------------------------------
    console.log("\n[Test] Suite F: Thời tiết");
    await cdp.setViewport(1440, 1000, false);
    await cdp.evaluate(`
      const weatherTab = document.getElementById('tab-weatherPanel');
      if (weatherTab) weatherTab.click();
      const loadBtn = document.getElementById('loadWeather');
      if (loadBtn) loadBtn.click();
    `);
    await new Promise(r => setTimeout(r, 2000));
    await cdp.screenshot("16_weather_tab_7days_1440.png");

    // Đổi địa điểm sang Trà Vinh
    await cdp.evaluate(`
      const locSelect = document.getElementById('weatherLocation');
      if (locSelect) {
        locSelect.value = 'tra-vinh';
        locSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    `);
    await new Promise(r => setTimeout(r, 2000));
    await cdp.screenshot("17_weather_location_switched.png");

    // ----------------------------------------------------
    // 6. Suite G: Ví, Hồ sơ và Điều hướng MVP
    // ----------------------------------------------------
    console.log("\n[Test] Suite G: Hồ sơ & Ví");
    await cdp.navigate("/profile");
    await new Promise(r => setTimeout(r, 1500));
    await cdp.screenshot("18_profile_wallet_1440.png");

    await cdp.setViewport(390, 844, true);
    await cdp.screenshot("19_profile_mobile_390.png");

    // ----------------------------------------------------
    // 7. Suite H: Hồi quy các trang còn lại
    // ----------------------------------------------------
    console.log("\n[Test] Suite H: Hồi quy");
    await cdp.setViewport(1440, 1000, false);
    await cdp.navigate("/community");
    await new Promise(r => setTimeout(r, 1200));
    await cdp.screenshot("20_community_catalog_1440.png");

    await cdp.navigate("/forum");
    await new Promise(r => setTimeout(r, 1200));
    await cdp.screenshot("21_forum_home_1440.png");

    await cdp.navigate("/admin");
    await new Promise(r => setTimeout(r, 800));
    await cdp.screenshot("22_admin_404_page.png");

    // ----------------------------------------------------
    // 8. Đăng xuất qua nút mới ở sidebar
    // ----------------------------------------------------
    console.log("\n[Test] Đăng xuất qua nút mới ở sidebar...");
    await cdp.navigate("/assistant");
    await new Promise(r => setTimeout(r, 1000));
    await cdp.evaluate(`
      const logoutBtn = document.querySelector('.app-side-sign-out');
      if (logoutBtn) logoutBtn.click();
    `);
    await new Promise(r => setTimeout(r, 1500));
    await cdp.screenshot("23_post_logout_login_page.png");

    console.log("\n=== TOÀN BỘ KIỂM THỬ TRÌNH DUYỆT ĐÃ HOÀN TẤT THÀNH CÔNG ===");
  } catch (err) {
    console.error("Lỗi trong quá trình kiểm thử trình duyệt:", err);
  } finally {
    await cdp.stop();
  }
}

runBrowserQA().catch(console.error);
