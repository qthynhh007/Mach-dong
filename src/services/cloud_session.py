"""Forward the caller's session to cloud services without desktop secrets."""

from flask import has_request_context, request

from src.config import SESSION_COOKIE_NAME


def cloud_session_headers() -> dict[str, str]:
    if not has_request_context():
        return {}
    authorization = request.headers.get("Authorization", "")
    token = authorization[7:].strip() if authorization.startswith("Bearer ") else request.cookies.get(SESSION_COOKIE_NAME)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    csrf = request.headers.get("X-CSRF-Token")
    if csrf:
        headers["X-CSRF-Token"] = csrf
    return headers
