# WhitePay: "GPay on Whitechain"

A UPI/GPay-style payments app: pay a **name** (not an address) in **USDT on Whitechain**, with payment history in **Arkiv**, and **World ID** human verification for sensitive actions. No bill splitting (Whitechain rules exclude bill splitters).

## How each sponsor fits
| Layer | Sponsor | What it does in the app | Target sub-track |
|---|---|---|---|
| Money | **Whitechain** | USDT payments on chain 1874: merchant QR checkout, payment requests, refunds, receipts. Gasless for the payer (relayer pays WBT) | **Operate** (primary), **Scale** angle |
| Names | **ENS** | Every user/merchant gets a subname (`ravi.whitepay.eth`, `chai-shop.whitepay.eth`) under our ENSv2 registry; resolver holds their Whitechain address and payment prefs | **Best Use of ENSv2** |
| Data | **Arkiv** | Payment requests (expire on due date), receipts, merchant profiles as wallet-owned entities; history and merchant dashboard read from Arkiv | **Build on Arkiv (from scratch)** |
| Trust | **World** | Agent Pass / IDKit check before: claiming a name, payments above a limit, issuing a refund. Denied path blocks the action | **Agent Pass** or **IDKit** |

## Core user flows (demo script)
1. **Onboard**: user verifies with World ID → claims `name.whitepay.eth` (one name per human) → embedded wallet, no seed phrase.
2. **Customer pays merchant**: scan QR / type `chai-shop.whitepay.eth` → ENS resolves to Whitechain address → signs a gasless USDT authorization → relayer settles on Whitechain → receipt entity written to Arkiv.
3. **Merchant view**: dashboard reads payments from Arkiv (filter by date/status), issues a (partial) refund (World check gates it), exports CSV for the accountant.
4. **Payment request**: merchant creates a request/invoice → Arkiv entity expiring on its due date → customer pays via link.
5. **Failure paths**: World verification denied → refund/name claim blocked; expired request → cannot be paid.

## Risks to design around
- **"Plain transfer pay button won't place"** (Whitechain Operate). A P2P "send to friend" alone fails. The contract must add receipts, refunds, invoice IDs, and the merchant SDK/widget (demo app integrates in ~20 lines). Keep the merchant flow as the headline.
- **3 partner-prize limit.** Four sponsors means one gets dropped at submission. Build so any one layer can be cut. Decide by Sunday morning based on polish.
- **ENS lives on Ethereum (Sepolia/mainnet), money on Whitechain.** Store the Whitechain address as a multichain address record (ENSIP-11 coin type for chain 1874) and resolve it in the app. ENSv2 must be central, so use the subname registry + Permissioned Resolver + Enhanced Access Control (e.g. a merchant can delegate its cashier to edit only certain records), not just a name lookup.
- **Arkiv must be read by a user-visible feature** (history, dashboard), not just used as a log. Settlement stays on Whitechain.
- **World proofs must be validated in our backend**; never trust the client.

## Build order
1. Whitechain contracts (payment router with receipt events + refunds, EIP-3009/permit pull) → deploy + verify on 1874 → first real USDT payment.
2. Relayer (gasless) + merchant SDK/widget + customer and merchant UIs.
3. Arkiv entities for receipts and payment requests; dashboard reads them.
4. ENSv2 subname registry + resolver records; pay-by-name.
5. World gate on name claim / refunds, with denied path.
6. Docs: README, WHITECHAIN_FEEDBACK.md, /arkiv/*.md, World debrief, video.
