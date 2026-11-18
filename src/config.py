import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
REFERENCE_DIR = DATA_DIR / "reference"
MAX_CSV_BYTES = 1_000_000
IS_FROZEN = getattr(sys, "frozen", False)
if not IS_FROZEN:
    load_dotenv(ROOT / ".env.local")
    load_dotenv(ROOT / ".env")

STATE_DIR = (
    Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "MachDong"
    if IS_FROZEN else DATA_DIR
)
SIMULATION_API_URL = "https://mach-dong-rice-data.artfulmica6.chatgpt.site"
DB_PATH = Path(os.environ.get("AGRIDATA_DB_PATH", str(STATE_DIR / "agridata.db")))
CLIENT_SESSION_FILE = Path(
    os.environ.get("AGRIDATA_CLIENT_SESSION_FILE", str(STATE_DIR / "client_session.json"))
)

SESSION_COOKIE_NAME = "agridata_session"
SESSION_TTL_SECONDS = 7 * 24 * 3600  # 7 days
SESSION_SLIDING_EXPIRATION = True
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 300  # 5 minutes

AVALANCHE_CHAIN_ID = 43113
AVALANCHE_NETWORK_NAME = "Avalanche Fuji Testnet"
FUJI_RPC_URL = os.environ.get(
    "FUJI_RPC_URL", "https://api.avax-test.network/ext/bc/C/rpc"
)
FUJI_CONTRACT_ADDRESS = os.environ.get("FUJI_CONTRACT_ADDRESS", "").strip()
FUJI_SIGNER_PRIVATE_KEY = os.environ.get("FUJI_SIGNER_PRIVATE_KEY", "").strip()
CREDITS_PER_AVAX = 100  # 1 AVAX = 100 LÚA (0.01 AVAX = 1 LÚA)
DEFAULT_INITIAL_AVAX = 2.5  # Testnet AVAX seeded for Fuji credit changer demo

# Email OTP / SMTP Settings
OTP_TTL_SECONDS = 300  # 5 minutes
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SMTP_EMAIL = os.environ.get("SMTP_EMAIL", "")
SMTP_APP_PASSWORD = "".join(os.environ.get("SMTP_APP_PASSWORD", "").split())
