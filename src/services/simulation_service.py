from typing import TypedDict

from src.models.simulation import SimulationInput
from src.services.assistant_service import explain_risk

STAGES = (
    (15, "Mạ non", (0, 1, 2, 2, 3), (0, 1, 2)),
    (42, "Đẻ nhánh", (0, 0, 1, 2, 3), (0, 0, 1)),
    (65, "Làm đòng", (0, 1, 2, 2, 3), (0, 0, 1)),
    (78, "Trổ bông", (0, 1, 2, 2, 3), (0, 1, 2)),
    (95, "Chín vàng", (0, 0, 1, 1, 2), (0, 1, 2)),
)
RISK_LABELS = ("Thấp", "Vừa", "Cao", "Nguy hiểm")


class SimulationResult(TypedDict):
    rule_version: str
    is_simulated: bool
    stage: str
    chi: float
    salinity_risk: str
    flood_risk: str
    survival_rate_pct: None
    spikelet_abortion_pct: float | None
    illustrative_yield_tonnes_ha: float
    advice: str


def evaluate(inputs: SimulationInput) -> SimulationResult:
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
        "illustrative_yield_tonnes_ha": 2.5 + (6.2 - 2.5) * chi / 100,
        "salinity_risk": salt_risk,
        "flood_risk": flood_risk,
        "survival_rate_pct": None,
        "spikelet_abortion_pct": 10 + 35 * salt_excess
        if stage == "Làm đòng" and salt > 2
        else None,
        "advice": explain_risk(stage, salt_risk, flood_risk, depth, inputs.temp_c),
    }
