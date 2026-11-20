"""Client for the central account API; no account or password database on the desktop."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
from typing import Any
from urllib import error, request

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from flask import has_request_context
from flask import request as flask_request

from src.models.user import User, UserRole, UserSession
from src.services.auth_service import AuthResult, AuthService


class CloudAuthService:
    def __init__(self, api_url: str, transport: Any = None) -> None:
        self.api_url = api_url.rstrip("/")
        if not self.api_url.startswith("https://"):
            raise ValueError("Cloud account API must use HTTPS")
        self.transport = transport or request.urlopen
        self._email_enabled: bool | None = None
        self._email_checked_at = 0.0

    @staticmethod
    def _encrypt_wallet_key(private_key: bytes, password: str) -> str:
        salt = secrets.token_bytes(16)
        nonce = secrets.token_bytes(12)
        key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000)
        ciphertext = AESGCM(key).encrypt(nonce, private_key, None)
        return "v1:" + base64.urlsafe_b64encode(salt + nonce + ciphertext).decode()

    @staticmethod
    def _decrypt_wallet_key(payload: str, password: str) -> bytes:
        if not payload.startswith("v1:"):
            raise ValueError("Unknown wallet encryption format")
        data = base64.urlsafe_b64decode(payload[3:])
        if len(data) < 60:
            raise ValueError("Invalid encrypted wallet")
        key = hashlib.pbkdf2_hmac("sha256", password.encode(), data[:16], 600_000)
        try:
            return AESGCM(key).decrypt(data[16:28], data[28:], None)
        except InvalidTag as exc:
            raise ValueError("Cannot decrypt wallet with this password") from exc

    def _call(
        self,
        route: str,
        payload: dict[str, Any] | None = None,
        token: str | None = None,
        csrf: str | None = None,
    ) -> AuthResult:
        headers = {"Accept": "application/json", "User-Agent": "MachDongDesktop/2.0"}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if csrf:
            headers["X-CSRF-Token"] = csrf
        req = request.Request(
            self.api_url + "/api/account/" + route,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers=headers,
            method="POST" if payload is not None else "GET",
        )
        try:
            with self.transport(req, timeout=12) as response:
                status = response.status
                body = json.load(response)
        except error.HTTPError as exc:
            status = exc.code
            try:
                body = json.load(exc)
            except (ValueError, UnicodeError):
                body = {"error": "Máy chủ tài khoản từ chối yêu cầu."}
        except (error.URLError, TimeoutError, OSError, ValueError):
            return AuthResult(False, 503, error="Không kết nối được kho tài khoản cloud. Vui lòng thử lại khi có Internet.")
        if not isinstance(body, dict):
            return AuthResult(False, 503, error="Phản hồi kho tài khoản không hợp lệ.")
        return AuthResult(200 <= status < 300, status, body.get("data"), body.get("error"))

    def email_otp_available(self) -> bool:
        if self._email_enabled is None or time.time() - self._email_checked_at > 300:
            result = self._call("config")
            self._email_enabled = bool(result.ok and (result.data or {}).get("email_otp_enabled"))
            self._email_checked_at = time.time()
        return self._email_enabled

    @staticmethod
    def get_wallet_guide_info(wallet_address: str = "") -> dict:
        return AuthService.get_wallet_guide_info(wallet_address)

    @staticmethod
    def _current_credentials() -> tuple[str | None, str | None]:
        if not has_request_context():
            return None, None
        from src.config import SESSION_COOKIE_NAME

        token = flask_request.cookies.get(SESSION_COOKIE_NAME)
        csrf = flask_request.headers.get("X-CSRF-Token")
        if not csrf and flask_request.is_json:
            body = flask_request.get_json(silent=True) or {}
            if isinstance(body, dict):
                csrf = body.get("csrf_token")
        return token, csrf

    @staticmethod
    def _user_from_public(data: dict) -> User:
        return User(
            user_id=str(data["user_id"]),
            username=str(data["username"]),
            name=str(data["name"]),
            email=str(data["email"]),
            email_verified=bool(data.get("email_verified", False)),
            phone=str(data["phone"]),
            password_hash="",
            password_salt="",
            role=UserRole(data["role"]),
            wallet_address=str(data.get("wallet_address") or ""),
            wallet_type=str(data.get("wallet_type") or "UNLINKED"),
            simulation_credits=int(data.get("simulation_credits", 0)),
            avax_balance=float(data.get("avax_balance", 0)),
        )

    def send_email_otp(self, email: str, require_existing: bool = False) -> AuthResult:
        return self._call("send-otp", {"email": email, "require_existing": require_existing})

    def register_user(
        self,
        name: str,
        username: str,
        email: str,
        phone: str,
        password: str,
        wallet_address: str | None = None,
        wallet_mode: str = "AUTO_EMAIL",
        otp_code: str | None = None,
        require_otp: bool = False,
        device_info: str = "web",
    ) -> AuthResult:
        if len(password) < 12:
            return AuthResult(False, 400, error="Mật khẩu cần ít nhất 12 ký tự.")
        encrypted_key = None
        if wallet_mode == "AUTO_EMAIL":
            from eth_account import Account

            account = Account.create()
            wallet_address = account.address
            encrypted_key = self._encrypt_wallet_key(bytes(account.key), password)
        return self._call("register", {
            "name": name, "username": username, "email": email, "phone": phone,
            "password": password, "wallet_address": wallet_address,
            "wallet_type": wallet_mode, "encrypted_wallet_key": encrypted_key,
            "otp_code": otp_code, "device_info": device_info,
        })

    def verify_login(
        self,
        identifier: str,
        password: str,
        device_info: str = "web",
        name: str | None = None,
        username: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        wallet_address: str | None = None,
        wallet_mode: str = "AUTO_EMAIL",
        otp_code: str | None = None,
        auto_create_on_full_profile: bool = False,
    ) -> AuthResult:
        del name, wallet_address, wallet_mode, auto_create_on_full_profile
        return self._call("login", {"identifier": identifier or username or email or phone,
                                    "password": password, "otp_code": otp_code,
                                    "device_info": device_info})

    def validate_session(
        self,
        session_token: str | None,
        csrf_token: str | None = None,
        require_csrf: bool = False,
    ) -> tuple[User, UserSession] | None:
        if not session_token:
            return None
        result = self._call("session", token=session_token, csrf=csrf_token if require_csrf else None)
        if not result.ok or not result.data:
            return None
        data = result.data
        if require_csrf and csrf_token != data.get("csrf_token"):
            return None
        user = self._user_from_public(data["user"])
        session = UserSession(
            session_id=session_token, user_id=user.user_id, role=user.role,
            csrf_token=data["csrf_token"], device_info="cloud", created_at=0,
            expires_at=float(data["expires_at"]), last_accessed_at=time.time(),
        )
        return user, session

    def revoke_session(self, session_token: str | None) -> bool:
        if not session_token:
            return False
        _, csrf = self._current_credentials()
        return self._call("logout", {}, token=session_token, csrf=csrf).ok

    def list_credit_transactions(self, user_id: str, limit: int = 10) -> list[dict]:
        token, _ = self._current_credentials()
        if not token:
            return []
        result = self._call("transactions", token=token)
        return result.data[:limit] if result.ok and isinstance(result.data, list) else []

    def get_field_profile(self) -> AuthResult:
        token, _ = self._current_credentials()
        return self._call("field-profile", token=token)

    def get_avatar(self) -> AuthResult:
        token, _ = self._current_credentials()
        return self._call("avatar", token=token)

    def save_avatar(self, image: bytes) -> AuthResult:
        token, csrf = self._current_credentials()
        return self._call("avatar", {"image": base64.b64encode(image).decode("ascii")}, token, csrf)

    def save_field_profile(self, profile: dict) -> AuthResult:
        token, csrf = self._current_credentials()
        return self._call("field-profile", profile, token, csrf)

    def update_profile(
        self,
        user: User,
        name: str | None = None,
        phone: str | None = None,
        wallet_address: str | None = None,
        wallet_mode: str | None = None,
        otp_code: str | None = None,
        password: str | None = None,
        require_wallet_otp: bool = True,
    ) -> AuthResult:
        del user, require_wallet_otp
        token, csrf = self._current_credentials()
        return self._call("profile", {"name": name, "phone": phone,
                                      "wallet_address": wallet_address,
                                      "wallet_mode": wallet_mode, "otp_code": otp_code,
                                      "password": password}, token, csrf)

    def change_password(self, user: User, current_password: str, new_password: str) -> AuthResult:
        del user
        token, csrf = self._current_credentials()
        wallet_payload = None
        if token:
            wallet_result = self._call("wallet-key", {"password": current_password}, token, csrf)
            if wallet_result.ok and wallet_result.data:
                try:
                    private_key = self._decrypt_wallet_key(wallet_result.data["encrypted_wallet_key"], current_password)
                    wallet_payload = self._encrypt_wallet_key(private_key, new_password)
                except (ValueError, KeyError):
                    return AuthResult(False, 400, error="Không thể cập nhật mã hóa ví. Vui lòng xuất và sao lưu khóa ví trước.")
        return self._call("password", {"current_password": current_password,
                                       "new_password": new_password,
                                       "encrypted_wallet_key": wallet_payload}, token, csrf)

    def reset_password_with_email_otp(self, email: str, otp_code: str, new_password: str) -> AuthResult:
        return self._call("reset-password", {"email": email, "otp_code": otp_code,
                                             "new_password": new_password})

    def export_wallet_key(self, user: User, password: str | None = None) -> AuthResult:
        del user
        if not password:
            return AuthResult(False, 400, error="Vui lòng nhập mật khẩu để xuất khóa ví.")
        token, csrf = self._current_credentials()
        result = self._call("wallet-key", {"password": password}, token, csrf)
        if not result.ok or not result.data:
            return result
        try:
            from eth_account import Account

            private_key = self._decrypt_wallet_key(result.data["encrypted_wallet_key"], password)
            account = Account.from_key(private_key)
            if account.address.lower() != result.data["wallet_address"].lower():
                raise ValueError("Wallet address mismatch")
        except (ValueError, KeyError):
            return AuthResult(False, 400, error="Không thể giải mã khóa ví. Mật khẩu có thể đã được đặt lại.")
        return AuthResult(True, 200, data={"wallet_address": account.address,
                                           "private_key": "0x" + private_key.hex(),
                                           "chain_id": 43113})

    def exchange_credits_with_avax(self, user: User, direction: str, amount: float) -> AuthResult:
        del user
        token, csrf = self._current_credentials()
        return self._call("exchange-credits", {"direction": direction, "amount": amount}, token, csrf)
