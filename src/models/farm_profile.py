"""Account-owned farming details shown in the profile."""

from dataclasses import dataclass
from math import isfinite

FARM_CULTIVARS = {"om5451": "OM5451", "daithom8": "Đài Thơm 8", "st25": "ST25", "om18": "OM18"}
FARM_STATIONS = {
    "muong-lo": "Cống Mương Lộ",
    "lang-the": "Cống Láng Thé",
    "ben-gia": "Trạm Bến Giá",
    "long-toan": "Cống Long Toàn",
}


def read_text(payload: dict, key: str, label: str, limit: int) -> str:
    value = payload.get(key, "")
    if not isinstance(value, str) or len(value.strip()) > limit:
        raise ValueError(f"{label} cần là văn bản, tối đa {limit} ký tự.")
    return value.strip()


@dataclass(frozen=True)
class FarmProfile:
    address: str = ""
    cultivar: str = ""
    area_ha: float | None = None
    station: str = ""
    seasons: int | None = None
    farming_system: str = ""

    @classmethod
    def parse(cls, value: object) -> "FarmProfile":
        if not isinstance(value, dict):
            raise ValueError("Dữ liệu canh tác không hợp lệ.")
        address = read_text(value, "address", "Địa bàn canh tác", 160)
        farming_system = read_text(value, "farming_system", "Mô hình canh tác", 80)
        cultivar = read_text(value, "cultivar", "Giống lúa", 20)
        station = read_text(value, "station", "Trạm đo", 20)
        if cultivar and cultivar not in FARM_CULTIVARS:
            raise ValueError("Giống lúa được chọn không hợp lệ.")
        if station and station not in FARM_STATIONS:
            raise ValueError("Trạm đo được chọn không hợp lệ.")

        area = value.get("area_ha")
        if area is not None:
            try:
                valid_area = type(area) in (int, float) and isfinite(area) and area >= 0
            except OverflowError:
                valid_area = False
            if not valid_area:
                raise ValueError("Diện tích canh tác phải là số từ 0 ha trở lên.")
            area = float(area)

        seasons = value.get("seasons")
        if seasons is not None and (type(seasons) is not int or not 0 <= seasons < 2**31):
            raise ValueError("Số vụ đã canh tác phải là số nguyên từ 0 trở lên.")

        return cls(address, cultivar, area, station, seasons, farming_system)


DEMO_FARM_PROFILE = FarmProfile(
    address="Long Hữu, Vĩnh Long", cultivar="om5451", area_ha=4.2,
    station="muong-lo", seasons=3, farming_system="Lúa – Tôm",
)
