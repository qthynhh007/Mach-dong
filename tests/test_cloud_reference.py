"""The desktop reads published references from cloud, never its local dataset."""

from io import BytesIO
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch
from urllib.error import URLError

from src.main import createApp
from src.services.cloud_reference_service import (
    cloudReferenceService,
    referenceUnavailable,
)


class cloudReferenceTests(TestCase):
    def testDownloadsAndAssistantReadCloudCopies(self) -> None:
        referenceDir = Path(__file__).resolve().parents[1] / "server" / "data" / "reference"
        content = {path.name: path.read_bytes() for path in referenceDir.rglob("*") if path.is_file()}
        seen = []

        def transport(req, timeout):
            self.assertEqual(timeout, 15)
            seen.append(req.full_url)
            return BytesIO(content[req.full_url.rsplit("/", 1)[-1]])

        app = createApp({"TESTING": True, "SECRET_KEY": "test-only", "REFERENCE_API_URL": "https://example.test", "REFERENCE_API_TRANSPORT": transport})
        client = app.test_client()
        with patch.object(Path, "read_bytes", side_effect=AssertionError("local file read")):
            library = client.get("/community")
            self.assertEqual(library.status_code, 200)
            download = client.get("/community/samples/dbscl-stations")
            self.assertEqual(download.status_code, 200)
            self.assertEqual(download.data, content["dbscl-man-muc-nuoc-2026.csv"])
            answer = client.post("/api/assistant/chat", json={"message": "Độ mặn tại trạm Cầu Quan tháng 5/2026?"})
            self.assertEqual(answer.status_code, 200, answer.json)
        self.assertTrue(any("/api/reference/dbscl-man-muc-nuoc-2026.csv" in url for url in seen))

    def testCacheExpiresAndFailureDoesNotUseStaleData(self) -> None:
        responses = iter([BytesIO(b"v1"), BytesIO(b"v2")])

        def transport(req, timeout):
            try:
                return next(responses)
            except StopIteration as exc:
                raise URLError("offline") from exc

        service = cloudReferenceService("https://example.test", transport, ttlSeconds=0)
        self.assertEqual(service.readBytes("co-ma-knowledge.json"), b"v1")
        self.assertEqual(service.readBytes("co-ma-knowledge.json"), b"v2")
        with self.assertRaises(referenceUnavailable):
            service.readBytes("co-ma-knowledge.json")
        with self.assertRaises(ValueError):
            service.readBytes("../secret.txt")
