from __future__ import annotations

import tempfile
from io import BytesIO
from pathlib import Path
from unittest import TestCase

from flask.testing import FlaskClient
from PIL import Image

from main import create_app
from src.controllers.auth_controller import AuthController
from src.models.user import (
    SQLiteUserRepository,
    UserRole,
    decrypt_email_bound_private_key,
    is_valid_wallet_address,
    normalize_vn_phone,
)
from src.services.auth_service import AuthService
from src.services.credit_service import default_credit_service
from src.services.session_client import ClientSessionManager


class TestAuthAndSession(TestCase):
    def setUp(self) -> None:
        # Never broadcast real Fuji transactions during unit tests
        self._orig_contract = default_credit_service.contract_address
        self._orig_key = default_credit_service.signer_private_key
        default_credit_service.contract_address = ""
        default_credit_service.signer_private_key = ""

        self.repo = SQLiteUserRepository(":memory:")
        self.auth_service = AuthService(
            repo=self.repo, seed_defaults=True, enable_smtp=False, allow_dev_otp=True
        )
        self.controller = AuthController(auth_service=self.auth_service)

    def tearDown(self) -> None:
        default_credit_service.contract_address = self._orig_contract
        default_credit_service.signer_private_key = self._orig_key
        self.repo.close()

    def test_seeded_accounts_and_no_default_farmer(self) -> None:
        admin = self.repo.get_by_username("admin")
        self.assertIsNotNone(admin)
        assert admin is not None
        self.assertEqual(admin.email, "tanvuthanh313130911@gmail.com")
        self.assertEqual(admin.name, "Vũ Thanh Tân")
        self.assertEqual(admin.phone, "+84911421604")
        self.assertEqual(admin.role, UserRole.ADMIN)
        self.assertEqual(admin.simulation_credits, 99)
        self.assertTrue(admin.verify_password("adminadmin"))
        self.assertNotEqual(admin.password_hash, "adminadmin")
        self.assertTrue(is_valid_wallet_address(admin.wallet_address))

        # Verify that decrypted private key derives the exact secp256k1 EIP-55 wallet address
        from eth_account import Account

        priv_key = decrypt_email_bound_private_key(
            admin.email, admin.encrypted_wallet_key, self.repo.wallet_secret
        )
        self.assertIsNotNone(priv_key)
        assert priv_key is not None
        self.assertEqual(Account.from_key(priv_key).address, admin.wallet_address)

        rev = self.repo.get_by_username("rev")
        self.assertIsNotNone(rev)
        assert rev is not None
        self.assertEqual(rev.email, "thanhtan313130911@gmail.com")
        self.assertEqual(rev.phone, "+84911421604")
        self.assertEqual(rev.role, UserRole.REVIEWER)
        self.assertEqual(rev.simulation_credits, 10)
        self.assertTrue(rev.verify_password("reviewer"))
        self.assertTrue(is_valid_wallet_address(rev.wallet_address))

        # Ensure no default farmer account was seeded
        self.assertIsNone(self.repo.get_by_username("farmer_mekong"))

        # Both admin and rev can log in via shared phone +84911421604 using their respective password
        res_admin = self.auth_service.verify_login("+84911421604", "adminadmin")
        self.assertTrue(res_admin.ok)
        assert res_admin.data is not None
        self.assertEqual(res_admin.data["user"]["username"], "admin")

        res_rev = self.auth_service.verify_login("0911421604", "reviewer")
        self.assertTrue(res_rev.ok)
        assert res_rev.data is not None
        self.assertEqual(res_rev.data["user"]["username"], "rev")

    def test_farmer_signup_auto_wallet_and_multi_login(self) -> None:
        reg = self.auth_service.register_user(
            name="Nguyễn Văn Đồng",
            username="nongdan_mekong",
            email="nongdan@gmail.com",
            phone="0912345678",
            password="LuaTot@2026",
            wallet_mode="AUTO_EMAIL",
        )
        self.assertTrue(reg.ok)
        self.assertEqual(reg.status_code, 201)
        assert reg.data is not None
        user_data = reg.data["user"]
        self.assertEqual(user_data["phone"], "+84912345678")
        self.assertEqual(user_data["role"], "FARMER")
        self.assertEqual(user_data["wallet_type"], "AUTO_EMAIL")
        self.assertTrue(is_valid_wallet_address(str(user_data["wallet_address"])))

        # Login via username, email, and +84 phone
        for identifier in (
            "nongdan_mekong",
            "nongdan@gmail.com",
            "+84912345678",
            "0912345678",
        ):
            login_res = self.auth_service.verify_login(identifier, "LuaTot@2026")
            self.assertTrue(login_res.ok, f"Failed login with {identifier}")

    def test_email_otp_does_not_leak_wallet_before_registration(self) -> None:
        email = "bacon.longhuu@gmail.com"
        otp_res = self.auth_service.send_email_otp(email)
        self.assertTrue(otp_res.ok)
        assert otp_res.data is not None
        # Wallet address must NOT be exposed during OTP step
        self.assertNotIn("preview_wallet_address", otp_res.data)
        code = str(otp_res.data.get("dev_otp_code") or "")
        self.assertEqual(len(code), 6)

        # Wrong code fails
        bad_login = self.auth_service.verify_login(
            identifier=email,
            password="",
            email=email,
            otp_code="000000" if code != "000000" else "999999",
        )
        self.assertFalse(bad_login.ok)

        # Correct 6-digit OTP code registers/signs in and reveals the real secp256k1 Fuji wallet
        good_login = self.auth_service.verify_login(
            identifier=email,
            password="",
            email=email,
            name="Bà Con Long Hữu",
            phone="0988777666",
            otp_code=code,
        )
        self.assertTrue(good_login.ok)
        assert good_login.data is not None
        user = good_login.data["user"]
        self.assertEqual(user["email"], email)
        self.assertEqual(user["phone"], "+84988777666")
        self.assertTrue(is_valid_wallet_address(str(user["wallet_address"])))
        self.assertEqual(user["wallet_type"], "AUTO_EMAIL")

    def test_credit_changer_avax_and_lua_transactions(self) -> None:
        reg = self.auth_service.register_user(
            name="Chú Năm",
            username="chunam_fuji",
            email="chunam@gmail.com",
            phone="+84912345678",
            password="Password123",
        )
        self.assertTrue(reg.ok)
        user = self.repo.get_by_username("chunam_fuji")
        assert user is not None
        self.assertEqual(user.simulation_credits, 3)
        self.assertAlmostEqual(user.avax_balance, 2.5)

        # 1. Exchange 0.5 AVAX -> +50 LÚA
        ex1 = self.auth_service.exchange_credits_with_avax(
            user=user, direction="AVAX_TO_CREDIT", amount=0.5
        )
        self.assertTrue(ex1.ok)
        assert ex1.data is not None
        self.assertEqual(ex1.data["user"]["simulation_credits"], 53)
        self.assertAlmostEqual(float(ex1.data["user"]["avax_balance"]), 2.0)
        self.assertTrue(str(ex1.data["transaction"]["tx_hash"]).startswith("0x"))

        # 2. Exchange 20 LÚA -> +0.20 AVAX
        ex2 = self.auth_service.exchange_credits_with_avax(
            user=user, direction="CREDIT_TO_AVAX", amount=20
        )
        self.assertTrue(ex2.ok)
        assert ex2.data is not None
        self.assertEqual(ex2.data["user"]["simulation_credits"], 33)
        self.assertAlmostEqual(float(ex2.data["user"]["avax_balance"]), 2.2)

        # 3. Faucet top-up (+1.0 AVAX)
        ex3 = self.auth_service.exchange_credits_with_avax(
            user=user, direction="FAUCET_TOPUP", amount=1.0
        )
        self.assertTrue(ex3.ok)
        assert ex3.data is not None
        self.assertAlmostEqual(float(ex3.data["user"]["avax_balance"]), 3.2)

    def test_forgot_password_reset_via_email_otp(self) -> None:
        # Non-existent email or username must be rejected before sending OTP
        missing_email = self.auth_service.send_email_otp(
            "nonexistent@gmail.com", require_existing=True
        )
        self.assertFalse(missing_email.ok)
        self.assertEqual(missing_email.status_code, 404)

        missing_user = self.auth_service.send_email_otp(
            "no_such_user", require_existing=True
        )
        self.assertFalse(missing_user.ok)
        self.assertEqual(missing_user.status_code, 404)

        # Providing username resolves the account's email and sends OTP
        otp_res = self.auth_service.send_email_otp("admin", require_existing=True)
        self.assertTrue(otp_res.ok)
        assert otp_res.data is not None
        self.assertEqual(otp_res.data["email"], "tanvuthanh313130911@gmail.com")
        code = str(otp_res.data["dev_otp_code"])

        # Reset password with wrong OTP fails
        bad_reset = self.auth_service.reset_password_with_email_otp(
            email="admin",
            otp_code="000000" if code != "000000" else "999999",
            new_password="NewAdminPass@2026",
        )
        self.assertFalse(bad_reset.ok)

        # Reset password with username + correct OTP succeeds
        ok_reset = self.auth_service.reset_password_with_email_otp(
            email="admin",
            otp_code=code,
            new_password="NewAdminPass@2026",
        )
        self.assertTrue(ok_reset.ok)

        # Old password no longer works; new password logs in
        self.assertFalse(self.auth_service.verify_login("admin", "adminadmin").ok)
        self.assertTrue(
            self.auth_service.verify_login("admin", "NewAdminPass@2026").ok
        )

    def test_lockout_and_client_session_restore(self) -> None:
        for _ in range(4):
            bad = self.auth_service.verify_login("admin", "wrong_pass")
            self.assertEqual(bad.status_code, 401)
        fifth = self.auth_service.verify_login("admin", "wrong_pass")
        self.assertEqual(fifth.status_code, 429)

        # Even correct password while locked returns 429
        locked = self.auth_service.verify_login("admin", "adminadmin")
        self.assertEqual(locked.status_code, 429)

        # ClientSessionManager persistence & CSRF check with rev account
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_path = Path(tmpdir) / "client_session.json"
            client_mgr = ClientSessionManager(cache_file=cache_path)
            login_resp = client_mgr.call_controller(
                self.controller.login,
                {"identifier": "rev", "password": "reviewer"},
            )
            self.assertEqual(login_resp["status_code"], 200)
            client_mgr.save_session(login_resp["data"], remember_me=True)
            self.assertTrue(cache_path.exists())

            # Simulate app restart
            restarted_mgr = ClientSessionManager(cache_file=cache_path)
            restored = restarted_mgr.restore_from_disk(
                self.controller.get_current_session
            )
            self.assertTrue(restored)
            assert restarted_mgr.current_user is not None
            self.assertEqual(restarted_mgr.current_user["username"], "rev")

            # Logout revokes session
            logout_resp = restarted_mgr.call_controller(self.controller.logout, {})
            self.assertEqual(logout_resp["status_code"], 200)
            restarted_mgr.clear_session()
            self.assertFalse(cache_path.exists())

    def test_flask_auth_api_endpoints(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        app = create_app(
            {
                "TESTING": True,
                "SECRET_KEY": "auth-tests-only",
                "COMMUNITY_DATABASE": str(Path(directory.name) / "community.sqlite3"),
                "AGRIDATA_AUTH_DEMO": True,
            }
        )
        app.extensions["auth_service"].enable_smtp = False
        self.check_flask_auth_api(app.test_client())
        other_client = app.test_client()
        self.assertFalse(
            other_client.get("/api/auth/session").json["data"]["authenticated"]
        )

    def test_farm_profile_is_persisted_and_uses_forum_counts(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        app = create_app({
            "TESTING": True,
            "SECRET_KEY": "farm-profile-tests",
            "COMMUNITY_DATABASE": str(Path(directory.name) / "community.sqlite3"),
        })
        repo = app.extensions["auth_service"].repo
        owner = repo.create_user("demo-field-a", "Nông hộ A", "field-a@example.test", "0910000001", "FarmTest@2026")
        repo.create_user("demo-field-b", "Nông hộ B", "field-b@example.test", "0910000002", "FarmTest@2026")
        client = app.test_client()
        login = client.post("/api/auth/login", json={"identifier": "demo-field-a", "password": "FarmTest@2026"})
        auth_headers = {"X-CSRF-Token": login.json["data"]["csrf_token"]}
        farm_data = {"address": "Tân Phú Đông · Hồ sơ kiểm thử", "cultivar": "st25", "area_ha": 4.6,
                     "station": "ben-gia", "seasons": 6, "farming_system": "Lúa – Tôm"}
        payload = {"name": "Nông hộ A", "phone": "0910000001", "farm_profile": farm_data}
        self.assertEqual(client.post("/api/auth/farm-profile", json=payload).status_code, 403)
        invalid = {**payload, "farm_profile": {**farm_data, "area_ha": True}}
        self.assertEqual(client.post("/api/auth/farm-profile", json=invalid, headers=auth_headers).status_code, 400)
        saved = client.post("/api/auth/farm-profile", json=payload, headers=auth_headers)
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json["data"]["farm_profile"], farm_data)
        self.assertEqual(repo.get_by_id(owner.user_id).simulation_credits, owner.simulation_credits)
        edited = client.post(
            "/api/auth/farm-profile",
            json={**payload, "farm_profile": {key: farm_data[key] for key in ("address", "cultivar", "area_ha")}},
            headers=auth_headers,
        )
        self.assertEqual(edited.json["data"]["farm_profile"], farm_data)
        self.assertIn("avatar-co-ma.webp", client.get("/profile").text)

        photo = BytesIO()
        Image.new("RGB", (400, 200), "#64aa72").save(photo, format="PNG")
        avatar_upload = client.post(
            "/api/auth/avatar",
            data={"avatar": (BytesIO(photo.getvalue()), "ruong.png")},
            headers=auth_headers,
        )
        self.assertEqual(avatar_upload.status_code, 200)
        avatar_url = avatar_upload.json["data"]["avatar_url"]
        stored_avatar = client.get(avatar_url)
        self.assertEqual(stored_avatar.mimetype, "image/jpeg")
        with Image.open(BytesIO(stored_avatar.data)) as image:
            self.assertEqual(image.size, (256, 256))
        rejected_avatar = client.post(
            "/api/auth/avatar",
            data={"avatar": (BytesIO(b"invalid"), "ruong.png")},
            headers=auth_headers,
        )
        self.assertEqual(rejected_avatar.status_code, 400)

        forum = client.get("/api/community/session").json["data"]
        forum_headers = {"X-CSRF-Token": forum["csrfToken"]}
        contribution = client.post(
            "/api/community/posts", headers=forum_headers,
            json={"title": "Quan sát ruộng", "body": "Ghi nhật ký vụ lúa.", "topic": "water",
                  "cultivar": "OM5451", "stage": "Đẻ nhánh", "photos": []},
        )
        self.assertEqual(contribution.status_code, 201, contribution.json)
        reply = client.post(
            f"/api/community/posts/{contribution.json['data']['id']}/replies",
            json={"body": "Ghi thêm mực nước mỗi ngày."}, headers=forum_headers,
        )
        self.assertEqual(reply.status_code, 201, reply.json)
        page = client.get("/profile").text
        self.assertIn('id="profile-post-count">1 bài viết', page)
        self.assertIn('id="profile-reply-count">1 câu trả lời', page)
        self.assertNotIn("Kinh nghiệm canh tác", page)
        self.assertNotIn("Quy mô thâm canh", page)
        self.assertIn("Đổi ảnh đại diện", page)
        self.assertIn('href="/wallet/rules"', page)
        self.assertEqual(page.count(avatar_url), 2)
        for field in ("hydrology-station", "farmer-seasons", "farmer-system"):
            self.assertNotIn(f'id="{field}"', page)
        other = app.test_client()
        other.post("/api/auth/login", json={"identifier": "demo-field-b", "password": "FarmTest@2026"})
        other_page = other.get("/profile").text
        self.assertIn('id="profile-post-count">0 bài viết', other_page)
        self.assertNotIn(farm_data["address"], other_page)
        self.assertEqual(other.get(avatar_url).status_code, 404)
        self.assertIn("avatar-co-ma.webp", other_page)

    def check_flask_auth_api(self, client: FlaskClient) -> None:
        # Homepage / must lock to /login until authenticated
        home_guest = client.get("/")
        self.assertEqual(home_guest.status_code, 302)
        self.assertTrue(home_guest.headers["Location"].endswith("/login"))

        # Ensure /login page does NOT show wallet address or wallet attachment box
        login_page = client.get("/login").get_data(as_text=True)
        self.assertNotIn("data-session-wallet", login_page)
        self.assertNotIn("walletAddressInput", login_page)
        self.assertIn("Quên mật khẩu", login_page)

        # Forgot-password OTP must reject unknown email/username
        missing_otp = client.post(
            "/api/auth/send-otp",
            json={"email": "unknown_user", "require_existing": True},
        )
        self.assertEqual(missing_otp.status_code, 404)

        # Send Email OTP via API (must not contain wallet address)
        otp_resp = client.post(
            "/api/auth/send-otp",
            json={"email": "tanvuthanh313130911@gmail.com"},
        )
        self.assertEqual(otp_resp.status_code, 200)
        self.assertNotIn("preview_wallet_address", otp_resp.json["data"])
        otp_code = otp_resp.json["data"].get("dev_otp_code")
        self.assertTrue(otp_code)

        # Login with seeded admin via Email + 6-digit OTP code
        login = client.post(
            "/api/auth/login",
            json={
                "identifier": "tanvuthanh313130911@gmail.com",
                "email": "tanvuthanh313130911@gmail.com",
                "otp_code": otp_code,
            },
        )
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.json["data"]["user"]["role"], "ADMIN")
        csrf_token = login.json["data"]["csrf_token"]
        cookie = client.get_cookie("agridata_session")
        assert cookie is not None
        self.assertTrue(cookie.http_only)

        # Homepage / now redirects to /community once authenticated
        home_authed = client.get("/")
        self.assertEqual(home_authed.status_code, 302)
        self.assertTrue(home_authed.headers["Location"].endswith("/community"))

        # Profile page renders slide-over privacy panel
        profile_html = client.get("/profile").get_data(as_text=True)
        self.assertIn("privacy-slide-panel", profile_html)
        self.assertIn("wallet-otp-input", profile_html)

        # Updating wallet address without Email OTP must fail (400)
        new_wallet = "0x1234567890123456789012345678901234567890"
        no_otp_wallet = client.post(
            "/api/auth/profile",
            headers={"X-CSRF-Token": csrf_token},
            json={"wallet_address": new_wallet, "wallet_mode": "EXTERNAL"},
        )
        self.assertEqual(no_otp_wallet.status_code, 400)

        # Updating wallet address with valid Email OTP succeeds
        wallet_otp_resp = client.post(
            "/api/auth/send-otp",
            json={"email": "tanvuthanh313130911@gmail.com", "require_existing": True},
        )
        wallet_otp = wallet_otp_resp.json["data"]["dev_otp_code"]
        ok_wallet = client.post(
            "/api/auth/profile",
            headers={"X-CSRF-Token": csrf_token},
            json={
                "wallet_address": new_wallet,
                "wallet_mode": "EXTERNAL",
                "otp_code": wallet_otp,
            },
        )
        self.assertEqual(ok_wallet.status_code, 200)
        self.assertEqual(ok_wallet.json["data"]["user"]["wallet_address"], new_wallet)
        assistant_page = client.get("/assistant").get_data(as_text=True)
        self.assertIn("Đăng xuất", assistant_page)
        self.assertIn("Trợ lý Cò Mạ", assistant_page)
        member = client.get("/api/community/session").json["data"]["member"]
        self.assertEqual(member["id"], "user:" + login.json["data"]["user"]["user_id"])
        self.assertFalse(member["isGuest"])

        # Test Credit Changer API endpoint with CSRF token
        ex_resp = client.post(
            "/api/auth/exchange-credits",
            headers={"X-CSRF-Token": csrf_token},
            json={"direction": "AVAX_TO_CREDIT", "amount": 0.1},
        )
        self.assertEqual(ex_resp.status_code, 200)
        self.assertIn("transaction", ex_resp.json["data"])

        # Logout without CSRF fails with 403
        no_csrf = client.post("/api/auth/logout", json={})
        self.assertEqual(no_csrf.status_code, 403)

        # Logout with CSRF succeeds
        ok_logout = client.post(
            "/api/auth/logout",
            headers={"X-CSRF-Token": csrf_token},
            json={},
        )
        self.assertEqual(ok_logout.status_code, 200)
        self.assertFalse(client.get("/api/auth/session").json["data"]["authenticated"])
        self.assertTrue(client.get("/api/community/session").json["data"]["member"]["isGuest"])
        self.assertEqual(normalize_vn_phone("0911421604"), "+84911421604")
