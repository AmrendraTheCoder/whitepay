# WondrPay: Risks, Vulnerabilities, Analogs

## 1. What could go wrong (project / hackathon risk)

| # | Risk | Why it matters | Mitigation |
|---|---|---|---|
| R1 | **Whitechain USDT may not support `permit` (EIP-2612) or `transferWithAuthorization` (EIP-3009)** | The whole gasless design depends on it. If it's a plain ERC-20, the payer needs gas for `approve` | **Check first** (read the verified token on the explorer). Fallback: ERC-4337 smart account + our paymaster, or relayer-sponsored one-time approve |
| R2 | Scope: 4 integrations in ~36h | Half-finished layers score zero; one gets dropped anyway (3-prize cap) | Whitechain core first, each other layer behind a feature flag |
| R3 | "Plain transfer" judged as won't-place | Loses Whitechain Operate | Merchant SDK/widget, receipts, refunds, export as headline |
| R4 | ENSv2 is brand new | Docs gaps, unexpected contract behavior, Sepolia availability | Prototype early; ask the ENS booth; keep a minimal registry path |
| R5 | Cross-chain identity: ENS on Ethereum, money on Whitechain | Two RPCs, two wallets' gas (Sepolia ETH for name ops), mismatched records | Server pays Sepolia gas for subname creation; resolve the 1874 coin-type record in the client |
| R6 | Embedded wallet provider may not support chain 1874 | "No seed phrase" story breaks | Verify provider support on day 1; fallback to passkey smart account we deploy ourselves |
| R7 | Testnet infra (faucet limits, RPC rate limits, explorer verification failures) | Blocks the mandatory "verified + real USDT tx" requirements | Grab faucet funds + Ankr RPC now; verify contracts as soon as deployed |
| R8 | Demo fragility (4 live services) | One outage kills the video | Record the video early, re-record later |
| R9 | Missing paperwork (feedback files, /arkiv/*.md, World debrief) | Instant disqualification | Write them as you go (`submission-auditor` agent) |

## 2. Security vulnerabilities (design-level)

### Payments (Whitechain contracts + relayer)
- **Relayer drain**: anyone can submit junk signed requests to burn our WBT. → Simulate before sending, per-user/IP rate limits, max gas price, only relay to our router, balance floor alert.
- **Signature replay**: across chains/contracts or reused nonces. → EIP-712 domain with chainId 1874 + verifying contract; unique nonces; deadlines.
- **Front-running of `transferWithAuthorization`**: an observer submits the signed auth to a different flow. → Use `receiveWithAuthorization` (payee must be caller) or route via our contract that binds an order ID.
- **Refund abuse**: refund > original amount, double refunds, refund to a different address. → Track `refunded[paymentId]`, cap at paid amount, refund only to the original payer.
- **Non-standard USDT**: classic USDT doesn't return `bool`; 6 decimals. → `SafeERC20`, never hard-code 18 decimals.
- **Reentrancy / access control** on refund, withdraw, admin functions. → Checks-effects-interactions, `ReentrancyGuard`, role-limited admin.
- **Fee-on-transfer / blocklist** behaviour if the token admin can freeze addresses. → Handle failed transfers gracefully.
- **Relayer/server key compromise** → the key holds only gas money, no USDT custody; keys in env/secret manager, never in the repo.

### Names (ENS)
- **Payment misdirection**: whoever can edit the resolver's address record can redirect payments. → Enhanced Access Control: address record editable only by the owner; cashier roles limited to non-financial text records.
- **Homoglyph / lookalike names** (`chai-sh0p`). → Normalize (ENSIP-15), show a verified-merchant badge and the resolved address before paying.
- **Squatting / sybil name grabs** → one name per World-verified human.
- **Stale records**: expired or revoked subnames still cached in the client. → Resolve at pay time, don't cache.

### Data (Arkiv)
- **Privacy leak: Arkiv entities are public.** Writing raw receipts publishes every customer's purchases and merchant revenue. → Store hashes or encrypted payloads; keep PII off-chain; disclose this in the README.
- **Forged history**: if a merchant wallet owns receipt entities, it can edit or delete them. → Treat Whitechain events as the source of truth; entities include the tx hash and the UI cross-checks onchain.
- **Expiry deletes records accountants need** → long expiry for receipts, short only for payment requests.
- **Swarm encrypted references contain the key** → never put them in a public entity unencrypted.

### Trust (World ID)
- **Trusting the client result** → verify proofs in the backend only.
- **Proof/nullifier replay** → store nullifiers per action; bind proofs to action + signal (user address).
- **Mocked proofs** at the event: fine for the demo, not production. Say so in the README.

### Web / backend
- **Webhook spoofing/replay** → HMAC-signed payloads with timestamp, merchant verifies.
- **Order-amount tampering** in the checkout widget → amount/merchant come from a server-signed order, not URL params.
- **Phishing payment links** → show the resolved name + address + amount on a trusted page.

### Regulatory / real-world (mention in the README "limitations")
Custodial-looking relayer, KYC/AML, money transmission rules (incl. India's stance on crypto payments), chargebacks don't exist onchain (refunds are voluntary).

## 3. Analogs in Web3 (similar products)
Status as of my knowledge (mid-2026); check before citing in a pitch.

| Product | Similarity | Difference / our angle |
|---|---|---|
| **MiniPay (Opera, on Celo)** | Closest analog: stablecoin wallet, phone-number payments, tiny fees, no gas knowledge | Ours: ENS names, merchant SDK, Whitechain |
| **World App** | Usernames + stablecoin sends, World ID built in | Ours: merchant checkout, receipts/refunds |
| **Daimo / Daimo Pay** | USDC payments by username, passkeys, gas abstracted, checkout SDK | Very close to our UX; differentiate with ENSv2 + Arkiv + Whitechain |
| **Coinbase Commerce / Base Pay, cb.id & Basenames** | Merchant checkout + ENS-style subnames for users | Centralized-provider path vs. our open stack |
| **Solana Pay** | QR merchant payments (UPI-like) | Different chain; no names/identity layer |
| **Request Network** | Invoices, payment requests, accounting export | Infra, not consumer UX |
| **Peanut Protocol** | Shareable payment links | No merchant tooling |
| **BitPay / NOWPayments / Helio** | Crypto checkout for merchants | Custodial / multi-coin, not stablecoin-native names |
| **Stripe stablecoin payments** | Merchant USDC acceptance | Fully centralized |

**Pitch takeaway:** the parts aren't new; the combination (human-verified ENS merchant names + gasless USDT on an OP Stack L2 + user-owned, queryable receipts) is. Judges will know Daimo, MiniPay and Solana Pay, so name them and say what's different.
