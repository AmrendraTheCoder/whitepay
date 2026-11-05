# UPI-Inspired Architecture for WhitePay

Source: NPCI *UPI Procedural Guidelines v1.5* (July 2016), 62 pages, read in full. It is old, and UPI has changed since, so treat it as design inspiration rather than current rules.

## 1. Role mapping: UPI → WhitePay
| UPI role | What it does in UPI | WhitePay equivalent |
|---|---|---|
| **NPCI / UPI switch** | Routes ReqPay/RespPay messages, resolves addresses, coordinates settlement | **PaymentRouter contract** on Whitechain (1874) |
| **VPA `name@psp`** | Human-readable payment address | **ENS subname `name.whitepay.eth`** |
| **PSP handle (`@okaxis`)** | Namespace owned by one PSP | Parent name `whitepay.eth` (other apps can run their own parent) |
| **NPCI Mapper / PSP local mapper** | Address → account resolution | **ENS resolver** (address record for chain 1874 + text records) |
| **Issuer / remitter bank** | Holds money, validates the PIN, debits | User's **smart account / embedded wallet** holding USDT |
| **Payer PSP app** | Front end, device binding, first factor | **WhitePay PWA** |
| **NPCI Common Library** | The only place a PIN is ever entered | **Passkey / secure enclave**: keys never touch our app code or the merchant's |
| **Acquirer + Reference ID** | Merchant gets a Reference ID bound to an amount; the PSP validates it before paying | **Server-signed EIP-712 Order** (merchant, amount, orderId, expiry), checked by the router |
| **Merchant whitelist ("address verified" icon)** | Anti-phishing for large merchants | **Verified-merchant registry**: ENS text record + World-verified owner → badge in app |
| **IMPS settlement + DSR reports** | Net settlement, daily settlement report, reconciliation files | Instant onchain settlement + **Arkiv receipts** + daily merchant report / CSV |
| **Dispute / complaint system** | Raise a complaint from transaction history using the txn ID | **Dispute entity on Arkiv** linked to the payment tx; merchant answers with a refund |

## 2. Ideas worth borrowing (ranked by value for the hackathon)

### Must have
1. **Push and Pull ("Pay" and "Collect")**
   - **Pay** is the customer pushing money.
   - **Collect** is a merchant request the payer approves.
   - UPI expiry rules: default **30 min**, minimum **1 min**, maximum **45 days**. Map these straight onto the **Arkiv entity expiry** of a payment request, so Arkiv's expiry becomes a visible product feature.
   - The payer can **reject** a collect request.
2. **Reference-ID-bound merchant payments.** UPI declines a merchant payment if the Reference ID and amount don't match what the acquirer issued.
   - Ours: the merchant backend signs an `Order{merchant, amount, orderId, deadline}`.
   - The router checks the signature and refuses replays (`orderId` can only be used once).
   - This is exactly the "not a plain transfer" piece Whitechain wants.
3. **Show the verified name on every screen.** UPI requires displaying the payee's VPA, **verified name** and amount, so `presidentofindia@bank` shows the real person's name.
   - Ours: show the ENS name, a World-verified badge and the resolved address before any payment or collect approval.
   - Never show a masked or unnamed requester. UPI declines masked collect requests.
4. **Standard deep link + QR spec.** UPI's `upi://pay?pa=…&am=…` lets any app pay any merchant.
   - Ours: publish `whitepay://pay?to=chai-shop.whitepay.eth&amount=…&order=…`, compatible with EIP-681 (`ethereum:` URI) so any wallet can pay.
   - The QR must show name, address and amount (mandatory in UPI's checklist).
5. **Transaction status + dispute from history.** UPI mandates "check status" and "raise complaint" against a transaction ID.
   - Ours: history (read from Arkiv) → tap a payment → status (onchain confirmation) → "Raise dispute" creates an Arkiv entity → merchant refunds with one click.
   - This also gives Whitechain its "past the first payment" extra credit.

### Should have
6. **Two-factor by design.** UPI uses the bound device as the first factor and the PIN/biometric as the second.
   - Ours: the passkey (bound to the device, unlocked by biometric) covers everyday payments.
   - **World ID fresh verification** is the step-up for risky actions. This is the World Agent Pass "meaningful action" story.
7. **Transaction limits + step-up.** UPI's default is ₹1 lakh per transaction.
   - Ours: per-transaction and daily limits enforced in the relayer/smart-account policy.
   - Above the limit, require a World verification. Demo both paths, approved and denied.
8. **Velocity checks / anti-spam.** UPI recommends at most 10 collect requests a day and 25 a week to one VPA, real-time velocity checks per customer, and "mark safe" whitelisting of known requesters.
   - Ours: relayer rate limits (this doubles as the Whitechain Scale **anti-drain** answer), collect-request caps per sender, and a "trusted requesters" list.
9. **Name hygiene.**
   - UPI keeps a blocked list of the top 100–200 famous names, and a deleted VPA can't be reissued for **2 years**.
   - Ours: a reserved-names list in the subname registrar, a cooldown before a released subname can be reissued (blocks impersonation of a past owner), and one name per World-verified human.
10. **Device change / recovery / hotlisting.** In UPI, a new device means re-binding, a new number means a new VPA, and a lost phone can be hotlisted.
    - Ours: re-bind the ENS name to a new wallet after a World ID re-verification (IDKit's "account recovery" trust moment).
    - Add a "freeze my name" kill switch that clears the resolver's address record.

### Nice to have
11. **Embedded vs independent mode.** UPI's PSP SDK can run inside a merchant app or as a standalone app.
    - Ours: `@whitepay/checkout` widget (embedded, ~20 lines) and the WhitePay PWA (independent).
    - A "Pay with WhitePay" button opens a chooser.
12. **Daily settlement report.** UPI sends members a daily settlement report plus raw files for reconciliation.
    - Ours: a merchant "Daily settlement" view and CSV built from onchain events, cross-checked against Arkiv receipts. This is the accountant export.
13. **Merchant category code (MCC).** Store a category in the merchant's ENS text record, for analytics and for spotting a person who is really running a shop (UPI does this to enforce merchant rules).
14. **Data minimisation.** UPI forbids the merchant app from seeing credentials, and customer data stays with the PSP.
    - Ours: the SDK never sees keys.
    - Arkiv is public, so store only hashes or encrypted payloads plus the tx hash, never raw personal data.

## 3. Lesson from UPI's later history
UPI's **P2P collect requests became a major fraud vector**: scammers send a "collect" and the victim approves, thinking they're receiving money. NPCI has since moved to restrict or retire P2P collect (reported for 2025; verify the details before citing).

So in WhitePay, **collect requests are allowed only from verified merchants**, never P2P. The approval screen says "You are **PAYING** X USDT to …" in large type.

## 4. Where onchain beats UPI (use in the README "why Whitechain" line)
| UPI limitation | WhitePay on Whitechain |
|---|---|
| Domestic INR only; cross-border is limited | USDT works across borders; a Dubai client can pay a Mumbai studio |
| Net settlement in cycles; settlement risk managed via a guarantee fund | Each payment settles atomically onchain; no "pending" state |
| Must be a licensed bank to be a PSP | Anyone can build a front end on the open router and ENS names |
| Receipts live in each bank's private database | Receipts are verifiable by tx hash; the customer can check a refund themselves |
| Recurring payments (AutoPay mandates) are bank-specific | Programmable permits and subscriptions in the contract |
| Timeouts turn into reversals and disputes | Atomic transactions: success or revert, nothing in between |

Be honest about where UPI is still better: chargebacks and consumer protection, regulation and KYC, proven scale (UPI benchmarks 150 TPS per PSP and 99.9% uptime even in 2016), and INR as the unit of account.

## 5. Updated architecture
```
 Customer PWA (passkey)        Merchant site + @whitepay/checkout       Merchant dashboard
        │  scan QR / deep link            │ creates signed Order               │
        ▼                                 ▼                                    │
  ENS resolve name ──► Order + EIP-712 / EIP-3009 signature                     │
        │                                 │                                    │
        ▼                                 ▼                                    │
  Policy server (limits, velocity, World step-up) ──► Relayer (pays WBT gas)    │
                                                    │                          │
                                                    ▼                          │
                              PaymentRouter on Whitechain 1874 (official USDT) │
                              pay / collect / refund / receipts events         │
                                                    │                          │
                                     Indexer ──► Arkiv entities ◄──────────────┘
                                                (requests w/ expiry, receipts,
                                                 disputes, daily reports)
```

## 6. What changes in the plan
- PaymentRouter gains: `payOrder(order, sig, auth)`, `createCollect` (merchant only), `refund(paymentId, amount)` capped at the original, `orderId` used once.
- New policy server between app and relayer: limits, velocity, World step-up, reserved names.
- Arkiv entity types: `PaymentRequest` (expiry = collect expiry), `Receipt`, `Dispute`, `DailyReport`.
- ENS: reserved names, reissue cooldown, `verified`/`mcc`/`displayName` text records, freeze switch.
- Demo script adds: collect request expiring live, a payment over the limit blocked until World verification, a dispute → refund.
