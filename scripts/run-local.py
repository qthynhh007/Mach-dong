"""Run the complete development app with isolated local D1/R2 adapters."""

import atexit
import os
import json
import secrets
import runpy
import signal
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

node = None

def _cleanup():
    global node
    if node and node.poll() is None:
        try:
            node.terminate()
            node.wait(timeout=3)
        except Exception:
            try:
                node.kill()
            except Exception:
                pass

atexit.register(_cleanup)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv

load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / ".env")
backend_mode = os.environ.get("MACH_DONG_BACKEND_MODE", "shared").strip()
if backend_mode not in ("shared", "local"):
    raise SystemExit("MACH_DONG_BACKEND_MODE chỉ nhận shared hoặc local.")
if backend_mode == "shared":
    runpy.run_path(str(ROOT / "scripts" / "run-shared.py"), run_name="__main__")
    raise SystemExit(0)
try:
    node_check = subprocess.run(
        ["node", "--input-type=module", "-e", "import {DatabaseSync} from 'node:sqlite'; new DatabaseSync(':memory:').close();"],
        capture_output=True, text=True, check=True,
    )
except (OSError, subprocess.CalledProcessError):
    raise SystemExit("Cần cài Node.js 22.13 trở lên (khuyên dùng Node.js 24 LTS), rồi mở lại PowerShell.") from None
ai_provider = "groq"
ai_key_name = "GROQ_API_KEY"
ai_ready = bool(os.environ.get(ai_key_name, "").strip())
print("[OK] Python và Node.js SQLite sẵn sàng.", flush=True)
print(
    f"[OK] Đã có {ai_key_name} cho chat và tư vấn mô phỏng ({ai_provider})."
    if ai_ready else
    f"[THIẾU] {ai_key_name}: copy .env.example thành .env.local và điền khóa được cấp. "
    "Chat và tư vấn AI chưa dùng được; các chức năng local khác vẫn chạy.",
    flush=True,
)
if "--check" in sys.argv:
    raise SystemExit(0 if ai_ready else 1)
web_port = int(os.environ.get("MACH_DONG_LOCAL_WEB_PORT", "5000"))
api_port = int(os.environ.get("MACH_DONG_LOCAL_API_PORT") or (8787 if web_port == 5000 else 8787 + (web_port - 5000)))
state = Path(os.environ.get("MACH_DONG_LOCAL_STATE", str(ROOT / "data" / "local-preview"))).resolve()
state.mkdir(parents=True, exist_ok=True)
env = dict(os.environ)
env["AI_PROVIDER"] = "groq"
for legacy_name in ("GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_FALLBACK_MODEL", "GEMINI_QUOTA_FALLBACK"):
    env.pop(legacy_name, None)
env["MACH_DONG_LOCAL_STATE"] = str(state)
env["MACH_DONG_LOCAL_INSTANCE"] = secrets.token_hex(16)
env["MACH_DONG_LOCAL_API_PORT"] = str(api_port)
env["MACH_DONG_LOCAL_WEB_PORT"] = str(web_port)
try:
    with urlopen(f"http://127.0.0.1:{api_port}/__local/health", timeout=1) as response:
        existing = json.load(response)
    with urlopen(f"http://127.0.0.1:{web_port}/login", timeout=2) as response:
        login_html = response.read().decode("utf-8")
    if existing.get("instance") and f'name="mach-dong-local-instance" content="{existing["instance"]}"' in login_html:
        print(f"Mạch Đồng đang chạy đúng bản cục bộ tại http://127.0.0.1:{web_port}")
        raise SystemExit(0)
except (OSError, ValueError):
    pass
for local_port in (api_port, web_port):
    with socket.socket() as probe:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            probe.bind(("127.0.0.1", local_port))
        except OSError as error:
            raise RuntimeError(
                f"Cổng {local_port} đang bị chiếm dụng bởi tiến trình khác. "
                "Chạy 'powershell -ExecutionPolicy Bypass -File scripts/stop-local.ps1' để giải phóng cổng "
                "hoặc dùng 'powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1 -Restart' "
                "hoặc đổi cổng: '-Port 5001'."
            ) from error
node = subprocess.Popen(["node", str(ROOT / "server" / "local.mjs")], cwd=ROOT, env=env,
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8")


def relay_api_output():
    for line in node.stdout:
        print(line, end="", flush=True)


threading.Thread(target=relay_api_output, daemon=True).start()


def transport(req, timeout):
    parsed = urlsplit(req.full_url)
    if parsed.scheme != "https" or parsed.netloc != "local.machdong.test":
        raise ValueError("Unexpected local development origin")
    url = f"http://127.0.0.1:{api_port}{parsed.path}" + ("?" + parsed.query if parsed.query else "")
    return urlopen(Request(url, data=req.data, headers=dict(req.header_items()), method=req.get_method()), timeout=timeout)


try:
    for _ in range(100):
        if node.poll() is not None:
            raise RuntimeError("Local API failed to start")
        try:
            with urlopen(f"http://127.0.0.1:{api_port}/__local/health", timeout=1) as response:
                ready = json.load(response)
            if ready.get("instance") == env["MACH_DONG_LOCAL_INSTANCE"]:
                break
        except OSError:
            time.sleep(0.1)
    else:
        raise RuntimeError("Local API did not start")
    from src.main import createApp

    config = {"TESTING": True, "TEMPLATES_AUTO_RELOAD": True, "SEND_FILE_MAX_AGE_DEFAULT": 0, "GEMINI_API_KEY": "",
              "SECRET_KEY": os.environ.get("MACH_DONG_LOCAL_SESSION_SECRET", "local-preview-only-change-before-sharing"),
              "COMMUNITY_DATABASE": str(state / "flask.sqlite3")}
    for prefix in ("AUTH", "COMMUNITY", "REFERENCE", "ASSISTANT", "SIMULATION"):
        config[prefix + "_API_URL"] = "https://local.machdong.test"
        config[prefix + "_API_TRANSPORT" if prefix != "SIMULATION" else "SIMULATION_TRANSPORT"] = transport
    app = createApp(config)
    @app.context_processor
    def local_instance_context() -> dict:
        return {"local_instance": env["MACH_DONG_LOCAL_INSTANCE"]}
    app.run(host="127.0.0.1", port=web_port, debug=False, use_reloader=False)
finally:
    if node.poll() is None:
        node.terminate()
    node.wait(timeout=10)
