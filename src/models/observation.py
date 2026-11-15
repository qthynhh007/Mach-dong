from dataclasses import dataclass
from datetime import datetime
from typing import Literal


@dataclass(frozen=True)
class Observation:
    measured_at: datetime
    site_type: Literal["field", "canal", "sluice"]
    metric: str
    value: float
    unit: str
