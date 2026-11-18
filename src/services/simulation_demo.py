"""Deterministic illustration used by the rice field sliders."""

from typing import TypedDict

from src.models.simulation import SimulationDemoInput
from src.services.assistant_service import explain_risk
from src.services.simulation_physiology import Physiology, describe_physiology

STAGES = (
    (15, "Mạ non", (0, 1, 2, 2, 3), (0, 1, 2)),
    (42, "Đẻ nhánh", (0, 0, 1, 2, 3), (0, 0, 1)),
    (65, "Làm đòng", (0, 1, 2, 2, 3), (0, 0, 1)),
    (78, "Trổ bông", (0, 1, 2, 2, 3), (0, 1, 2)),
    (95, "Chín vàng", (0, 0, 1, 1, 2), (0, 1, 2)),
)
RISK_LABELS = ("Thấp", "Vừa", "Cao", "Nguy hiểm")


class AdviceStep(TypedDict):
    title: str
    body: str


class SimulationResult(TypedDict):
    rule_version: str
    is_simulated: bool
    stage: str
    chi: float
    salinity_risk: str
    flood_risk: str
    survival_rate_pct: None
    advice: str
    advice_steps: list[AdviceStep]
    physiology: Physiology


STAGE_CHECKS = {
    "Mạ non": "Chọn một ô mạ ở chỗ trũng và một ô ở nền cao hơn. Đếm cây còn đứng trong từng ô, đánh dấu vị trí rồi xem lại sau khi nước rút. Ghi riêng cây bị vùi bùn, cây nằm rạp và cây đang ra lá mới để biết chỗ nào cần thăm lại trước khi tính chuyện dặm.",
    "Đẻ nhánh": "Đánh dấu vài bụi dễ tìm lại, nhẹ tay tách lá và đếm số thân từ gốc theo cùng một cách ở mỗi buổi. Ruộng sạ dày khó phân biệt từng bụi thì đếm thân trong cùng một khung. Ghi riêng điểm mé bờ và giữa ruộng để nhận ra chỗ nào chậm ra nhánh.",
    "Làm đòng": "Ra cả đầu và cuối thửa, xem bẹ lá đòng và độ đồng đều giữa các bụi để xác nhận giai đoạn. Đánh dấu vạt đã làm đòng, ghi tình trạng lá trên cùng và vị trí có nước đọng. Nếu các vạt lệch giai đoạn, theo dõi từng vạt riêng khi bàn lịch nước.",
    "Trổ bông": "Chọn vài bông ở mé và giữa ruộng. Phân biệt bông vừa ló khỏi bẹ với bông có hoa đang mở, rồi ghi cả giờ quan sát. Quay lại cùng vị trí ở buổi sau để biết phần ruộng nào đang trổ rộ; một bông ở mé chưa đại diện cho toàn thửa.",
    "Chín vàng": "Đi từ mé nắng vào vạt khuất. Ở mỗi vạt, xem hạt ở đầu, giữa và cuối vài bông; đánh dấu vùng còn xanh hoặc có cây ngã. Khi bàn ngày gặt, đưa người cắt tới hai vạt khác nhau nhất; nếu cần con số độ ẩm để giao lúa, hãy đo trên mẫu hạt.",
}


def detailed_advice(inputs: SimulationDemoInput, stage: str, salt_risk: str) -> list[AdviceStep]:
    salt = f"{inputs.salinity_gl:g}".replace(".", ",")
    salt_step: AdviceStep = {
        "title": "Đo lại nước ruộng trước khi lấy nước" if salt_risk != "Thấp" else "Ghi mốc mặn để so lần sau",
        "body": f"Kịch bản dùng độ mặn nước ruộng {salt} g/L, mức rủi ro {salt_risk.lower()} ở giai đoạn {stage.lower()}. "
        + ("Nếu đang tính mở cửa lấy nước, ưu tiên đo cả nguồn ngoài kênh và nước trong thửa ngay trước lúc quyết định. "
           if salt_risk != "Thấp" else "Chọn một điểm cố định trong thửa để có số đối chiếu khi đổi nguồn nước hoặc sau kỳ triều. ")
        + "Ghi hai dòng riêng cho ruộng và kênh, kèm giờ, vị trí, đơn vị trên máy và trạng thái cửa. Nếu máy hiển thị độ dẫn điện, giữ nguyên đơn vị đó. Sau khi nguồn nước thay đổi, quay lại đúng điểm trong ruộng và đo lại.",
    }
    depth = inputs.water_depth_cm
    cm = f"{abs(depth):g}".replace(".", ",")
    if depth > 15:
        water_step: AdviceStep = {
            "title": "Kiểm tra ngọn lúa ở chỗ ngập sâu",
            "body": f"Kịch bản đặt nước cao {cm} cm trên mặt đất. Ra vạt thấp trước, đo từ mặt đất tới mặt nước rồi nhìn ngọn lúa còn nhô lên hay đã chìm. "
            "Đo thêm một điểm nền cao và ghi giờ bắt đầu thấy ngập. Kiểm tra cửa tiêu và mực nước phía nhận trước khi bàn việc thoát nước. Khi nước rút, quay lại bụi đã đánh dấu để xem cây còn đứng, bị vùi bùn hay đang ra lá mới.",
        }
    elif depth < 0:
        water_step = {
            "title": "Kiểm tra nước dưới mặt ruộng",
            "body": f"Mức âm trong kịch bản nghĩa là nước thấp hơn mặt đất {cm} cm. Nếu ruộng có ống theo dõi, đọc khoảng cách từ mặt đất tới mặt nước trong ống cùng vị trí, cùng mốc. "
            "Nếu chỉ thấy mặt đất đã ráo, ghi đúng hiện tượng đó và để trống độ sâu chưa đo. Xem đất quanh gốc ở cả gò cao và chỗ trũng; nếu tính cấp thêm nước, đo mặn nguồn trước rồi kiểm tra lại trong thửa sau khi nước tới.",
        }
    else:
        water_step = {
            "title": "Đối chiếu mực nước ở đầu và cuối thửa",
            "body": ("Mực nước kịch bản ngang mặt đất. " if depth == 0 else f"Kịch bản có lớp nước sâu {cm} cm. ")
            + "Chọn mốc ngang mặt đất tại mỗi điểm; chờ nước bớt gợn rồi đọc thước ở đầu cấp nước và vạt trũng cuối thửa. "
            "Ghi giờ đọc, trận mưa gần nhất và cửa đang đóng hay mở. Sau khi tưới hoặc tháo nước, đo lại cả hai điểm để xem nước đã tới hoặc đã rút ở phần nào của ruộng.",
        }
    steps = [water_step, salt_step] if depth > 15 or (depth < -5 and salt_risk == "Thấp") else [salt_step, water_step]
    if inputs.temp_c > 35:
        steps.append({
            "title": "Kiểm tra nóng lúc hoa mở" if stage == "Trổ bông" else "Thăm lại khi trời dịu",
            "body": f"Nhiệt độ cao nhất trong kịch bản là {inputs.temp_c:g} °C. "
            + ("Ghi giờ thấy hoa mở và đối chiếu với nhiệt độ thực đo tại ruộng lúc đó. Nếu chỉ có dự báo ngày, ghi riêng nguồn dự báo. Theo dõi lại cùng nhóm bông trong thời kỳ vào hạt trước khi nhận xét mức ảnh hưởng."
               if stage == "Trổ bông" else "Ghé cùng một vạt lúc nóng và lúc trời dịu, ghi lá có cuốn, rũ rồi hồi lại hay còn bất thường. Kiểm tra nước quanh gốc cùng lúc vì lá cuốn riêng lẻ chưa cho biết nguyên nhân. Ghi rõ nhiệt độ lấy từ dự báo hay đo tại ruộng."),
        })
    steps.append({
        "title": f"Thăm đồng giai đoạn {stage.lower()}",
        "body": f"Ngày {inputs.day_after_sowing} sau sạ được xếp vào giai đoạn {stage.lower()} trong mô hình. " + STAGE_CHECKS[stage],
    })
    return steps


def evaluate(inputs: SimulationDemoInput) -> SimulationResult:
    _, stage, salt_risks, flood_risks = next(
        record for record in STAGES if inputs.day_after_sowing <= record[0]
    )
    salt = inputs.salinity_gl
    depth = inputs.water_depth_cm
    salt_risk = RISK_LABELS[salt_risks[sum(salt >= cutoff for cutoff in (1, 2, 3, 4))]]
    flood_risk = RISK_LABELS[flood_risks[int(depth > 10) + int(depth > 20)]]
    salt_excess = max(0, salt - 2) / 4
    salt_penalty = 25 + 15 * salt_excess if stage == "Làm đòng" and salt >= 2 else 0
    water_penalty = 0
    if not -5 <= depth <= 15:
        water_penalty = 15 + 5 * (max(0, -5 - depth) / 5 + max(0, depth - 15) / 15)
    heat_penalty = 10 if inputs.temp_c > 35 else 0
    chi = max(0, 100 - salt_penalty - water_penalty - heat_penalty)
    return {
        "rule_version": "SIM-PHYSIOLOGY-V1",
        "is_simulated": True,
        "stage": stage,
        "chi": round(chi, 1),
        "salinity_risk": salt_risk,
        "flood_risk": flood_risk,
        "survival_rate_pct": None,
        "advice": explain_risk(stage, salt_risk, flood_risk, depth, inputs.temp_c),
        "advice_steps": detailed_advice(inputs, stage, salt_risk),
        "physiology": describe_physiology(inputs, stage, salt_risk),
    }
