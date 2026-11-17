"""Gemini Developer API client used by the Cò Mạ assistant."""

import json
from collections.abc import Sequence
from time import monotonic
from typing import Literal, TypedDict
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

GEMINI_MODEL = "gemini-3.5-flash"
GEMINI_MODEL_LABEL = "Gemini 3.5 Flash"
GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite"
GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_PRIMARY_TIMEOUT_SECONDS = 150
GEMINI_TIMEOUT_SECONDS = 180


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


def _fetch_reply(api_key: str, payload: bytes) -> tuple[str, list[str]]:
    deadline = monotonic() + GEMINI_TIMEOUT_SECONDS
    busy = GeminiError("Gemini đang bận. Bà con thử lại sau nha.", 503)
    failure = busy
    for model in (GEMINI_MODEL, GEMINI_FALLBACK_MODEL):
        remaining = deadline - monotonic()
        if remaining <= 0:
            break
        timeout = remaining
        if model == GEMINI_MODEL:
            timeout = min(timeout, GEMINI_PRIMARY_TIMEOUT_SECONDS)
        request = Request(
            f"{GEMINI_MODELS_URL}/{model}:generateContent",
            data=payload,
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            method="POST",
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                return _parse_reply(response.read())
        except HTTPError as error:
            if error.code != 503:
                raise
            error.close()
            failure = busy
        except OSError as error:
            reason = error.reason if isinstance(error, URLError) else error
            if not isinstance(reason, TimeoutError):
                raise
            failure = GeminiError("Gemini phản hồi quá lâu. Bà con có thể gửi lại câu hỏi.", 504)
        except (ValueError, KeyError, IndexError, TypeError, AttributeError):
            failure = GeminiError(
                "Cò Mạ chưa nhận được câu trả lời đầy đủ. Bà con có thể gửi lại câu hỏi."
            )
    raise failure


def generate_reply(
    api_key: str, instruction: str, messages: Sequence[ChatMessage], evidence: str
) -> tuple[str, list[str]]:
    contents = [
        {"role": turn["role"], "parts": [{"text": turn["text"]}]}
        for turn in messages
    ]
    contents[-1]["parts"].insert(0, {"text": evidence})
    payload = json.dumps(
        {
            "systemInstruction": {"parts": [{"text": instruction}]},
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": 2048,
                "thinkingConfig": {"thinkingLevel": "LOW"},
                "responseMimeType": "application/json",
                "responseSchema": {
                    "type": "OBJECT",
                    "properties": {
                        "reply": {"type": "STRING"},
                        "source_ids": {"type": "ARRAY", "items": {"type": "STRING"}},
                    },
                    "required": ["reply", "source_ids"],
                },
            },
        }
    ).encode("utf-8")
    try:
        return _fetch_reply(api_key, payload)
    except HTTPError as error:
        code = error.code
        error.close()
        if code in (401, 403, 404):
            raise GeminiError(
                "Cò Mạ chưa kết nối được. Kiểm tra khóa và quyền dùng Gemini API."
            ) from None
        if code == 429:
            raise GeminiError(
                "Gemini đang chạm hạn mức. Bà con thử lại sau nha.", 429
            ) from None
        raise GeminiError("Gemini đang gặp trục trặc. Bà con thử lại nha.") from None
    except OSError:
        raise GeminiError(
            "Kết nối với Gemini bị gián đoạn. Bà con thử lại nha."
        ) from None
