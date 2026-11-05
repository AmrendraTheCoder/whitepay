# WhitePay wallet architecture

## 1. The pieces
```
 Phone (WhitePay PWA)                     WhitePay server (Vercel)                      Chains
 ────────────────────                     ─────────────────────────                     ──────
 Device wallet(s)  ─┐                     Policy + relayer (holds WBT only) ──────────► Whitechain Sepolia 1874
   key encrypted    │  signs EIP-712      Order checks (MerchantRegistry)                 PaymentRouter, USDT (EIP-3009)
   PIN / fingerprint├─ messages only ───► Arkiv writer (receipts, requests, directory) ─► Arkiv Rabdi 7794095
 Browser wallet ────┘  (never a tx)       ENS admin (issues names) ─────────────────────► Ethereum Sepolia (ENSv2)
   MetaMask, Rabby                        World ID verify (Developer Portal)
```
**The payer never sends a transaction.** Every wallet only *signs a message* (an EIP-3009 `receiveWithAuthorization` for USDT, bound to one order or one recipient). The WhitePay relayer submits it and pays the WBT gas. That's why a wallet with **0 WBT** can pay.

## 2. Wallet kinds (several per phone)
| | Device wallet | Browser wallet (MetaMask, Rabby…) |
|---|---|---|
| Created by | WhitePay ("Create wallet" or "Add wallet") | "Connect MetaMask" |
| Key lives | On this phone only, **encrypted** in browser storage | Inside MetaMask (WhitePay stores only the address) |
| Unlock | Fingerprint/Face ID (passkey PRF → AES key) or 6-digit PIN (PBKDF2 → AES key); 5 wrong PINs = 5 min lock | "Confirm in your wallet" popup |
| Signs | Order payments, P2P pushes, shop orders, name claims | Same messages; WhitePay switches it to Whitechain Sepolia first (EIP-712 domain uses chain 1874) |
| Seed phrase | None shown. Remove = funds lost unless you exported/imported the key | MetaMask's own recovery phrase |

The wallet list is stored on the device as `{ active, list[] }`. **You → Wallets** lets you switch the active wallet, add another, connect MetaMask, or remove one.

> **MetaMask on a phone:** open `whitepay.vercel.app` **inside MetaMask's built-in browser** (MetaMask app → Browser). Ordinary Safari/Chrome on a phone has no `window.ethereum`. On desktop, the MetaMask extension works directly.

## 3. Account types: Personal vs Business (like GPay vs GPay for Business)
| | Personal | Business (shop) |
|---|---|---|
| Name | `you.whitepay.eth`, one per human (World ID action `whitepay-name`) | `shop-handle.whitepay.eth`, issued at shop sign-up |
| Registered in | ENS (text `kind=person`) + Arkiv `whitepay.worldclaim` | `MerchantRegistry` on Whitechain + Arkiv `whitepay.merchant` + ENS (`kind=merchant`) |
| Can | Pay shops, pay and receive from people | Create signed QR orders (5-min Arkiv requests), receive, verified badge |
| Verified | World ID when claiming the name | World ID action `whitepay-shop` → `verified=true` in registry, Arkiv and ENS |

**One wallet = one type.** A wallet with a personal name can't sign up a shop. The app offers "Create a business wallet", so personal and shop money, names and history never mix.

## 4. Seeing your wallet and balance
- **Home banner / Money:** live USDT balance read from Whitechain (`balanceOf`). The eye button hides amounts.
- **You:** your WhitePay ID (ENS name), full address (tap to copy), wallet type, and which wallet is active.
- **Transactions:** every payment in or out, read from **Arkiv receipts**. Each row links to the Whitechain explorer tx.
- **Explorer:** Money → "Explorer" opens `explorer.testnet.whitechain.io/address/<your address>`.

## 5. Adding money (testnet)
1. **From a friend:** show **Receive** (your QR). They pay you USDT with no gas.
2. **Swap:** get WBT at `faucet.testnet.whitechain.io`, swap WBT → **Tether USD `0xcedf…55a7`** on `testnet.yetitrade.fi`, then send it to your WhitePay address (Money → Add money shows it).
3. **From MetaMask:** send USDT on Whitechain Sepolia to your address, or connect MetaMask as a wallet.

Only the official hackathon USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` counts. **USDT.e** and the many "Mock USDT" tokens are different tokens and won't show.

## 6. World ID rules (why "already verified" happens)
World ID 4 uniqueness proofs are **one-time per action**: the same person proving the same action again is refused (`nullifier_replayed`). WhitePay uses this as its "one per human" guarantee:
- `whitepay-name`: one personal name per human.
- `whitepay-shop`: one verified shop per human.
- `whitepay-pay`: step-up for payments above 100 USDT. Set to **unlimited** verifications; each proof is bound to one payment through its signal.

The very first attempt (old action `ens-claim`) was consumed by World's server while ours rejected it (staging/production mismatch). That action is retired, and the new actions start clean.

## 7. Security notes
- Keys never leave the phone. The server never sees a private key, PIN or fingerprint.
- The server re-checks every request: Arkiv owner, order digest, on-chain merchant signer, deadline, limits.
- The relayer can't redirect funds: the payer's signature fixes the recipient (P2P nonce) or the exact order (QR digest).
- Limits: 5 payments/min and 500 USDT/day per payer; World ID step-up above 100 USDT; gas-price cap; simulate before send.
