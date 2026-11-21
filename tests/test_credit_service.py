from __future__ import annotations

from unittest import TestCase
from unittest.mock import MagicMock, patch

from src.services.credit_service import (
    SIMULATION_CREDITS_ABI,
    FujiCreditService,
    compute_submission_hash,
    snowtrace_tx_url,
)


class TestFujiCreditService(TestCase):
    def test_abi_contains_expected_soulbound_functions(self) -> None:
        names = {item["name"] for item in SIMULATION_CREDITS_ABI}
        self.assertEqual(
            names,
            {
                "balanceOf",
                "usedSubmissionHashes",
                "awardContribution",
                "spendCredits",
                "buyCredits",
                "fundNewWallet",
            },
        )

    def test_submission_hash_and_snowtrace_url(self) -> None:
        h1 = compute_submission_hash("site=field,salinity=2.4,unit=g/L")
        h2 = compute_submission_hash("site=field,salinity=2.4,unit=g/L")
        self.assertEqual(len(h1), 32)
        self.assertEqual(h1, h2)
        self.assertEqual(
            snowtrace_tx_url("abc123"),
            "https://testnet.snowtrace.io/tx/0xabc123",
        )
        self.assertEqual(
            snowtrace_tx_url("0xdef456"),
            "https://testnet.snowtrace.io/tx/0xdef456",
        )

    def test_graceful_fallback_when_unconfigured(self) -> None:
        svc = FujiCreditService(contract_address="", signer_private_key="")
        self.assertFalse(svc.is_read_configured)
        self.assertFalse(svc.is_write_configured)
        self.assertIsNone(
            svc.get_onchain_balance("0x6cf2AF5cA4E0c12a7981a7571D66451Ee1D102a1")
        )
        award = svc.award_contribution_onchain(
            "0x6cf2AF5cA4E0c12a7981a7571D66451Ee1D102a1", 5, "sample-csv"
        )
        self.assertFalse(award["onchain"])
        self.assertIsNone(award["tx_hash"])
        buy = svc.buy_credits_onchain(
            "0x6cf2AF5cA4E0c12a7981a7571D66451Ee1D102a1", 0.1
        )
        self.assertFalse(buy["onchain"])
        self.assertIsNone(buy["tx_hash"])

    def test_fund_new_wallet_checks_zero_balance_and_sends_0_05_avax(self) -> None:
        svc = FujiCreditService(
            contract_address="0xf2dBC98658CDEa971DFB8CD1D2CF160FcfC95552",
            signer_private_key="0x" + "11" * 32,
        )
        fake_w3 = MagicMock()
        fake_w3.to_wei.return_value = 50_000_000_000_000_000
        fake_contract = MagicMock()
        fake_fn = MagicMock()
        fake_contract.functions.fundNewWallet.return_value = fake_fn

        # Non-zero balance -> skipped
        fake_w3.eth.get_balance.return_value = 1
        with patch.object(svc, "_get_web3_and_contract", return_value=(fake_w3, fake_contract)):
            res_nonzero = svc.fund_new_wallet_onchain("0x6cf2AF5cA4E0c12a7981a7571D66451Ee1D102a1", 0.05)
        self.assertFalse(res_nonzero["onchain"])
        fake_contract.functions.fundNewWallet.assert_not_called()

        # Zero balance -> calls fundNewWallet with 0.05 AVAX in wei
        fake_w3.eth.get_balance.return_value = 0
        with (
            patch.object(svc, "_get_web3_and_contract", return_value=(fake_w3, fake_contract)),
            patch.object(svc, "_send_contract_tx", return_value={"onchain": True, "tx_hash": "0xabc"}) as mock_send,
        ):
            res_zero = svc.fund_new_wallet_onchain("0x6cf2AF5cA4E0c12a7981a7571D66451Ee1D102a1", 0.05)
        self.assertTrue(res_zero["onchain"])
        fake_contract.functions.fundNewWallet.assert_called_once_with(
            "0x6cf2AF5cA4E0c12a7981a7571D66451Ee1D102a1", 50_000_000_000_000_000
        )
        mock_send.assert_called_once_with(fake_fn)

    def test_award_initial_credits_uses_signup_hash(self) -> None:
        svc = FujiCreditService(
            contract_address="0x0C035a37A8E41285DB6cbB77f3929e513C3F29A4",
            signer_private_key="0x" + "11" * 32,
        )
        wallet = "0x6cf2AF5cA4E0c12a7981a7571D66451Ee1D102a1"
        with patch.object(
            svc, "award_contribution_onchain", return_value={"onchain": True, "tx_hash": "0x123"}
        ) as mock_award:
            res = svc.award_initial_credits_onchain(wallet, 3)
        self.assertTrue(res["onchain"])
        mock_award.assert_called_once_with(wallet, 3, f"signup:{wallet.lower()}")

    def test_sync_credits_onchain_reconciles_up_down_and_equal(self) -> None:
        svc = FujiCreditService(
            contract_address="0x0C035a37A8E41285DB6cbB77f3929e513C3F29A4",
            signer_private_key="0x" + "11" * 32,
        )
        wallet = "0x6cf2AF5cA4E0c12a7981a7571D66451Ee1D102a1"

        # Already equal -> no tx
        with patch.object(svc, "get_onchain_balance", return_value=10):
            eq_res = svc.sync_credits_onchain(wallet, 10)
        self.assertTrue(eq_res["synced"])
        self.assertEqual(eq_res["credits"], 10)
        self.assertIsNone(eq_res["tx_hash"])

        # On-chain lower than target -> mints difference
        with (
            patch.object(svc, "get_onchain_balance", return_value=0),
            patch.object(svc, "award_contribution_onchain", return_value={"onchain": True, "tx_hash": "0xup"}) as mock_up,
        ):
            up_res = svc.sync_credits_onchain(wallet, 5)
        self.assertTrue(up_res["synced"])
        self.assertEqual(up_res["credits"], 5)
        self.assertEqual(mock_up.call_args[0][1], 5)

        # On-chain higher than target -> spends difference
        with (
            patch.object(svc, "get_onchain_balance", return_value=8),
            patch.object(svc, "spend_credits_onchain", return_value={"onchain": True, "tx_hash": "0xdown"}) as mock_down,
        ):
            down_res = svc.sync_credits_onchain(wallet, 5)
        self.assertTrue(down_res["synced"])
        self.assertEqual(down_res["credits"], 5)
        mock_down.assert_called_once_with(wallet, 3, "sync")
