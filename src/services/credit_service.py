from __future__ import annotations

import hashlib
from typing import Any

from src.config import (
    AVALANCHE_CHAIN_ID,
    FUJI_CONTRACT_ADDRESS,
    FUJI_RPC_URL,
    FUJI_SIGNER_PRIVATE_KEY,
)

SIMULATION_CREDITS_ABI: list[dict[str, Any]] = [
    {
        "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
        "name": "usedSubmissionHashes",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "address", "name": "farmer", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
            {"internalType": "bytes32", "name": "submissionHash", "type": "bytes32"},
        ],
        "name": "awardContribution",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "address", "name": "farmer", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
            {"internalType": "string", "name": "reason", "type": "string"},
        ],
        "name": "spendCredits",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "address", "name": "beneficiary", "type": "address"}],
        "name": "buyCredits",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "address payable", "name": "recipient", "type": "address"},
            {"internalType": "uint256", "name": "amountWei", "type": "uint256"},
        ],
        "name": "fundNewWallet",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]


def compute_submission_hash(payload: bytes | str) -> bytes:
    raw = payload.encode("utf-8") if isinstance(payload, str) else payload
    return hashlib.sha256(raw).digest()


def snowtrace_tx_url(tx_hash: str) -> str:
    clean = (tx_hash or "").strip()
    if not clean:
        return ""
    if not clean.startswith("0x"):
        clean = "0x" + clean
    return f"https://testnet.snowtrace.io/tx/{clean}"


class FujiCreditService:
    """Bridge between AgriData SQLite ledger and SimulationCredits.sol on Avalanche Fuji (43113)."""

    def __init__(
        self,
        rpc_url: str = FUJI_RPC_URL,
        contract_address: str = FUJI_CONTRACT_ADDRESS,
        signer_private_key: str = FUJI_SIGNER_PRIVATE_KEY,
        chain_id: int = AVALANCHE_CHAIN_ID,
    ) -> None:
        self.rpc_url = rpc_url
        self.contract_address = contract_address.strip()
        self.signer_private_key = signer_private_key.strip()
        self.chain_id = chain_id

    @property
    def is_read_configured(self) -> bool:
        return bool(self.contract_address)

    @property
    def is_write_configured(self) -> bool:
        return bool(self.contract_address and self.signer_private_key)

    def _get_web3_and_contract(self):
        from web3 import Web3

        w3 = Web3(Web3.HTTPProvider(self.rpc_url, request_kwargs={"timeout": 8}))
        checksum_addr = Web3.to_checksum_address(self.contract_address)
        contract = w3.eth.contract(address=checksum_addr, abi=SIMULATION_CREDITS_ABI)
        return w3, contract

    def get_onchain_balance(self, wallet_address: str) -> int | None:
        if not self.is_read_configured or not wallet_address:
            return None
        try:
            from web3 import Web3

            _, contract = self._get_web3_and_contract()
            checksum_wallet = Web3.to_checksum_address(wallet_address)
            return int(contract.functions.balanceOf(checksum_wallet).call())
        except Exception:  # noqa: BLE001 - Optional RPC boundary; balance stays unknown on failure.
            return None

    def get_onchain_avax_balance(self, wallet_address: str) -> float | None:
        if not self.rpc_url or not wallet_address:
            return None
        try:
            from web3 import Web3

            w3 = Web3(Web3.HTTPProvider(self.rpc_url, request_kwargs={"timeout": 8}))
            checksum_wallet = Web3.to_checksum_address(wallet_address)
            wei_balance = w3.eth.get_balance(checksum_wallet)
            return round(float(w3.from_wei(wei_balance, "ether")), 4)
        except Exception:  # noqa: BLE001 - Optional RPC boundary; balance stays unknown on failure.
            return None

    def verify_buy_credits_tx(
        self,
        tx_hash: str,
        beneficiary_wallet: str,
        expected_avax: float,
    ) -> dict[str, Any]:
        clean_hash = (tx_hash or "").strip()
        if not clean_hash.startswith("0x") or len(clean_hash) != 66:
            return {"onchain": False, "tx_hash": None, "reason": "Mã giao dịch Fuji (tx_hash) không hợp lệ."}
        if not self.is_read_configured:
            return {"onchain": False, "tx_hash": None, "reason": "Chưa cấu hình FUJI_CONTRACT_ADDRESS."}
        try:
            from web3 import Web3

            w3, _ = self._get_web3_and_contract()
            receipt = w3.eth.wait_for_transaction_receipt(clean_hash, timeout=30)
            tx = w3.eth.get_transaction(clean_hash)
            if int(receipt.get("status", 0)) != 1:
                return {"onchain": False, "tx_hash": None, "reason": "Giao dịch trên Fuji đã thất bại (reverted)."}
            tx_to = str(tx.get("to") or "").lower()
            if tx_to != self.contract_address.lower():
                return {"onchain": False, "tx_hash": None, "reason": "Giao dịch không gửi tới hợp đồng SimulationCredits đã cấu hình."}
            expected_wei = int(w3.to_wei(expected_avax, "ether"))
            if int(tx.get("value", 0)) < expected_wei:
                return {"onchain": False, "tx_hash": None, "reason": "Giá trị AVAX trong giao dịch nhỏ hơn mức yêu cầu."}
            _ = Web3.to_checksum_address(beneficiary_wallet)
            return {
                "onchain": True,
                "tx_hash": clean_hash,
                "snowtrace_url": snowtrace_tx_url(clean_hash),
            }
        except Exception:  # noqa: BLE001 - RPC boundary must not leak internal traces.
            return {"onchain": False, "tx_hash": None, "reason": "Không tìm thấy hoặc chưa xác nhận được giao dịch trên Avalanche Fuji."}

    def _send_contract_tx(
        self, fn_call: Any, value_wei: int = 0
    ) -> dict[str, Any]:
        if not self.is_write_configured:
            return {
                "onchain": False,
                "tx_hash": None,
                "reason": "FUJI_CONTRACT_ADDRESS hoặc FUJI_SIGNER_PRIVATE_KEY chưa được cấu hình.",
            }
        try:
            from web3 import Web3

            w3, _ = self._get_web3_and_contract()
            acct = w3.eth.account.from_key(self.signer_private_key)
            nonce = w3.eth.get_transaction_count(acct.address)
            tx = fn_call.build_transaction(
                {
                    "chainId": self.chain_id,
                    "from": acct.address,
                    "nonce": nonce,
                    "value": value_wei,
                    "gas": 180_000,
                    "gasPrice": w3.eth.gas_price,
                }
            )
            signed = w3.eth.account.sign_transaction(tx, self.signer_private_key)
            tx_hash_bytes = w3.eth.send_raw_transaction(signed.raw_transaction)
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash_bytes, timeout=30)
            if int(receipt.get("status", 0)) != 1:
                return {
                    "onchain": False,
                    "tx_hash": None,
                    "reason": "Giao dịch trên Fuji đã thất bại (reverted).",
                }
            tx_hash = Web3.to_hex(tx_hash_bytes)
            return {
                "onchain": True,
                "tx_hash": tx_hash,
                "snowtrace_url": snowtrace_tx_url(tx_hash),
            }
        except Exception:  # noqa: BLE001 - Provider errors must not expose signed payloads or keys.
            return {
                "onchain": False,
                "tx_hash": None,
                "reason": "Không gửi được giao dịch Fuji. Kiểm tra kết nối và cấu hình máy chủ.",
            }

    def award_contribution_onchain(
        self,
        farmer_wallet: str,
        amount: int,
        submission_hash: bytes | str,
    ) -> dict[str, Any]:
        if not self.is_write_configured:
            return {
                "onchain": False,
                "tx_hash": None,
                "reason": "Chưa cấu hình hợp đồng Fuji trong .env.",
            }
        from web3 import Web3

        _, contract = self._get_web3_and_contract()
        checksum_farmer = Web3.to_checksum_address(farmer_wallet)
        hash_bytes = (
            compute_submission_hash(submission_hash)
            if isinstance(submission_hash, str) and not submission_hash.startswith("0x")
            else (
                bytes.fromhex(submission_hash[2:])
                if isinstance(submission_hash, str)
                else submission_hash
            )
        )
        fn = contract.functions.awardContribution(checksum_farmer, int(amount), hash_bytes)
        return self._send_contract_tx(fn)

    def spend_credits_onchain(
        self,
        farmer_wallet: str,
        amount: int,
        reason: str = "simulation",
    ) -> dict[str, Any]:
        if not self.is_write_configured:
            return {
                "onchain": False,
                "tx_hash": None,
                "reason": "Chưa cấu hình hợp đồng Fuji trong .env.",
            }
        from web3 import Web3

        _, contract = self._get_web3_and_contract()
        checksum_farmer = Web3.to_checksum_address(farmer_wallet)
        fn = contract.functions.spendCredits(checksum_farmer, int(amount), reason)
        return self._send_contract_tx(fn)

    def buy_credits_onchain(
        self,
        beneficiary_wallet: str,
        avax_amount: float,
    ) -> dict[str, Any]:
        if not self.is_write_configured:
            return {
                "onchain": False,
                "tx_hash": None,
                "reason": "Chưa cấu hình hợp đồng Fuji trong .env.",
            }
        from web3 import Web3

        w3, contract = self._get_web3_and_contract()
        checksum_beneficiary = Web3.to_checksum_address(beneficiary_wallet)
        wei_value = int(w3.to_wei(avax_amount, "ether"))
        fn = contract.functions.buyCredits(checksum_beneficiary)
        return self._send_contract_tx(fn, value_wei=wei_value)

    def fund_new_wallet_onchain(
        self,
        farmer_wallet: str,
        avax_amount: float = 0.05,
    ) -> dict[str, Any]:
        """Send initial AVAX from the contract to a newly created 0-balance wallet."""
        if not self.is_write_configured or not farmer_wallet:
            return {
                "onchain": False,
                "tx_hash": None,
                "reason": "Chưa cấu hình hợp đồng Fuji trong .env.",
            }
        try:
            from web3 import Web3

            w3, contract = self._get_web3_and_contract()
            checksum_farmer = Web3.to_checksum_address(farmer_wallet)
            if int(w3.eth.get_balance(checksum_farmer)) > 0:
                return {
                    "onchain": False,
                    "tx_hash": None,
                    "reason": "Ví đã có số dư AVAX trên C-Chain.",
                }
            wei_value = int(w3.to_wei(avax_amount, "ether"))
            fn = contract.functions.fundNewWallet(checksum_farmer, wei_value)
            return self._send_contract_tx(fn)
        except Exception:  # noqa: BLE001 - Do not leak RPC or key details.
            return {
                "onchain": False,
                "tx_hash": None,
                "reason": "Không kiểm tra hoặc cấp AVAX khởi tạo trên Fuji.",
            }

    def award_initial_credits_onchain(
        self,
        farmer_wallet: str,
        amount: int = 3,
    ) -> dict[str, Any]:
        """Mint initial signup LÚA credits on-chain once per wallet address."""
        if not self.is_write_configured or not farmer_wallet or amount <= 0:
            return {
                "onchain": False,
                "tx_hash": None,
                "reason": "Chưa cấu hình hợp đồng Fuji hoặc ví không hợp lệ.",
            }
        return self.award_contribution_onchain(
            farmer_wallet, int(amount), f"signup:{farmer_wallet.strip().lower()}"
        )


default_credit_service = FujiCreditService()
