import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / ".env")

DATA_DIR = ROOT / "data"
REFERENCE_DIR = DATA_DIR / "reference"
DB_PATH = Path(os.environ.get("AGRIDATA_DB_PATH", str(DATA_DIR / "agridata.db")))
CLIENT_SESSION_FILE = Path(
    os.environ.get("AGRIDATA_CLIENT_SESSION_FILE", str(DATA_DIR / "client_session.json"))
)
MAX_CSV_BYTES = 1_000_000

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
