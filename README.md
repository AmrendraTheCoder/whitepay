# WhitePay

**UPI-style stablecoin payments on Whitechain.** Pay a name like `chai-shop.whitepay.eth` in USDT, with no gas, no seed phrase and no chain knowledge. Merchants get a drop-in checkout, signed orders, collect requests, refunds and an accountant export.

> Built at ETHGlobal Mumbai (Nov 2026). Work in progress. See [docs/BUILD_GUIDE.md](docs/BUILD_GUIDE.md).

## Live on Whitechain Sepolia (chain 1874)

| | Address |
|---|---|
| PaymentRouter (verified) | [`0x9f38d33010345dcd62e26640b539263fa139026e`](https://explorer.testnet.whitechain.io/address/0x9f38d33010345dcd62e26640b539263fa139026e) |
| MerchantRegistry (verified) | [`0xe063c2fb8f80c20ff699f9f211be300f58781f68`](https://explorer.testnet.whitechain.io/address/0xe063c2fb8f80c20ff699f9f211be300f58781f68) |
| USDT (official test token) | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |

**USDT payment settled in the main flow:** [`0x1c9057fc…c362f`](https://explorer.testnet.whitechain.io/tx/0x1c9057fc24477b69f37e8da80b2c1e1bf80908a55a84e908139e07cac86c362f)
- 1 USDT from a customer wallet holding **0 WBT** to `chai-shop.whitepay.eth`.
- Settled through `PaymentRouter.payOrder` with a merchant-signed order.
- Gas was paid by the WhitePay relayer.

## Why onchain stablecoin settlement on Whitechain
A UPI or card payment settles in one country's currency, in bank batches, through licensed intermediaries, and the receipt lives in a private bank database. WhitePay settles each payment atomically in USDT on Whitechain:
- A client in Dubai can pay a studio in Mumbai in seconds.
- There is no "pending" state and no chargeback-style settlement risk.
- Refunds are capped and verifiable by anyone from the transaction hash.
- Anyone can build a front end on the open router, with no bank license.

A regular payment rail can't give a cross-border merchant instant, final, programmable settlement with a public, customer-checkable receipt.

## How a payment works
1. **Merchant backend signs an EIP-712 `Order`** (merchant, amount, orderId, deadline). This is UPI's "Reference ID".
2. **Customer signs USDT `receiveWithAuthorization` (EIP-3009)**, with `to` = router and `nonce` = order digest.
   - The signature can only settle that exact order.
   - Only the router can submit it, so it can't be front-run.
3. **Relayer submits `payOrder` and pays the WBT gas.** The router pulls the USDT, pays the merchant's payout wallet and emits `PaymentSettled`.
4. **Refunds:** the merchant signs an EIP-3009 authorization and the router refunds the original payer. Refunds are capped at the amount paid, and partial refunds are supported.

```bash
node scripts/first-payment.mjs 1   # reproduces the flow above (needs .env)
```

## Payment requests live on Arkiv (Rabdi testnet, chain 7794095)
A payment in progress is a `whitepay.request` entity that lives for its TTL: 5 min for a merchant QR, 30 min max for invoices. It is either **completed** (patched to `paid` and linked to a `whitepay.receipt`) or **depleted** (it expires and vanishes). The same deadline is enforced on-chain.

Before paying, the payer's app trusts the entity only if all four checks pass:
1. `$owner` is the WhitePay writer.
2. The fields re-hash to the signed order digest.
3. The merchant signature matches the `MerchantRegistry` signer on Whitechain.
4. The request is still pending and before its deadline.

**Live run** (`npx tsx --env-file=.env scripts/lifecycle-demo.ts 1 --expiry`):
- Request entity: `0x9eb6f2fc66b0135ab418fbd8c9ca792c20fb51d6b27b2831c60ed4481c8e405e`
- Settled on Whitechain: [`0x355d8505…370cb`](https://explorer.testnet.whitechain.io/tx/0x355d8505a99317c41a2ec3156a9b578a217fb8772c27a974a2de6c728e8370cb)
- Receipt entity: `0x75346a3d7fe9d743d2597d0e2123ef93c9ba9d7273aac05bba2de71112ef637b`
- Rejected as expected: tampered amount, forged signature, entity not owned by WhitePay, paying twice (Arkiv status and on-chain `OrderAlreadyPaid`), and an expired request (gone from Arkiv, `OrderExpired` on-chain).

**Arkiv writer wallet:** `0x4D5910272479420d1383100b3986d5fc9d5D658F`

**Query judges can run** (a merchant's receipts, newest first):
```
arkiv.schema = str('whitepay.receipt') AND $owner = addr(0x4D5910272479420d1383100b3986d5fc9d5D658F) AND merchant = addr(0xCF69aAdd6357Afd3C1b5EcFE3eecA134f49b6e10) ORDER BY paidAt:u64 DESC
```

## The app (`apps/web`, mobile-first PWA)
```bash
npm install && npm run dev        # http://localhost:3000 (reads the root .env)
```
| Screen | What it does |
|---|---|
| `/` customer | Create a device wallet: a 6-digit PIN plus optional fingerprint/Face ID (WebAuthn passkey with PRF). The key is encrypted on the device; no seed phrase. Shows USDT balance and payment history **read from Arkiv** |
| `/scan` | Camera QR scanner, or paste a payment link |
| `/pay?req=<entityKey>` | Fetches the request from Arkiv and shows the 4 verification checks, merchant badge and expiry countdown. Fingerprint or PIN unlocks the key, the device re-hashes the order and signs EIP-3009, then the relayer settles. Expired or already-paid requests are refused |
| `/merchant` | **Sign up a shop**: business name and a handle (`<handle>.whitepay.eth`, with an availability check and reserved names). The phone signs the request, the shop is registered in `MerchantRegistry` on Whitechain, and its profile is published to Arkiv. Then: enter an amount and the **order is signed on the merchant's own device**, giving a QR valid for 5 min. The screen flips to "Received" live and lists receipts from Arkiv |
| `/receive` | Personal QR (UPI "show my QR"), with an optional fixed amount, Share and Copy link |
| `/send` | Pay a person by QR, handle or address. The signature binds recipient + memo (`payDirect`), with no gas |

Tested end to end in the browser with two separate wallets:
- A wallet signed up as **Masala Corner** (`masala-corner`): registered on-chain, profile on Arkiv, shown as "Unverified".
- The shop signed a 0.20 USDT QR on its device, and a second customer (0 WBT) paid it with the PIN. The shop screen showed "Received".
- The customer scanned the shop's Receive link and sent 0.10 USDT P2P. Arkiv history shows both, tagged `p2m` and `p2p`.

Earlier test with the demo merchant:
- The merchant created a 0.50 USDT QR.
- The customer wallet (0 WBT) paid it with the PIN.
- The merchant screen updated live.
- Re-opening the QR shows "Already paid".

`scripts/p2p-send.ts` sends a gasless person-to-person payment (`payDirect`) to any address.

## Repo layout
```
contracts/          Foundry: PaymentRouter, MerchantRegistry, tests, deploy script
packages/shared/    chain config, EIP-712 types, UPI-derived limits, Arkiv schemas
scripts/            wallet generation, first-payment demo
deployments/        deployed addresses and tx hashes
docs/               build guide, architecture, risks, sponsor notes, Arkiv reference
```

## Setup
```bash
npm install
cd contracts && forge test        # 17 tests incl. fuzz
cp .env.example .env              # or: ./scripts/gen-wallets.sh (writes fresh keys, prints addresses only)
```

## Current limitations
- One payment per onchain transaction (hundreds of TPS on one L2). UPI-scale volume would need batching or net settlement.
- The relayer is centralized and holds only WBT; anti-drain policy (rate limits, gas caps) is in progress.
- ENS names, Arkiv receipts, World ID verification and the customer app are not built yet.

## AI usage
Built with Claude Code (Anthropic) assisting with research, contract code, tests and docs. All on-chain actions were run and checked by the team.

## License
MIT
