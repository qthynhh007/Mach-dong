import json
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

from main import create_app
from src.services.assistant_sources import select_knowledge


class TestAssistant(TestCase):
    def setUp(self) -> None:
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.client = create_app(
            {
                "TESTING": True,
                "SECRET_KEY": "assistant-tests-only",
                "COMMUNITY_DATABASE": str(Path(directory.name) / "community.sqlite3"),
                "GEMINI_API_KEY": "",
            }
        ).test_client()

    def test_local_mode_and_missing_api_key(self) -> None:
        self.assertIn("Chưa kết nối Gemini", self.client.get("/assistant").text)
        response = self.client.post("/api/assistant/chat", json={"message": "Chào Cò"})
        self.assertEqual(response.status_code, 503)
        self.assertIsNone(response.json["data"])

    @patch("src.services.ai_client.urlopen")
    def test_chat_sends_recent_turns_and_returns_visible_text(
        self, urlopen: MagicMock
    ) -> None:
        self.client.application.config["GEMINI_API_KEY"] = "test-key"
        page = self.client.get("/assistant").text
        self.assertIn("Gemini 3.5 Flash", page)
        self.assertIn('data-wait-seconds="180"', page)
        self.assertNotIn("test-key", page)
        source_id = "KN-RICE-SALINITY-SOC-TRANG"
        urlopen.return_value = BytesIO(
            json.dumps(
                {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {"text": "Private thought", "thought": True},
                                    {"text": json.dumps({
                                        "reply": "Bà con đo mặn tại ruộng nha.",
                                        "source_ids": [source_id],
                                    })},
                                ]
                            }
                        }
                    ]
                }
            ).encode()
        )
        history = [
            {"role": "user", "text": "Lúa đang làm đòng."},
            {"role": "model", "text": "Bà con đo mặn ở đâu?"},
        ]
        response = self.client.post(
            "/api/assistant/chat",
            json={"message": "Tui đo ở cống.", "history": history},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["data"]["reply"], "Bà con đo mặn tại ruộng nha.")
        request = urlopen.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/gemini-3.5-flash:generateContent"))
        self.assertEqual(request.get_header("X-goog-api-key"), "test-key")
        body = json.loads(request.data)
        self.assertEqual(
            [turn["role"] for turn in body["contents"]], ["user", "model", "user"]
        )
        evidence, question = body["contents"][-1]["parts"]
        self.assertIn(source_id, evidence["text"])
        self.assertEqual(question, {"text": "Tui đo ở cống."})
        self.assertEqual(body["generationConfig"]["responseMimeType"], "application/json")
        self.assertEqual(response.json["data"]["sources"][0]["source_id"], source_id)

    def test_rejects_invalid_chat_payload(self) -> None:
        for payload in (
            {"message": " "},
            {"message": "x" * 401},
            {"message": "Chào Cò", "history": [{"role": "system", "text": "test"}] * 2},
        ):
            with self.subTest(payload=payload):
                response = self.client.post("/api/assistant/chat", json=payload)
                self.assertEqual(response.status_code, 400)
                self.assertIsNone(response.json["data"])

    @patch("src.services.ai_client.urlopen")
    def test_reports_upstream_quota_without_exposing_response(
        self, urlopen: MagicMock
    ) -> None:
        self.client.application.config["GEMINI_API_KEY"] = "test-key"
        urlopen.side_effect = HTTPError(
            url="https://generativelanguage.googleapis.com",
            code=429,
            msg="private upstream detail",
            hdrs=None,
            fp=None,
        )
        response = self.client.post("/api/assistant/chat", json={"message": "Cách trồng ớt?"})
        self.assertEqual(response.status_code, 429)
        self.assertNotIn("private upstream detail", response.text)
        urlopen.assert_called_once()

    @patch("src.services.ai_client.urlopen")
    def test_uses_fallback_when_primary_model_is_unavailable(self, urlopen: MagicMock) -> None:
        self.client.application.config["GEMINI_API_KEY"] = "test-key"
        source_id = "KN-RICE-BLAST"
        answer = json.dumps({
            "reply": "Bà con xem vết trên lá có hình thoi nha.",
            "source_ids": [source_id],
        })
        fallback_body = json.dumps({"candidates": [{"content": {"parts": [{"text": answer}]}}]})
        for failure in (
            HTTPError("", 503, "primary unavailable", {}, None),
            TimeoutError(),
            URLError(TimeoutError()),
            BytesIO(json.dumps({"candidates": [{"finishReason": "MAX_TOKENS"}]}).encode()),
            BytesIO(b'{"candidates":[{"content":{"parts":[{"text":"{"}]}}]}'),
        ):
            with self.subTest(failure=type(failure).__name__):
                urlopen.reset_mock()
                urlopen.side_effect = [failure, BytesIO(fallback_body.encode())]

                response = self.client.post(
                    "/api/assistant/chat", json={"message": "Lúa có vết hình thoi, nghi đạo ôn?"}
                )

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json["data"]["sources"][0]["source_id"], source_id)
                self.assertEqual(urlopen.call_count, 2)
                primary, fallback = (call.args[0] for call in urlopen.call_args_list)
                self.assertTrue(primary.full_url.endswith("/gemini-3.5-flash:generateContent"))
                self.assertTrue(fallback.full_url.endswith("/gemini-3.1-flash-lite:generateContent"))
                self.assertEqual(primary.data, fallback.data)

    @patch("src.services.ai_client.urlopen")
    def test_reports_blocked_response_without_calling_fallback(self, urlopen: MagicMock) -> None:
        self.client.application.config["GEMINI_API_KEY"] = "test-key"
        urlopen.return_value = BytesIO(b'{"promptFeedback":{"blockReason":"SAFETY"}}')

        response = self.client.post("/api/assistant/chat", json={"message": "Cách trồng ớt?"})

        self.assertEqual(response.status_code, 422)
        self.assertIsNone(response.json["data"])
        urlopen.assert_called_once()

    @patch("src.services.ai_client.urlopen")
    def test_reports_unavailable_when_both_models_are_busy(self, urlopen: MagicMock) -> None:
        self.client.application.config["GEMINI_API_KEY"] = "test-key"
        urlopen.side_effect = [
            HTTPError("", 503, "primary unavailable", {}, None),
            HTTPError("", 503, "fallback unavailable", {}, None),
        ]

        response = self.client.post("/api/assistant/chat", json={"message": "Cách trồng ớt?"})

        self.assertEqual(response.status_code, 503)
        self.assertIsNone(response.json["data"])
        self.assertIn("Gemini đang bận", response.json["error"])
        self.assertEqual(urlopen.call_count, 2)

    def test_retrieval_for_planting_nutrition_disease_and_crop_switch(self) -> None:
        for question, expected in (
            ("Trồng dưa leo trong chậu thế nào?", "KN-CUCUMBER-SPRING"),
            ("Cây cải cần bón bao nhiêu phân hữu cơ?", "KN-SOIL-VEGETABLES"),
            ("Cà chua trồng chậu bị đen ở đáy quả, có cần bón canxi không?", "UMN-TOMATO-DISORDERS"),
            ("Ớt bị vàng lá", "UMN-PEPPER-ROOT-ROT"),
            ("Xoài gặp mặn thì đo ở đâu?", "KN-FRUIT-SALINITY"),
            ("Dưa leo bị phấn trắng, kiểm tra gì?", "UMN-CUCURBIT-MILDEW"),
        ):
            with self.subTest(question=question):
                result = select_knowledge([{"role": "user", "text": question}])
                self.assertIn(expected, {item["source_id"] for item in result})
        switched = select_knowledge([
            {"role": "user", "text": "Trồng dưa leo trong chậu thế nào?"},
            {"role": "model", "text": "Cho Cò biết chậu lớn cỡ nào nha."},
            {"role": "user", "text": "Còn xoài thì trồng thế nào?"},
        ])
        self.assertIn("KN-MANGO-VIETGAP", {item["source_id"] for item in switched})
        self.assertTrue(all("dưa chuột" not in item["crops"] for item in switched))

    def test_retrieval_for_specific_terms_in_expanded_knowledge(self) -> None:
        for question, expected in (
            ("Lúa bị ốc bươu vàng", "KN-RICE-GOLDEN-SNAIL"),
            ("Lúa cỏ xử lý thế nào?", "KN-RICE-WEEDY-RICE"),
            ("Lúa có vết hình thoi, nghi đạo ôn", "KN-RICE-BLAST"),
            ("Lúa sau ngập cần kiểm tra gì?", "KN-RICE-FLOOD-RECOVERY"),
            ("Lúa OM5451 giai đoạn mạ bị mặn thì sao?", "VU-2022"),
            ("Cách xử lý sầu riêng sau ngập?", "KN-DURIAN-FLOOD-RECOVERY"),
            ("Dưa leo có hoa cái mà không đậu trái", "UMN-CUCUMBER-POLLINATION"),
            ("Bưởi vàng lá gân xanh", "KN-POMELO-GREENING"),
        ):
            with self.subTest(question=question):
                result = select_knowledge([{"role": "user", "text": question}])
                self.assertIn(expected, {item["source_id"] for item in result})
                self.assertLessEqual(len(result), 4)

    @patch("src.services.ai_client.urlopen")
    def test_rejects_unknown_or_unselected_source(self, urlopen: MagicMock) -> None:
        self.client.application.config["GEMINI_API_KEY"] = "test-key"
        for source_id in ("FAKE-SOURCE", "VU-2022"):
            urlopen.return_value = BytesIO(json.dumps({
                "candidates": [{"content": {"parts": [{"text": json.dumps({
                    "reply": "Nội dung chưa kiểm chứng.", "source_ids": [source_id],
                })}]}}],
            }).encode())
            response = self.client.post(
                "/api/assistant/chat", json={"message": "Cà chua bị thối đít quả?"}
            )
            self.assertEqual(response.status_code, 502)
            self.assertIsNone(response.json["data"])

    def test_historical_station_records_keep_kind_date_and_missing_status(self) -> None:
        def ask(message: str) -> dict:
            response = self.client.post("/api/assistant/chat", json={"message": message})
            self.assertEqual(response.status_code, 200)
            return response.json["data"]

        observed = ask("Độ mặn thực đo trạm Cầu Quan ngày 7/5/2026?")
        self.assertIn("3,5 ‰", observed["reply"])
        self.assertIn("thực đo", observed["reply"])
        self.assertNotIn("dự báo", observed["reply"])
        self.assertTrue(observed["sources"][0]["url"].endswith("#page=2"))
        forecast = ask("Dự báo độ mặn trạm Cầu Quan ngày 20 tháng 5 năm 2026?")
        self.assertIn("dự báo", forecast["reply"])
        self.assertIn("3,5 ‰", forecast["reply"])
        self.assertNotIn("thực đo", forecast["reply"])
        missing = ask("Độ mặn thực đo trạm Cái Muối kỳ 07/05/2026?")
        self.assertIn("nghỉ đo", missing["reply"])
        self.assertNotIn("‰", missing["reply"])
        self.assertEqual(ask("Mặn Cầu Quan tháng 7/2026?")["sources"], [])
        self.assertEqual(ask("Mặn trạm Cầu Quan hôm nay?")["sources"], [])

    def test_field_and_demo_data_keep_measurement_sites_separate(self) -> None:
        for message in (
            "Mực nước trạm Tân Châu thì độ sâu ngập ruộng bao nhiêu?",
            "Độ sâu ngập ruộng Long Hữu là bao nhiêu?",
        ):
            result = self.client.post("/api/assistant/chat", json={"message": message}).json["data"]
            self.assertEqual(result["sources"], [])
            self.assertIn("tính từ mặt ruộng", result["reply"])
        sample = self.client.post("/api/assistant/chat", json={"message": "Ca LH-03"}).json["data"]
        self.assertTrue(sample["reply"].startswith("[Giả lập]"))
        self.assertRegex(sample["reply"], r"tại ruộng.*2,8 g/L")
        self.assertRegex(sample["reply"], r"ngoài kênh.*4,1 g/L")
        late = self.client.post(
            "/api/assistant/chat", json={"message": "LH-03 ở mốc 48 giờ"}
        ).json["data"]
        self.assertIn("22 cm", late["reply"])
        self.assertIn("1,7 g/L", late["reply"])
        self.assertNotIn("4,1 g/L", late["reply"])
