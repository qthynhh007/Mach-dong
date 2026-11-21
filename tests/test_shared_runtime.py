"""A judge's machine must use shared AI without a provider credential."""

from unittest import TestCase
from unittest.mock import patch
from io import BytesIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from src.main import createApp
from workspace_helpers import sign_in

from src.services.shared_runtime import shared_app_config, validate_shared_health


class SharedRuntimeTests(TestCase):
    def test_shared_mode_does_not_forward_a_local_provider_key(self):
        config = shared_app_config("https://api.example.test", 5000)
        self.assertEqual(config["GEMINI_API_KEY"], "")
        for prefix in ("AUTH", "COMMUNITY", "REFERENCE", "ASSISTANT", "SIMULATION"):
            self.assertEqual(config[prefix + "_API_URL"], "https://api.example.test")
        self.assertFalse(config["TESTING"])

    def test_rejects_old_health_that_only_has_evidence_selection_ai(self):
        with self.assertRaisesRegex(ValueError, "chưa hỗ trợ"):
            validate_shared_health({"data": {"status": "ok", "aiConfigured": True}, "error": None})

    def test_requires_real_chat_and_advice_configuration(self):
        for feature in ("chat", "scenarioAdvice"):
            capabilities = {"chat": True, "scenarioAdvice": True}
            capabilities[feature] = False
            with self.assertRaisesRegex(ValueError, "chưa sẵn sàng"):
                validate_shared_health({"data": {"status": "ok", "aiFeatures": capabilities}, "error": None})

    def test_accepts_current_shared_backend(self):
        validate_shared_health({"data": {"status": "ok", "aiFeatures": {"chat": True, "scenarioAdvice": True}}, "error": None})

    def test_shared_origin_must_be_https_without_credentials_or_paths(self):
        for origin in ("http://example.test", "https://key@example.test", "https://example.test/api", "https://example.test/?key=secret"):
            with self.assertRaises(ValueError):
                shared_app_config(origin, 5000)

    def test_chat_and_advice_forward_the_session_but_no_provider_key(self):
        seen = []

        def transport(req, timeout):
            seen.append(req)
            data = {"reply": "Bà con kiểm tra nguồn nước cấp trước nha.", "source_ids": []}
            return BytesIO(json.dumps({"data": data, "error": None}).encode())

        with TemporaryDirectory() as directory:
            config = shared_app_config("https://shared.example.test", 5000)
            config.update(TESTING=True, SECRET_KEY="shared-test-only", AUTH_API_URL="", COMMUNITY_API_URL="", REFERENCE_API_URL="",
                          COMMUNITY_DATABASE=str(Path(directory) / "community.sqlite3"),
                          ASSISTANT_API_TRANSPORT=transport, SIMULATION_TRANSPORT=transport)
            app = createApp(config)
            client = app.test_client()
            session = sign_in(client)
            with patch("src.services.assistant_service.generate_reply", side_effect=AssertionError("No local provider calls")):
                chat = client.post("/api/assistant/chat", json={"message": "Cách trồng cà chua ngoài đất?"})
            self.assertEqual(chat.status_code, 200)
            advice = client.post("/api/simulation/advice", json={
                "varietyId": "OM5451", "locationId": "can-tho", "stage": "panicle", "dayAfterSowing": 48,
                "salinityGl": 2.8, "salinitySite": "fieldWater", "waterDepthCm": 4.5, "plantHeightCm": None,
                "tempMaxC": 28.5, "rootZoneEcDsM": None, "ecIsSeasonAverage": False, "exposureDays": 7,
                "useWeather": False, "requestAi": False,
            })
            self.assertEqual(advice.status_code, 200)
            self.assertEqual([req.full_url for req in seen], ["https://shared.example.test/api/assistant/generate", "https://shared.example.test/api/simulation/advice"])
            for req in seen:
                self.assertTrue(req.get_header("Authorization").startswith("Bearer "))
                self.assertEqual(req.get_header("X-csrf-token"), session["csrf_token"])
                self.assertIsNone(req.get_header("X-goog-api-key"))
                self.assertNotIn("GEMINI_API_KEY", req.data.decode())
            app.extensions["auth_service"].repo.close()
