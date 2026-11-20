"""Validated inputs for the field illustration and the cloud scenario."""
from dataclasses import dataclass
from math import isfinite


class simulationError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class SimulationDemoInput:
    salinity_gl: float
    water_depth_cm: float
    day_after_sowing: int
    temp_c: float

    @classmethod
    def parse(cls, payload: object) -> "SimulationDemoInput":
        if not isinstance(payload, dict):
            raise simulationError("Cần gửi thông số mô phỏng hợp lệ.")
        salinity = payload.get("salinity_gl")
        water = payload.get("water_depth_cm")
        day = payload.get("day_after_sowing")
        temp = payload.get("temp_c")
        if (
            type(salinity) not in (int, float)
            or not 0 <= salinity <= 6
            or type(water) not in (int, float)
            or not -10 <= water <= 30
            or type(day) is not int
            or not 0 <= day <= 95
            or type(temp) not in (int, float)
            or not 20 <= temp <= 42
        ):
            raise simulationError("Thông số nằm ngoài giới hạn của mô phỏng cánh đồng.")
        return cls(salinity, water, day, temp)


@dataclass(frozen=True)
class simulationInput:
    payload: dict

    @classmethod
    def parse(cls, payload: object) -> "simulationInput":
        if not isinstance(payload, dict):
            raise simulationError("Cần gửi một kịch bản hợp lệ.")
        ranges = {
            "dayAfterSowing": (0, 150), "salinityGl": (0, 20),
            "waterDepthCm": (0, 150), "plantHeightCm": (1, 200),
            "tempMaxC": (5, 55), "rootZoneEcDsM": (0, 20), "exposureDays": (1, 30),
        }
        fields = set(ranges) | {"varietyId", "locationId", "stage", "salinitySite",
                                "ecIsSeasonAverage", "useWeather", "requestAi"}
        if set(payload) - fields:
            raise simulationError("Kịch bản chứa trường không hỗ trợ.")
        for key, (minimum, maximum) in ranges.items():
            value = payload.get(key)
            if value is None and key in ("plantHeightCm", "rootZoneEcDsM"):
                continue
            if type(value) not in (int, float) or not isfinite(value) or not minimum <= value <= maximum:
                raise simulationError(f"Giá trị {key} phải từ {minimum} đến {maximum}.")
            if key in ("dayAfterSowing", "exposureDays") and int(value) != value:
                raise simulationError(f"{key} phải là số nguyên.")
        for key in ("ecIsSeasonAverage", "useWeather", "requestAi"):
            if type(payload.get(key)) is not bool:
                raise simulationError(f"{key} phải là đúng/sai.")
        if payload.get("varietyId") != "OM5451":
            raise simulationError("Hiện chỉ có bằng chứng cho OM5451.")
        if payload.get("stage") not in ("seedling", "tillering", "panicle", "flowering", "ripening"):
            raise simulationError("Hãy xác nhận giai đoạn sinh trưởng.")
        if payload.get("salinitySite") not in ("fieldWater", "canalWater"):
            raise simulationError("Cần xác định nơi đo độ mặn.")
        locationId = payload.get("locationId")
        if not isinstance(locationId, str) or not 1 <= len(locationId) <= 40:
            raise simulationError("Địa điểm không hợp lệ.")
        return cls(dict(payload))
