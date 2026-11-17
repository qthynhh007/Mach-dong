import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"

if ENV_FILE.exists():
    for raw_line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

DATA_DIR = ROOT / "data"
REFERENCE_DIR = DATA_DIR / "reference"
DB_PATH = Path(os.environ.get("AGRIDATA_DB_PATH", str(DATA_DIR / "agridata.db")))
CLIENT_SESSION_FILE = Path(
    os.environ.get("AGRIDATA_CLIENT_SESSION_FILE", str(DATA_DIR / "client_session.json"))
)
MAX_CSV_BYTES = 1_000_000

SECRET_KEY = os.environ.get(
    "AGRIDATA_SECRET_KEY", "mach-dong-agridata-fuji-43113-secret-key-2026"
)
SESSION_COOKIE_NAME = "agridata_session"
SESSION_TTL_SECONDS = 7 * 24 * 3600  # 7 days
SESSION_SLIDING_EXPIRATION = True
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 300  # 5 minutes

AVALANCHE_CHAIN_ID = 43113
AVALANCHE_NETWORK_NAME = "Avalanche Fuji Testnet"
CREDITS_PER_AVAX = 100  # 1 AVAX = 100 LÚA (0.01 AVAX = 1 LÚA)
DEFAULT_INITIAL_AVAX = 2.5  # Testnet AVAX seeded for Fuji credit changer demo

# Email OTP / SMTP Settings
OTP_TTL_SECONDS = 300  # 5 minutes
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SMTP_EMAIL = os.environ.get("SMTP_EMAIL", "tanvuthanh313130911@gmail.com")
SMTP_APP_PASSWORD = os.environ.get("SMTP_APP_PASSWORD", "")
