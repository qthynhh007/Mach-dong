from time import perf_counter

from flask import Blueprint, Response, current_app, jsonify, render_template, request
from werkzeug.exceptions import RequestEntityTooLarge

from src.services.ai_client import GEMINI_MODEL_LABEL, ChatMessage, GeminiError
from src.services.assistant_images import MAX_IMAGE_BASE64, parse_chat_image
from src.services.assistant_service import answer_question

blueprint = Blueprint("assistant", __name__)
ASSISTANT_WAIT_SECONDS = 20
MAX_MESSAGE_LENGTH = 400
MAX_REPLY_LENGTH = 4096
MAX_HISTORY_TURNS = 8
MAX_CHAT_BYTES = MAX_IMAGE_BASE64 + 128 * 1024


@blueprint.get("/assistant")
def assistant() -> str:
    return render_template(
        "assistant/index.html",
        current_page="assistant",
        compact=request.args.get("view") == "dialog",
        quick_context=request.args.get("context"),
        gemini_enabled=bool(current_app.config["GEMINI_API_KEY"]),
        gemini_model_label=GEMINI_MODEL_LABEL,
        wait_seconds=ASSISTANT_WAIT_SECONDS,
        max_message_length=MAX_MESSAGE_LENGTH,
        max_history_turns=MAX_HISTORY_TURNS,
    )


@blueprint.post("/api/assistant/chat")
def chat() -> tuple[Response, int]:
    request.max_content_length = MAX_CHAT_BYTES
    try:
        payload = request.get_json(silent=True)
    except RequestEntityTooLarge:
        return jsonify(data=None, error="Câu hỏi hoặc ảnh quá lớn. Chọn ảnh tối đa 5 MB nha."), 413
    if not isinstance(payload, dict):
        return jsonify(data=None, error="Gửi câu hỏi dưới dạng JSON nha."), 400

    try:
        image = parse_chat_image(payload.get("image"))
    except GeminiError as error:
        return jsonify(data=None, error=str(error)), error.status
    message = payload.get("message", "")
    if image and isinstance(message, str) and not message.strip():
        message = "Nhờ Cò Mạ xem ảnh cây trồng này và chỉ giúp dấu hiệu cần kiểm tra."
    if not isinstance(message, str) or not 0 < len(message.strip()) <= MAX_MESSAGE_LENGTH:
        error = f"Nhập câu hỏi từ 1 đến {MAX_MESSAGE_LENGTH} ký tự nha."
        return jsonify(data=None, error=error), 400

    history = payload.get("history", [])
    if (
        not isinstance(history, list)
        or len(history) > MAX_HISTORY_TURNS
        or len(history) % 2 != 0
    ):
        return jsonify(data=None, error="Lịch sử trò chuyện chưa hợp lệ."), 400

    messages: list[ChatMessage] = []
    for index, turn in enumerate(history):
        role = "model" if index % 2 else "user"
        limit = MAX_REPLY_LENGTH if role == "model" else MAX_MESSAGE_LENGTH
        text = turn.get("text") if isinstance(turn, dict) else None
        if (
            not isinstance(text, str)
            or not 0 < len(text.strip()) <= limit
            or turn.get("role") != role
        ):
            return jsonify(data=None, error="Lịch sử trò chuyện chưa hợp lệ."), 400
        messages.append({"role": role, "text": text.strip()})
    messages.append({"role": "user", "text": message.strip()})
    if image:
        messages[-1]["image"] = image

    api_key = current_app.config["GEMINI_API_KEY"]
    started = perf_counter()
    try:
        answer = answer_question(api_key, messages)
    except GeminiError as error:
        response, status = jsonify(data=None, error=str(error)), error.status
    else:
        answer["reply"] = answer["reply"][:MAX_REPLY_LENGTH]
        response, status = jsonify(data=answer, error=None), 200
    response.headers["Server-Timing"] = f"assistant;dur={(perf_counter() - started) * 1_000:.1f}"
    return response, status
