# Whitechain ($15,000)

Whitechain = "The Onchain Economy Layer": EVM L2 on OP Stack, mainnet arriving November. Plain EVM, any tooling.

## Common qualification (all 4 tracks)
1. Contracts deployed on **Whitechain Sepolia (1874)** and **verified on explorer**.
2. ≥1 payment in **official USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`** in the main flow; explorer tx link in README. Self-minted tokens don't count.
3. README line: why this flow needs onchain stablecoin settlement on Whitechain and what a regular rail can't do.
4. Public repo with steady progress; README = setup, architecture, current limitations.
5. Demo video 2–4 min showing **each party**.
6. `WHITECHAIN_FEEDBACK.md`: what worked, where stuck, docs gaps.
Continuity adds: proof of starting point (dated pre-hackathon commit / earlier submission) + "before and during" README section.

## Tracks
### Operate – Stablecoin Payments for Business ($5k: 2.5/1.5/1)
Merchant-ready USDT payment flow, plug-in in ~20 lines of a separate demo app.
- Ideas: drop-in checkout + order webhooks + onchain receipt; payment links/invoices with due dates & reminders; subscriptions with permit pulls + cancel; refunds/partial refunds with customer-checkable record.
- Want: widget/SDK/payment-link API/plugin; **merchant AND customer views**; extra credit for refund, renewal, accountant export.
- Won't place: plain-transfer pay button, tipping jar, bill splitter, custodial bridges, payroll/escrow/rev-split alone.

### Tokenize – Real World Finance ($4k: 2.5/1.5)
RWA lifecycle with compliance in contract (allowlists, transfer restrictions, maturity/settlement), all payments USDT. Bonds w/ coupons, invoice financing, repo DvP, trade finance. Needs issuer + investor/business actor and one full lifecycle step. Paying an invoice = Operate; financing/selling one = Tokenize.

### Scale – Payments Nobody Notices ($3k: 2/1)
Payer pays USDT with no WBT gas, no seed phrase, no chain awareness (person or AI agent). Ideas: gasless via permit/EIP-3009 + own relayer; embedded wallet/smart account; x402 pay-per-request with own facilitator. Must explain: who pays gas, how relayer gets WBT, **anti-drain protections**. Won't place: payer signs gas-costing tx; AI chats that never pay.

### Continuity – Bring Your Product ($3k: 1.5/1.5)
Existing product adds Whitechain (USDT payments / onchain feature / contracts). Real new work, not UI polish; real users help.

## Resources
Docs https://docs.whitechain.io · Faucet · Explorer · Builders https://whitechain.io/builders · YetiTrade testnet https://testnet.yetitrade.fi · OP Stack docs https://docs.optimism.io · Workshop https://www.youtube.com/watch?v=KULaCM9UslE
