# Local Environment Setup Guide (`.env`) · AgriData (Mạch Đồng)

This guide explains how to configure your local `.env` file for **Email OTP verification**, **session signing**, and **Avalanche Fuji (Chain ID `43113`)** smart contract integration.

> [!IMPORTANT]
> Your `.env` file stays **strictly local** on your machine and is ignored by `.gitignore`. Never commit `.env` or private keys to GitHub.

---

## 1. Create Your Local `.env` File

From the project root (`Mach-dong/`), copy `.env.example` to `.env`:

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**
```bash
cp .env.example .env
```

*(Note on Windows: If creating `.env` manually in Notepad, save it as `".env"` with quotes so Windows does not append `.txt`.)*

---

## 2. Configure Each Key in `.env`

### A. `AGRIDATA_SECRET_KEY` (Required for Sessions & Wallet Derivation)
Used to sign HMAC session tokens, hash Email OTP codes, and derive deterministic `secp256k1` Fuji wallets for `AUTO_EMAIL` accounts.

Generate a random 64-character hex string in your terminal:
```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```
Paste the output into `.env`:
```env
AGRIDATA_SECRET_KEY=your_generated_64_hex_string
```

---

### B. `SMTP_EMAIL` & `SMTP_APP_PASSWORD` (Email 6-Digit OTP Codes)
Used by `src/services/auth_service.py` to send 6-digit confirmation codes for registration, login, password reset, and changing a wallet address.

1. Enable **2-Step Verification** on your Google Account.
2. Go to [Google App Passwords](https://myaccount.google.com/apppasswords), create an App Password (e.g., named `AgriData`), and copy the 16-character password.
3. Add it to `.env`:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_EMAIL=your-email@gmail.com
   SMTP_APP_PASSWORD=xxxx xxxx xxxx xxxx
   ```

> [!TIP]
> **Testing without SMTP**: If `SMTP_APP_PASSWORD` is left blank (and `AGRIDATA_AUTH_DEMO=1`), the app prints the 6-digit OTP in the server terminal so you can test locally without configuring Gmail.

---

### C. `FUJI_CONTRACT_ADDRESS` & `FUJI_SIGNER_PRIVATE_KEY` (Avalanche Fuji `43113`)
Used by `src/services/credit_service.py` (`web3.py`) to interact with `contracts/SimulationCredits.sol` on **Avalanche Fuji C-Chain**.

1. **Contract Address (`FUJI_CONTRACT_ADDRESS`)**:
   * You can use the team's deployed Fuji testnet contract (`0xf2dBC98658CDEa971DFB8CD1D2CF160FcfC95552`), **or** deploy your own copy via [Remix IDE](https://remix.ethereum.org/):
     * Compiler: `0.8.24` · EVM Version: `cancun`
     * Environment: **Browser Extension** (Core Wallet / MetaMask switched to **Fuji Testnet `43113`**)
     * Deploy `contracts/SimulationCredits.sol` and copy the deployed `0x...` address.
2. **Backend Signer Private Key (`FUJI_SIGNER_PRIVATE_KEY`)**:
   * Must be a **32-byte (`0x` + 64 hex chars)** C-Chain/EVM private key for the contract `owner` wallet (used to pay Fuji gas fees on behalf of users).
   * Fund that wallet with free testnet AVAX from the [Core Fuji Testnet Faucet](https://core.app/tools/testnet-faucet/).
   * Add both to `.env`:
     ```env
     FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
     FUJI_CONTRACT_ADDRESS=0xYourDeployedContractAddress
     FUJI_SIGNER_PRIVATE_KEY=0xYour64HexCharPrivateKey
     ```

> [!NOTE]
> **UI / Python-only teammates**: If you leave `FUJI_SIGNER_PRIVATE_KEY` blank in your local `.env`, the app automatically falls back to local SQLite simulation mode without sending any blockchain transactions.

---

### D. Optional Keys
```env
# Optional: Gemini API key for the Cò Mạ farming assistant
GEMINI_API_KEY=

# Optional: Override default SQLite path (data/agridata.db)
# AGRIDATA_DB_PATH=data/agridata.db
```

---

## 3. Verify Your Setup

Run the automated test suite and start the Flask server:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe main.py
```

Open [http://127.0.0.1:5000/](http://127.0.0.1:5000/) in your browser.
