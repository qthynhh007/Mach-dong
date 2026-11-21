"""Clients for Cò Mạ chat and cloud simulation."""

import json
import logging
from collections.abc import Sequence
from time import monotonic, sleep
from typing import Literal, TypedDict
from urllib.error import HTTPError, URLError
from urllib.request import Request

from src.services.cloud_client import cloudClient
from src.services.http_transport import default_urlopen as urlopen

GEMINI_MODEL = "gemini-3.5-flash"
GEMINI_MODEL_LABEL = "Gemini 3.5 Flash"
GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite"
GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_PRIMARY_TIMEOUT_SECONDS = 12
GEMINI_FALLBACK_TIMEOUT_SECONDS = 15
logger = logging.getLogger(__name__)


class ChatMessage(TypedDict):
    role: Literal["user", "model"]
    text: str


class GeminiError(Exception):
    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.status = status


def _parse_reply(raw: bytes) -> tuple[str, list[str]]:
    response = json.loads(raw)
    if response.get("promptFeedback", {}).get("blockReason"):
        raise GeminiError("Cò Mạ chưa thể trả lời câu này. Bà con thử diễn đạt lại nha.", 422)
    candidate = response["candidates"][0]
    finish_reason = candidate.get("finishReason")
    if finish_reason == "MAX_TOKENS":
        raise ValueError("Incomplete Gemini response")
    if finish_reason not in (None, "STOP"):
        raise GeminiError("Cò Mạ chưa thể trả lời câu này. Bà con thử diễn đạt lại nha.", 422)
    parts = candidate["content"]["parts"]
    answer = json.loads("".join(
        part.get("text", "") for part in parts if not part.get("thought")
    ))
    reply, source_ids = answer["reply"], answer["source_ids"]
    if (
        not isinstance(reply, str)
        or not reply.strip()
        or not isinstance(source_ids, list)
        or not all(isinstance(source_id, str) for source_id in source_ids)
    ):
        raise ValueError("Invalid Gemini reply")
    return reply.strip(), source_ids


def _fetch_reply(api_key: str, payload: dict) -> tuple[str, list[str]]:
    deadline = monotonic() + GEMINI_PRIMARY_TIMEOUT_SECONDS + GEMINI_FALLBACK_TIMEOUT_SECONDS
    busy = GeminiError("Cò Mạ đang bận. Bà con thử lại sau nha.", 503)
    failure = busy
    for model, limit, thinking in (
        (GEMINI_MODEL, GEMINI_PRIMARY_TIMEOUT_SECONDS, "LOW"),
        (GEMINI_FALLBACK_MODEL, GEMINI_FALLBACK_TIMEOUT_SECONDS, "MINIMAL"),
    ):
        if model == GEMINI_FALLBACK_MODEL:
            sleep(0.35)
        started = monotonic()
        remaining = deadline - started
        if remaining <= 0:
            break
        payload["generationConfig"]["thinkingConfig"] = {"thinkingLevel": thinking}
        request = Request(
            f"{GEMINI_MODELS_URL}/{model}:generateContent",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            method="POST",
        )
        outcome: str | int = "ok"
        try:
            with urlopen(request, timeout=min(remaining, limit)) as response:
                return _parse_reply(response.read())
        except HTTPError as error:
            outcome = error.code
            if error.code != 503:
                raise
            error.close()
            failure = busy
        except OSError as error:
            outcome = "connection_error"
            reason = error.reason if isinstance(error, URLError) else error
            if not isinstance(reason, TimeoutError):
                raise
            outcome = "timeout"
            failure = GeminiError("Tư vấn đang mất nhiều thời gian hơn dự kiến. Bà con có thể gửi lại câu hỏi.", 504)
        except (ValueError, KeyError, IndexError, TypeError, AttributeError):
            outcome = "invalid_response"
            failure = GeminiError(
                "Cò Mạ chưa nhận được câu trả lời đầy đủ. Bà con có thể gửi lại câu hỏi."
            )
        except GeminiError as error:
            outcome = error.status
            raise
        finally:
            logger.info(
                "Gemini model=%s outcome=%s duration_ms=%.0f",
                model, outcome, (monotonic() - started) * 1_000,
            )
    raise failure


def generate_reply(
    api_key: str,
    instruction: str,
    messages: Sequence[ChatMessage],
    evidence: str,
    allowed_source_ids: Sequence[str],
) -> tuple[str, list[str]]:
    contents = [
        {"role": turn["role"], "parts": [{"text": turn["text"]}]}
        for turn in messages
    ]
    contents[-1]["parts"].insert(0, {"text": evidence})
    payload = {
        "systemInstruction": {"parts": [{"text": instruction}]},
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "reply": {"type": "STRING"},
                    "source_ids": {
                        "type": "ARRAY",
                        "items": {"type": "STRING", **({"enum": list(allowed_source_ids)} if allowed_source_ids else {})},
                        "maxItems": len(allowed_source_ids),
                    },
                },
                "required": ["reply", "source_ids"],
            },
        },
    }
    try:
        return _fetch_reply(api_key, payload)
    except HTTPError as error:
        code = error.code
        error.close()
        if code in (401, 403, 404):
            raise GeminiError(
                "Cò Mạ đang tạm gián đoạn. Bà con thử lại sau nha."
            ) from None
        if code == 429:
            raise GeminiError(
                "Cò Mạ đang nhận nhiều câu hỏi. Bà con thử lại sau nha.", 429
            ) from None
        raise GeminiError("Cò Mạ đang gặp trục trặc. Bà con thử lại nha.") from None
    except OSError:
        raise GeminiError(
            "Kết nối với Cò Mạ bị gián đoạn. Bà con thử lại nha."
        ) from None


class aiClient:
    """Shared cloud API; Gemini secrets and inference stay on the server."""
    def __init__(self, cloud: cloudClient) -> None:
        self.cloud = cloud

    def simulate(self, payload: dict) -> dict:
        return self.cloud.request("/api/simulation", payload)
