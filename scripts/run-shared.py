"""Serve the local interface; account, data and AI credentials stay on the shared server."""

import json
import os
import socket
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from src.config import SIMULATION_API_URL
from src.services.shared_runtime import shared_app_config, validate_shared_health

origin = os.environ.get("MACH_DONG_SHARED_API_URL", SIMULATION_API_URL).strip().rstrip("/")
port = int(os.environ.get("MACH_DONG_LOCAL_WEB_PORT", "5000"))
config = shared_app_config(origin, port)
print(f"Mạch Đồng · giao diện local, backend dùng chung: {origin}", flush=True)
print("Không cần nhập API key AI trên máy người dùng.", flush=True)
ready = False
try:
    req = Request(origin + "/api/health", headers={"Accept": "application/json", "User-Agent": "MachDongDesktop/2.0"})
    with urlopen(req, timeout=10) as response:
        health = json.load(response)
    validate_shared_health(health)
    ready = True
    print("[OK] Backend đã khai báo đủ chat Cò Mạ và tư vấn mô phỏng. Hãy thử câu hỏi thật để kiểm tra hạn mức.", flush=True)
except (URLError, OSError, ValueError) as error:
    message = str(error) if isinstance(error, ValueError) else "Không kết nối được backend. Kiểm tra Internet hoặc báo nhóm vận hành."
    print(f"[CHƯA SẴN SÀNG] {message}", flush=True)
if "--check" in sys.argv:
    raise SystemExit(0 if ready else 1)

with socket.socket() as probe:
    if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    try:
        probe.bind(("127.0.0.1", port))
    except OSError:
        raise SystemExit(f"Cổng {port} đang được dùng. Đóng phiên cũ hoặc chạy scripts/run-local.ps1 -Port {port + 1}.") from None

from src.main import createApp

app = createApp(config)
app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)
