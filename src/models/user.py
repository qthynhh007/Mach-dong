from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path

from src.config import (
    AVALANCHE_CHAIN_ID,
    DB_PATH,
    DEFAULT_INITIAL_AVAX,
)

PBKDF2_ITERATIONS = 200_000
WALLET_REGEX = re.compile(r"^0x[a-fA-F0-9]{40}$")
EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
VN_MOBILE_REGEX = re.compile(
    r"^(?:\+84|0)(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$"
)


class UserRole(StrEnum):
    FARMER = "FARMER"
    REVIEWER = "REVIEWER"
    ADMIN = "ADMIN"


def normalize_email(email: str) -> str:
    cleaned = (email or "").strip().lower()
    if not cleaned or not EMAIL_REGEX.match(cleaned):
        raise ValueError(
            "Email không hợp lệ. Vui lòng nhập đúng định dạng (ví dụ: ten@gmail.com)."
        )
    return cleaned


def normalize_vn_phone(phone: str) -> str:
    raw = re.sub(r"[\s\-\.\(\)]", "", (phone or "").strip())
    if not raw:
        raise ValueError("Số điện thoại không được để trống (định dạng +84).")
    if raw.startswith("0084"):
        raw = "+84" + raw[4:]
    elif raw.startswith("84") and len(raw) >= 10:
        raw = "+" + raw
    elif raw.startswith("0") and len(raw) >= 9:
        raw = "+84" + raw[1:]
    elif raw.startswith("+840") and len(raw) >= 12:
        raw = "+84" + raw[4:]
    if not VN_MOBILE_REGEX.match(raw):
        raise ValueError(
            "Số điện thoại phải theo chuẩn Việt Nam (+84...), ví dụ: +84911421604 hoặc 0911421604."
        )
    return raw


def is_valid_wallet_address(address: str) -> bool:
    return bool(WALLET_REGEX.match((address or "").strip()))


def _derive_private_key_hex(email: str, secret_key: str) -> str:
    cleaned_email = (email or "").strip().lower()
    return hmac.new(
        secret_key.encode("utf-8"),
        f"avalanche-fuji-{AVALANCHE_CHAIN_ID}-secp256k1:{cleaned_email}".encode(),
        hashlib.sha256,
    ).hexdigest()


def preview_email_wallet_address(email: str, secret_key: str) -> str:
    cleaned_email = (email or "").strip().lower()
    if not cleaned_email or "@" not in cleaned_email:
        return ""
    from eth_account import Account

    priv_hex = _derive_private_key_hex(cleaned_email, secret_key)
    acct = Account.from_key("0x" + priv_hex)
    return str(acct.address)


def generate_email_bound_wallet(
    email: str, secret_key: str
) -> tuple[str, str]:
    from eth_account import Account

    normalized = normalize_email(email)
    priv_hex = _derive_private_key_hex(normalized, secret_key)
    acct = Account.from_key("0x" + priv_hex)
    address = str(acct.address)
    mask = hashlib.sha256(f"{secret_key}:{normalized}:mask".encode()).digest()
    raw_priv = bytes.fromhex(priv_hex)
    encrypted_bytes = bytes(b ^ mask[i % len(mask)] for i, b in enumerate(raw_priv))
    encrypted_key = f"fuji-{AVALANCHE_CHAIN_ID}:" + encrypted_bytes.hex()
    return address, encrypted_key


def decrypt_email_bound_private_key(
    email: str, encrypted_key: str | None, secret_key: str
) -> str | None:
    if not encrypted_key or ":" not in encrypted_key:
        return None
    normalized = (email or "").strip().lower()
    _, hex_payload = encrypted_key.split(":", 1)
    try:
        encrypted_bytes = bytes.fromhex(hex_payload)
    except ValueError:
        return None
    mask = hashlib.sha256(f"{secret_key}:{normalized}:mask".encode()).digest()
    raw_priv = bytes(b ^ mask[i % len(mask)] for i, b in enumerate(encrypted_bytes))
    return "0x" + raw_priv.hex()


@dataclass
class User:
    user_id: str
    username: str
    name: str
    email: str
    phone: str
    password_hash: str
    password_salt: str
    role: UserRole = UserRole.FARMER
    wallet_address: str = ""
    wallet_type: str = "AUTO_EMAIL"
    encrypted_wallet_key: str | None = None
    google_sub: str | None = None
    simulation_credits: int = 3
    avax_balance: float = DEFAULT_INITIAL_AVAX
    failed_login_attempts: int = 0
    locked_until: float = 0.0
    created_at: float = field(default_factory=time.time)
    email_verified: bool = True

    @property
    def id(self) -> str:
        return self.user_id

    @property
    def display_name(self) -> str:
        return self.name

    @staticmethod
    def hash_password(password: str, salt_hex: str | None = None) -> tuple[str, str]:
        if salt_hex is None:
            salt_hex = secrets.token_hex(16)
        salt_bytes = bytes.fromhex(salt_hex)
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt_bytes,
            PBKDF2_ITERATIONS,
        )
        return derived.hex(), salt_hex

    def verify_password(self, password: str) -> bool:
        candidate_hash, _ = self.hash_password(password, self.password_salt)
        return hmac.compare_digest(self.password_hash, candidate_hash)

    def is_locked(self, now: float | None = None) -> bool:
        current = time.time() if now is None else now
        return self.locked_until > current

    def to_public_dict(self) -> dict[str, str | int | float]:
        return {
            "user_id": self.user_id,
            "username": self.username,
            "name": self.name,
            "email": self.email,
            "email_verified": self.email_verified,
            "phone": self.phone,
            "role": str(self.role),
            "wallet_address": self.wallet_address,
            "wallet_type": self.wallet_type,
            "chain_id": AVALANCHE_CHAIN_ID,
            "simulation_credits": self.simulation_credits,
            "avax_balance": round(float(self.avax_balance), 4),
        }


@dataclass
class UserSession:
    session_id: str
    user_id: str
    role: UserRole
    csrf_token: str
    device_info: str
    created_at: float
    expires_at: float
    last_accessed_at: float
    is_revoked: bool = False

    def is_expired(self, now: float | None = None) -> bool:
        current = time.time() if now is None else now
        return current >= self.expires_at


class SQLiteUserRepository:
    def __init__(
        self, db_path: str | Path = DB_PATH, wallet_secret: str | None = None
    ) -> None:
        self.wallet_secret = wallet_secret or secrets.token_hex(32)
        self.db_path = str(db_path)
        self._memory_conn: sqlite3.Connection | None = None
        if self.db_path == ":memory:":
            self._memory_conn = sqlite3.connect(":memory:", check_same_thread=False)
            self._memory_conn.row_factory = sqlite3.Row
            self._memory_conn.execute("PRAGMA foreign_keys = ON")
        else:
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        if self._memory_conn is not None:
            return self._memory_conn
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _close(self, conn: sqlite3.Connection) -> None:
        if conn is not self._memory_conn:
            conn.close()

    def close(self) -> None:
        if self._memory_conn is not None:
            self._memory_conn.close()
            self._memory_conn = None

    def _init_schema(self) -> None:
        conn = self._connect()
        try:
            with conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        user_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                        name TEXT NOT NULL,
                        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                        phone TEXT NOT NULL,
                        password_hash TEXT NOT NULL,
                        password_salt TEXT NOT NULL,
                        role TEXT NOT NULL DEFAULT 'FARMER',
                        wallet_address TEXT NOT NULL,
                        wallet_type TEXT NOT NULL DEFAULT 'AUTO_EMAIL',
                        encrypted_wallet_key TEXT,
                        google_sub TEXT UNIQUE,
                        simulation_credits INTEGER NOT NULL DEFAULT 3,
                        avax_balance REAL NOT NULL DEFAULT 2.5,
                        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
                        locked_until REAL NOT NULL DEFAULT 0.0,
                        created_at REAL NOT NULL
                    )
                    """
                )
                # Ensure avax_balance column exists if migrating an older DB
                cols = {
                    r["name"]
                    for r in conn.execute("PRAGMA table_info(users)").fetchall()
                }
                if "avax_balance" not in cols:
                    conn.execute(
                        "ALTER TABLE users ADD COLUMN avax_balance REAL NOT NULL DEFAULT 2.5"
                    )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS user_sessions (
                        session_id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        role TEXT NOT NULL,
                        csrf_token TEXT NOT NULL,
                        device_info TEXT NOT NULL,
                        created_at REAL NOT NULL,
                        expires_at REAL NOT NULL,
                        last_accessed_at REAL NOT NULL,
                        is_revoked INTEGER NOT NULL DEFAULT 0,
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS email_otp_codes (
                        email TEXT PRIMARY KEY COLLATE NOCASE,
                        code_hash TEXT NOT NULL,
                        expires_at REAL NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        is_used INTEGER NOT NULL DEFAULT 0,
                        created_at REAL NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS credit_transactions (
                        tx_id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        direction TEXT NOT NULL,
                        avax_amount REAL NOT NULL,
                        credit_delta INTEGER NOT NULL,
                        tx_hash TEXT NOT NULL,
                        note TEXT NOT NULL,
                        created_at REAL NOT NULL,
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                    )
                    """
                )
        finally:
            self._close(conn)

    @staticmethod
    def _row_to_user(row: sqlite3.Row) -> User:
        row_keys = row.keys()
        avax_val = float(row["avax_balance"]) if "avax_balance" in row_keys else DEFAULT_INITIAL_AVAX
        return User(
            user_id=row["user_id"],
            username=row["username"],
            name=row["name"],
            email=row["email"],
            phone=row["phone"],
            password_hash=row["password_hash"],
            password_salt=row["password_salt"],
            role=UserRole(row["role"]),
            wallet_address=row["wallet_address"],
            wallet_type=row["wallet_type"],
            encrypted_wallet_key=row["encrypted_wallet_key"],
            google_sub=row["google_sub"],
            simulation_credits=int(row["simulation_credits"]),
            avax_balance=avax_val,
            failed_login_attempts=int(row["failed_login_attempts"]),
            locked_until=float(row["locked_until"]),
            created_at=float(row["created_at"]),
        )

    @staticmethod
    def _row_to_session(row: sqlite3.Row) -> UserSession:
        return UserSession(
            session_id=row["session_id"],
            user_id=row["user_id"],
            role=UserRole(row["role"]),
            csrf_token=row["csrf_token"],
            device_info=row["device_info"],
            created_at=float(row["created_at"]),
            expires_at=float(row["expires_at"]),
            last_accessed_at=float(row["last_accessed_at"]),
            is_revoked=bool(row["is_revoked"]),
        )

    def create_user(
        self,
        username: str,
        name: str,
        email: str,
        phone: str,
        password: str,
        role: UserRole = UserRole.FARMER,
        wallet_address: str | None = None,
        wallet_type: str = "AUTO_EMAIL",
        google_sub: str | None = None,
        simulation_credits: int = 3,
        avax_balance: float = DEFAULT_INITIAL_AVAX,
    ) -> User:
        clean_username = username.strip()
        if not clean_username:
            raise ValueError("Tên đăng nhập không được để trống.")
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Họ và tên không được để trống.")
        clean_email = normalize_email(email)
        clean_phone = normalize_vn_phone(phone)

        encrypted_key: str | None = None
        if wallet_address and wallet_address.strip():
            clean_wallet = wallet_address.strip()
            if not is_valid_wallet_address(clean_wallet):
                raise ValueError(
                    "Địa chỉ ví Avalanche Fuji không hợp lệ (cần bắt đầu bằng 0x và gồm 42 ký tự hex)."
                )
            resolved_wallet_type = wallet_type or "EXTERNAL"
        else:
            clean_wallet, encrypted_key = generate_email_bound_wallet(clean_email, self.wallet_secret)
            resolved_wallet_type = "AUTO_EMAIL"

        pwd_hash, pwd_salt = User.hash_password(password)
        user = User(
            user_id=str(uuid.uuid4()),
            username=clean_username,
            name=clean_name,
            email=clean_email,
            phone=clean_phone,
            password_hash=pwd_hash,
            password_salt=pwd_salt,
            role=role,
            wallet_address=clean_wallet,
            wallet_type=resolved_wallet_type,
            encrypted_wallet_key=encrypted_key,
            google_sub=google_sub,
            simulation_credits=simulation_credits,
            avax_balance=avax_balance,
            failed_login_attempts=0,
            locked_until=0.0,
            created_at=time.time(),
        )
        self.save_user(user)
        return user

    def save_user(self, user: User) -> None:
        conn = self._connect()
        try:
            with conn:
                conn.execute(
                    """
                    INSERT INTO users (
                        user_id, username, name, email, phone,
                        password_hash, password_salt, role,
                        wallet_address, wallet_type, encrypted_wallet_key,
                        google_sub, simulation_credits, avax_balance,
                        failed_login_attempts, locked_until, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                        username = excluded.username,
                        name = excluded.name,
                        email = excluded.email,
                        phone = excluded.phone,
                        password_hash = excluded.password_hash,
                        password_salt = excluded.password_salt,
                        role = excluded.role,
                        wallet_address = excluded.wallet_address,
                        wallet_type = excluded.wallet_type,
                        encrypted_wallet_key = excluded.encrypted_wallet_key,
                        google_sub = excluded.google_sub,
                        simulation_credits = excluded.simulation_credits,
                        avax_balance = excluded.avax_balance,
                        failed_login_attempts = excluded.failed_login_attempts,
                        locked_until = excluded.locked_until
                    """,
                    (
                        user.user_id,
                        user.username,
                        user.name,
                        user.email,
                        user.phone,
                        user.password_hash,
                        user.password_salt,
                        str(user.role),
                        user.wallet_address,
                        user.wallet_type,
                        user.encrypted_wallet_key,
                        user.google_sub,
                        user.simulation_credits,
                        user.avax_balance,
                        user.failed_login_attempts,
                        user.locked_until,
                        user.created_at,
                    ),
                )
        finally:
            self._close(conn)

    def get_by_id(self, user_id: str) -> User | None:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM users WHERE user_id = ?", (user_id,)
            ).fetchone()
            return self._row_to_user(row) if row else None
        finally:
            self._close(conn)

    def get_by_username(self, username: str) -> User | None:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
                (username.strip(),),
            ).fetchone()
            return self._row_to_user(row) if row else None
        finally:
            self._close(conn)

    def get_by_email(self, email: str) -> User | None:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
                (email.strip().lower(),),
            ).fetchone()
            return self._row_to_user(row) if row else None
        finally:
            self._close(conn)

    def get_by_google_sub(self, google_sub: str) -> User | None:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM users WHERE google_sub = ?", (google_sub.strip(),)
            ).fetchone()
            return self._row_to_user(row) if row else None
        finally:
            self._close(conn)

    def list_users(self, limit: int = 10) -> list[User]:
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT * FROM users ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
            return [self._row_to_user(r) for r in rows]
        finally:
            self._close(conn)

    def get_all_by_phone(self, phone: str) -> list[User]:
        try:
            normalized = normalize_vn_phone(phone)
        except ValueError:
            return []
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT * FROM users WHERE phone = ? ORDER BY created_at ASC",
                (normalized,),
            ).fetchall()
            return [self._row_to_user(r) for r in rows]
        finally:
            self._close(conn)

    def find_candidates_by_identifier(self, identifier: str) -> list[User]:
        cleaned = (identifier or "").strip()
        if not cleaned:
            return []
        by_username = self.get_by_username(cleaned)
        if by_username is not None:
            return [by_username]
        by_email = self.get_by_email(cleaned)
        if by_email is not None:
            return [by_email]
        return self.get_all_by_phone(cleaned)

    def find_by_identifier(self, identifier: str) -> User | None:
        candidates = self.find_candidates_by_identifier(identifier)
        return candidates[0] if candidates else None

    def create_session(self, session: UserSession) -> None:
        conn = self._connect()
        try:
            with conn:
                conn.execute(
                    """
                    INSERT INTO user_sessions (
                        session_id, user_id, role, csrf_token, device_info,
                        created_at, expires_at, last_accessed_at, is_revoked
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        session.session_id,
                        session.user_id,
                        str(session.role),
                        session.csrf_token,
                        session.device_info,
                        session.created_at,
                        session.expires_at,
                        session.last_accessed_at,
                        1 if session.is_revoked else 0,
                    ),
                )
        finally:
            self._close(conn)

    def get_session(self, session_id: str) -> UserSession | None:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM user_sessions WHERE session_id = ?", (session_id,)
            ).fetchone()
            return self._row_to_session(row) if row else None
        finally:
            self._close(conn)

    def update_session_access(
        self, session_id: str, last_accessed_at: float, expires_at: float
    ) -> None:
        conn = self._connect()
        try:
            with conn:
                conn.execute(
                    """
                    UPDATE user_sessions
                    SET last_accessed_at = ?, expires_at = ?
                    WHERE session_id = ?
                    """,
                    (last_accessed_at, expires_at, session_id),
                )
        finally:
            self._close(conn)

    def revoke_session(self, session_id: str) -> bool:
        conn = self._connect()
        try:
            with conn:
                cursor = conn.execute(
                    "UPDATE user_sessions SET is_revoked = 1 WHERE session_id = ?",
                    (session_id,),
                )
                return cursor.rowcount > 0
        finally:
            self._close(conn)

    def revoke_all_user_sessions(self, user_id: str) -> int:
        conn = self._connect()
        try:
            with conn:
                cursor = conn.execute(
                    "UPDATE user_sessions SET is_revoked = 1 WHERE user_id = ?",
                    (user_id,),
                )
                return cursor.rowcount
        finally:
            self._close(conn)

    def save_email_otp(
        self, email: str, code_hash: str, expires_at: float
    ) -> None:
        clean_email = normalize_email(email)
        now = time.time()
        conn = self._connect()
        try:
            with conn:
                conn.execute(
                    """
                    INSERT INTO email_otp_codes (
                        email, code_hash, expires_at, attempts, is_used, created_at
                    ) VALUES (?, ?, ?, 0, 0, ?)
                    ON CONFLICT(email) DO UPDATE SET
                        code_hash = excluded.code_hash,
                        expires_at = excluded.expires_at,
                        attempts = 0,
                        is_used = 0,
                        created_at = excluded.created_at
                    """,
                    (clean_email, code_hash, expires_at, now),
                )
        finally:
            self._close(conn)

    def get_email_otp(self, email: str) -> dict | None:
        clean_email = (email or "").strip().lower()
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM email_otp_codes WHERE email = ? COLLATE NOCASE",
                (clean_email,),
            ).fetchone()
            return dict(row) if row else None
        finally:
            self._close(conn)

    def increment_otp_attempts(self, email: str) -> None:
        clean_email = (email or "").strip().lower()
        conn = self._connect()
        try:
            with conn:
                conn.execute(
                    "UPDATE email_otp_codes SET attempts = attempts + 1 WHERE email = ? COLLATE NOCASE",
                    (clean_email,),
                )
        finally:
            self._close(conn)

    def mark_otp_used(self, email: str) -> None:
        clean_email = (email or "").strip().lower()
        conn = self._connect()
        try:
            with conn:
                conn.execute(
                    "UPDATE email_otp_codes SET is_used = 1 WHERE email = ? COLLATE NOCASE",
                    (clean_email,),
                )
        finally:
            self._close(conn)

    def record_credit_transaction(
        self,
        user_id: str,
        direction: str,
        avax_amount: float,
        credit_delta: int,
        tx_hash: str,
        note: str,
    ) -> dict[str, str | int | float]:
        tx_id = str(uuid.uuid4())
        now = time.time()
        conn = self._connect()
        try:
            with conn:
                conn.execute(
                    """
                    INSERT INTO credit_transactions (
                        tx_id, user_id, direction, avax_amount, credit_delta,
                        tx_hash, note, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        tx_id,
                        user_id,
                        direction,
                        round(float(avax_amount), 4),
                        int(credit_delta),
                        tx_hash,
                        note,
                        now,
                    ),
                )
        finally:
            self._close(conn)
        return {
            "tx_id": tx_id,
            "user_id": user_id,
            "direction": direction,
            "avax_amount": round(float(avax_amount), 4),
            "credit_delta": int(credit_delta),
            "tx_hash": tx_hash,
            "note": note,
            "created_at": now,
        }

    def list_credit_transactions(
        self, user_id: str, limit: int = 10
    ) -> list[dict[str, str | int | float]]:
        conn = self._connect()
        try:
            rows = conn.execute(
                """
                SELECT * FROM credit_transactions
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            self._close(conn)
