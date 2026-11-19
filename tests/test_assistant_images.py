"""Photo validation and multimodal chat must work without leaking keys or faking analysis."""

import base64
import json
import random
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

from PIL import Image

from src.main import createApp
from src.services.ai_client import GeminiError
from src.services.assistant_images import MAX_IMAGE_BASE64, parse_chat_image


class AssistantImageTests(TestCase):
    def setUp(self) -> None:
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.client = createApp({
            "TESTING": True, "SECRET_KEY": "image-test-only", "GEMINI_API_KEY": "",
            "COMMUNITY_DATABASE": str(Path(directory.name) / "community.sqlite3"),
        }).test_client()
        output = BytesIO()
        Image.new("RGB", (32, 24), "#93b977").save(output, "PNG")
        self.photo = {"mime_type": "image/png", "data": base64.b64encode(output.getvalue()).decode()}

    def test_normalizes_real_images_and_rejects_forged_or_oversized_attachments(self) -> None:
        parsed = parse_chat_image(self.photo)
        self.assertEqual(parsed["mime_type"], "image/jpeg")
        with Image.open(BytesIO(base64.b64decode(parsed["data"]))) as image:
            self.assertEqual(image.size, (32, 24))
            self.assertNotIn("exif", image.info)
        for photo in (
            {}, {"mime_type": [], "data": "abc"},
            {**self.photo, "mime_type": "image/jpeg"},
            {**self.photo, "data": "not-base64"},
            {**self.photo, "data": base64.b64encode(b"not an image").decode()},
        ):
            with self.subTest(photo=photo):
                response = self.client.post("/api/assistant/chat", json={"message": "Xem ảnh lúa", "image": photo})
                self.assertEqual(response.status_code, 400)
                self.assertIsNone(response.json["data"])
        with self.assertRaises(GeminiError) as raised:
            parse_chat_image({**self.photo, "data": "A" * (MAX_IMAGE_BASE64 + 1)})
        self.assertEqual(raised.exception.status, 413)

    def test_image_requires_ai_instead_of_returning_a_local_answer(self) -> None:
        response = self.client.post("/api/assistant/chat", json={"message": "Chào Cò", "image": self.photo})
        self.assertEqual(response.status_code, 503)
        self.assertIn("xem ảnh", response.json["error"])

    def test_photo_request_can_exceed_the_csv_upload_limit(self) -> None:
        output = BytesIO()
        pixels = random.Random(42).randbytes(640 * 640 * 3)
        Image.frombytes("RGB", (640, 640), pixels).save(output, "PNG")
        photo = {"mime_type": "image/png", "data": base64.b64encode(output.getvalue()).decode()}
        self.assertGreater(len(photo["data"]), self.client.application.config["MAX_CONTENT_LENGTH"])
        response = self.client.post("/api/assistant/chat", json={"image": photo})
        self.assertEqual(response.status_code, 503)  # Valid photo reaches the missing-AI state.
        self.assertIn("Gemini", response.json["error"])

    @patch("src.services.ai_client.urlopen")
    def test_sends_validated_image_alongside_question_and_grounded_sources(self, urlopen) -> None:
        self.client.application.config["GEMINI_API_KEY"] = "image-test-key"
        answer = {"reply": "Lá có vùng đổi màu; bà con kiểm tra thêm tại ruộng nha.", "source_ids": ["KN-RICE-BLAST"]}
        urlopen.return_value = BytesIO(json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(answer)}]}}]}).encode())
        response = self.client.post("/api/assistant/chat", json={"message": "Lúa có vết hình thoi, nghi đạo ôn?", "image": self.photo})
        self.assertEqual(response.status_code, 200, response.json)
        body = json.loads(urlopen.call_args.args[0].data)
        parts = body["contents"][-1]["parts"]
        self.assertEqual(parts[-1]["inlineData"]["mimeType"], "image/jpeg")
        self.assertTrue(base64.b64decode(parts[-1]["inlineData"]["data"]).startswith(b"\xff\xd8"))
        self.assertIn("Không suy độ mặn", body["systemInstruction"]["parts"][0]["text"])
        self.assertNotIn("image-test-key", response.text)

    @patch("src.services.assistant_service.generate_reply", return_value=("Cò thấy lá xanh. Bà con đang trồng cây gì?", []))
    def test_image_only_question_can_ask_for_context_without_inventing_sources(self, generate) -> None:
        self.client.application.config["GEMINI_API_KEY"] = "image-test-key"
        response = self.client.post("/api/assistant/chat", json={"image": self.photo})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertIn("đang trồng cây gì", response.json["data"]["reply"])
        self.assertEqual(response.json["data"]["sources"], [])
        self.assertIn("image", generate.call_args.args[2][-1])

    @patch("src.services.assistant_service.generate_reply", side_effect=GeminiError("Gemini đang bận.", 503))
    def test_failed_image_analysis_remains_an_error_for_retry(self, generate) -> None:
        self.client.application.config["GEMINI_API_KEY"] = "image-test-key"
        response = self.client.post("/api/assistant/chat", json={"message": "Lúa bị vàng lá", "image": self.photo})
        self.assertEqual(response.status_code, 503)
        self.assertIsNone(response.json["data"])
