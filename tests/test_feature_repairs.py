"""Regression coverage for the six repairs requested on 20 November."""

from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from src.main import createApp
from src.controllers.session_guard import safe_workspace_path
from workspace_helpers import sign_in


class FeatureRepairsTests(TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.app = createApp({"TESTING": True, "SECRET_KEY": "repair-tests-only",
                              "COMMUNITY_DATABASE": str(Path(directory.name) / "test.sqlite3")})
        self.addCleanup(self.app.extensions["auth_service"].repo.close)
        self.client = self.app.test_client()

    def test_guests_cannot_open_any_workspace_page(self):
        for path in ("/community", "/forum", "/simulation", "/simulation/report?tab=thoi-tiet",
                     "/assistant", "/profile", "/wallet/rules"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 302)
                self.assertTrue(response.headers["Location"].startswith("/login?next="))

    def test_guests_cannot_call_workspace_apis(self):
        for path, method in (("/api/simulation/catalog", "GET"), ("/api/simulation/weather", "GET"),
                             ("/api/simulation", "POST"), ("/api/assistant/chat", "POST"),
                             ("/api/community/posts", "GET")):
            with self.subTest(path=path):
                response = self.client.open(path, method=method)
                self.assertEqual(response.status_code, 401)
                self.assertIsNone(response.json["data"])

    def test_registration_does_not_require_email_confirmation_controls(self):
        response = self.client.get("/register")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('id="btnSendOtpRegister"', response.text)
        self.assertNotIn('id="registerOtpInput"', response.text)

    def test_login_only_uses_password_even_when_email_delivery_is_enabled(self):
        self.app.extensions["auth_service"].email_otp_available=lambda:True
        page=self.client.get("/login").text
        self.assertNotIn('id="otpCodeInput"',page)
        self.assertNotIn('id="btnSendOtpLogin"',page)
        sign_in(self.client)
        response=self.client.post("/api/auth/login",json={"identifier":"test_farmer","password":"test-password-only","otp_code":"stale"})
        self.assertEqual(response.status_code,200)

    def test_removed_admin_page_returns_not_found(self):
        self.assertEqual(self.client.get("/admin").status_code, 404)

    def test_redirect_only_accepts_internal_workspace_paths(self):
        for unsafe in ("//evil.test", "https://evil.test", "/\\evil.test", "/login", "/api/auth/logout", {}, "/\nelse"):
            self.assertEqual(safe_workspace_path(unsafe), "/community")
        self.assertEqual(safe_workspace_path("/simulation?tab=thoi-tiet"), "/simulation?tab=thoi-tiet")

    def test_removed_samples_are_not_published_and_profile_keeps_avatar(self):
        sign_in(self.client)
        library=self.client.get("/community")
        for slug in ("salinity", "water", "weather", "ph"):
            self.assertNotIn(f'id="csv-title-{slug}"', library.text)
            self.assertEqual(self.client.get("/community/samples/"+slug).status_code,404)
        profile=self.client.get("/profile")
        self.assertIn('id="profile-avatar-choose"',profile.text)
        self.assertIn('id="wallet-heading"',profile.text)
        self.assertNotIn('href="/admin"',profile.text)
