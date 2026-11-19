"""Download approved sources or reproduce and validate the published data."""

import argparse
import csv
import hashlib
import io
import json
from collections import Counter
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from src.services.assistant_sources import knowledge
from src.services.csv_library import FLOOD_DEMO_CSV, SIWRR_URL, STATION_CSV, VILO_URL
from src.services.forum_service import EDITORIAL_POSTS

PDFS = {
    "vinhlong": (VILO_URL, "86659fb79a628f37647d685e61253ad1769ffe0ac11194eab15c7256977994d6"),
    "siwrr": (SIWRR_URL, "3585bdfdc2df73ddd4ea157122e5604ba64c34edb49b6a0f9a4beaf316d0d31d"),
}
STATIONS = {
    "Cái Muối", "Đồng Phú", "Trà Vinh", "Láng Thé", "Nhuận Phú Tân",
    "Trà Kha", "Cầu Quan", "Đường Đức", "Trà Ôn",
}
RIVERS = {
    "Sông Tiền": "Sông Tiền", "0.8Cổ Chiên": "Sông Cổ Chiên",
    "Cổ Chiên": "Sông Cổ Chiên", "Hậu": "Sông Hậu",
}
PERIODS = {
    "observed": (date(2026, 5, 7), date(2026, 5, 14)),
    "forecast": (date(2026, 5, 14), date(2026, 5, 23)),
}
STATION_FIELDS = (
    "site_type", "station_name", "river", "metric", "unit", "value", "data_kind",
    "value_status", "period_start", "period_end", "peak_dates", "source_id",
    "source_page", "issued_on", "is_simulated", "source_url",
)
MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024
LARGE_DOCUMENTS = {
    "https://khuyennongvn.gov.vn/data/documents/0/2026/10/06/hangweb/st-hanhan-muakho-2026-2027-full.pdf":
        50 * 1024 * 1024,
}


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


class PublicSourceRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        origin = urlsplit(request.full_url)
        target = urlsplit(new_url)
        if (
            target.scheme != "https"
            or target.port not in (None, 443)
            or (target.hostname or "").removeprefix("www.")
            != (origin.hostname or "").removeprefix("www.")
        ):
            raise ValueError(f"Chuyển hướng ngoài nguồn đã duyệt: {new_url}")
        return super().redirect_request(request, fp, code, message, headers, new_url)


def fetch_sources(kind: str, output: Path) -> int:
    sources = {}
    if kind == "station":
        sources = {url: (url, name, checksum) for name, (url, checksum) in PDFS.items()}
    else:
        for item in (*knowledge(), *EDITORIAL_POSTS.values()):
            url = item["url"]
            sources.setdefault(url, (item.get("archive_url", url), None, None))
    output.mkdir(parents=True, exist_ok=True)
    manifest = []
    opener = build_opener(PublicSourceRedirect())
    for url, (download_url, name, checksum) in sources.items():
        record = {"url": url, "fetched_at": datetime.now(UTC).isoformat()}
        size_limit = LARGE_DOCUMENTS.get(url, MAX_DOWNLOAD_BYTES)
        try:
            request = Request(
                download_url, headers={"User-Agent": "MachDongData/1.0 (public source archive)"}
            )
            with opener.open(request, timeout=20) as response:
                content = response.read(size_limit + 1)
                content_type = response.headers.get_content_type()
                record["resolved_url"] = response.url
            if not content or len(content) > size_limit:
                raise ValueError("Dung lượng tệp ngoài giới hạn.")
            fingerprint = digest(content)
            if checksum and fingerprint != checksum:
                raise ValueError("Bản PDF đã thay đổi SHA-256, cần đối chiếu lại.")
            extension = ".pdf" if content.startswith(b"%PDF-") else ".html"
            if content_type in ("application/xml", "text/xml"):
                extension = ".xml"
            filename = (name or fingerprint) + extension
            (output / filename).write_bytes(content)
            record.update(file=filename, sha256=fingerprint, content_type=content_type)
        except (OSError, ValueError) as error:
            record["error"] = str(error)
        manifest.append(record)
    (output / f"manifest-{kind}.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    failures = sum("error" in row for row in manifest)
    print(f"{kind}: tải {len(manifest) - failures}/{len(manifest)} nguồn. Manifest: {output}")
    return int(bool(failures))


def normalize_peak_dates(raw: str, start: date, end: date) -> str:
    ranges = []
    for token in raw.split(";"):
        days = [date(start.year, start.month, int(day)) for day in token.split("-")]
        if len(days) not in (1, 2) or not start <= days[0] <= days[-1] <= end:
            raise ValueError(f"Ngày cực đại nằm ngoài kỳ {start} – {end}: {raw}")
        ranges.append("/".join(day.isoformat() for day in days))
    return "|".join(ranges)


def build_stations(raw: Path) -> list[dict]:
    try:
        import pdfplumber
    except ImportError as error:
        raise ValueError("Cài pdfplumber để chạy clean-stations.") from error

    pdf_bytes = {}
    for name, (_, checksum) in PDFS.items():
        content = (raw / f"{name}.pdf").read_bytes()
        if digest(content) != checksum:
            raise ValueError(f"SHA-256 không khớp ở {name}.pdf.")
        pdf_bytes[name] = content
    rows = []
    with pdfplumber.open(io.BytesIO(pdf_bytes["vinhlong"])) as pdf:
        for page, kind in ((2, "observed"), (4, "forecast"), (5, "forecast")):
            river = "Cổ Chiên" if page == 5 else None
            start, end = PERIODS[kind]
            table = pdf.pages[page - 1].extract_table()
            if not table:
                raise ValueError(f"Không đọc được bảng mặn trang {page}.")
            for river_cell, station, _, value, days, _ in table[1:]:
                river = river_cell or river
                if station not in STATIONS:
                    continue
                missing = value == "" and days == "Nghỉ đo"
                row = (
                    "river_station", station, RIVERS[river], "salinity_max", "‰",
                    "" if missing else str(Decimal(value.replace(",", "."))),
                    kind, "not_measured" if missing else "reported",
                    start.isoformat(), end.isoformat(),
                    "" if missing else normalize_peak_dates(days, start, end),
                    "VILO-XMAN-18-20260514", str(page),
                    "2026-05-14", "false", VILO_URL,
                )
                rows.append(dict(zip(STATION_FIELDS, row, strict=True)))
    # SIWRR page 3 is a scan. These four values were transcribed and checked
    # visually against the exact PDF verified above.
    for station, value in (("Tân Châu", "0.95"), ("Châu Đốc", "1.06"),
                           ("Mỹ Thuận", "0.88"), ("Cần Thơ", "1.10")):
        row = (
            "river_station", station, "", "river_water_level_max", "m", value,
            "observed", "reported", "2026-04-08", "2026-04-08", "",
            "SIWRR-20260409", "3", "2026-04-09", "false", SIWRR_URL,
        )
        rows.append(dict(zip(STATION_FIELDS, row, strict=True)))
    return rows


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def verify_stations(rows: list[dict]) -> dict:
    keys = set()
    counts = Counter()
    periods = {"salinity_max": "‰", "river_water_level_max": "m"}
    for row in rows:
        key = tuple(row[field] for field in (
            "source_id", "station_name", "metric", "data_kind", "period_start", "period_end"
        ))
        missing = row["value_status"] == "not_measured"
        if (
            key in keys or row["is_simulated"] != "false"
            or row["site_type"] != "river_station"
            or row["data_kind"] not in ("observed", "forecast")
            or row["value_status"] not in ("reported", "not_measured")
            or row["unit"] != periods.get(row["metric"])
            or urlsplit(row["source_url"]).scheme != "https"
            or missing != (row["value"] == "")
            or (missing and (row["peak_dates"] or row["data_kind"] != "observed"))
            or (not missing and not Decimal(row["value"]).is_finite())
        ):
            raise ValueError(f"Dòng trạm không hợp lệ: {key}")
        start, end = date.fromisoformat(row["period_start"]), date.fromisoformat(row["period_end"])
        if start > end or any(
            not start <= date.fromisoformat(day) <= end
            for day in row["peak_dates"].replace("|", "/").split("/") if day
        ):
            raise ValueError(f"Kỳ/ngày cực đại không hợp lệ: {key}")
        keys.add(key)
        counts["not_measured" if missing else row["data_kind"]] += 1
    if len(keys) != 22:
        raise ValueError(f"Lô trạm 2026 cần 22 dòng, hiện có {len(keys)}.")
    return dict(counts)


def verify_published() -> None:
    station_counts = verify_stations(read_csv(STATION_CSV))
    simulated = read_csv(FLOOD_DEMO_CSV)
    units = {"water_depth": "cm", "salinity": "g/L", "flood_duration": "h"}
    if any(
        row["is_simulated"] != "true" or row["unit"] != units.get(row["metric"])
        or row["site_type"] not in ("field", "canal")
        or (row["site_type"] == "canal" and row["metric"] != "salinity")
        for row in simulated
    ):
        raise ValueError("Sai nhãn, đơn vị hoặc loại điểm đo trong CSV giả lập.")
    entries = knowledge()
    forum = tuple(EDITORIAL_POSTS.values())
    if (
        len({item["source_id"] for item in entries}) != len(entries)
        or len({item["url"] for item in forum}) != len(forum) or len(forum) != 20
        or any(
            urlsplit(url).scheme != "https"
            for item in (*entries, *forum) for url in (item["url"], item.get("archive_url", item["url"]))
        )
    ):
        raise ValueError("Trùng mã căn cứ, trùng link bài đăng hoặc có URL không phải HTTPS.")
    print(json.dumps({
        "station": station_counts, "simulated": len(simulated),
        "knowledge": len(entries), "forum": len(forum),
    }, ensure_ascii=False, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    fetch = commands.add_parser("fetch", help="Lưu bản gốc và manifest nguồn")
    fetch.add_argument("kind", choices=("station", "knowledge"))
    fetch.add_argument("--out", type=Path, required=True)
    clean = commands.add_parser("clean-stations", help="Tái tạo CSV từ hai PDF tháng 4–5/2026")
    clean.add_argument("--raw", type=Path, required=True)
    clean.add_argument("--out", type=Path, required=True)
    commands.add_parser("check", help="Kiểm tra các bộ dữ liệu đã duyệt trong repo")
    options = parser.parse_args()
    try:
        if options.command == "fetch":
            return fetch_sources(options.kind, options.out)
        if options.command == "clean-stations":
            rows = build_stations(options.raw)
            counts = verify_stations(rows)
            options.out.parent.mkdir(parents=True, exist_ok=True)
            with options.out.open("w", encoding="utf-8-sig", newline="") as output:
                writer = csv.DictWriter(output, fieldnames=STATION_FIELDS)
                writer.writeheader()
                writer.writerows(rows)
            print(json.dumps(counts, ensure_ascii=False))
        else:
            verify_published()
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
