import { spawn } from "node:child_process";

async function test() {
  const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=9228",
    "--user-data-dir=C:\\Users\\Admin\\AppData\\Local\\Temp\\chrome-qa-test-auth-" + Date.now()
  ]);
  await new Promise(r => setTimeout(r, 1500));
  const tabRes = await fetch("http://127.0.0.1:9228/json/new?http://127.0.0.1:5000/login", { method: "PUT" });
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

  // Fill in credentials and submit form
  await send("Runtime.evaluate", {
    expression: `
      document.getElementById("identifierInput").value = "check_cookie_7630";
      document.getElementById("secretInput").value = "Password@123";
      document.getElementById("loginForm").requestSubmit();
    `
  });
  console.log("Submitted loginForm!");
  await new Promise(r => setTimeout(r, 2000));

  // Check URL
  const urlRes = await send("Runtime.evaluate", { expression: "window.location.href", returnByValue: true });
  console.log("URL after login:", urlRes.result?.value);

  // Navigate to /assistant
  await send("Page.navigate", { url: "http://127.0.0.1:5000/assistant" });
  await new Promise(r => setTimeout(r, 1500));
  const assistantUrl = await send("Runtime.evaluate", { expression: "window.location.href", returnByValue: true });
  console.log("URL after navigating to /assistant:", assistantUrl.result?.value);

  const headingRes = await send("Runtime.evaluate", { expression: "document.querySelector('h1')?.textContent", returnByValue: true });
  console.log("Page heading:", headingRes.result?.value);

  chrome.kill();
}
test().catch(console.error);
