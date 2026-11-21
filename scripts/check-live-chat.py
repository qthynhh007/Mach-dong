"""Exercise a real five-turn chat through Flask; credentials stay in memory."""
import getpass
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

password = os.environ.get("MACH_DONG_QA_PASSWORD") or (
    getpass.getpass("Local account password: ") if sys.stdin.isatty() else sys.stdin.readline().strip()
)
if not password:
    raise SystemExit("A local test account password is required")
headers = {"Content-Type": "application/json"}


def call(origin: str, path: str, payload: dict) -> dict:
    try:
        with urlopen(Request(origin + path, data=json.dumps(payload, ensure_ascii=False).encode(), headers=headers), timeout=125) as response:
            result = json.load(response)
    except HTTPError as error:
        raise RuntimeError(json.load(error).get("error", "Local request failed")) from None
    if result.get("error"):
        raise RuntimeError(result["error"])
    return result["data"]


api = "http://127.0.0.1:8787"
session = call(api, "/api/account/login", {"identifier": os.environ.get("MACH_DONG_QA_USER", "nongho"), "password": password})
del password
headers.update({"Authorization": "Bearer " + session["session_token"], "X-CSRF-Token": session["csrf_token"]})
history: list[dict] = []
results = []
output = Path(__file__).resolve().parents[2] / "output" / "co-ma-chat-upgraded.json"
output.parent.mkdir(exist_ok=True)
questions = [
    "Lúa đang trổ bông, độ mặn tại ruộng hiện tại 4,2 g/L, nước sâu 36 cm, cao cây 90 cm và nhiệt độ 35°C. Tôi cần làm gì trước?",
    "Tôi sửa lại: số mặn đó đo ở kênh, chưa đo trong ruộng. Có nên lấy nước vào không?",
    "Chuyển sang cà phê: vì sao sau một đợt khô rồi có mưa thì cây ra hoa?",
    "Tóm tắt ý chính về cà phê trong hai câu.",
    "Quay lại lúa, vừa đo tại ruộng được 0,5 g/L. Cần kiểm tra gì trước khi lấy nước vào?",
]
try:
    for index, question in enumerate(questions, 1):
        answer = call("http://127.0.0.1:5000", "/api/assistant/chat", {"message": question, "history": history})
        assert isinstance(answer.get("reply"), str) and 20 <= len(answer["reply"]) <= 4096
        assert isinstance(answer.get("sources"), list)
        results.append({"question": question, **answer})
        output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        history.extend([{"role": "user", "text": question}, {"role": "model", "text": answer["reply"]}])
        history = history[-8:]
        print(json.dumps({"turn": index, "status": "passed", "replyLength": len(answer["reply"]), "sourceCount": len(answer["sources"])}, ensure_ascii=False), flush=True)
    print(json.dumps({"status": "passed", "turns": len(results), "output": str(output)}, ensure_ascii=False))
finally:
    call(api, "/api/account/logout", {})
