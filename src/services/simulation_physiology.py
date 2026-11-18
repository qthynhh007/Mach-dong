"""Qualitative teaching cues for the rice scene."""

from typing import Literal, TypedDict

from src.models.simulation import SimulationDemoInput


SoilState = Literal["dry", "moist", "flooded"]


class PlantSignals(TypedDict):
    leaf_roll: float
    leaf_droop: float
    tip_burn: float
    water_cover: float
    soil: SoilState


class Mechanism(TypedDict):
    title: str
    body: str
    source_title: str
    source_url: str


class Physiology(TypedDict):
    signals: PlantSignals
    mechanisms: list[Mechanism]


STAGE_NOTES = {
    "Mạ non": "Rễ và lá đầu tiên đang hình thành. Trong hình, khóm thấp và thưa nên nước dễ che phần lá hơn.",
    "Đẻ nhánh": "Các chồi mới mọc từ gốc, giúp bụi lúa dày lên. Cảnh vẽ nhiều lá và chồi hơn giai đoạn mạ.",
    "Làm đòng": "Bông đang hình thành trong bẹ lá. Tán đã cao và dày, bông vẫn nằm trong bẹ nên chưa vẽ bông lộ ra.",
    "Trổ bông": "Bông thoát khỏi bẹ lá, sau đó hoa nở và thụ phấn. Hình cho thấy bông nhô lên trên tán lá.",
    "Chín vàng": "Hạt tích lũy chất khô rồi chín. Bông và tán ngả vàng theo giai đoạn, vệt nâu ở đầu lá biểu thị riêng tín hiệu mặn.",
}

SALT_CUES = {"Thấp": 0.0, "Vừa": 0.2, "Cao": 0.63, "Nguy hiểm": 1.0}
STAGE_COVER = {"Mạ non": 1.0, "Đẻ nhánh": 0.8, "Làm đòng": 0.65, "Trổ bông": 0.6, "Chín vàng": 0.58}


def unit_interval(value: float) -> float:
    return max(0.0, min(1.0, value))


def describe_physiology(inputs: SimulationDemoInput, stage: str, salt_risk: str) -> Physiology:
    depth = inputs.water_depth_cm
    salt = SALT_CUES[salt_risk]
    dryness = unit_interval((-5 - depth) / 5)
    heat = unit_interval((inputs.temp_c - 35) / 7)
    soil: SoilState
    if depth > 15:
        soil = "flooded"
        water_note = (
            "Nước che phần thấp của khóm, rõ hơn ở lúa mạ. Khi lá chìm, ánh sáng và trao đổi khí "
            "giảm. Nước lấp các lỗ rỗng trong đất làm oxy khuếch tán chậm. Lúa dẫn oxy tới rễ "
            "qua mô khí, nhưng nguồn oxy có thể hạn chế khi bị ngập sâu. "
            "Ngoài ruộng, cần đo độ cao khóm và thời gian ngập."
        )
    elif depth < -5:
        soil = "dry"
        water_note = (
            "Hình vẽ nền đất khô và lá cuốn, rũ. Đất khô có thể làm giảm nước cấp cho rễ; lá lúa "
            "có thể cuốn khi gặp hạn. Mức cuốn còn tùy giống và hình dạng lá. Kiểm tra độ ẩm đất tại gốc."
        )
    else:
        soil = "moist"
        water_note = (
            "Hình vẽ đất ẩm hoặc lớp nước nông theo mực nước đang chọn. Khi tán còn trên mặt nước, "
            "lá vẫn trao đổi khí và mô khí giúp vận chuyển oxy tới rễ. Kiểm tra các chỗ trũng riêng."
        )

    salt_note = (
        "Muối làm rễ khó hút nước. Khi phơi nhiễm, Na⁺ tích tụ ở lá có thể làm giảm diệp lục "
        "và gây hư phần đầu lá. Cảnh dùng vệt vàng nâu ở đầu lá để minh họa; cần số đo nước tại ruộng "
        "và thời gian phơi nhiễm để đánh giá thực tế. Nếu cần đánh giá độ mặn của đất, lấy mẫu đất riêng."
        if salt else "Ở mức rủi ro thấp của kịch bản, đầu lá giữ màu theo giai đoạn. "
        "Độ mặn cần được theo dõi bằng số đo nước ngay tại ruộng."
    )
    heat_note = "Nóng đúng lúc hoa lúa nở có thể làm giảm khả năng thụ phấn. Mức ảnh hưởng phụ thuộc giống và thời gian gặp nóng."
    if heat and stage == "Trổ bông":
        heat_note += " Kịch bản đang ở giai đoạn trổ và đã kích hoạt cảnh báo nhiệt của mô hình."
    elif heat:
        heat_note += " Cảnh thêm sắc nóng và độ rũ minh họa khi mô hình kích hoạt cảnh báo nhiệt."

    return {
        "signals": {
            "leaf_roll": round(max(dryness * .86, salt * .30), 3),
            "leaf_droop": round(unit_interval(dryness * .79 + heat * .48 + salt * .13), 3),
            "tip_burn": salt,
            "water_cover": round(unit_interval(depth / 30) * STAGE_COVER[stage] * .86, 3),
            "soil": soil,
        },
        "mechanisms": [
            {
                "title": f"Giai đoạn · {stage}",
                "body": STAGE_NOTES[stage],
                "source_title": "IRRI · Sinh trưởng cây lúa",
                "source_url": "https://books.irri.org/0471097608_content.pdf",
            },
            {
                "title": f"Mặn · Rủi ro {salt_risk.lower()}",
                "body": salt_note,
                "source_title": "Nghiên cứu Na⁺ và tổn thương lá lúa",
                "source_url": "https://doi.org/10.1626/pps.5.269",
            },
            {
                "title": "Nước và vùng rễ",
                "body": water_note,
                "source_title": "Nghiên cứu lá lúa cuốn khi đất khô" if soil == "dry" else "Nghiên cứu oxy trong rễ lúa khi ngập",
                "source_url": "https://doi.org/10.1111/pce.13514" if soil == "dry" else "https://doi.org/10.1111/nph.12048",
            },
            {
                "title": "Nhiệt độ tầng tán",
                "body": heat_note,
                "source_title": "Nghiên cứu nhiệt độ và thụ phấn lúa",
                "source_url": "https://doi.org/10.1093/jxb/erm003",
            },
        ],
    }
