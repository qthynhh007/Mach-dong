"""HTTPS-only transport: no fallback predictions or desktop API keys."""
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from src.models.simulation import simulationError
from src.services.cloud_session import cloud_session_headers
from src.services.http_transport import default_urlopen


class cloudClient:
    def __init__(self, baseUrl: str, transport=None) -> None:
        parsed = urlsplit(baseUrl)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.query or parsed.fragment:
            raise ValueError("SIMULATION_API_URL must be an HTTPS origin")
        self.baseUrl = baseUrl.rstrip("/")
        self.transport = transport or default_urlopen

    def request(self, path: str, payload: dict | None = None) -> dict:
        body = json.dumps(payload, allow_nan=False).encode("utf-8") if payload is not None else None
        request = Request(self.baseUrl + path, data=body,
                          headers={"Content-Type": "application/json", "Accept": "application/json",
                                   "User-Agent": "MachDongDesktop/2.0", **cloud_session_headers()})
        try:
            with self.transport(request, timeout=275 if path == "/api/simulation/advice" else 35) as response:
                raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise simulationError("Dữ liệu máy chủ vượt giới hạn.", 502)
            result = json.loads(raw)
            if not isinstance(result, dict) or result.get("error") or not isinstance(result.get("data"), dict):
                raise simulationError("Phản hồi máy chủ chưa hợp lệ.", 502)
            return result["data"]
        except HTTPError as error:
            message = "Máy chủ mô phỏng tạm thời không khả dụng. Không có dự đoán thay thế."
            try:
                parsed = json.loads(error.read(8192))
                if isinstance(parsed.get("error"), str):
                    message = parsed["error"][:500]
            except (ValueError, AttributeError):
                pass
            raise simulationError(message, error.code if error.code in (400, 401, 403, 413, 415, 429, 502, 503, 504) else 502) from error
        except (URLError, TimeoutError, OSError, ValueError) as error:
            raise simulationError("Không kết nối được máy chủ. Cần Internet để mô phỏng; hãy thử lại.", 503) from error
