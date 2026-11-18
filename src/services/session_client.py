from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from src.config import CLIENT_SESSION_FILE, SESSION_COOKIE_NAME
from src.controllers.session_guard import RequestContext


class ClientSessionManager:
    """Manages client/app session state in memory and optional local disk cache."""

    def __init__(self, cache_file: str | Path = CLIENT_SESSION_FILE) -> None:
        self.cache_file = Path(cache_file)
        self.session_token: str | None = None
        self.csrf_token: str | None = None
        self.expires_at: float = 0.0
        self.current_user: dict[str, Any] | None = None

    @property
    def is_authenticated(self) -> bool:
        return bool(self.session_token and self.current_user)

    def save_session(
        self, auth_data: dict[str, Any], remember_me: bool = True
    ) -> None:
        self.session_token = auth_data.get("session_token")
        self.csrf_token = auth_data.get("csrf_token")
        self.expires_at = float(auth_data.get("expires_at") or 0.0)
        self.current_user = auth_data.get("user")
        if remember_me and self.session_token:
            self.cache_file.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "session_token": self.session_token,
                "csrf_token": self.csrf_token,
                "expires_at": self.expires_at,
                "user": self.current_user,
            }
            self.cache_file.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

    def clear_session(self) -> None:
        self.session_token = None
        self.csrf_token = None
        self.expires_at = 0.0
        self.current_user = None
        if self.cache_file.exists():
            try:
                self.cache_file.unlink()
            except OSError:
                pass

    def restore_from_disk(
        self, verify_action: Callable[[RequestContext], dict[str, Any]] | None = None
    ) -> bool:
        if not self.cache_file.exists():
            return False
        try:
            raw = json.loads(self.cache_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            self.clear_session()
            return False

        token = raw.get("session_token")
        csrf = raw.get("csrf_token")
        if not token:
            self.clear_session()
            return False

        self.session_token = token
        self.csrf_token = csrf
        self.expires_at = float(raw.get("expires_at") or 0.0)
        self.current_user = raw.get("user")

        if verify_action is not None:
            response = self.call_controller(verify_action, {})
            if response.get("status_code") != 200 or not response.get("data"):
                self.clear_session()
                return False
            user_data = response["data"].get("user")
            if user_data:
                self.current_user = user_data
        return True

    def build_request(
        self, payload: dict[str, Any] | None = None
    ) -> RequestContext:
        headers: dict[str, str] = {}
        cookies: dict[str, str] = {}
        if self.session_token:
            headers["Authorization"] = f"Bearer {self.session_token}"
            cookies[SESSION_COOKIE_NAME] = self.session_token
        if self.csrf_token:
            headers["X-CSRF-Token"] = self.csrf_token
        return RequestContext(
            payload=dict(payload or {}),
            cookies=cookies,
            headers=headers,
        )

    def call_controller(
        self,
        action: Callable[[RequestContext], dict[str, Any]],
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        req = self.build_request(payload)
        response = action(req)
        if response.get("status_code") == 401:
            self.clear_session()
        return response
