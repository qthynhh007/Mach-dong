from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from main import create_app


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
            ("/simulation", "Mô phỏng cánh đồng lúa"),
            ("/simulation/report", "Mô phỏng có căn cứ"),
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

    def test_simulation_has_no_fabricated_physiology(self) -> None:
        response = self.client.get("/simulation/report")
        body = response.get_data(as_text=True)
        self.assertIn("Chưa đủ dữ liệu", body)
        self.assertNotIn("15.7", body)
        self.assertNotIn("0.42 MPa", body)

    def test_simulation_restores_the_four_sliders_and_report_link(self) -> None:
        body = self.client.get("/simulation").get_data(as_text=True)
        for item_id in ("inputSalinity", "inputWater", "inputStage", "inputTemp", "field-scene", "plant-study"):
            self.assertIn(f'id="{item_id}"', body)
        self.assertIn('href="/simulation/report"', body)
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
