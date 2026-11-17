from __future__ import annotations

from typing import Any

from flask import (
    Blueprint,
    Response,
    jsonify,
    make_response,
    render_template,
    request,
)

from src.config import CREDITS_PER_AVAX, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS
from src.controllers.session_guard import (
    RequestContext,
    extract_tokens_from_context,
    get_current_auth,
    require_session,
)
from src.models.user import decrypt_email_bound_private_key
from src.services.auth_service import AuthService, default_auth_service
from src.services.session_client import ClientSessionManager

blueprint = Blueprint("auth", __name__)
client_session_manager = ClientSessionManager()


def _attach_session_cookie(
    resp: Response, session_data: dict[str, Any], remember_me: bool = True
) -> Response:
    token = session_data.get("session_token", "")
    max_age = SESSION_TTL_SECONDS if remember_me else None
    resp.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        max_age=max_age,
        httponly=True,
        samesite="Lax",
        path="/",
    )
    client_session_manager.save_session(session_data, remember_me=remember_me)
    return resp


@blueprint.get("/login")
def login() -> str:
    auth = get_current_auth(default_auth_service)
    user_dict = auth[0].to_public_dict() if auth else None
    return render_template(
        "auth/login.html",
        current_page="login",
        current_user=user_dict,
        wallet_guide=default_auth_service.get_wallet_guide_info(
            str(user_dict["wallet_address"]) if user_dict else ""
        ),
    )


@blueprint.get("/register")
def register() -> str:
    auth = get_current_auth(default_auth_service)
    user_dict = auth[0].to_public_dict() if auth else None
    return render_template(
        "auth/register.html",
        current_page="register",
        current_user=user_dict,
        wallet_guide=default_auth_service.get_wallet_guide_info(
            str(user_dict["wallet_address"]) if user_dict else ""
        ),
    )


@blueprint.get("/profile")
def profile() -> str:
    auth = get_current_auth(default_auth_service)
    user_dict = auth[0].to_public_dict() if auth else None
    tx_list = (
        default_auth_service.repo.list_credit_transactions(auth[0].user_id, limit=8)
        if auth
        else []
    )
    return render_template(
        "auth/profile.html",
        current_page="profile",
        current_user=user_dict,
        credit_transactions=tx_list,
        credits_per_avax=CREDITS_PER_AVAX,
        wallet_guide=default_auth_service.get_wallet_guide_info(
            str(user_dict["wallet_address"]) if user_dict else ""
        ),
    )


@blueprint.get("/api/auth/session")
def get_session_status() -> tuple[Response, int]:
    auth = get_current_auth(default_auth_service, require_csrf=False)
    if auth is None:
        return jsonify(data={"authenticated": False, "user": None}, error=None), 200
    user, session = auth
    return (
        jsonify(
            data={
                "authenticated": True,
                "csrf_token": session.csrf_token,
                "expires_at": session.expires_at,
                "user": user.to_public_dict(),
                "wallet_info": default_auth_service.get_wallet_guide_info(
                    user.wallet_address
                ),
                "transactions": default_auth_service.repo.list_credit_transactions(
                    user.user_id, limit=8
                ),
            },
            error=None,
        ),
        200,
    )


@blueprint.post("/api/auth/send-otp")
def api_send_email_otp() -> tuple[Response, int]:
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify(data=None, error="Dữ liệu gửi lên không hợp lệ."), 400
    email = str(body.get("email") or "").strip()
    result = default_auth_service.send_email_otp(email)
    if not result.ok or not result.data:
        return jsonify(data=None, error=result.error), result.status_code
    return jsonify(data=result.data, error=None), result.status_code


@blueprint.post("/api/auth/reset-password")
def api_reset_password() -> tuple[Response, int]:
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify(data=None, error="Dữ liệu đặt lại mật khẩu không hợp lệ."), 400

    result = default_auth_service.reset_password_with_email_otp(
        email=str(body.get("email") or ""),
        otp_code=str(body.get("otp_code") or ""),
        new_password=str(body.get("new_password") or ""),
    )
    if not result.ok:
        return jsonify(data=None, error=result.error), result.status_code
    return jsonify(data=result.data, error=None), 200


@blueprint.post("/api/auth/register")
def api_register() -> tuple[Response, int]:
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify(data=None, error="Dữ liệu gửi lên không hợp lệ."), 400

    remember_me = bool(body.get("remember_me", True))
    device_info = request.headers.get("User-Agent", "web")
    result = default_auth_service.register_user(
        name=str(body.get("name") or ""),
        username=str(body.get("username") or ""),
        email=str(body.get("email") or ""),
        phone=str(body.get("phone") or ""),
        password=str(body.get("password") or ""),
        wallet_address=body.get("wallet_address"),
        wallet_mode=str(body.get("wallet_mode") or "AUTO_EMAIL"),
        otp_code=body.get("otp_code"),
        require_otp=bool(body.get("require_otp", True)),
        device_info=device_info,
    )
    if not result.ok or not result.data:
        return jsonify(data=None, error=result.error), result.status_code

    resp = make_response(jsonify(data=result.data, error=None))
    _attach_session_cookie(resp, result.data, remember_me=remember_me)
    return resp, result.status_code


@blueprint.post("/api/auth/login")
@blueprint.post("/api/auth/signin")
@blueprint.post("/api/auth/verify-otp")
def api_login() -> tuple[Response, int]:
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify(data=None, error="Dữ liệu gửi lên không hợp lệ."), 400

    remember_me = bool(body.get("remember_me", True))
    device_info = request.headers.get("User-Agent", "web")
    result = default_auth_service.verify_login(
        identifier=str(
            body.get("identifier") or body.get("email") or body.get("username") or ""
        ),
        password=str(body.get("password") or ""),
        device_info=device_info,
        name=body.get("name"),
        username=body.get("username"),
        email=body.get("email"),
        phone=body.get("phone"),
        wallet_address=body.get("wallet_address"),
        wallet_mode=str(body.get("wallet_mode") or "AUTO_EMAIL"),
        otp_code=body.get("otp_code"),
        auto_create_on_full_profile=bool(
            body.get("auto_create_on_full_profile", False)
        ),
    )
    if not result.ok or not result.data:
        return jsonify(data=None, error=result.error), result.status_code

    resp = make_response(jsonify(data=result.data, error=None))
    _attach_session_cookie(resp, result.data, remember_me=remember_me)
    return resp, result.status_code


@blueprint.post("/api/auth/exchange-credits")
@require_session(default_auth_service, require_csrf=True)
def api_exchange_credits() -> tuple[Response, int]:
    from flask import g

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify(data=None, error="Dữ liệu giao dịch không hợp lệ."), 400

    direction = str(body.get("direction") or "AVAX_TO_CREDIT")
    try:
        amount = float(body.get("amount") or 0)
    except (TypeError, ValueError):
        return jsonify(data=None, error="Số lượng quy đổi không hợp lệ."), 400

    result = default_auth_service.exchange_credits_with_avax(
        user=g.current_user,
        direction=direction,
        amount=amount,
    )
    if not result.ok:
        return jsonify(data=None, error=result.error), result.status_code
    return jsonify(data=result.data, error=None), 200


@blueprint.post("/api/auth/export-wallet-key")
@require_session(default_auth_service, require_csrf=True)
def api_export_wallet_key() -> tuple[Response, int]:
    from flask import g

    user = g.current_user
    if user.wallet_type != "AUTO_EMAIL" or not user.encrypted_wallet_key:
        return (
            jsonify(
                data=None,
                error="Tài khoản đang dùng ví gắn ngoài (EXTERNAL). Private Key do ứng dụng ví của bạn quản lý.",
            ),
            400,
        )
    priv_key = decrypt_email_bound_private_key(
        user.email, user.encrypted_wallet_key
    )
    if not priv_key:
        return jsonify(data=None, error="Không thể giải mã Private Key."), 400
    return (
        jsonify(
            data={
                "wallet_address": user.wallet_address,
                "private_key": priv_key,
                "chain_id": 43113,
            },
            error=None,
        ),
        200,
    )


@blueprint.post("/api/auth/logout")
@require_session(default_auth_service, require_csrf=True)
def api_logout() -> tuple[Response, int]:
    token, _ = extract_tokens_from_context()
    default_auth_service.revoke_session(token)
    client_session_manager.clear_session()
    resp = make_response(jsonify(data={"logged_out": True}, error=None))
    resp.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return resp, 200


@blueprint.post("/api/auth/profile")
@require_session(default_auth_service, require_csrf=True)
def api_update_profile() -> tuple[Response, int]:
    from flask import g

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify(data=None, error="Dữ liệu hồ sơ không hợp lệ."), 400

    result = default_auth_service.update_profile(
        user=g.current_user,
        name=body.get("name"),
        phone=body.get("phone"),
        wallet_address=body.get("wallet_address"),
        wallet_mode=body.get("wallet_mode"),
    )
    if not result.ok:
        return jsonify(data=None, error=result.error), result.status_code
    return jsonify(data=result.data, error=None), 200


@blueprint.post("/api/auth/password")
@require_session(default_auth_service, require_csrf=True)
def api_change_password() -> tuple[Response, int]:
    from flask import g

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify(data=None, error="Dữ liệu mật khẩu không hợp lệ."), 400

    result = default_auth_service.change_password(
        user=g.current_user,
        current_password=str(body.get("current_password") or ""),
        new_password=str(body.get("new_password") or ""),
    )
    if not result.ok:
        return jsonify(data=None, error=result.error), result.status_code
    return jsonify(data=result.data, error=None), 200


class AuthController:
    """Programmatic controller interface compatible with ClientSessionManager."""

    def __init__(self, auth_service: AuthService = default_auth_service) -> None:
        self.auth_service = auth_service

    def send_otp(self, req: RequestContext) -> dict[str, Any]:
        res = self.auth_service.send_email_otp(str(req.payload.get("email") or ""))
        return {
            "status_code": res.status_code,
            "data": res.data,
            "error": res.error,
        }

    def reset_password(self, req: RequestContext) -> dict[str, Any]:
        p = req.payload
        res = self.auth_service.reset_password_with_email_otp(
            email=str(p.get("email") or ""),
            otp_code=str(p.get("otp_code") or ""),
            new_password=str(p.get("new_password") or ""),
        )
        return {
            "status_code": res.status_code,
            "data": res.data,
            "error": res.error,
        }

    def register(self, req: RequestContext) -> dict[str, Any]:
        p = req.payload
        res = self.auth_service.register_user(
            name=str(p.get("name") or ""),
            username=str(p.get("username") or ""),
            email=str(p.get("email") or ""),
            phone=str(p.get("phone") or ""),
            password=str(p.get("password") or ""),
            wallet_address=p.get("wallet_address"),
            wallet_mode=str(p.get("wallet_mode") or "AUTO_EMAIL"),
            otp_code=p.get("otp_code"),
            require_otp=bool(p.get("require_otp", False)),
            device_info=str(p.get("device_info") or "desktop"),
        )
        return {
            "status_code": res.status_code,
            "data": res.data,
            "error": res.error,
        }

    def login(self, req: RequestContext) -> dict[str, Any]:
        p = req.payload
        res = self.auth_service.verify_login(
            identifier=str(
                p.get("identifier") or p.get("email") or p.get("username") or ""
            ),
            password=str(p.get("password") or ""),
            device_info=str(p.get("device_info") or "desktop"),
            name=p.get("name"),
            username=p.get("username"),
            email=p.get("email"),
            phone=p.get("phone"),
            wallet_address=p.get("wallet_address"),
            wallet_mode=str(p.get("wallet_mode") or "AUTO_EMAIL"),
            otp_code=p.get("otp_code"),
            auto_create_on_full_profile=bool(
                p.get("auto_create_on_full_profile", False)
            ),
        )
        return {
            "status_code": res.status_code,
            "data": res.data,
            "error": res.error,
        }

    def exchange_credits(self, req: RequestContext) -> dict[str, Any]:
        decorator = require_session(self.auth_service, require_csrf=True)

        @decorator
        def _handler(context: RequestContext) -> dict[str, Any]:
            assert context.current_user is not None
            res = self.auth_service.exchange_credits_with_avax(
                user=context.current_user,
                direction=str(context.payload.get("direction") or "AVAX_TO_CREDIT"),
                amount=float(context.payload.get("amount") or 0),
            )
            return {
                "status_code": res.status_code,
                "data": res.data,
                "error": res.error,
            }

        return _handler(req)

    def get_current_session(self, req: RequestContext) -> dict[str, Any]:
        decorator = require_session(self.auth_service, require_csrf=False)

        @decorator
        def _handler(context: RequestContext) -> dict[str, Any]:
            assert context.current_user is not None
            assert context.current_session is not None
            return {
                "status_code": 200,
                "data": {
                    "user": context.current_user.to_public_dict(),
                    "csrf_token": context.current_session.csrf_token,
                    "expires_at": context.current_session.expires_at,
                },
                "error": None,
            }

        return _handler(req)

    def logout(self, req: RequestContext) -> dict[str, Any]:
        decorator = require_session(self.auth_service, require_csrf=True)

        @decorator
        def _handler(context: RequestContext) -> dict[str, Any]:
            token, _ = extract_tokens_from_context(context)
            self.auth_service.revoke_session(token)
            return {
                "status_code": 200,
                "data": {"logged_out": True},
                "error": None,
            }

        return _handler(req)
