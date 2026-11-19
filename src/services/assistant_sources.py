"""Select reviewed material from published knowledge and CSV snapshots."""

import csv
import json
import re
from calendar import monthrange
from collections.abc import Sequence
from datetime import date, datetime
from io import StringIO
from pathlib import Path

from src.config import REFERENCE_DIR
from src.models.community import normalizeText
from src.services.ai_client import ChatMessage
from src.services.cloud_reference_service import referenceBytes
from src.services.csv_library import FLOOD_DEMO_CSV, STATION_CSV

ALIASES = {
    "cải": ("rau cải", "cây cải", "trồng cải", "cải ngọt", "cải xanh", "cải thìa", "cải bẹ"),
    "dưa chuột": ("dưa leo",),
    "đậu tương": ("đậu nành",),
    "dứa": ("thơm", "khóm"),
    "lúa": ("om5451", "om18", "st25", "ruộng lúa", "làm đòng", "sau sạ"),
}
TOPIC_TERMS = {
    "planting": ("trồng", "gieo", "sạ", "làm giàn", "chăm sóc", "quy trình", "tỉa cành"),
    "nutrition": ("phân", "bón", "đất", "dinh dưỡng", "canxi", "compost", "cải tạo"),
    "diagnostic": ("bệnh", "sâu", "đốm", "héo", "thối", "lõm", "lá vàng", "vàng lá", "đen", "xì mủ", "rụng"),
    "water": ("mặn", "ngập", "úng", "mực nước", "độ sâu", "cây sống", "nước rút", "ec", "cống"),
}
GROWING_SETTINGS = ("chậu", "luống", "thủy canh", "ngoài đất", "vườn", "ruộng", "nhà màng")
FIELD_CLARIFICATION = (
    "Cò Mạ cần số đo ngay tại ruộng. Bà con cho Cò biết độ sâu nước tính từ mặt ruộng, "
    "ngập bao lâu và cây đang ở giai đoạn nào nha. Nếu đo mặn, ghi thêm đơn vị và vị trí đo."
)
RELATIVE_PERIOD_TERMS = (
    "hôm nay", "hôm qua", "hôm kia", "bây giờ", "hiện tại", "mới nhất", "gần đây",
    "ngày mai", "ngày kia", "tuần này", "tuần trước", "tuần sau", "tuần tới",
    "tháng này", "tháng trước", "tháng sau", "tháng tới", "năm nay",
)
RELATIVE_PERIOD_PATTERN = re.compile(r"\b\d+\s+(?:gio|ngay|tuan|thang)\s+(?:truoc|qua|toi|sau|gan day)\b")
ELABORATION_REQUEST = re.compile(
    r"(?:(?:co|co ma) )?(?:(?:giai thich|noi|phan tich|huong dan|tra loi)"
    r" (?:ky|ro|chi tiet)(?: hon)?|(?:ky|ro|chi tiet) hon)"
    r"(?: (?:di|nha|nhe|voi|duoc khong))?[.!?…]*"
)


def contains(text: str, phrase: str) -> bool:
    return re.search(r"(?<!\w)" + re.escape(normalizeText(phrase)) + r"(?!\w)", text) is not None


def matches(text: str, terms: Sequence[str]) -> bool:
    return any(contains(text, term) for term in terms)


def knowledge() -> tuple[dict, ...]:
    curated = json.loads(
        referenceBytes(REFERENCE_DIR / "co-ma-knowledge.json").decode("utf-8-sig")
    )["sources"]
    rice = json.loads(
        referenceBytes(REFERENCE_DIR / "lua-man-ngap-sources.json").decode("utf-8-sig")
    )["sources"]
    return (
        *(item for item in curated if item["status"] == "reviewed"),
        *(
            {**item, "crops": ["lúa"], "topic": "water", "terms": item["topics"]}
            for item in rice
        ),
    )


def crop_names(text: str) -> set[str]:
    crops = {crop for item in knowledge() for crop in item["crops"] if crop != "*"}
    return {
        crop for crop in crops
        if matches(text, (crop, *ALIASES.get(crop, ())) if crop != "cải" else ALIASES[crop])
    }


def growing_settings(text: str) -> set[str]:
    return {term for term in GROWING_SETTINGS if contains(text, term)}


def select_knowledge(messages: Sequence[ChatMessage]) -> list[dict]:
    question_index = len(messages) - 1
    question = normalizeText(messages[question_index]["text"])
    if ELABORATION_REQUEST.fullmatch(question):
        for index in range(question_index - 1, -1, -1):
            if messages[index]["role"] != "user":
                continue
            previous_question = normalizeText(messages[index]["text"])
            if not ELABORATION_REQUEST.fullmatch(previous_question):
                question_index, question = index, previous_question
                break
    crops = crop_names(question)
    topics = {topic for topic, terms in TOPIC_TERMS.items() if matches(question, terms)}
    context = question
    previous = ""
    previous_settings: set[str] = set()
    for turn in reversed(messages[:question_index]):
        if turn["role"] != "user":
            continue
        candidate = normalizeText(turn["text"])
        previous_crops = crop_names(candidate)
        if previous_crops:
            if crops and crops != previous_crops:
                break
            crops = previous_crops
            previous = previous or candidate
        previous_settings = previous_settings or growing_settings(candidate)
        if previous and previous_settings:
            break
    if previous and not topics:
        context = previous + " " + question
        topics = {topic for topic, terms in TOPIC_TERMS.items() if matches(context, terms)}
    if not crops and "water" in topics and matches(question, ("ruộng", "tỷ lệ cây sống")):
        crops = {"lúa"}
    if not crops and "diagnostic" in topics:
        return []

    settings = growing_settings(question) or (previous_settings if previous else set())

    default_topics = topics or {"planting"}
    ranked = []
    topics_with_matching_settings: set[str] = set()
    for item in knowledge():
        direct = crops.intersection(item["crops"])
        if not direct and ("*" not in item["crops"] or item["topic"] not in topics):
            continue
        hits = sum(contains(context, term) for term in item["terms"])
        if not hits and item["topic"] not in default_topics:
            continue
        scope = (
            part for key in ("region", "stage")
            for part in item.get(key, "").split("|") if part
        )
        score = 4 * bool(direct) + 3 * (item["topic"] in topics) + 4 * hits
        score += 2 * sum(contains(question, term) for term in scope)
        if item["source_id"] == "UMN-TOMATO-DISORDERS" and not matches(
            context, ("quả", "trái", "thối đít", "đáy")
        ):
            continue
        source_settings = growing_settings(normalizeText(item.get("setting", ""))) if settings else set()
        conflicting_setting = bool(source_settings and settings.isdisjoint(source_settings))
        if settings.intersection(source_settings):
            score += 6
            if direct:
                topics_with_matching_settings.add(item["topic"])
        elif conflicting_setting:
            score -= 6
        ranked.append((score, item["source_id"], item, conflicting_setting))
    ranked.sort(key=lambda entry: (-entry[0], entry[1]))
    return [
        item for _, _, item, conflicting_setting in ranked
        if not (conflicting_setting and item["topic"] in topics_with_matching_settings)
    ][:4]


def read_rows(path: Path) -> tuple[dict, ...]:
    return tuple(csv.DictReader(StringIO(referenceBytes(path).decode("utf-8-sig"), newline="")))


def citation(source_id: str, title: str, url: str) -> dict:
    return {"source_id": source_id, "title": title, "url": url}


def requested_period(text: str) -> tuple[date, date] | None:
    iso = re.search(r"\b\d{4}-\d{2}-\d{2}\b", text)
    if iso:
        day = date.fromisoformat(iso.group())
        return day, day
    local = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b", text)
    if not local:
        local = re.search(r"\b(\d{1,2}) thang (\d{1,2})(?: nam (\d{4}))?\b", text)
    if local:
        day, month, year = local.groups()
        # The published station snapshot covers 2026 only.
        day = date(int(year or 2026), int(month), int(day))
        return day, day
    month = re.search(r"\b(?:thang )?(\d{1,2})(?:/| nam )(\d{4})\b", text)
    if month:
        number, year = map(int, month.groups())
        return date(year, number, 1), date(year, number, monthrange(year, number)[1])
    year = re.search(r"\b(?:nam )?(20\d{2})\b", text)
    if year:
        number = int(year.group(1))
        return date(number, 1, 1), date(number, 12, 31)
    return None


def station_answer(question: str) -> dict | None:
    rows = [row for row in read_rows(STATION_CSV) if contains(question, row["station_name"])]
    if not rows or not matches(
        question, ("trạm", "mặn", "smax", "mực nước", "cao trình", "dự báo", "thực đo", "quan trắc", "số đo")
    ):
        return None
    if matches(question, ("ruộng", "thửa", "dùng tưới", "tưới được", "bơm vào")):
        return {"reply": FIELD_CLARIFICATION, "sources": []}
    if matches(question, RELATIVE_PERIOD_TERMS) or RELATIVE_PERIOD_PATTERN.search(question):
        return {
            "reply": "Kho hiện có bản tin lịch sử tháng 4–5/2026. Cò Mạ cần bản tin mới để trả lời ở thời điểm bà con hỏi.",
            "sources": [],
        }
    try:
        period_filter = requested_period(question)
    except ValueError:
        return {"reply": "Bà con gửi lại ngày theo dạng ngày/tháng/năm nha.", "sources": []}
    salinity = matches(question, ("mặn", "độ mặn", "smax"))
    level = matches(question, ("mực nước", "cao trình", "độ sâu"))
    forecast = matches(question, ("dự báo", "dự kiến"))
    observed = matches(question, ("thực đo", "quan trắc", "hiện trạng"))
    rows = [
        row for row in rows
        if (salinity == level or (row["metric"] == "salinity_max") == salinity)
        and (forecast == observed or (row["data_kind"] == "forecast") == forecast)
        and (
            period_filter is None
            or row["period_start"] <= period_filter[1].isoformat()
            and row["period_end"] >= period_filter[0].isoformat()
        )
    ]
    if not rows:
        return {"reply": "Kho chưa có đúng chỉ tiêu, kỳ hoặc loại bản tin ở trạm bà con hỏi.", "sources": []}
    lines, sources = [], {}
    for row in rows:
        name = row["station_name"]
        kind = "dự báo" if row["data_kind"] == "forecast" else "thực đo"
        start, end = date.fromisoformat(row["period_start"]), date.fromisoformat(row["period_end"])
        period = f"{start:%d/%m/%Y}" if start == end else f"{start:%d/%m/%Y} đến {end:%d/%m/%Y}"
        metric = "độ mặn cực đại" if row["metric"] == "salinity_max" else "mực nước lớn nhất ngày"
        value = f'{row["value"].replace(".", ",")} {row["unit"]}'
        reading = (
            f"bản tin ghi nghỉ đo cho chỉ tiêu {metric}"
            if row["value_status"] == "not_measured"
            else f"{metric} {value}"
        )
        lines.append(f"Trạm {name}, {kind} kỳ {period}, {reading}.")
        if row["peak_dates"]:
            peaks = re.sub(
                r"\d{4}-\d{2}-\d{2}",
                lambda match: f"{date.fromisoformat(match.group()):%d/%m/%Y}",
                row["peak_dates"].replace("/", " đến ").replace("|", ", "),
            )
            lines.append(f"Bản tin ghi mốc cực đại {peaks}.")
        if period_filter and period_filter[0] == period_filter[1] and start != end:
            lines.append("Đây là bản ghi tổng hợp theo kỳ. Kho chưa có chuỗi số liệu từng ngày.")
        key = (row["source_id"], row["source_page"])
        sources[key] = citation(
            f"{key[0]}-P{key[1]}", f"Bản tin {key[0]} · trang {key[1]}",
            row["source_url"] + f"#page={key[1]}",
        )
    return {"reply": "\n".join(lines), "sources": list(sources.values())}


def demo_answer(question: str) -> dict | None:
    case = re.search(r"\blh[- ]?0[1-5]\b", question)
    if not case and not matches(question, ("kịch bản mẫu", "ca giả lập")):
        return None
    case_id = f"LH-{case.group()[-2:]}" if case else "LH-03"
    rows = [row for row in read_rows(FLOOD_DEMO_CSV) if row["case_id"] == case_id]
    duration = re.search(r"\b(\d+)\s*(?:h|gio)\b", question)
    if duration:
        timestamps = {
            row["measured_at"] for row in rows
            if row["metric"] == "flood_duration" and row["value"] == duration.group(1)
        }
        rows = [row for row in rows if row["measured_at"] in timestamps]
    labels = {"salinity": "độ mặn", "water_depth": "độ sâu nước", "flood_duration": "thời gian ngập"}
    groups = {}
    for row in rows:
        timestamp = datetime.fromisoformat(row["measured_at"])
        place = "tại ruộng" if row["site_type"] == "field" else "ngoài kênh"
        key = f"{timestamp:%d/%m/%Y %H:%M} {place} ({row['site_id']})"
        groups.setdefault(key, []).append(
            f"{labels[row['metric']]} {row['value'].replace('.', ',')} {row['unit']}"
        )
    info = [f"[Giả lập] {case_id} tại Long Hữu."]
    info.extend(f"{place}, {', '.join(values)}." for place, values in groups.items())
    if rows and not any(row["site_type"] == "field" for row in rows):
        info.append("Ca này chỉ có số đo ở kênh. Muốn biết tình trạng ruộng cần số đo riêng tại ruộng.")
    if not rows:
        info.append("Tệp chưa ghi số đo ở mốc thời gian này.")
    return {
        "reply": "\n".join(info),
        "sources": [citation("MD-DEMO-MAN-NGAP-01", "CSV mặn và ngập ruộng OM5451 · Giả lập",
                             "/community/samples/long-huu-man-ngap")],
    }
