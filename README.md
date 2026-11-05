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
