"""Verify cross-feature contracts introduced by the branch integration."""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

from src.main import createApp


class mergeIntegrationTests(TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.app = createApp({
            "TESTING": True, "SECRET_KEY": "integration-tests-only",
            "COMMUNITY_DATABASE": str(Path(directory.name) / "community.sqlite3"),
            "COMMUNITY_SEED_SAMPLES": False, "COMMUNITY_SEED_EDITORIAL": False,
            "COMMUNITY_ALLOW_GUESTS": False, "AGRIDATA_AUTH_DEMO": True,
        })
        self.service = self.app.extensions["auth_service"]
        self.service.enable_smtp = False
        self.addCleanup(self.service.repo.close)
        self.client = self.app.test_client()
        login = self.client.post("/api/auth/login", json={"identifier": "admin", "password": "adminadmin"})
        self.assertEqual(login.status_code, 200)
        self.login = login.json["data"]

    def testLoginOwnsCommunityPostsAndLogoutRevokesWriting(self):
        session = self.client.get("/api/community/session").json["data"]
        self.assertEqual(session["member"]["id"], "user:" + self.login["user"]["user_id"])
        response = self.client.post("/api/community/posts", headers={"X-CSRF-Token": session["csrfToken"]}, json={
            "title": "Ghi nhận điều kiện ruộng lúa", "body": "Tôi đã đo nước tại ruộng hôm nay.",
            "topic": "water", "cultivar": "OM5451", "stage": "Đẻ nhánh", "photos": [],
        })
        self.assertEqual(response.status_code, 201)
        postId = response.json["data"]["id"]
        self.assertTrue(response.json["data"]["canEdit"])
        self.assertEqual(self.client.get("/forum/" + postId).status_code, 200)
        logout = self.client.post("/api/auth/logout", headers={"X-CSRF-Token": self.login["csrf_token"]}, json={})
        self.assertEqual(logout.status_code, 200)
        self.assertIsNone(self.client.get("/api/community/session").json["data"]["member"])
        denied = self.client.delete("/api/community/posts/" + postId, headers={"X-CSRF-Token": session["csrfToken"]})
        self.assertEqual(denied.status_code, 401)

    @patch("src.controllers.auth_controller.default_credit_service.get_onchain_balance", return_value=None)
    def testSimulatedTransactionHashIsNotLabeledAsBlockchainTransaction(self, balance):
        userId = self.login["user"]["user_id"]
        fakeHash = "0x" + "a" * 64
        sentHash = "0x" + "b" * 64
        for txHash, note in [(fakeHash, "[Giả lập] Cộng 1 AVAX"), (sentHash, "Đổi điểm (On-chain Fuji)")]:
            self.service.repo.record_credit_transaction(userId, "AVAX_TO_CREDIT", 1, 100, txHash, note)
        page = self.client.get("/profile")
        self.assertEqual(page.status_code, 200)
        self.assertIn("Mã mô phỏng", page.text)
        self.assertNotIn("https://testnet.snowtrace.io/tx/" + fakeHash, page.text)
        self.assertIn("https://testnet.snowtrace.io/tx/" + sentHash, page.text)
