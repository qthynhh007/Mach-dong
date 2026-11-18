import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCE_DIR = ROOT / "data" / "reference"
MAX_CSV_BYTES = 1_000_000
STATE_DIR = (
    Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "MachDong"
    if getattr(sys, "frozen", False) else ROOT / "data"
)
SIMULATION_API_URL = "https://mach-dong-rice-data.artfulmica6.chatgpt.site"
