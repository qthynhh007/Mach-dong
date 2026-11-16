"""Gemini Developer API client used by the Cò Mạ assistant."""

import json
from collections.abc import Sequence
from typing import Literal, TypedDict
from urllib.error import HTTPError
from urllib.request import Request, urlopen

GEMINI_MODEL = "gemini-3.8-flash"
GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)


class ChatMessage(TypedDict):
    role: Literal["user", "model"]
    text: str


class GeminiError(Exception):
    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.status = status


def generate_reply(
    api_key: str, instruction: str, messages: Sequence[ChatMessage], evidence: str
) -> tuple[str, list[str]]:
    contents = [
        {"role": turn["role"], "parts": [{"text": turn["text"]}]}
        for turn in messages
    ]
    contents[-1]["parts"].insert(0, {"text": evidence})
    request = Request(
        GEMINI_ENDPOINT,
        data=json.dumps(
            {
                "systemInstruction": {"parts": [{"text": instruction}]},
                "contents": contents,
                "generationConfig": {
                    "maxOutputTokens": 1024,
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
        ).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            parts = json.load(response)["candidates"][0]["content"]["parts"]
            answer = json.loads("".join(
                part.get("text", "") for part in parts if not part.get("thought")
            ))
            reply, source_ids = answer["reply"], answer["source_ids"]
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
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        raise GeminiError(
            "Cò Mạ chưa có câu trả lời. Bà con thử đổi cách hỏi nha."
        ) from None

    if (
        not isinstance(reply, str)
        or not reply.strip()
        or not isinstance(source_ids, list)
        or not all(isinstance(source_id, str) for source_id in source_ids)
    ):
        raise GeminiError("Cò Mạ chưa có câu trả lời. Bà con thử đổi cách hỏi nha.")
    return reply.strip(), source_ids
