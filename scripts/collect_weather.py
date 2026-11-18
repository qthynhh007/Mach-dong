"""Download official NASA POWER data for the cloud bundle; never invent missing values."""

import argparse
import hashlib
import json
import time
from datetime import UTC, date, datetime
from pathlib import Path
from typing import ClassVar
from urllib.parse import urlencode
from urllib.request import urlopen


class weatherCollector:
    parameters: ClassVar[dict[str, tuple[str, str]]] = {
        "T2M_MIN": ("tempMinC", "C"), "T2M_MAX": ("tempMaxC", "C"),
        "T2M": ("tempMeanC", "C"), "PRECTOTCORR": ("rainMm", "mm/day"),
        "RH2M": ("humidityPct", "%"), "WS2M": ("windMs", "m/s"),
        "ALLSKY_SFC_SW_DWN": ("solarMjM2", "MJ/m^2/day"),
    }

    def collect(self, catalogPath: Path, outputPath: Path, year: int) -> None:
        catalog = json.loads(catalogPath.read_text(encoding="utf-8"))
        if year < 1984 or year >= date.today().year:
            raise ValueError("Use a completed year from 1984 onward")
        dataset = {"schemaVersion": 1, "version": f"nasa-power-{year}-v1",
                   "sourceId": "nasa-power", "retrievedAt": datetime.now(UTC).isoformat(),
                   "year": year, "timeStandard": "LST", "kind": "griddedHistorical",
                   "units": {value[0]: value[1] for value in self.parameters.values()},
                   "locations": []}
        for location in catalog["locations"]:
            query = urlencode({"parameters": ",".join(self.parameters), "community": "AG",
                               "latitude": location["latitude"], "longitude": location["longitude"],
                               "start": f"{year}0101", "end": f"{year}1231",
                               "format": "JSON", "time-standard": "LST"})
            sourceUrl = f"https://power.larc.nasa.gov/api/temporal/daily/point?{query}"
            with urlopen(sourceUrl, timeout=60) as response:
                raw = response.read(4_000_001)
            if len(raw) > 4_000_000:
                raise ValueError("Response too large")
            body = json.loads(raw)
            values = body["properties"]["parameter"]
            for key, (_, unit) in self.parameters.items():
                if body["parameters"][key]["units"] != unit:
                    raise ValueError(f"Unexpected NASA unit for {key}")
            rows = []
            for day in sorted(values["T2M"]):
                row = {"date": datetime.strptime(day, "%Y%m%d").date().isoformat()}
                for key, (field, _) in self.parameters.items():
                    value = values[key].get(day)
                    row[field] = None if value == body["header"]["fill_value"] else value
                rows.append(row)
            expected = (date(year + 1, 1, 1) - date(year, 1, 1)).days
            if len(rows) != expected:
                raise ValueError(f"Incomplete year for {location['id']}")
            dataset["locations"].append({"locationId": location["id"], "query": location,
                "sourceUrl": sourceUrl, "rawSha256": hashlib.sha256(raw).hexdigest(),
                "apiVersion": body["header"]["api"]["version"],
                "sources": body["header"]["sources"], "rows": rows})
            print(f"{location['id']}: {len(rows)} days", flush=True)
            time.sleep(0.3)
        dataset["rowCount"] = sum(len(item["rows"]) for item in dataset["locations"])
        outputPath.parent.mkdir(parents=True, exist_ok=True)
        temporaryPath = outputPath.with_suffix(".tmp")
        temporaryPath.write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")),
                                 encoding="utf-8")
        temporaryPath.replace(outputPath)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2025)
    args = parser.parse_args()
    projectRoot = Path(__file__).resolve().parents[1]
    weatherCollector().collect(projectRoot / "server/data/catalog.json",
                               projectRoot / "server/data/weather-history.json", args.year)
