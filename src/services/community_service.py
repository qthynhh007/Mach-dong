from pathlib import Path

from src.config import REFERENCE_DIR

SAMPLES = {
    "salinity": "long-huu-man-ruong.csv",
    "water": "ba-tri-muc-nuoc.csv",
    "weather": "go-cong-nhiet-do.csv",
    "ph": "cu-lao-dung-do-ph.csv",
}


def sample_csv(name: str) -> Path | None:
    filename = SAMPLES.get(name)
    return REFERENCE_DIR / filename if filename else None
