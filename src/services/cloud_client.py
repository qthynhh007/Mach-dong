"""Transport to the deployed simulation service or the local development worker."""
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from src.models.simulation import simulationError


class cloudClient:
    def __init__(self, baseUrl: str, transport=None, *, allow_loopback: bool = False) -> None:
        parsed = urlsplit(baseUrl)
        self.is_local = parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "::1"}
        if (
            (parsed.scheme != "https" and not (allow_loopback and self.is_local))
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("SIMULATION_API_URL must be an HTTPS origin or loopback HTTP")
        self.baseUrl = baseUrl.rstrip("/")
        self.transport = transport or urlopen

    def request(self, path: str, payload: dict | None = None) -> dict:
        body = json.dumps(payload, allow_nan=False).encode("utf-8") if payload is not None else None
        request = Request(self.baseUrl + path, data=body,
                          headers={"Content-Type": "application/json", "Accept": "application/json",
                                   "User-Agent": "MachDongDesktop/2.0"})
        try:
            with self.transport(request, timeout=35) as response:
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
            raise simulationError(message, error.code if error.code in (400, 413, 415, 429, 502, 503) else 502) from error
        except (URLError, TimeoutError, OSError, ValueError) as error:
            message = (
                "Chưa kết nối được máy chủ mô phỏng trên máy này."
                if self.is_local
                else "Không kết nối được máy chủ mô phỏng. Kiểm tra kết nối Internet rồi thử lại."
            )
            raise simulationError(message, 503) from error
