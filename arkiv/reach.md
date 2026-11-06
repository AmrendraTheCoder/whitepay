# Reach

## Who it's for
| User | What they use on Arkiv |
|---|---|
| **Shoppers / everyday payers** | Their payment history (Transactions, "Pay again"), verified-shop directory before paying, live 5-minute payment requests behind every shop QR |
| **Merchants (small shops, freelancers, studios)** | Signed QR requests, a received-payments dashboard, public shop profile + verified badge |
| **Accountants / auditors** | Receipts anyone can read and match to Whitechain tx hashes (CSV export planned on the same queries) |
| **Other apps** | The receipt and directory entities are public and queryable (`arkiv/schema.md`), so wallets or accounting tools can read WondrPay data without asking us |

Target corridors (see `docs/BUSINESS.md`): **India** (UPI-style QR habits; inbound USD payments for freelancers and tourists paying local shops, settled via licensed ramps) and **Ukraine** (stablecoin-heavy usage, close to the WhiteBIT/Whitechain ecosystem). Non-UPI markets (Nigeria, Argentina, Turkey) are next.

## Can they try it today?
Yes: **https://wondrpay.vercel.app** (mobile-first PWA).
1. Create a wallet (PIN / fingerprint, no seed phrase).
2. Pay a shop QR, or send to a name like `masala-corner.wondrpay.eth`.
3. Open Transactions to see receipts read from Arkiv.

Everything runs on testnets: Whitechain Sepolia, Arkiv Rabdi, ENS Sepolia.

**Live activity created so far:** shop QR payments, P2P transfers, shop-to-shop and refunds (see `scripts/e2e-matrix.ts`), 2 shops in the merchant directory, and 1 personal name.

## Will we keep building after Mumbai?
Yes. Next steps:
1. Checkout SDK and payment links for merchant websites.
2. Merchant CSV export and disputes (`whitepay.dispute`, already defined).
3. Whitechain mainnet.
4. A licensed on/off-ramp partner in one corridor.

Arkiv stays the data layer for requests, receipts and directories. Once Arkiv mainnet is available, we'd move there.
