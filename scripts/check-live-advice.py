"""Check real scenario advice against the loopback API; never persist credentials."""
import getpass
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

origin = "http://127.0.0.1:8787"
password = os.environ.get("MACH_DONG_QA_PASSWORD") or (
    getpass.getpass("Local account password: ") if sys.stdin.isatty() else sys.stdin.readline().strip()
)
if not password:
    raise SystemExit("A local test account password is required")
headers = {"Content-Type": "application/json"}


def call(path: str, payload: dict) -> dict:
    try:
        with urlopen(Request(origin + path, data=json.dumps(payload).encode(), headers=headers), timeout=275) as response:
            result = json.load(response)
    except HTTPError as error:
        raise RuntimeError(json.load(error).get("error", "Local API request failed")) from None
    if result.get("error"):
        raise RuntimeError(result["error"])
    return result["data"]


session = call("/api/account/login", {"identifier": os.environ.get("MACH_DONG_QA_USER", "nongho"), "password": password})
del password
headers.update({"Authorization": "Bearer " + session["session_token"], "X-CSRF-Token": session["csrf_token"]})
try:
    inputs = {"varietyId": "OM5451", "locationId": "can-tho", "stage": "flowering", "dayAfterSowing": 75,
              "salinityGl": 4.2, "salinitySite": "fieldWater", "waterDepthCm": 36, "plantHeightCm": 90,
              "tempMaxC": 35, "rootZoneEcDsM": None, "ecIsSeasonAverage": False, "exposureDays": 7,
              "useWeather": False, "requestAi": False}
    answer = call("/api/simulation/advice", inputs)
    assert answer["provider"] == "Gemini" and answer["isFallback"] is False
    assert answer["inputSnapshot"] == inputs
    assert len(answer["reply"]) > 100
    output = Path(__file__).resolve().parents[2] / "output" / "co-ma-api-practical.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(answer, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": "passed", "provider": answer["provider"], "model": answer["model"],
                      "replyLength": len(answer["reply"]), "output": str(output)}, ensure_ascii=False))
finally:
    call("/api/account/logout", {})
