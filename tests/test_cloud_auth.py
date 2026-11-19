import io
import json
import tempfile
import unittest
from pathlib import Path

from src.main import createApp
from src.services.cloud_auth_service import CloudAuthService


class FakeResponse(io.BytesIO):
    status = 201


class CloudAuthTests(unittest.TestCase):
    def test_flask_cloud_mode_renders_without_local_account_database(self):
        def transport(req, timeout):
            self.assertEqual(req.full_url, "https://example.test/api/account/config")
            self.assertEqual(req.get_header("User-agent"), "MachDongDesktop/2.0")
            response = FakeResponse(b'{"data":{"email_otp_enabled":false},"error":null}')
            response.status = 200
            return response

        with tempfile.TemporaryDirectory() as temp_dir:
            account_db = Path(temp_dir) / "accounts.sqlite3"
            app = createApp({"TESTING": True, "SECRET_KEY": "test-only",
                             "AUTH_API_URL": "https://example.test",
                             "AUTH_API_TRANSPORT": transport,
                             "AGRIDATA_DB_PATH": str(account_db),
                             "COMMUNITY_DATABASE": str(Path(temp_dir) / "community.sqlite3")})
            client = app.test_client()
            self.assertEqual(client.get("/register").status_code, 200)
            self.assertNotIn('id="registerOtpInput"',client.get("/register").get_data(as_text=True))
            self.assertEqual(client.get("/login").status_code, 200)
            self.assertFalse(account_db.exists())

    def test_production_cannot_fall_back_to_local_accounts(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            account_db = Path(temp_dir) / "accounts.sqlite3"
            with self.assertRaisesRegex(RuntimeError, "AUTH_API_URL is required"):
                createApp({"AUTH_API_URL": "", "SECRET_KEY": "test-only",
                           "AGRIDATA_DB_PATH": str(account_db),
                           "COMMUNITY_DATABASE": str(Path(temp_dir) / "community.sqlite3")})
            self.assertFalse(account_db.exists())

    def test_registration_sends_only_encrypted_wallet_key(self):
        captured = {}

        def transport(req, timeout):
            self.assertEqual(timeout, 12)
            captured.update(json.loads(req.data))
            self.assertEqual(req.full_url, "https://example.test/api/account/register")
            return FakeResponse(json.dumps({"data": {"user": {"wallet_address": captured["wallet_address"]}}, "error": None}).encode())

        service = CloudAuthService("https://example.test", transport)
        result = service.register_user(
            name="Nông hộ A", username="farmer_a", email="a@example.test",
            phone="+84912345678", password="long-password-for-test",
        )
        self.assertTrue(result.ok)
        self.assertEqual(captured["wallet_type"], "AUTO_EMAIL")
        self.assertRegex(captured["wallet_address"], r"^0x[0-9A-Fa-f]{40}$")
        self.assertTrue(captured["encrypted_wallet_key"].startswith("v1:"))
        self.assertNotIn("long-password-for-test", captured["encrypted_wallet_key"])
        private_key = service._decrypt_wallet_key(captured["encrypted_wallet_key"],"long-password-for-test")
        self.assertEqual(len(private_key),32)
        with self.assertRaises(ValueError):
            service._decrypt_wallet_key(captured["encrypted_wallet_key"],"wrong-password")


if __name__ == "__main__":
    unittest.main()
