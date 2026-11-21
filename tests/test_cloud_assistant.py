"""The desktop assistant uses Groq on the shared Site without a local key."""

import json
from io import BytesIO
from unittest import TestCase

from src.main import createApp
from workspace_helpers import sign_in


class cloudAssistantTests(TestCase):
    def testProvidedFieldMeasurementsReachConversation(self) -> None:
        seen = []
        def transport(req, timeout):
            seen.append(json.loads(req.data))
            return BytesIO(json.dumps({"data": {"reply": "Việc nên làm: Kiểm tra nguồn cấp trước khi lấy nước vào ruộng.", "source_ids": []}, "error": None}).encode())
        app = createApp({"TESTING": True, "SECRET_KEY": "test-only", "ASSISTANT_API_URL": "https://example.test", "ASSISTANT_API_TRANSPORT": transport})
        client = app.test_client()
        sign_in(client)
        answer = client.post("/api/assistant/chat", json={"message": "Lúa đang trổ bông. Độ mặn tại ruộng hiện tại 4,2 g/L, mực nước 36 cm; nên làm gì?"})
        self.assertEqual(answer.status_code, 200)
        self.assertEqual(len(seen), 1)
        self.assertIn("4,2 g/L", seen[0]["messages"][-1]["text"])
        followup=client.post("/api/assistant/chat",json={"message":"Vậy độ mặn hiện tại cần xử lý gì?","history":[
            {"role":"user","text":"Lúa đang trổ bông, mặn ruộng 4,2 g/L, nước 36 cm."},
            {"role":"model","text":"Bà con kiểm tra nguồn nước cấp."},
        ]})
        self.assertEqual(followup.status_code,200)
        self.assertEqual(len(seen),2)
        self.assertEqual(len(seen[-1]["messages"]),3)

    def testQuestionOutsideFilesStillCallsCloud(self) -> None:
        seen = []
        def transport(req, timeout):
            seen.append(json.loads(req.data))
            return BytesIO(json.dumps({"data": {"reply": "Thanh long cần trụ đỡ để nâng đỡ thân leo.", "source_ids": []}, "error": None}).encode())
        app = createApp({"TESTING": True, "SECRET_KEY": "test-only", "ASSISTANT_API_URL": "https://example.test", "ASSISTANT_API_TRANSPORT": transport})
        client = app.test_client()
        sign_in(client)
        from unittest.mock import patch
        with patch("src.services.assistant_service.select_knowledge", return_value=[]):
            answer = client.post("/api/assistant/chat", json={"message": "Vì sao thanh long cần trụ?"})
        self.assertEqual(answer.status_code, 200)
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0]["sourceIds"], [])
        self.assertEqual(answer.json["data"]["answer_basis"], "general_knowledge")
        self.assertEqual(answer.json["data"]["sources"], [])

    def testGeneratesGroundedAnswerWithoutGeminiKey(self) -> None:
        seen = []

        def transport(req, timeout):
            self.assertEqual(timeout, 105)
            seen.append(req)
            return BytesIO(json.dumps({"data": {"reply": "Bà con kiểm tra đất thoát nước.", "source_ids": ["KN-TOMATO-PLANT"]}, "error": None}).encode())

        app = createApp({"TESTING": True, "SECRET_KEY": "test-only", "GEMINI_API_KEY": "", "ASSISTANT_API_URL": "https://example.test", "ASSISTANT_API_TRANSPORT": transport})
        client = app.test_client()
        sign_in(client)
        self.assertIn("Sẵn sàng hỗ trợ bà con", client.get("/assistant").text)
        answer = client.post("/api/assistant/chat", json={"message": "Cách trồng cà chua ngoài đất?"})
        self.assertEqual(answer.status_code, 200, answer.json)
        self.assertEqual(answer.json["data"]["sources"][0]["source_id"], "KN-TOMATO-PLANT")
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0].full_url, "https://example.test/api/assistant/generate")
        self.assertNotIn("test-key", seen[0].data.decode())
