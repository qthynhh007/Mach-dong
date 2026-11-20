"""Read versioned public reference files from the shared Site."""

from threading import Lock
from time import monotonic
from urllib import error, parse, request

from flask import current_app, has_app_context

from src.config import MAX_CSV_BYTES
from src.services.cloud_session import cloud_session_headers


class referenceUnavailable(RuntimeError):
    pass


class cloudReferenceService:
    allowedNames = frozenset((
        "co-ma-knowledge.json", "lua-man-ngap-sources.json", "forum-source-posts.json",
        "dbscl-man-muc-nuoc-2026.csv", "long-huu-man-ngap-demo.csv",
        "long-huu-man-ruong.csv", "ba-tri-muc-nuoc.csv", "go-cong-nhiet-do.csv",
        "cu-lao-dung-do-ph.csv", "catalog.json", "forum-photo-assets.json", "rice-field-diaries.json",
        "faostat-viet-nam-rice-production.csv", "faostat-viet-nam-rice-yields.csv",
        *(f"nasa-power-{place}-2025.csv" for place in ("ba-tri", "ca-mau", "can-tho", "chau-doc", "go-cong", "long-my", "soc-trang", "tra-vinh")),
    ))

    def __init__(self, apiUrl: str, transport=None, ttlSeconds: int = 300) -> None:
        self.apiUrl = apiUrl.rstrip("/")
        if not self.apiUrl.startswith("https://"):
            raise ValueError("Reference API must use HTTPS")
        self.transport = transport or request.urlopen
        self.ttlSeconds = ttlSeconds
        self.cache: dict[str, tuple[float, bytes]] = {}
        self.lock = Lock()

    def readBytes(self, name: str) -> bytes:
        if name not in self.allowedNames:
            raise ValueError("Unknown reference file")
        with self.lock:
            cached = self.cache.get(name)
            if cached and cached[0] > monotonic():
                return cached[1]
        url = self.apiUrl + "/api/reference/" + parse.quote(name, safe="")
        req = request.Request(url, headers={"Accept": "text/csv, application/json", "User-Agent": "MachDongDesktop/2.0", **cloud_session_headers()})
        try:
            with self.transport(req, timeout=15) as response:
                data = response.read(MAX_CSV_BYTES + 1)
        except (error.HTTPError, error.URLError, TimeoutError, OSError) as exc:
            raise referenceUnavailable("Không tải được dữ liệu tham chiếu từ máy chủ. Hãy thử lại khi có Internet.") from exc
        if not data or len(data) > MAX_CSV_BYTES:
            raise referenceUnavailable("Dữ liệu tham chiếu trên máy chủ không hợp lệ.")
        with self.lock:
            self.cache[name] = (monotonic() + self.ttlSeconds, data)
        return data


def referenceBytes(path) -> bytes:
    if has_app_context():
        service = current_app.extensions.get("referenceService")
        if service is not None:
            return service.readBytes(path.name)
    return path.read_bytes()
