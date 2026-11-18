"""Explain server-calculated field checks using Gemini when requested."""

import json

from src.models.simulation import SimulationDemoInput, simulationInput
from src.services.ai_client import GeminiError, generate_reply
from src.services.simulation_demo import evaluate
from src.services.simulation_service import report_advice


def explain_scenario(payload: object, api_key: str) -> dict:
    if isinstance(payload, dict) and "varietyId" in payload:
        scenario = simulationInput.parse(payload).payload
        steps = report_advice(scenario, {})
    else:
        preview = SimulationDemoInput.parse(payload)
        result = evaluate(preview)
        scenario = {**vars(preview), "stage": result["stage"]}
        steps = result["advice_steps"]
    fallback = {"mode": "local", "text": " ".join(step["body"] for step in steps)}
    if not api_key:
        return {**fallback, "status": "Máy chủ chưa cấu hình Gemini. Đang dùng hướng dẫn tại chỗ."}
    evidence = {f"step-{i}": step for i, step in enumerate(steps, 1)}
    try:
        reply, sources = generate_reply(
            api_key,
            "Bạn là Cò Mạ. Viết tiếng Việt gần gũi, 2–3 đoạn ngắn cho người đi thăm ruộng. "
            "Chọn việc cần làm trước, giải thích vì sao, cách đo và thời điểm kiểm tra lại. "
            "Chỉ diễn giải căn cứ kèm theo. Các thông số là giả lập. Giữ riêng mặn ở kênh và ruộng. "
            "Không tự thêm ngưỡng, liều lượng, dự báo năng suất hay số đo. "
            "Trả JSON với reply là văn bản thuần và source_ids là mã bước đã dùng.",
            [{"role": "user", "text": "Với kịch bản này tôi nên kiểm tra gì ngoài ruộng?"}],
            json.dumps({"scenario": scenario, "steps": evidence}, ensure_ascii=False),
            list(evidence),
        )
    except GeminiError as error:
        return {**fallback, "status": f"{error} Đang dùng hướng dẫn tại chỗ."}
    if not sources or any(source not in evidence for source in sources):
        return {**fallback, "status": "Phản hồi thiếu căn cứ. Đang dùng hướng dẫn tại chỗ."}
    return {"mode": "gemini", "status": "Gemini · Diễn giải kịch bản giả lập", "text": reply}
