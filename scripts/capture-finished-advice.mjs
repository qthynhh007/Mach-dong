import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIR = "K:/Unihack/output/antigravity-testing";
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://127.0.0.1:5000";

async function run() {
  const chrome = spawn(CHROME_PATH, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=9232",
    "--user-data-dir=C:\\Users\\Admin\\AppData\\Local\\Temp\\chrome-qa-advice-shot-" + Date.now()
  ]);
  await new Promise(r => setTimeout(r, 1500));
  const tabRes = await fetch("http://127.0.0.1:9232/json/new?http://127.0.0.1:5000/login", { method: "PUT" });
  const tab = await tabRes.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const send = (m, p = {}) => new Promise((res, rej) => {
    const cur = id++;
    const h = (e) => { const d = JSON.parse(e.data); if (d.id === cur) { ws.removeEventListener("message", h); if(d.error) rej(d.error); else res(d.result); } };
    ws.addEventListener("message", h);
    ws.send(JSON.stringify({ id: cur, method: m, params: p }));
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  // Login
  await send("Runtime.evaluate", {
    expression: `
      document.getElementById("identifierInput").value = "check_cookie_7630";
      document.getElementById("secretInput").value = "Password@123";
      document.getElementById("loginForm").requestSubmit();
    `
  });
  await new Promise(r => setTimeout(r, 1800));

  // Navigate to simulation
  await send("Page.navigate", { url: `${BASE_URL}/simulation` });
  await new Promise(r => setTimeout(r, 2000));

  // Run D1 and Ask AI
  await send("Runtime.evaluate", {
    expression: `
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

      document.getElementById('runSimulation')?.click();
    `
  });
  await new Promise(r => setTimeout(r, 2000));

  await send("Runtime.evaluate", {
    expression: `document.getElementById('explainReport')?.click();`
  });

  // Poll until reportExplanation has content
  console.log("Waiting for AI advice to render in report...");
  for (let i = 0; i < 25; i++) {
    const hasContent = await send("Runtime.evaluate", {
      expression: `document.getElementById('reportExplanation')?.children.length > 0`
    });
    if (hasContent.result?.value) {
      console.log("AI Advice rendered!");
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Scroll advice card into view
  await send("Runtime.evaluate", {
    expression: `
      const card = document.getElementById('reportAdviceCard');
      if (card) card.scrollIntoView({ behavior: 'instant', block: 'center' });
      const fold = document.getElementById('reportAdviceSourcesFold');
      if (fold) fold.open = true;
    `
  });
  await new Promise(r => setTimeout(r, 600));

  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUTPUT_DIR, "10_simulation_d1_report_advice_1440.png"), Buffer.from(shot.data, "base64"));
  console.log("Saved completed 10_simulation_d1_report_advice_1440.png");

  chrome.kill();
}

run().catch(console.error);
