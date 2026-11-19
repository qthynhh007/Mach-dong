from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from src.models.simulation import simulationError
from src.services.cloud_client import cloudClient

logger = logging.getLogger(__name__)

LOCATIONS: dict[str, tuple[float, float, str]] = {
    "can-tho": (10.04, 105.78, "Cần Thơ"),
    "long-my": (9.68, 105.57, "Long Mỹ, Hậu Giang"),
    "ba-tri": (10.04, 106.59, "Ba Tri, Bến Tre"),
    "go-cong": (10.36, 106.67, "Gò Công, Tiền Giang"),
    "tra-vinh": (9.93, 106.34, "Trà Vinh"),
    "soc-trang": (9.6, 105.97, "Sóc Trăng"),
    "chau-doc": (10.7, 105.12, "Châu Đốc, An Giang"),
    "ca-mau": (9.18, 105.15, "Cà Mau"),
}

HISTORY_FILE = (
    Path(__file__).resolve().parent.parent.parent
    / "server"
    / "data"
    / "weather-history.json"
)


class weatherClient:
    def __init__(self, cloud: cloudClient) -> None:
        self.cloud = cloud

    def forecast(self, locationId: str) -> dict[str, Any]:
        """Fetch 7-day forecast from cloud, falling back to direct Open-Meteo or sample data."""
        clean_id = locationId.strip() if locationId else ""
        if not clean_id or clean_id not in LOCATIONS:
            clean_id = "can-tho"

        # 1. Try cloud worker first
        try:
            return self.cloud.request(
                "/api/weather?" + urllib.parse.urlencode({"locationId": clean_id})
            )
        except (simulationError, OSError, ValueError) as cloud_err:
            logger.info("Cloud weather unavailable (%s), falling back to direct Open-Meteo", cloud_err)

        # 2. Fall back to direct Open-Meteo query
        try:
            return self._forecast_direct(clean_id)
        except (simulationError, OSError, ValueError) as direct_err:
            logger.info("Direct Open-Meteo failed (%s), falling back to local sample data", direct_err)

        # 3. Fall back to local meteorological sample dataset
        return self._forecast_sample(clean_id)

    def _forecast_direct(self, location_id: str) -> dict[str, Any]:
        lat, lon, _name = LOCATIONS[location_id]
        query = urllib.parse.urlencode(
            {
                "latitude": lat,
                "longitude": lon,
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,shortwave_radiation_sum",
                "timezone": "Asia/Bangkok",
                "forecast_days": "7",
            }
        )
        source_url = f"https://api.open-meteo.com/v1/forecast?{query}"
        req = urllib.request.Request(
            source_url, headers={"User-Agent": "MachDongDesktop/2.0"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))

        daily = payload.get("daily", {})
        dates = daily.get("time", [])
        if not dates:
            raise simulationError("Thiếu chuỗi dự báo hợp lệ.", 502)

        rows = []
        for i, d in enumerate(dates):
            rows.append(
                {
                    "date": d,
                    "tempMaxC": daily.get("temperature_2m_max", [None])[i],
                    "tempMinC": daily.get("temperature_2m_min", [None])[i],
                    "rainMm": daily.get("precipitation_sum", [None])[i],
                    "et0Mm": daily.get("et0_fao_evapotranspiration", [None])[i],
                    "solarMjM2": daily.get("shortwave_radiation_sum", [None])[i],
                }
            )

        return {
            "locationId": location_id,
            "sourceId": "open-meteo",
            "sourceUrl": source_url,
            "retrievedAt": datetime.now(UTC).isoformat(),
            "kind": "forecast",
            "timezone": "Asia/Bangkok",
            "license": "CC BY 4.0; Open-Meteo, API phi thương mại",
            "units": {
                "tempMaxC": "°C",
                "tempMinC": "°C",
                "rainMm": "mm",
                "et0Mm": "mm",
                "solarMjM2": "MJ/m²",
            },
            "rows": rows,
        }

    def _forecast_sample(self, location_id: str) -> dict[str, Any]:
        """Generate a fallback 7-day forecast from local NASA POWER dataset."""
        try:
            if HISTORY_FILE.exists():
                hist = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
                for loc in hist.get("locations", []):
                    if loc.get("locationId") == location_id:
                        raw_rows = loc.get("rows", [])
                        if raw_rows:
                            now = datetime.now(UTC)
                            rows = []
                            for idx in range(7):
                                base_row = raw_rows[idx % len(raw_rows)]
                                target_date = (now + timedelta(days=idx)).strftime(
                                    "%Y-%m-%d"
                                )
                                rows.append(
                                    {
                                        "date": target_date,
                                        "tempMaxC": base_row.get("tempMaxC", 31.0),
                                        "tempMinC": base_row.get("tempMinC", 24.5),
                                        "rainMm": base_row.get("rainMm", 0.0),
                                        "et0Mm": 4.2,
                                        "solarMjM2": base_row.get("solarMjM2", 18.0),
                                    }
                                )
                            return {
                                "locationId": location_id,
                                "sourceId": "weather-history-sample",
                                "sourceUrl": "/api/datasets/weather-history",
                                "retrievedAt": now.isoformat(),
                                "kind": "sample-forecast",
                                "timezone": "Asia/Bangkok",
                                "license": "Dữ liệu mẫu tham khảo NASA POWER",
                                "units": {
                                    "tempMaxC": "°C",
                                    "tempMinC": "°C",
                                    "rainMm": "mm",
                                    "et0Mm": "mm",
                                    "solarMjM2": "MJ/m²",
                                },
                                "rows": rows,
                            }
        except (OSError, ValueError, KeyError) as hist_err:
            logger.warning("Failed to load historical weather sample (%s)", hist_err)

        raise simulationError(
            "Nguồn thời tiết tạm không phản hồi. Hãy dùng kịch bản nhập tay hoặc thử lại.",
            503,
        )
