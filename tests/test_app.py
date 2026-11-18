from csv import DictReader
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from main import create_app
from src.config import CREDITS_PER_AVAX


class TestApp(TestCase):
    def setUp(self) -> None:
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.client = create_app(
            {
                "TESTING": True,
                "SECRET_KEY": "app-tests-only",
                "COMMUNITY_DATABASE": str(Path(directory.name) / "community.sqlite3"),
            }
        ).test_client()

    def test_views_render(self) -> None:
        for route, title in (
            ("/community", "Kho CSV cộng đồng"),
            ("/forum", "Thảo Luận Bà Con"),
            ("/forum/new", "Viết bài chia sẻ"),
            ("/forum/muong-lo", "Khung trao đổi"),
            ("/simulation", "Mô phỏng cánh đồng lúa"),
            ("/simulation/report", "Mô phỏng có căn cứ"),
            ("/login", "Đăng Nhập Nông Hộ"),
            ("/register", "Đăng ký nông hộ"),
            ("/profile", "Bảo Mật &amp; Đổi Mật Khẩu"),
            ("/wallet/rules", "Thể lệ dùng điểm LÚA"),
            ("/assistant", "Lời khuyên Cò Mạ"),
            ("/admin", "Duyệt dữ liệu"),
        ):
            with self.subTest(route=route):
                response = self.client.get(route)
                self.assertEqual(response.status_code, 200)
                self.assertIn(title, response.get_data(as_text=True))
                self.assertIn('id="co-ma-launcher"', response.text)

    def test_wallet_rules_use_configured_rate_and_link_to_sign_in(self) -> None:
        page = self.client.get("/wallet/rules")
        self.assertEqual(page.status_code, 200)
        self.assertIn(f"1 AVAX = {CREDITS_PER_AVAX} LÚA", page.text)
        self.assertIn("Đăng nhập để mở ví", page.text)

    def test_assistant_dialog_reuses_chat_without_nested_launcher(self) -> None:
        page = self.client.get("/assistant?view=dialog").text
        self.assertIn('class="assistant-compact"', page)
        self.assertIn('data-chat-url="/api/assistant/chat"', page)
        self.assertNotIn('id="co-ma-launcher"', page)

    def test_co_ma_launcher_passes_context_to_chat_and_full_tab(self) -> None:
        for name, label in (("simulation", "Mặn ngoài kênh LH-05"), ("community", "Mực nước Cần Thơ"),
                            ("forum", "Mặn kênh và mặn ruộng")):
            with self.subTest(context=name):
                launcher = self.client.get(f"/{name}").text
                self.assertIn('src="/static/assets/co-ma/wave.png"', launcher)
                self.assertIn(f'href="/assistant?context={name}"', launcher)
                self.assertIn(f'data-chat-src="/assistant?view=dialog&amp;context={name}"', launcher)
                self.assertIn(label, self.client.get(f"/assistant?view=dialog&context={name}").text)
        self.assertIn("Độ mặn Cầu Quan", self.client.get("/assistant?context=unknown").text)

    def test_csv_preview_and_download(self) -> None:
        with self.client.get("/community/samples/salinity") as sample:
            self.assertIn("attachment", sample.headers["Content-Disposition"])
            raw = sample.get_data()
        response = self.client.post(
            "/api/community/preview", data={"file": (BytesIO(raw), "sample.csv")}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["data"]["row_count"], 1)
        self.assertIn("unit", response.json["data"]["columns"])

    def test_csv_preview_rejects_inconsistent_rows(self) -> None:
        response = self.client.post(
            "/api/community/preview",
            data={"file": (BytesIO(b"site,unit,value\nfield,g/L"), "invalid.csv")},
        )
        self.assertEqual(response.status_code, 400)

    def test_published_csv_previews_match_downloads_and_sources(self) -> None:
        expected = {
            "nasa-power-can-tho-2025": (365, "rain_mm_day", "0.02"),
            "faostat-viet-nam-rice-production": (64, "rice_production_tonnes", "43450450"),
            "faostat-viet-nam-rice-yields": (64, "rice_yield_tonnes_per_ha", "6.1517005"),
        }
        catalog = self.client.get("/community").get_data(as_text=True)
        for slug, (count, column, value) in expected.items():
            with self.subTest(slug=slug):
                self.assertIn(f'id="csv-title-{slug}"', catalog)
                preview = self.client.get(f"/api/community/datasets/{slug}").json["data"]
                self.assertEqual(preview["row_count"], count)
                self.assertEqual(preview["rows"][0][preview["columns"].index(column)], value)
                with self.client.get(f"/community/samples/{slug}") as download:
                    self.assertEqual(download.status_code, 200)
                    self.assertIn("attachment", download.headers["Content-Disposition"])
                    rows = list(DictReader(download.get_data(as_text=True).splitlines()))
                self.assertEqual(len(rows), count)
                self.assertEqual(rows[0][column], value)

    def test_simulation_has_no_fabricated_physiology(self) -> None:
        response = self.client.get("/simulation/report")
        body = response.get_data(as_text=True)
        self.assertIn("Chưa đủ dữ liệu", body)
        self.assertNotIn("15.7", body)
        self.assertNotIn("0.42 MPa", body)

    def test_simulation_combines_the_existing_illustrations_and_report_controls(self) -> None:
        body = self.client.get("/simulation").get_data(as_text=True)
        for item_id in ("inputSalinity", "inputWater", "inputStage", "inputTemp", "field-scene", "plant-study",
                        "scenarioForm", "reportPanel", "weatherPanel", "relativeYield", "riskSummary"):
            self.assertIn(f'id="{item_id}"', body)
        self.assertIn('data-panel="reportPanel"', body)
        self.assertIn('data-panel="weatherPanel"', body)
        self.assertIn('name="canalSalinityGl"', body)
        self.assertIn('value="panicle" data-through-day="65"', body)
        self.assertIn("Chưa đủ dữ liệu", body)
        self.assertIn("simulation-demo.js", body)

    def test_simulation_preview_renders_original_scenario_as_simulated(self) -> None:
        response = self.client.post(
            "/api/simulation/preview",
            json={"salinity_gl": 2.8, "water_depth_cm": 4.5, "day_after_sowing": 48, "temp_c": 28.5},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json["data"]
        self.assertTrue(data["is_simulated"])
        self.assertEqual(data["stage"], "Làm đòng")
        self.assertEqual(data["chi"], 72)
        self.assertIsNone(data["survival_rate_pct"])
        self.assertNotIn("illustrative_yield_tonnes_ha", data)
        self.assertTrue(data["advice_steps"])

    def test_simulation_rejects_invalid_values(self) -> None:
        for path in ("/api/simulation", "/api/simulation/preview"):
            with self.subTest(path=path):
                response = self.client.post(
                    path,
                    json={
                        "salinity_gl": 2,
                        "water_depth_cm": 4.5,
                        "day_after_sowing": 43,
                        "temp_c": 18,
                    },
                )
                self.assertEqual(response.status_code, 400)
