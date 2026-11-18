from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from functools import wraps
from typing import Any

from flask import current_app, g, has_request_context, jsonify, request

from src.config import SESSION_COOKIE_NAME
from src.models.user import User, UserRole, UserSession
from src.services.auth_service import AuthService


@dataclass
class RequestContext:
    payload: dict[str, Any] = field(default_factory=dict)
    cookies: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    current_user: User | None = None
    current_session: UserSession | None = None


def extract_tokens_from_context(
    req: RequestContext | None = None,
) -> tuple[str | None, str | None]:
    if req is not None:
        auth_header = req.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        if not token:
            token = req.cookies.get(SESSION_COOKIE_NAME)
        csrf = req.headers.get("X-CSRF-Token") or req.payload.get("csrf_token")
        return token, csrf

    if has_request_context():
        auth_header = request.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        if not token:
            token = request.cookies.get(SESSION_COOKIE_NAME)
        csrf = request.headers.get("X-CSRF-Token")
        if not csrf and request.is_json:
            body = request.get_json(silent=True) or {}
            if isinstance(body, dict):
                csrf = body.get("csrf_token")
        if not csrf:
            csrf = request.form.get("csrf_token")
        return token, csrf

    return None, None


def get_auth_service() -> AuthService:
    return current_app.extensions["auth_service"]


def get_current_auth(
    auth_service: AuthService | None = None,
    require_csrf: bool = False,
    req: RequestContext | None = None,
) -> tuple[User, UserSession] | None:
    token, csrf = extract_tokens_from_context(req)
    if not token:
        return None
    cacheable = auth_service is None and req is None and not require_csrf
    if cacheable and "current_auth" in g:
        return g.current_auth
    service = auth_service or get_auth_service()
    auth = service.validate_session(token, csrf, require_csrf)
    if cacheable:
        g.current_auth = auth
    return auth


def require_session(
    auth_service: AuthService | None = None,
    allowed_roles: list[UserRole] | None = None,
    require_csrf: bool = True,
) -> Callable:
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            req_ctx = (
                args[0]
                if args and isinstance(args[0], RequestContext)
                else kwargs.get("req")
            )
            token, csrf = extract_tokens_from_context(req_ctx)
            if not token:
                if req_ctx is not None:
                    return {
                        "status_code": 401,
                        "data": None,
                        "error": "Chưa đăng nhập hoặc phiên đã hết hạn.",
                    }
                return (
                    jsonify(data=None, error="Chưa đăng nhập hoặc phiên đã hết hạn."),
                    401,
                )

            service = auth_service or get_auth_service()
            validated_no_csrf = service.validate_session(
                session_token=token, csrf_token=csrf, require_csrf=False
            )
            if validated_no_csrf is None:
                if req_ctx is not None:
                    return {
                        "status_code": 401,
                        "data": None,
                        "error": "Phiên đăng nhập không hợp lệ hoặc đã bị thu hồi.",
                    }
                return (
                    jsonify(
                        data=None,
                        error="Phiên đăng nhập không hợp lệ hoặc đã bị thu hồi.",
                    ),
                    401,
                )

            user, session = validated_no_csrf
            if require_csrf:
                validated_with_csrf = service.validate_session(
                    session_token=token, csrf_token=csrf, require_csrf=True
                )
                if validated_with_csrf is None:
                    if req_ctx is not None:
                        return {
                            "status_code": 403,
                            "data": None,
                            "error": "Thiếu hoặc sai mã bảo mật CSRF (X-CSRF-Token).",
                        }
                    return (
                        jsonify(
                            data=None,
                            error="Thiếu hoặc sai mã bảo mật CSRF (X-CSRF-Token).",
                        ),
                        403,
                    )

            if allowed_roles and user.role not in allowed_roles:
                if req_ctx is not None:
                    return {
                        "status_code": 403,
                        "data": None,
                        "error": "Tài khoản không có quyền thực hiện thao tác này.",
                    }
                return (
                    jsonify(
                        data=None,
                        error="Tài khoản không có quyền thực hiện thao tác này.",
                    ),
                    403,
                )

            if req_ctx is not None:
                req_ctx.current_user = user
                req_ctx.current_session = session
            elif has_request_context():
                g.current_user = user
                g.current_session = session

            return func(*args, **kwargs)

        return wrapper

    return decorator
