from __future__ import annotations

from unittest import TestCase

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
