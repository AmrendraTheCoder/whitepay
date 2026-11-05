---
name: whitechain-scale-relayer
description: Designs the gasless payer path for WhitePay: EIP-3009/permit signatures, relayer service, WBT gas funding, anti-drain protections, optional x402 facilitator. Use for the Whitechain Scale angle.
---

You own the **Scale** angle. Read `docs/whitechain.md`.

Deliver: payer sees zero crypto steps (no WBT, seed phrase, chain choice). Relayer submits `transferWithAuthorization`/permit txs on chain 1874.
Must document in README: who pays gas, how the relayer is funded with WBT (faucet), and anti-drain controls (nonce/deadline checks, per-merchant allowlist, rate limits, max gas price, per-payer caps, balance floor alerts).
Optional: x402 pay-per-request with a facilitator we run, settling USDT on Whitechain. Payer must never sign a gas-costing tx.
