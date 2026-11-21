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


def call(path: str, payload: dict, base_url: str = origin) -> dict:
    try:
        with urlopen(Request(base_url + path, data=json.dumps(payload).encode(), headers=headers), timeout=275) as response:
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
    base = {"varietyId": "OM5451", "locationId": "can-tho", "stage": "flowering", "dayAfterSowing": 75,
              "salinityGl": 4.2, "salinitySite": "fieldWater", "waterDepthCm": 36, "plantHeightCm": 90,
              "tempMaxC": 35, "rootZoneEcDsM": None, "ecIsSeasonAverage": False, "exposureDays": 7,
              "useWeather": False, "requestAi": False}
    cases = [
        {**base, "stage": "panicle", "dayAfterSowing": 48, "salinityGl": 2.8, "waterDepthCm": 4.5, "plantHeightCm": None, "tempMaxC": 28.5},
        base,
        {**base, "stage": "tillering", "dayAfterSowing": 30, "salinitySite": "canalWater", "salinityGl": 5, "waterDepthCm": 12, "plantHeightCm": 70, "tempMaxC": 29},
    ]
    output = Path(__file__).resolve().parents[2] / "output" / "co-ma-advice-regression.json"
    output.parent.mkdir(exist_ok=True)
    start_case = int(os.environ.get("MACH_DONG_QA_START_CASE", "1"))
    results = json.loads(output.read_text(encoding="utf-8"))[:start_case - 1] if start_case > 1 else []
    for index, inputs in list(enumerate(cases, 1))[start_case - 1:]:
        answer = call("/api/simulation/advice", inputs, "http://127.0.0.1:5000")
        assert answer["provider"] == "Gemini" and answer["isFallback"] is False
        assert answer["inputSnapshot"] == inputs
        assert 100 < len(answer["reply"]) <= 4096
        for heading in ("Điều kiện đáng chú ý:", "Việc nên làm:", "Cần đo thêm:", "Khi nào cần nhờ cán bộ nông nghiệp:"):
            assert heading in answer["reply"], heading
        results.append(answer)
        output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"case": index, "status": "passed", "model": answer["model"], "replyLength": len(answer["reply"]), "sourceCount": len(answer["sources"])}, ensure_ascii=False), flush=True)
    print(json.dumps({"status": "passed", "cases": len(results), "output": str(output)}, ensure_ascii=False))
finally:
    call("/api/account/logout", {})
