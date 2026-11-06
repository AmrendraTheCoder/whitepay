# Why Arkiv (and not Postgres)

## What users would lose with a private database
| With Arkiv | With Postgres |
|---|---|
| **Receipts are public, verifiable records.** Any wallet, accounting tool or customer can query `whitepay.receipt` by payer or merchant and match each to its Whitechain tx hash, without our API | Receipts live in our DB; users must trust and ask us |
| **Payment requests expire in the data layer itself.** A shop QR is a `whitepay.request` whose Arkiv expiry equals the order's on-chain deadline (1–30 min). When it lapses it is *gone*, and the contract also rejects it (`OrderExpired`). We tested this live | Expiry is a cron job or flag we could get wrong or skip |
| **Provenance is part of verification.** The payer's app trusts a request only if `$owner` is the WondrPay writer. It then re-derives the order digest from the fields and checks the shop's signature against `MerchantRegistry` on Whitechain. Forged or tampered entities are rejected (tested: tampered amount, forged signature, foreign owner) | "Trust our server's row" |
| **Open directories.** `whitepay.merchant` and `whitepay.person` map addresses ↔ names ↔ verified status, readable by anyone, so another app can show "✓ Verified shop" too | Closed user table |
| **Auditable "one per human".** World ID nullifiers live in `whitepay.worldclaim`, so anyone can check that a shop or name was verified once, without learning who the person is | Hidden in our DB |

## What we kept off Arkiv, and why
| Kept off Arkiv | Where it lives | Why |
|---|---|---|
| **Money / settlement** | Whitechain (`PaymentRouter`, USDT) | Value transfer needs the payment chain's finality; Arkiv entities reference the tx hash |
| **Private keys, PIN, fingerprint** | The user's device (encrypted) or MetaMask | Never leave the phone |
| **Personal data (names, phone, KYC)** | Nowhere | Arkiv is public; we store only addresses, amounts, ENS names and short public fields. Optional notes go in an encrypted `bytes` column |
| **Raw World ID proofs** | Verified, then discarded | Only the RP-scoped **nullifier** is stored; it reveals no identity |
| **Relayer rate limits, step-up tokens** | Server memory / HMAC | Short-lived security state, not user data |
| **ENS names** | ENSv2 on Ethereum Sepolia | Names belong in the naming system; Arkiv mirrors address → name for fast lookups |
