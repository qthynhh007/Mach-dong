"""Configuration and readiness checks for the local UI with shared services."""

from urllib.parse import urlsplit


def shared_app_config(origin: str, port: int) -> dict:
    parsed = urlsplit(origin)
    if (
        parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
        or parsed.path not in ("", "/") or parsed.query or parsed.fragment
    ):
        raise ValueError("Backend dùng chung phải là HTTPS origin, không chứa khóa hoặc đường dẫn.")
    config = {
        "TESTING": False,
        "GEMINI_API_KEY": "",
        "GROQ_API_KEY": "",
        "TEMPLATES_AUTO_RELOAD": True,
        "SEND_FILE_MAX_AGE_DEFAULT": 0,
        "MACH_DONG_BACKEND_MODE": "shared",
        "MACH_DONG_LOCAL_WEB_PORT": port,
    }
    for prefix in ("AUTH", "COMMUNITY", "REFERENCE", "ASSISTANT", "SIMULATION"):
        config[prefix + "_API_URL"] = origin.rstrip("/")
        config[prefix + "_API_TRANSPORT" if prefix != "SIMULATION" else "SIMULATION_TRANSPORT"] = None
    return config


def validate_shared_health(payload: object) -> None:
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict) or data.get("status") != "ok":
        raise ValueError("Chưa kết nối được backend dùng chung.")
    features = data.get("aiFeatures")
    if not isinstance(features, dict):
        raise ValueError("Backend đang chạy bản cũ, chưa hỗ trợ chat và tư vấn mới. Nhóm cần triển khai backend.")
    if features.get("chat") is not True or features.get("scenarioAdvice") is not True:
        raise ValueError("AI trên backend chưa sẵn sàng. Nhóm cần cấu hình AI_PROVIDER và khóa của nhà cung cấp trên máy chủ.")
