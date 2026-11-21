"""Cò Mạ chat with reference-assisted or general AI answers; keys stay server-side."""

import json
from urllib import error, request

from src.services.ai_client import GeminiError
from src.services.cloud_session import cloud_session_headers


class cloudAssistantService:
    def __init__(self, apiUrl: str, transport=None) -> None:
        self.apiUrl = apiUrl.rstrip("/")
        if not self.apiUrl.startswith("https://"):
            raise ValueError("Assistant API must use HTTPS")
        self.transport = transport or request.urlopen

    def generateReply(self, messages: list[dict], sourceIds: list[str]) -> tuple[str, list[str]]:
        payload = json.dumps({"messages": messages, "sourceIds": sourceIds}, ensure_ascii=False).encode("utf-8")
        req = request.Request(
            self.apiUrl + "/api/assistant/generate", data=payload,
            headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "MachDongDesktop/2.0", **cloud_session_headers()},
            method="POST",
        )
        try:
            with self.transport(req, timeout=35) as response:
                body = json.load(response)
        except error.HTTPError as exc:
            try:
                body = json.load(exc)
                message = str(body.get("error") or "Cò Mạ tạm thời không khả dụng.")[:300]
            except (ValueError, UnicodeError, AttributeError):
                message = "Cò Mạ tạm thời không khả dụng."
            raise GeminiError(message, exc.code if exc.code in (400, 401, 403, 429, 503, 504) else 502) from exc
        except (error.URLError, TimeoutError, OSError, ValueError) as exc:
            raise GeminiError("Chưa kết nối được với Cò Mạ. Bà con thử lại khi có Internet nha.", 503) from exc
        result = body.get("data") if isinstance(body, dict) else None
        if (
            not isinstance(result, dict)
            or not isinstance(result.get("reply"), str)
            or not isinstance(result.get("source_ids"), list)
            or any(sourceId not in sourceIds for sourceId in result["source_ids"])
        ):
            raise GeminiError("Cò Mạ chưa nhận được phản hồi có nguồn hợp lệ.", 502)
        return result["reply"], result["source_ids"]
