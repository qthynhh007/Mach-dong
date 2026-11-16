from __future__ import annotations

import tempfile
from pathlib import Path
from unittest import TestCase

from main import create_app
from src.controllers.auth_controller import AuthController
from src.models.user import (
    SQLiteUserRepository,
    UserRole,
    is_valid_wallet_address,
    normalize_vn_phone,
)
from src.services.auth_service import AuthService
from src.services.session_client import ClientSessionManager


class TestAuthAndSession(TestCase):
    def setUp(self) -> None:
        self.repo = SQLiteUserRepository(":memory:")
        self.auth_service = AuthService(repo=self.repo, seed_defaults=True)
        self.controller = AuthController(auth_service=self.auth_service)

    def tearDown(self) -> None:
        self.repo.close()

    def test_seeded_accounts_and_no_default_farmer(self) -> None:
        admin = self.repo.get_by_username("admin")
        self.assertIsNotNone(admin)
        assert admin is not None
        self.assertEqual(admin.email, "tanvuthanh313130911@gmail.com")
        self.assertEqual(admin.phone, "+84911421604")
        self.assertEqual(admin.role, UserRole.ADMIN)
        self.assertEqual(admin.simulation_credits, 99)
        self.assertTrue(admin.verify_password("admin"))
        self.assertNotEqual(admin.password_hash, "admin")
        self.assertTrue(is_valid_wallet_address(admin.wallet_address))

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
        res_admin = self.auth_service.verify_login("+84911421604", "admin")
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

    def test_email_otp_signin_and_auto_wallet_creation(self) -> None:
        email = "bacon.longhuu@gmail.com"
        otp_res = self.auth_service.send_email_otp(email)
        self.assertTrue(otp_res.ok)
        assert otp_res.data is not None
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

        # Correct 6-digit OTP code signs in and auto-creates Email-bound Avalanche Fuji wallet
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

        # Re-using the same consumed OTP code must fail
        replay = self.auth_service.verify_login(
            identifier=email,
            password="",
            email=email,
            otp_code=code,
        )
        self.assertFalse(replay.ok)

    def test_lockout_and_client_session_restore(self) -> None:
        for _ in range(4):
            bad = self.auth_service.verify_login("admin", "wrong_pass")
            self.assertEqual(bad.status_code, 401)
        fifth = self.auth_service.verify_login("admin", "wrong_pass")
        self.assertEqual(fifth.status_code, 429)

        # Even correct password while locked returns 429
        locked = self.auth_service.verify_login("admin", "admin")
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
        client = create_app().test_client()
        # Preview wallet by email
        preview = client.get("/api/auth/wallet-preview?email=testfarmer@gmail.com")
        self.assertEqual(preview.status_code, 200)
        self.assertTrue(
            is_valid_wallet_address(preview.json["data"]["preview_wallet_address"])
        )

        # Send Email OTP via API
        otp_resp = client.post(
            "/api/auth/send-otp",
            json={"email": "tanvuthanh313130911@gmail.com"},
        )
        self.assertEqual(otp_resp.status_code, 200)
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

        # Check active session endpoint
        sess = client.get("/api/auth/session")
        self.assertEqual(sess.status_code, 200)
        self.assertTrue(sess.json["data"]["authenticated"])

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
        self.assertEqual(normalize_vn_phone("0911421604"), "+84911421604")
