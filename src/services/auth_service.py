from __future__ import annotations

import hashlib
import hmac
import logging
import math
import re
import secrets
import smtplib
import time
import uuid
from dataclasses import dataclass
from email.message import EmailMessage

from src.config import (
    AVALANCHE_CHAIN_ID,
    AVALANCHE_NETWORK_NAME,
    CREDITS_PER_AVAX,
    LOCKOUT_DURATION_SECONDS,
    MAX_LOGIN_ATTEMPTS,
    OTP_TTL_SECONDS,
    SESSION_SLIDING_EXPIRATION,
    SESSION_TTL_SECONDS,
    SMTP_APP_PASSWORD,
    SMTP_EMAIL,
    SMTP_HOST,
    SMTP_PORT,
)
from src.models.user import (
    SQLiteUserRepository,
    User,
    UserRole,
    UserSession,
    _derive_private_key_hex,
    decrypt_email_bound_private_key,
    generate_email_bound_wallet,
    is_valid_wallet_address,
    normalize_email,
    normalize_vn_phone,
)
from src.services.credit_service import default_credit_service


@dataclass
class AuthResult:
    ok: bool
    status_code: int
    data: dict | None = None
    error: str | None = None


class AuthService:
    def __init__(
        self,
        repo: SQLiteUserRepository | None = None,
        secret_key: str | None = None,
        session_ttl_seconds: int = SESSION_TTL_SECONDS,
        sliding_expiration: bool = SESSION_SLIDING_EXPIRATION,
        max_login_attempts: int = MAX_LOGIN_ATTEMPTS,
        lockout_duration_seconds: int = LOCKOUT_DURATION_SECONDS,
        otp_ttl_seconds: int = OTP_TTL_SECONDS,
        seed_defaults: bool = False,
        enable_smtp: bool = True,
        allow_dev_otp: bool = False,
    ) -> None:
        self.repo = repo or SQLiteUserRepository(wallet_secret=secret_key)
        self.secret_key = secret_key or self.repo.wallet_secret
        self.session_ttl_seconds = session_ttl_seconds
        self.sliding_expiration = sliding_expiration
        self.max_login_attempts = max_login_attempts
        self.lockout_duration_seconds = lockout_duration_seconds
        self.otp_ttl_seconds = otp_ttl_seconds
        self.enable_smtp = enable_smtp
        self.allow_dev_otp = allow_dev_otp
        if seed_defaults:
            self.seed_default_accounts()

    def seed_default_accounts(self) -> None:
        seeds = [
            {
                "username": "admin",
                "name": "Vũ Thanh Tân",
                "email": "tanvuthanh313130911@gmail.com",
                "phone": "+84911421604",
                "password": "adminadmin",
                "role": UserRole.ADMIN,
                "credits": 99,
                "avax": 10.0,
            },
            {
                "username": "rev",
                "name": "Kiểm duyệt viên ĐBSCL",
                "email": "thanhtan313130911@gmail.com",
                "phone": "+84911421604",
                "password": "reviewer",
                "role": UserRole.REVIEWER,
                "credits": 10,
                "avax": 5.0,
            },
        ]
        for item in seeds:
            existing = self.repo.get_by_username(item["username"])
            if existing is None:
                existing = self.repo.get_by_email(item["email"])
            if existing is None:
                self.repo.create_user(
                    username=item["username"],
                    name=item["name"],
                    email=item["email"],
                    phone=item["phone"],
                    password=item["password"],
                    role=item["role"],
                    wallet_address=None,
                    wallet_type="AUTO_EMAIL",
                    simulation_credits=item["credits"],
                    avax_balance=item["avax"],
                )

    def _sign_session_id(self, session_id: str) -> str:
        sig = hmac.new(
            self.secret_key.encode("utf-8"),
            session_id.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return f"{session_id}.{sig}"

    def _verify_signed_token(self, token: str) -> str | None:
        if not token or "." not in token:
            return None
        session_id, provided_sig = token.rsplit(".", 1)
        if not session_id or not provided_sig:
            return None
        expected_sig = hmac.new(
            self.secret_key.encode("utf-8"),
            session_id.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected_sig, provided_sig):
            return None
        return session_id

    def _hash_email_otp(self, email: str, code: str) -> str:
        clean_email = email.strip().lower()
        clean_code = code.strip()
        return hmac.new(
            self.secret_key.encode("utf-8"),
            f"email-otp:{clean_email}:{clean_code}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    def send_email_otp(
        self, email: str, require_existing: bool = False
    ) -> AuthResult:
        raw_input = (email or "").strip()
        if not raw_input:
            return AuthResult(
                False, 400, error="Vui lòng nhập Email hoặc Tên đăng nhập."
            )

        resolved_user: User | None = None
        if require_existing:
            if "@" in raw_input:
                try:
                    clean_email = normalize_email(raw_input)
                except ValueError as exc:
                    return AuthResult(False, 400, error=str(exc))
                resolved_user = self.repo.get_by_email(clean_email)
            else:
                resolved_user = self.repo.get_by_username(raw_input)
            if resolved_user is None:
                return AuthResult(
                    False,
                    404,
                    error="Không tìm thấy tài khoản nào đăng ký với Email hoặc Tên đăng nhập này.",
                )
            clean_email = resolved_user.email
        else:
            try:
                clean_email = normalize_email(raw_input)
            except ValueError as exc:
                return AuthResult(False, 400, error=str(exc))

        otp_code = f"{secrets.randbelow(1_000_000):06d}"
        expires_at = time.time() + self.otp_ttl_seconds
        code_hash = self._hash_email_otp(clean_email, otp_code)
        delivery_mode = "DEV_PREVIEW"
        smtp_sent = False

        if self.enable_smtp and SMTP_EMAIL and SMTP_APP_PASSWORD:
            msg = EmailMessage()
            msg["Subject"] = f"[Mạch Đồng · AgriData] Mã xác nhận Email: {otp_code}"
            msg["From"] = SMTP_EMAIL
            msg["To"] = clean_email
            msg.set_content(
                f"Xin chào bà con,\n\n"
                f"Mã xác nhận (OTP) Mạch Đồng của bạn là: {otp_code}\n"
                f"Mã có hiệu lực trong {self.otp_ttl_seconds // 60} phút.\n\n"
                f"Sau khi xác thực mã thành công, hệ thống sẽ khởi tạo và hiển thị địa chỉ ví "
                f"Avalanche Fuji (Chain ID {AVALANCHE_CHAIN_ID}) của bạn trên màn hình.\n\n"
                f"Trân trọng,\nĐội ngũ Mạch Đồng · AgriData ĐBSCL"
            )
            try:
                with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=8) as server:
                    server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
                    server.send_message(msg)
                smtp_sent = True
                delivery_mode = "SMTP"
            except (OSError, smtplib.SMTPException):
                logging.getLogger(__name__).warning("Không gửi được OTP qua SMTP.")

        if not smtp_sent and not self.allow_dev_otp:
            return AuthResult(
                False, 503, error="Chưa gửi được mã xác nhận. Vui lòng thử lại sau."
            )

        self.repo.save_email_otp(clean_email, code_hash, expires_at)
        response_data: dict[str, str | int | bool] = {
            "email": clean_email,
            "expires_in_seconds": self.otp_ttl_seconds,
            "delivery_mode": delivery_mode,
            "smtp_sent": smtp_sent,
        }
        if not smtp_sent:
            response_data["dev_otp_code"] = otp_code

        return AuthResult(True, 200, data=response_data)

    def verify_email_otp(
        self, email: str, otp_code: str, consume: bool = True
    ) -> tuple[bool, str | None]:
        try:
            clean_email = normalize_email(email)
        except ValueError as exc:
            return False, str(exc)

        clean_code = (otp_code or "").strip()
        if not clean_code or not re.match(r"^[0-9]{6}$", clean_code):
            return False, "Mã xác nhận Email phải gồm đúng 6 chữ số."

        record = self.repo.get_email_otp(clean_email)
        if record is None or record.get("is_used"):
            return (
                False,
                "Chưa có mã xác nhận hoặc mã đã được sử dụng. Vui lòng bấm 'Gửi mã Email'.",
            )

        now = time.time()
        if now >= float(record["expires_at"]):
            return False, "Mã xác nhận Email đã hết hạn (5 phút). Vui lòng gửi lại mã mới."

        if int(record["attempts"]) >= 5:
            return False, "Bạn đã nhập sai mã xác nhận quá 5 lần. Vui lòng yêu cầu gửi mã mới."

        expected_hash = self._hash_email_otp(clean_email, clean_code)
        if not hmac.compare_digest(str(record["code_hash"]), expected_hash):
            self.repo.increment_otp_attempts(clean_email)
            return False, "Mã xác nhận Email không chính xác."

        if consume:
            self.repo.mark_otp_used(clean_email)
        return True, None

    def _issue_session(self, user: User, device_info: str = "web") -> dict:
        now = time.time()
        session = UserSession(
            session_id=str(uuid.uuid4()),
            user_id=user.user_id,
            role=user.role,
            csrf_token=secrets.token_hex(24),
            device_info=device_info[:200] if device_info else "web",
            created_at=now,
            expires_at=now + self.session_ttl_seconds,
            last_accessed_at=now,
            is_revoked=False,
        )
        self.repo.create_session(session)
        signed_token = self._sign_session_id(session.session_id)
        return {
            "session_token": signed_token,
            "csrf_token": session.csrf_token,
            "expires_at": session.expires_at,
            "user": user.to_public_dict(),
            "wallet_info": self.get_wallet_guide_info(user.wallet_address),
        }

    @staticmethod
    def get_wallet_guide_info(
        wallet_address: str = "",
    ) -> dict[str, str | int]:
        return {
            "network_name": AVALANCHE_NETWORK_NAME,
            "chain_id": AVALANCHE_CHAIN_ID,
            "currency": "AVAX (Testnet)",
            "credits_per_avax": CREDITS_PER_AVAX,
            "rpc_url": "https://api.avax-test.network/ext/bc/C/rpc",
            "explorer_url": "https://testnet.snowtrace.io",
            "wallet_address": wallet_address,
            "summary_vi": (
                "Ví Avalanche Fuji (Chain ID 43113) sẽ được khởi tạo và hiển thị trên màn hình "
                "ngay sau khi bà con xác thực mã Email và hoàn tất đăng ký/đăng nhập."
            ),
        }

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
        clean_name = (name or "").strip()
        clean_username = (username or "").strip()
        if not clean_name:
            return AuthResult(False, 400, error="Vui lòng nhập họ và tên nông hộ.")
        if not clean_username or len(clean_username) < 3:
            return AuthResult(
                False, 400, error="Tên đăng nhập cần ít nhất 3 ký tự."
            )
        if not password or len(password) < 4:
            return AuthResult(
                False, 400, error="Mật khẩu cần ít nhất 4 ký tự."
            )

        try:
            clean_email = normalize_email(email)
            clean_phone = normalize_vn_phone(phone)
        except ValueError as exc:
            return AuthResult(False, 400, error=str(exc))

        if require_otp or (otp_code and otp_code.strip()):
            ok_otp, otp_err = self.verify_email_otp(clean_email, otp_code or "")
            if not ok_otp:
                return AuthResult(False, 400, error=otp_err)

        if self.repo.get_by_username(clean_username) is not None:
            return AuthResult(
                False, 409, error="Tên đăng nhập này đã được sử dụng."
            )
        if self.repo.get_by_email(clean_email) is not None:
            return AuthResult(
                False, 409, error="Email này đã được đăng ký tài khoản."
            )

        chosen_wallet: str | None = None
        chosen_type = "AUTO_EMAIL"
        if (
            wallet_mode.upper() == "EXTERNAL"
            and wallet_address
            and wallet_address.strip()
        ):
            chosen_wallet = wallet_address.strip()
            chosen_type = "EXTERNAL"
            if not is_valid_wallet_address(chosen_wallet):
                return AuthResult(
                    False,
                    400,
                    error="Địa chỉ ví Avalanche không hợp lệ (cần dạng 0x... gồm 42 ký tự hex).",
                )
        elif wallet_address and wallet_address.strip() and wallet_mode.upper() != "AUTO_EMAIL":
            chosen_wallet = wallet_address.strip()
            chosen_type = "EXTERNAL"

        try:
            user = self.repo.create_user(
                username=clean_username,
                name=clean_name,
                email=clean_email,
                phone=clean_phone,
                password=password,
                role=UserRole.FARMER,
                wallet_address=chosen_wallet,
                wallet_type=chosen_type,
                simulation_credits=3,
            )
        except ValueError as exc:
            return AuthResult(False, 400, error=str(exc))

        session_data = self._issue_session(user, device_info=device_info)
        return AuthResult(True, 201, data=session_data)

    def sign_in_with_email_otp(
        self,
        email: str,
        otp_code: str,
        password: str | None = None,
        name: str | None = None,
        username: str | None = None,
        phone: str | None = None,
        wallet_address: str | None = None,
        wallet_mode: str = "AUTO_EMAIL",
        device_info: str = "web-email-otp",
    ) -> AuthResult:
        try:
            clean_email = normalize_email(email)
        except ValueError as exc:
            return AuthResult(False, 400, error=str(exc))

        ok_otp, otp_err = self.verify_email_otp(clean_email, otp_code, consume=False)
        if not ok_otp:
            return AuthResult(False, 401, error=otp_err)

        existing = self.repo.get_by_email(clean_email)
        if existing is not None:
            if existing.is_locked():
                remaining = max(1, int(existing.locked_until - time.time()))
                return AuthResult(
                    False,
                    429,
                    error=f"Tài khoản đang tạm khóa. Vui lòng thử lại sau {remaining} giây.",
                )
            if password and password.strip():
                if not existing.verify_password(password):
                    existing.failed_login_attempts += 1
                    if existing.failed_login_attempts >= self.max_login_attempts:
                        existing.locked_until = time.time() + self.lockout_duration_seconds
                    self.repo.save_user(existing)
                    return AuthResult(False, 401, error="Mật khẩu không đúng.")
            existing.failed_login_attempts = 0
            existing.locked_until = 0.0
            if name and name.strip():
                existing.name = name.strip()
            if (
                wallet_mode.upper() == "EXTERNAL"
                and wallet_address
                and is_valid_wallet_address(wallet_address.strip())
            ):
                existing.wallet_address = wallet_address.strip()
                existing.wallet_type = "EXTERNAL"
            elif not existing.wallet_address:
                addr, enc_key = generate_email_bound_wallet(existing.email, self.repo.wallet_secret)
                existing.wallet_address = addr
                existing.wallet_type = "AUTO_EMAIL"
                existing.encrypted_wallet_key = enc_key
            self.repo.mark_otp_used(clean_email)
            self.repo.save_user(existing)
            return AuthResult(
                True, 200, data=self._issue_session(existing, device_info=device_info)
            )

        # New user signing in with verified Email OTP: create their account & Email-bound Avalanche Fuji wallet
        self.repo.mark_otp_used(clean_email)
        resolved_name = (name or clean_email.split("@")[0]).strip()
        base_username = (username or re.sub(r"[^a-zA-Z0-9_]", "_", clean_email.split("@")[0]))[:24].strip()
        if len(base_username) < 3:
            base_username = f"nongho_{base_username}"
        candidate_username = base_username
        suffix = 1
        while self.repo.get_by_username(candidate_username) is not None:
            suffix += 1
            candidate_username = f"{base_username}_{suffix}"

        try:
            clean_phone = normalize_vn_phone(phone or "+84900000000")
        except ValueError as exc:
            return AuthResult(False, 400, error=str(exc))

        resolved_password = (
            password.strip()
            if password and len(password.strip()) >= 4
            else secrets.token_urlsafe(12)
        )
        chosen_wallet = (
            wallet_address.strip()
            if wallet_mode.upper() == "EXTERNAL"
            and wallet_address
            and is_valid_wallet_address(wallet_address.strip())
            else None
        )
        chosen_type = "EXTERNAL" if chosen_wallet else "AUTO_EMAIL"

        user = self.repo.create_user(
            username=candidate_username,
            name=resolved_name,
            email=clean_email,
            phone=clean_phone,
            password=resolved_password,
            role=UserRole.FARMER,
            wallet_address=chosen_wallet,
            wallet_type=chosen_type,
            simulation_credits=3,
        )
        return AuthResult(
            True, 201, data=self._issue_session(user, device_info=device_info)
        )

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
        target_email = (email or (identifier if "@" in (identifier or "") else "")).strip()
        if otp_code and otp_code.strip() and target_email:
            return self.sign_in_with_email_otp(
                email=target_email,
                otp_code=otp_code,
                password=password,
                name=name,
                username=username,
                phone=phone,
                wallet_address=wallet_address,
                wallet_mode=wallet_mode,
                device_info=device_info,
            )

        lookup_key = (identifier or username or email or phone or "").strip()
        if not lookup_key or not password:
            return AuthResult(
                False,
                400,
                error="Vui lòng nhập thông tin đăng nhập (Email / Username / SĐT +84) và mật khẩu hoặc mã xác nhận Email.",
            )

        candidates = self.repo.find_candidates_by_identifier(lookup_key)
        if not candidates and username:
            candidates = self.repo.find_candidates_by_identifier(username)
        if not candidates and email:
            candidates = self.repo.find_candidates_by_identifier(email)
        if not candidates and phone:
            candidates = self.repo.find_candidates_by_identifier(phone)

        if not candidates:
            if (
                auto_create_on_full_profile
                and name
                and (username or identifier)
                and email
                and phone
            ):
                return self.register_user(
                    name=name,
                    username=username or identifier,
                    email=email,
                    phone=phone,
                    password=password,
                    wallet_address=wallet_address,
                    wallet_mode=wallet_mode,
                    otp_code=otp_code,
                    device_info=device_info,
                )
            User.hash_password(password, "00" * 16)
            return AuthResult(
                False,
                401,
                error="Tài khoản hoặc mật khẩu không đúng.",
            )

        now = time.time()
        locked_candidate: User | None = None
        for candidate in candidates:
            if candidate.is_locked(now):
                locked_candidate = candidate
                continue
            if candidate.verify_password(password):
                candidate.failed_login_attempts = 0
                candidate.locked_until = 0.0
                if name and name.strip():
                    candidate.name = name.strip()
                if (
                    wallet_address
                    and wallet_address.strip()
                    and is_valid_wallet_address(wallet_address.strip())
                    and wallet_mode.upper() == "EXTERNAL"
                ):
                    candidate.wallet_address = wallet_address.strip()
                    candidate.wallet_type = "EXTERNAL"
                elif not candidate.wallet_address and candidate.email:
                    addr, enc_key = generate_email_bound_wallet(candidate.email, self.repo.wallet_secret)
                    candidate.wallet_address = addr
                    candidate.wallet_type = "AUTO_EMAIL"
                    candidate.encrypted_wallet_key = enc_key
                self.repo.save_user(candidate)
                return AuthResult(
                    True,
                    200,
                    data=self._issue_session(candidate, device_info=device_info),
                )

        if locked_candidate is not None and len(candidates) == 1:
            remaining = max(1, int(locked_candidate.locked_until - now))
            return AuthResult(
                False,
                429,
                error=f"Tài khoản tạm khóa do nhập sai nhiều lần. Vui lòng thử lại sau {remaining} giây.",
            )

        target = candidates[0]
        target.failed_login_attempts += 1
        if target.failed_login_attempts >= self.max_login_attempts:
            target.locked_until = now + self.lockout_duration_seconds
            self.repo.save_user(target)
            return AuthResult(
                False,
                429,
                error=(
                    f"Tài khoản đã bị tạm khóa {self.lockout_duration_seconds // 60} phút "
                    "do nhập sai mật khẩu quá 5 lần."
                ),
            )
        self.repo.save_user(target)
        return AuthResult(
            False,
            401,
            error="Tài khoản hoặc mật khẩu không đúng.",
        )

    def _generate_fuji_tx_hash(
        self, user: User, direction: str, avax_amount: float, credit_delta: int
    ) -> str:
        payload = (
            f"chain:{AVALANCHE_CHAIN_ID}|wallet:{user.wallet_address}|"
            f"dir:{direction}|avax:{avax_amount:.4f}|credits:{credit_delta}|"
            f"ts:{time.time_ns()}"
        )
        try:
            from eth_account import Account
            from eth_account.messages import encode_defunct

            priv_hex = _derive_private_key_hex(user.email, self.repo.wallet_secret)
            signed = Account.sign_message(
                encode_defunct(text=payload), private_key="0x" + priv_hex
            )
            return "0x" + signed.message_hash.hex()[-64:]
        except Exception:
            return "0x" + hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def exchange_credits_with_avax(
        self,
        user: User,
        direction: str,
        amount: float,
    ) -> AuthResult:
        if not math.isfinite(amount):
            return AuthResult(False, 400, error="Số lượng quy đổi không hợp lệ.")
        clean_dir = (direction or "AVAX_TO_CREDIT").strip().upper()
        if clean_dir == "FAUCET_TOPUP":
            faucet_avax = 1.0
            user.avax_balance = round(float(user.avax_balance) + faucet_avax, 4)
            self.repo.save_user(user)
            tx_hash = self._generate_fuji_tx_hash(
                user, "FAUCET_TOPUP", faucet_avax, 0
            )
            tx_record = self.repo.record_credit_transaction(
                user_id=user.user_id,
                direction="FAUCET_TOPUP",
                avax_amount=faucet_avax,
                credit_delta=0,
                tx_hash=tx_hash,
                note="[Giả lập] Cộng 1 AVAX",
            )
            return AuthResult(
                True,
                200,
                data={
                    "user": user.to_public_dict(),
                    "transaction": tx_record,
                    "transactions": self.repo.list_credit_transactions(user.user_id),
                },
            )

        if clean_dir == "AVAX_TO_CREDIT":
            try:
                avax_to_spend = round(float(amount), 4)
            except (TypeError, ValueError):
                return AuthResult(False, 400, error="Số lượng AVAX không hợp lệ.")
            if avax_to_spend <= 0:
                return AuthResult(
                    False, 400, error="Số lượng AVAX cần lớn hơn 0 (tối thiểu 0.01 AVAX)."
                )
            credits_to_mint = int(round(avax_to_spend * CREDITS_PER_AVAX))
            if credits_to_mint < 1:
                return AuthResult(
                    False,
                    400,
                    error=f"Tối thiểu cần {1 / CREDITS_PER_AVAX:.2f} AVAX để đổi 1 Điểm LÚA.",
                )
            exact_avax_cost = round(credits_to_mint / CREDITS_PER_AVAX, 4)
            if float(user.avax_balance) < exact_avax_cost:
                return AuthResult(
                    False,
                    400,
                    error=(
                        f"Số dư AVAX không đủ (cần {exact_avax_cost} AVAX, hiện có "
                        f"{user.avax_balance:.4f} AVAX). Bạn có thể bấm 'Cộng 1 AVAX giả lập'."
                    ),
                )
            user.avax_balance = round(float(user.avax_balance) - exact_avax_cost, 4)
            user.simulation_credits = int(user.simulation_credits) + credits_to_mint
            self.repo.save_user(user)
            onchain_res = default_credit_service.buy_credits_onchain(
                beneficiary_wallet=user.wallet_address,
                avax_amount=exact_avax_cost,
            )
            if onchain_res.get("onchain") and onchain_res.get("tx_hash"):
                tx_hash = str(onchain_res["tx_hash"])
                tx_note = f"Đổi {exact_avax_cost} AVAX → +{credits_to_mint} LÚA (On-chain Fuji)"
            else:
                tx_hash = self._generate_fuji_tx_hash(
                    user, "AVAX_TO_CREDIT", exact_avax_cost, credits_to_mint
                )
                tx_note = f"Đổi {exact_avax_cost} AVAX → +{credits_to_mint} LÚA [Giả lập]"
            tx_record = self.repo.record_credit_transaction(
                user_id=user.user_id,
                direction="AVAX_TO_CREDIT",
                avax_amount=exact_avax_cost,
                credit_delta=credits_to_mint,
                tx_hash=tx_hash,
                note=tx_note,
            )
            return AuthResult(
                True,
                200,
                data={
                    "user": user.to_public_dict(),
                    "transaction": tx_record,
                    "transactions": self.repo.list_credit_transactions(user.user_id),
                },
            )

        if clean_dir == "CREDIT_TO_AVAX":
            try:
                credits_to_spend = int(round(float(amount)))
            except (TypeError, ValueError):
                return AuthResult(False, 400, error="Số Điểm LÚA không hợp lệ.")
            if credits_to_spend < 1:
                return AuthResult(
                    False, 400, error="Số Điểm LÚA cần quy đổi phải từ 1 LÚA trở lên."
                )
            if int(user.simulation_credits) < credits_to_spend:
                return AuthResult(
                    False,
                    400,
                    error=(
                        f"Số dư Điểm LÚA không đủ (cần {credits_to_spend} LÚA, "
                        f"hiện có {user.simulation_credits} LÚA)."
                    ),
                )
            avax_gained = round(credits_to_spend / CREDITS_PER_AVAX, 4)
            user.simulation_credits = int(user.simulation_credits) - credits_to_spend
            user.avax_balance = round(float(user.avax_balance) + avax_gained, 4)
            self.repo.save_user(user)
            tx_hash = self._generate_fuji_tx_hash(
                user, "CREDIT_TO_AVAX", avax_gained, -credits_to_spend
            )
            tx_record = self.repo.record_credit_transaction(
                user_id=user.user_id,
                direction="CREDIT_TO_AVAX",
                avax_amount=avax_gained,
                credit_delta=-credits_to_spend,
                tx_hash=tx_hash,
                note=f"Quy đổi {credits_to_spend} LÚA → +{avax_gained} AVAX [Giả lập]",
            )
            return AuthResult(
                True,
                200,
                data={
                    "user": user.to_public_dict(),
                    "transaction": tx_record,
                    "transactions": self.repo.list_credit_transactions(user.user_id),
                },
            )

        return AuthResult(
            False,
            400,
            error="Loại giao dịch không hợp lệ (chỉ hỗ trợ AVAX_TO_CREDIT, CREDIT_TO_AVAX, FAUCET_TOPUP).",
        )

    def validate_session(
        self,
        session_token: str | None,
        csrf_token: str | None = None,
        require_csrf: bool = False,
    ) -> tuple[User, UserSession] | None:
        if not session_token:
            return None
        session_id = self._verify_signed_token(session_token)
        if not session_id:
            return None
        session = self.repo.get_session(session_id)
        if session is None or session.is_revoked:
            return None
        now = time.time()
        if session.is_expired(now):
            return None
        if require_csrf:
            if (
                not isinstance(csrf_token, str)
                or not csrf_token.isascii()
                or not hmac.compare_digest(session.csrf_token, csrf_token)
            ):
                return None
        user = self.repo.get_by_id(session.user_id)
        if user is None:
            return None
        if self.sliding_expiration:
            new_expires = now + self.session_ttl_seconds
            session.last_accessed_at = now
            session.expires_at = new_expires
            self.repo.update_session_access(session.session_id, now, new_expires)
        return user, session

    def revoke_session(self, session_token: str | None) -> bool:
        if not session_token:
            return False
        session_id = self._verify_signed_token(session_token)
        if not session_id:
            return False
        return self.repo.revoke_session(session_id)

    def revoke_all_user_sessions(self, user_id: str) -> int:
        return self.repo.revoke_all_user_sessions(user_id)

    def export_wallet_key(self, user: User) -> AuthResult:
        if user.wallet_type != "AUTO_EMAIL" or not user.encrypted_wallet_key:
            return AuthResult(False, 400, error="Khóa riêng của ví gắn ngoài do ứng dụng ví quản lý.")
        from eth_account import Account

        private_key = decrypt_email_bound_private_key(
            user.email, user.encrypted_wallet_key, self.repo.wallet_secret
        )
        try:
            address = Account.from_key(private_key).address if private_key else ""
        except ValueError:
            address = ""
        if not address or address.lower() != user.wallet_address.lower():
            return AuthResult(False, 400, error="Không thể xác minh khóa riêng của ví.")
        return AuthResult(
            True,
            200,
            data={
                "wallet_address": user.wallet_address,
                "private_key": private_key,
                "chain_id": AVALANCHE_CHAIN_ID,
            },
        )

    def update_profile(
        self,
        user: User,
        name: str | None = None,
        phone: str | None = None,
        wallet_address: str | None = None,
        wallet_mode: str | None = None,
        otp_code: str | None = None,
        require_wallet_otp: bool = True,
    ) -> AuthResult:
        if name is not None and name.strip():
            user.name = name.strip()
        if phone is not None and phone.strip():
            try:
                user.phone = normalize_vn_phone(phone)
            except ValueError as exc:
                return AuthResult(False, 400, error=str(exc))

        wants_wallet_change = bool(
            (wallet_mode and wallet_mode.upper() == "AUTO_EMAIL")
            or (
                wallet_address is not None
                and wallet_address.strip()
                and wallet_address.strip() != user.wallet_address
            )
        )
        if wants_wallet_change and require_wallet_otp:
            ok_otp, otp_err = self.verify_email_otp(
                user.email, otp_code or "", consume=True
            )
            if not ok_otp:
                return AuthResult(
                    False,
                    400,
                    error=otp_err
                    or "Vui lòng xác thực mã 6 số qua Email trước khi đổi địa chỉ ví.",
                )

        if wallet_mode and wallet_mode.upper() == "AUTO_EMAIL":
            addr, enc_key = generate_email_bound_wallet(user.email, self.repo.wallet_secret)
            user.wallet_address = addr
            user.wallet_type = "AUTO_EMAIL"
            user.encrypted_wallet_key = enc_key
        elif wallet_address is not None and wallet_address.strip():
            clean_wallet = wallet_address.strip()
            if not is_valid_wallet_address(clean_wallet):
                return AuthResult(
                    False,
                    400,
                    error="Địa chỉ ví Avalanche Fuji không hợp lệ (cần 0x + 40 ký tự hex).",
                )
            user.wallet_address = clean_wallet
            user.wallet_type = "EXTERNAL"
        self.repo.save_user(user)
        return AuthResult(True, 200, data={"user": user.to_public_dict()})

    def change_password(
        self, user: User, current_password: str, new_password: str
    ) -> AuthResult:
        if not user.verify_password(current_password or ""):
            return AuthResult(
                False, 401, error="Mật khẩu hiện tại không chính xác."
            )
        if not new_password or len(new_password) < 4:
            return AuthResult(
                False, 400, error="Mật khẩu mới cần ít nhất 4 ký tự."
            )
        if current_password == new_password:
            return AuthResult(
                False, 400, error="Mật khẩu mới phải khác mật khẩu hiện tại."
            )
        pwd_hash, pwd_salt = User.hash_password(new_password)
        user.password_hash = pwd_hash
        user.password_salt = pwd_salt
        self.repo.save_user(user)
        return AuthResult(
            True, 200, data={"message": "Đã cập nhật mật khẩu thành công."}
        )

    def reset_password_with_email_otp(
        self, email: str, otp_code: str, new_password: str
    ) -> AuthResult:
        raw_input = (email or "").strip()
        if not raw_input:
            return AuthResult(
                False, 400, error="Vui lòng nhập Email hoặc Tên đăng nhập."
            )

        if not new_password or len(new_password) < 4:
            return AuthResult(
                False, 400, error="Mật khẩu mới cần ít nhất 4 ký tự."
            )

        user: User | None = None
        if "@" in raw_input:
            try:
                clean_email = normalize_email(raw_input)
            except ValueError as exc:
                return AuthResult(False, 400, error=str(exc))
            user = self.repo.get_by_email(clean_email)
        else:
            user = self.repo.get_by_username(raw_input)

        if user is None:
            return AuthResult(
                False,
                404,
                error="Không tìm thấy tài khoản nào đăng ký với Email hoặc Tên đăng nhập này.",
            )

        clean_email = user.email

        ok_otp, otp_err = self.verify_email_otp(clean_email, otp_code, consume=True)
        if not ok_otp:
            return AuthResult(False, 400, error=otp_err)

        pwd_hash, pwd_salt = User.hash_password(new_password)
        user.password_hash = pwd_hash
        user.password_salt = pwd_salt
        user.failed_login_attempts = 0
        user.locked_until = 0.0
        self.repo.save_user(user)
        return AuthResult(
            True,
            200,
            data={
                "email": clean_email,
                "username": user.username,
                "message": "Đã đặt lại mật khẩu mới thành công! Bạn có thể đăng nhập ngay.",
            },
        )
