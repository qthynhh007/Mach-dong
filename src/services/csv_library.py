"""Published CSV catalog. Each download resolves through the cloud reference service."""

from dataclasses import dataclass
from pathlib import Path

from src.config import REFERENCE_DIR
from src.services.cloud_reference_service import referenceBytes
from src.services.quality_service import preview_csv

STATION_CSV = REFERENCE_DIR / "dbscl-man-muc-nuoc-2026.csv"
FLOOD_DEMO_CSV = REFERENCE_DIR / "long-huu-man-ngap-demo.csv"
VILO_URL = (
    "https://snnmt.vinhlong.gov.vn/Portals/1041/2026/5/19/"
    "VILO_XMAN_20260514_1700%20%281%29.pdf?ver=ULoxeqRZg5BrKdp7JslwyA%3D%3D"
)
SIWRR_URL = (
    "https://www.siwrr.org.vn/docs/2023/files/"
    "20260409-20-VKHTLMN-Bantintuan-DubaoNguonnuoc-09_04_2026.pdf"
)


@dataclass(frozen=True)
class CsvDataset:
    slug: str
    path: Path
    title: str
    details: str
    categories: tuple[str, ...]
    location: str
    period: str
    sources: tuple[tuple[str, str], ...] = ()

    @property
    def simulated(self) -> bool:
        return not self.sources

    def preview(self) -> dict:
        return preview_csv(self.readBytes(), limit=25)

    def readBytes(self) -> bytes:
        return referenceBytes(self.path)

    @property
    def file_size(self) -> str:
        size = len(self.readBytes())
        if size < 1024:
            return f"{size} B"
        return f"{size / 1024:.1f}".replace(".", ",") + " KB"

DATASETS = (
    CsvDataset(
        "dbscl-stations", STATION_CSV, "Mặn và mực nước tại trạm ĐBSCL",
        "Thực đo và dự báo được ghi riêng · Độ mặn ‰, mực nước trạm m",
        ("salinity", "water"), "Trạm sông ĐBSCL", "04–05/2026",
        (
            ("Đài KTTV Vĩnh Long", VILO_URL),
            ("Viện Khoa học Thủy lợi miền Nam", SIWRR_URL + "#page=3"),
        ),
    ),
    CsvDataset(
        "long-huu-man-ngap", FLOOD_DEMO_CSV, "Mặn và ngập ruộng OM5451",
        "5 ca minh họa · Đo riêng tại ruộng và ngoài kênh",
        ("salinity", "water", "long-huu", "om5451"), "Long Hữu", "15–16/11/2026",
    ),
    CsvDataset(
        "salinity", REFERENCE_DIR / "long-huu-man-ruong.csv", "Độ mặn tại ruộng",
        "Lúa OM5451 · Độ mặn g/L", ("salinity", "long-huu", "om5451"), "Long Hữu", "15/11/2026",
    ),
    CsvDataset(
        "water", REFERENCE_DIR / "ba-tri-muc-nuoc.csv", "Mực nước ruộng",
        "Độ sâu nước tính từ mặt ruộng · cm", ("water",), "Ba Tri", "15/11/2026",
    ),
    CsvDataset(
        "weather", REFERENCE_DIR / "go-cong-nhiet-do.csv", "Nhiệt độ tại ruộng",
        "Đơn vị °C", ("weather",), "Gò Công Tây", "15/11/2026",
    ),
    CsvDataset(
        "ph", REFERENCE_DIR / "cu-lao-dung-do-ph.csv", "Độ pH tại ruộng",
        "Mẫu ghi độ pH", ("ph",), "Cù Lao Dung", "15/11/2026",
    ),
)

DATASET_BY_SLUG = {dataset.slug: dataset for dataset in DATASETS}
