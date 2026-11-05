# WhitePay: business model and the road to real money

> Ideas and market notes, not legal or financial advice. Crypto rules in India, Ukraine and elsewhere change often; confirm with a lawyer and licensed partners before launch.

## 1. Tested today (live testnet, 2026-11-05)
`scripts/e2e-matrix.ts` ran every account combination on Whitechain Sepolia with official USDT. Every payer held **0 WBT**:

| Flow | Example use | Result |
|---|---|---|
| Personal → Business (dynamic QR order, Arkiv request) | Pay at a shop | ✔ |
| Personal → Personal (P2P) | Split dinner, family transfer | ✔ |
| Personal → Business by ENS name | Pay `masala-corner.whitepay.eth` | ✔ |
| Business → Personal | Cashback, freelancer payout | ✔ |
| Business → Business (B2B) | Pay a supplier | ✔ |
| Business refund → original customer (partial, capped on-chain) | Returns | ✔ |

Balance deltas matched exactly, and both sides saw each payment in their activity.

## 2. The business side ("Stripe for stablecoin UPI")
**For merchants (the paying client of WhitePay):**
- **Checkout SDK / payment links / invoices:** `<whitepay-button merchant="shop.whitepay.eth">` for websites, payment links over WhatsApp, invoices with due dates (an Arkiv request with a longer TTL). Signed webhooks to the merchant's server. *This is the Whitechain "Operate" requirement: a separate demo app integrating in about 20 lines.*
- **Dashboard:** live receipts (Arkiv), refunds (built), daily settlement report, CSV export for the accountant, multiple outlets per business.
- **Staff roles:** ENSv2 Enhanced Access Control lets a cashier key edit display records but never the payout address. Separate terminal keys per counter.
- **Subscriptions / autopay:** recurring pulls with signed EIP-3009/permit authorizations and a "cancel anytime" mandate, like UPI AutoPay.
- **Payouts:** B2B and supplier payments (tested), bulk payroll-style payouts to freelancers.
- **Treasury "Earn" (the staking idea):** idle merchant USDT could earn yield, *opt-in only*, via audited partners (lending markets or tokenized T-bill funds), with clear risk disclosure. It must stay separate from the payment balance, and in many countries it needs its own license. Treat it as phase 3.

**Revenue model:**
| Stream | Price idea | Why merchants accept it |
|---|---|---|
| Merchant fee (MDR) | 0.3–0.5% | Cards cost 1.8–3% abroad; cross-border is 3–6% |
| Cross-border / FX spread | 0.5–1% on ramp conversions | Cheaper than SWIFT/PayPal for freelancers and exporters |
| SaaS tier | Monthly fee for multi-outlet, staff, API, webhooks | Same as Razorpay/Stripe dashboards |
| Treasury share | Share of opt-in yield | Only where licensed |
| Gas | Bundled into the fee | The relayer pays WBT; the user never sees gas |

**For the merchant's customers:** cashback in USDT (business → personal, tested), loyalty stamps as Arkiv entities, verified-merchant badge (World ID) for trust.

## 3. Getting closer to real money
The chain part is ready for mainnet: Whitechain mainnet (chain 1875) launched in October 2026. What's missing is the **fiat bridge** (on/off ramp) and **compliance**. Architecture:
```
UPI / bank / card ──► licensed on-ramp partner (KYC) ──► real USDT on Whitechain mainnet ──► WhitePay wallet
WhitePay wallet ──► off-ramp partner ──► INR/UAH to bank via UPI/IMPS/SEPA/card
```
- WhitePay stays **non-custodial**: keys on the phone. Ramps are licensed partners that hold the fiat.
- **KYC ≠ World ID.** World ID proves a unique human. Ramps also need identity KYC; plan tiers (small limits without full KYC where the law allows).
- Compliance needs: FATF travel rule for transfers above thresholds, sanctions screening, transaction monitoring (the velocity limits exist already).

### India (UPI)
- **Status (verify):** crypto isn't legal tender, and the RBI is cautious. Exchanges and VASPs must **register with FIU-IND** under PMLA. Gains on virtual digital assets are taxed at **30%** plus **1% TDS** on transfers.
- **Paying shops directly in crypto is a grey area for local INR commerce.** The cleaner wedges are:
  1. **Inbound cross-border:** foreign clients pay Indian freelancers, agencies and exporters in USDT. They off-ramp to INR via an FIU-registered partner and receive it over UPI/IMPS.
  2. **Tourists:** visitors pay Indian merchants via QR in USDT, and the merchant gets **INR** through the partner. The merchant never holds crypto.
  3. **Remittances** into India.
- **UPI integration:** an FIU-registered on-ramp offers "Pay with UPI" to buy USDT into a WhitePay wallet, and off-ramps pay out to UPI IDs. Only licensed banks and PSPs can connect to UPI directly, so a partner is required.

### Ukraine
- Whitechain is built by the **WhiteBIT / W Group** ecosystem, which has deep roots in Ukraine, a large user base and exchange liquidity. That's a natural ramp and liquidity partner.
- Stablecoins are widely used for savings and cross-border transfers. Card-based ramps are common.
- **Status (verify):** Ukraine has been finalizing virtual-asset regulation and taxation, and the National Bank restricts some FX and crypto flows under martial law.
- **Fit:** P2P and business payouts in USDT, freelancer income, cross-border payments to suppliers, with off-ramps to UAH cards and accounts via a licensed partner.

### Markets with no UPI-like rail (or with high inflation)
- **Nigeria, Argentina, Turkey, Egypt:** dollar stablecoins as savings and payments. WhitePay's QR + name + no-gas UX fits street merchants.
- **Brazil (Pix), Indonesia (QRIS), Thailand (PromptPay):** like UPI, QR rails exist. WhitePay can mirror their QR UX and bridge via local ramps for cross-border payments.
- **Gulf → South Asia corridors:** worker remittances, settling instantly in USDT and off-ramping at the destination.

## 4. Roadmap to production
1. **Checkout SDK + payment links + webhooks.** Hackathon-critical for Whitechain Operate.
2. **Mainnet** (1875): real USDT, gas budgeting for the relayer, Redis-backed rate limits, monitoring.
3. **One ramp partner** in one corridor (e.g. inbound USD → India freelancers, or WhiteBIT for Ukraine). KYC tiers.
4. **Compliance:** travel rule, sanctions screening, merchant KYB, audit of contracts.
5. **Merchant SaaS:** multi-outlet, staff keys, subscriptions, accounting exports.
6. **Optional, licensed:** Treasury "Earn".
