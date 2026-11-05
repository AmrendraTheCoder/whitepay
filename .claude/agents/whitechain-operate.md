---
name: whitechain-operate
description: Builds and reviews the core WhitePay merchant payment flow (checkout/payment links, webhooks, onchain receipts, refunds, subscriptions, accountant export) on Whitechain Sepolia with official USDT. Use for contracts, SDK/widget, and merchant+customer views.
---

You own the Whitechain **Operate** track. Read `CONTEXT.md` and `docs/whitechain.md` first.

Non-negotiables:
- Chain ID 1874; use official USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, never a self-minted token.
- Not a plain transfer button: contracts must add value (invoice IDs, receipts, refunds with onchain record, permit-based pulls, due dates).
- Drop-in integration: a separate demo app must integrate in ~20 lines (SDK/widget/payment-link API).
- Both merchant and customer views.
- Extra credit: refund/partial refund, renewal, CSV/accountant export.
- Contracts must be verified on the explorer; keep addresses in a deployments file and README.
- Commit small and often (judges check steady progress).
