import json
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from urllib.error import URLError

from src.main import createApp
from src.models.simulation import simulationError, simulationInput
from src.services.cloud_client import cloudClient


class testSimulation(TestCase):
    def setUp(self):
        self.payload = {"varietyId": "OM5451", "locationId": "can-tho", "stage": "panicle",
                        "dayAfterSowing": 48, "salinityGl": 2.8, "salinitySite": "fieldWater",
                        "waterDepthCm": 4.5, "plantHeightCm": None, "tempMaxC": 28.5,
                        "rootZoneEcDsM": None, "ecIsSeasonAverage": False,
                        "exposureDays": 7, "useWeather": False, "requestAi": False}
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.requests = []

        def transport(request, timeout):
            self.requests.append(request)
            self.assertEqual(timeout, 35)
            return BytesIO(json.dumps({"data": {"engineVersion": "test-cloud",
                            "metrics": {"survivalRatePct": None}}, "error": None}).encode())

        self.app = createApp({"TESTING": True, "SECRET_KEY": "tests-only",
                              "COMMUNITY_DATABASE": str(Path(directory.name) / "test.sqlite3"),
                              "SIMULATION_TRANSPORT": transport})
        self.client = self.app.test_client()

    def testRemoteForwardingPreservesUserData(self):
        self.payload["requestAi"] = True
        response = self.client.post("/api/simulation", json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(self.requests[0].data), self.payload)
        self.assertTrue(self.requests[0].full_url.startswith("https://"))
        self.assertNotIn("key", self.requests[0].headers)
        self.assertEqual(response.json["data"]["engineVersion"], "test-cloud")

    def testInvalidInputsNeverCallCloud(self):
        for overrides in ({"tempMaxC": float("nan")}, {"tempMaxC": float("inf")},
                          {"salinityGl": True}, {"stage": "made-up"}, {"useWeather": "true"},
                          {"exposureDays": 1.1}, {"rootZoneEcDsM": -1}, {"varietyId": "ST25"}):
            with self.subTest(overrides=overrides):
                response = self.client.post("/api/simulation", json={**self.payload, **overrides})
                self.assertEqual(response.status_code, 400)
        self.assertEqual(self.requests, [])

    def testExplicitMeasurementMetadataRequired(self):
        self.payload.pop("salinitySite")
        with self.assertRaises(simulationError):
            simulationInput.parse(self.payload)

    def testNetworkFailureReturnsNoPrediction(self):
        def failedTransport(request, timeout):
            raise URLError("offline")
        self.app.extensions["simulationService"].ai.cloud.transport = failedTransport
        response = self.client.post("/api/simulation", json=self.payload)
        self.assertEqual(response.status_code, 503)
        self.assertIsNone(response.json["data"])
        self.assertIn("Internet", response.json["error"])

    def testCrossOriginBrowserCallCannotSpendAiQuota(self):
        response = self.client.post("/api/simulation", json=self.payload,
                                    headers={"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.requests, [])

    def testUnknownAndOversizedInputsRejected(self):
        response = self.client.post("/api/simulation", json={**self.payload, "untrusted": "value"})
        self.assertEqual(response.status_code, 400)
        response = self.client.post("/api/simulation", data=" " * 9000, content_type="application/json")
        self.assertEqual(response.status_code, 413)

    def testMalformedCloudResponseIsNotTreatedAsSuccess(self):
        for raw in (b"not json", b'{"data":null,"error":null}', b"[]"):
            with self.subTest(raw=raw), self.assertRaises(simulationError):
                cloudClient("https://example.test", lambda request, timeout, raw=raw: BytesIO(raw)).request("/api/catalog")

    def testCloudConfigurationCannotUseLocalAiOrCredentialsInUrl(self):
        for url in ("http://127.0.0.1:11434", "https://key@example.test", "https://example.test?key=x"):
            with self.assertRaises(ValueError):
                cloudClient(url)

    def testCatalogAndWeatherUseSharedCloud(self):
        self.assertEqual(self.client.get("/api/simulation/catalog").status_code, 200)
        self.assertEqual(self.client.get("/api/simulation/weather?locationId=can-tho").status_code, 200)
        self.assertTrue(self.requests[-1].full_url.endswith("/api/weather?locationId=can-tho"))
