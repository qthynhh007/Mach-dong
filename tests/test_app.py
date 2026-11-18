from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from main import create_app
from src.models.simulation import SimulationInput
from src.services.simulation_service import evaluate


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
            ("/forum/new", "Đăng Bài Chia Sẻ Kinh Nghiệm Canh Tác"),
            ("/forum/muong-lo", "Khung trao đổi"),
            ("/simulation", "Điểm sức khỏe lúa (CHI)"),
            ("/login", "Đăng Nhập Nông Hộ"),
            ("/register", "Đăng ký nông hộ"),
            ("/profile", "Bảo Mật &amp; Đổi Mật Khẩu"),
            ("/assistant", "Lời khuyên Cò Mạ"),
            ("/admin", "Duyệt dữ liệu"),
        ):
            with self.subTest(route=route):
                response = self.client.get(route)
                self.assertEqual(response.status_code, 200)
                self.assertIn(title, response.get_data(as_text=True))

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

    def test_catalog_previews_and_downloads_the_same_published_data(self) -> None:
        for slug, count, flag in (
            ("dbscl-stations", 22, "false"),
            ("long-huu-man-ngap", 16, "true"),
        ):
            with self.subTest(slug=slug):
                published = self.client.get("/api/community/datasets/" + slug).json["data"]
                self.assertEqual(len(published["rows"]), count)
                self.assertEqual(published["row_count"], count)
                index = published["columns"].index("is_simulated")
                self.assertTrue(all(row[index] == flag for row in published["rows"]))
                with self.client.get("/community/samples/" + slug) as download:
                    raw = download.get_data()
                    self.assertIn("attachment", download.headers["Content-Disposition"])
                upload = self.client.post(
                    "/api/community/preview", data={"file": (BytesIO(raw), "reference.csv")}
                ).json["data"]
                self.assertEqual(upload["rows"], published["rows"][:5])
        self.assertEqual(self.client.get("/api/community/datasets/unlisted").status_code, 404)

    def test_simulation_matches_demo_chi(self) -> None:
        payload = {
            "salinity_gl": 2.8,
            "water_depth_cm": 4.5,
            "day_after_sowing": 48,
            "temp_c": 28.5,
        }
        response = self.client.post("/api/simulation", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["data"]["chi"], 72)
        self.assertEqual(response.json["data"]["stage"], "Làm đòng")
        self.assertIsNone(response.json["data"]["survival_rate_pct"])
        steps = response.json["data"]["advice_steps"]
        self.assertEqual(steps[0]["title"], "Kiểm tra mặn tại ruộng")
        self.assertIn("kênh hoặc cống", steps[0]["body"])

    def test_simulation_advice_changes_for_flooding_and_heat(self) -> None:
        data = evaluate(SimulationInput(2.8, 25, 72, 38))
        titles = [step["title"] for step in data["advice_steps"]]
        self.assertEqual(titles[0], "Đo mức ngập và thời gian ngập")
        self.assertIn("Quan sát dấu hiệu stress nhiệt", titles)
        self.assertIn("cùng ô mẫu", data["advice_steps"][-1]["body"])
        seedlings = evaluate(SimulationInput(0.8, 22, 10, 26))
        self.assertIn("quan sát rễ mới", seedlings["advice_steps"][0]["body"])
        dry = evaluate(SimulationInput(0.2, -8, 15, 26))
        self.assertEqual(dry["advice_steps"][0]["title"], "Kiểm tra chỗ ruộng khô")
        self.assertNotIn("Quan sát dấu hiệu stress nhiệt", [step["title"] for step in dry["advice_steps"]])

    def test_simulation_labels_chi_as_a_score(self) -> None:
        page = self.client.get("/simulation").text
        self.assertIn("Điểm sức khỏe lúa (CHI)", page)
        self.assertIn("thang 100", page)
        self.assertNotIn("Tỷ lệ cây phát triển tốt", page)

    def test_simulation_rejects_invalid_values(self) -> None:
        response = self.client.post(
            "/api/simulation",
            json={
                "salinity_gl": 2,
                "water_depth_cm": 4.5,
                "day_after_sowing": 43,
                "temp_c": 18,
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_simulation_physiology_distinguishes_stress_signals(self) -> None:
        def signals(salt: float, depth: float, day: int, temp: float = 28) -> dict:
            return evaluate(SimulationInput(salt, depth, day, temp))["physiology"]["signals"]

        baseline = signals(0.5, 4.5, 48)
        salty = signals(6, 4.5, 48)
        dry = signals(0.5, -10, 48)
        flooded_seedling = signals(0.5, 28, 10)
        flooded_mature = signals(0.5, 28, 90)
        self.assertEqual(baseline["soil"], "moist")
        self.assertGreater(salty["tip_burn"], baseline["tip_burn"])
        self.assertEqual(dry["soil"], "dry")
        self.assertEqual(dry["water_cover"], 0)
        self.assertGreater(dry["leaf_roll"], baseline["leaf_roll"])
        self.assertGreater(dry["leaf_droop"], baseline["leaf_droop"])
        self.assertGreater(signals(0.5, 4.5, 48, 42)["leaf_droop"], baseline["leaf_droop"])
        self.assertEqual(flooded_seedling["soil"], "flooded")
        self.assertGreater(flooded_seedling["water_cover"], flooded_mature["water_cover"])

    def test_stage_boundary_and_determinism(self) -> None:
        before = SimulationInput(2.8, 4.5, 42, 28.5)
        after = SimulationInput(2.8, 4.5, 43, 28.5)
        self.assertEqual(evaluate(before)["stage"], "Đẻ nhánh")
        self.assertEqual(evaluate(after)["stage"], "Làm đòng")
        self.assertEqual(evaluate(after), evaluate(after))
