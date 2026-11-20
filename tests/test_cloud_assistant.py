"""The desktop assistant uses Groq on the shared Site without a local key."""

import json
from io import BytesIO
from unittest import TestCase

from src.main import createApp
from workspace_helpers import sign_in


class cloudAssistantTests(TestCase):
    def testGeneratesGroundedAnswerWithoutGeminiKey(self) -> None:
        seen = []

        def transport(req, timeout):
            self.assertEqual(timeout, 35)
            seen.append(req)
            return BytesIO(json.dumps({"data": {"reply": "Bà con kiểm tra đất thoát nước.", "source_ids": ["KN-TOMATO-PLANT"]}, "error": None}).encode())

        app = createApp({"TESTING": True, "SECRET_KEY": "test-only", "GEMINI_API_KEY": "", "ASSISTANT_API_URL": "https://example.test", "ASSISTANT_API_TRANSPORT": transport})
        client = app.test_client()
        sign_in(client)
        self.assertIn("AI trên máy chủ", client.get("/assistant").text)
        answer = client.post("/api/assistant/chat", json={"message": "Cách trồng cà chua ngoài đất?"})
        self.assertEqual(answer.status_code, 200, answer.json)
        self.assertEqual(answer.json["data"]["sources"][0]["source_id"], "KN-TOMATO-PLANT")
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0].full_url, "https://example.test/api/assistant/generate")
        self.assertNotIn("test-key", seen[0].data.decode())
