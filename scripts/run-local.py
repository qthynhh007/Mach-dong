"""Run the complete development app with isolated local D1/R2 adapters."""

import os
import json
import secrets
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv

load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / ".env")
api_port = int(os.environ.get("MACH_DONG_LOCAL_API_PORT", "8787"))
web_port = int(os.environ.get("MACH_DONG_LOCAL_WEB_PORT", "5000"))
state = ROOT / "data" / "local-preview"
state.mkdir(parents=True, exist_ok=True)
env = dict(os.environ)
env["MACH_DONG_LOCAL_STATE"] = str(state)
env["MACH_DONG_LOCAL_INSTANCE"] = secrets.token_hex(16)
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
            raise RuntimeError(f"Port {local_port} is already in use. Stop the previous local server before restarting.") from error
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

    config = {"TESTING": True, "TEMPLATES_AUTO_RELOAD": True, "SECRET_KEY": os.environ.get("MACH_DONG_LOCAL_SESSION_SECRET", "local-preview-only-change-before-sharing"),
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
