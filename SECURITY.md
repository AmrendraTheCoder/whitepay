# WondrPay security model

Run the live attack suite yourself: `scripts/security-check.sh` (27 checks against production WondrPay + the demo store).

## Money layer (on-chain, cannot be bypassed by any server bug)

| Threat | Protection |
|---|---|
| Price tampering | The shop key signs `merchant, amount, orderId, deadline` (EIP-712); `PaymentRouter` settles only that amount, before the deadline, once. |
| Replay / double spend | EIP-3009 `receiveWithAuthorization` nonces are single-use in the USDT contract; the order nonce is the order digest. |
| Front-running a signed authorization | `receiveWithAuthorization` (not `transferWithAuthorization`): only the router can execute it. |
| Refund abuse | Only the shop's payout wallet can authorize, money goes only to the original payer, capped at what was paid (`RefundExceedsPaid`). |
| Relayer drain | Relayer holds only WBT (gas), never USDT; gas-price cap, per-payer rate + daily limits, simulation before sending, relayer allow-list on the router. |

## Keys

- Shoppers' keys never leave the phone: AES-GCM encrypted with a PIN (PBKDF2, 5-try lockout) or a passkey PRF secret. Unlocked once per tab session (15 idle minutes, `sessionStorage`, cleared on lock).
- External wallets (MetaMask via WalletConnect) still approve every signature in the wallet; WondrPay adds its own PIN/fingerprint gate.
- Shop keys stay on the shop's server (`createWondrPayOrder`). Server secrets live only in Vercel env vars; `.env` is git- and deploy-ignored.

## Web layer (both apps, `proxy.ts` + `@whitepay/shared/security`)

| Threat | Protection |
|---|---|
| XSS / injected scripts | Per-request nonce CSP with `'strict-dynamic'`, `object-src 'none'`, `base-uri 'none'`; every page is dynamically rendered so the nonce is fresh. |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY`. |
| Transport / sniffing | HSTS (2 years, preload), `nosniff`, strict referrer policy, Permissions-Policy (camera only where the scanner needs it), COOP. |
| CSRF | Writes must be `application/json`; cross-site `Origin` is refused on wallet-signed endpoints. |
| Abuse / brute force | Per-IP sliding-window rate limits per route (e.g. name claims 6/min, payments 20/min, store orders 12/min), body caps (16–32 KB), method allow-list. |
| Prototype pollution | Catalog lookups use `Object.hasOwn` (`sku: "__proto__"` → 400). |
| Info leaks | Generic error messages from the store, no `X-Powered-By`, `no-store` on APIs. |

## Checkout SDK (`/sdk/v1/checkout.js`)

- Versioned path + Subresource Integrity (sha384) on every embed: a modified file is refused by the browser.
- No `innerHTML` with network data: every field is regex-validated, written with `textContent` / `setAttribute`; links are `noopener noreferrer`.
- `order-endpoint` must be same-origin; the pay URL must be exactly `https://wondrpay.vercel.app/pay?req=<32-byte key>`.
- The `wondrpay:paid` browser event is a UI hint only. Shops fulfil from the signed webhook + on-chain check.

## Webhooks

- **Signed:** EIP-191 signature by a dedicated key (`0x27d2F6770F18E1C0Eefc129124747407Ef44aBe1`, published at `/api/webhook-key`) over `whitepay-webhook:v1:<timestamp>:<keccak256(body)>`.
- **Replay-proof:** rejected if older than 5 minutes; unique `x-whitepay-event-id` for de-duplication.
- **SSRF-proof:** https on port 443, hostname only (no IP literals, no credentials), every resolved address must be public (blocks loopback, RFC1918, link-local / cloud metadata, CGNAT, ULA). Checked at order creation and again before every delivery (DNS rebinding); redirects are not followed; 5 s timeout; 3 attempts.
- **Defence in depth:** the merchant SDK's `verifyWondrPayPayment` confirms `PaymentSettled` on Whitechain before fulfilment.

## Known limits (testnet hackathon build)

- Rate limits are per server instance (in-memory). Production: shared store (Upstash/Vercel KV) or the Vercel Firewall.
- The demo store's webhook de-duplication is in-memory; a real shop uses a unique key in its database.
- `style-src 'unsafe-inline'` is allowed because React style attributes need it; styles cannot execute script.

## Autopay (subscriptions): one signature

The subscriber signs **one** EIP-2612 `permit`. Its spender is a per-subscription `AutopayMandate` clone
(`AutopayFactory` `0x00F61E008AAC480f3D81F959d659c43dDe72ac66`, `contracts/src/Autopay.sol`) whose address is
derived from every term (subscriber, merchant, amount, period, start, grace, cycles, id). One wallet prompt = consent
to exactly those terms. The app reads the clone address from the chain itself, never from the WondrPay server.

| Threat | Protection (enforced by the clone / token, tested in `contracts/test/Autopay.t.sol`) |
|---|---|
| Charging more or to someone else | Changing any term changes the clone address, which has no allowance (`NoAllowance`). The permit caps the total at amount × cycles. |
| Charging early | `charge()` only works from 30 s before a cycle's due time (`NotDue`). |
| Charging late / catching up | A cycle whose grace window closed is skipped forever, never charged late. |
| Double charge | One charge per cycle (`nextCycle`), at most `cycles` times (`Finished`); restarting can't re-charge. |
| Front-running the permit | Harmless: `start()` tolerates an already-applied permit. |
| Cancel | One EIP-712 signature (verified by the clone), or a direct call by subscriber or merchant; `cancelled` blocks every future charge. |
| Keeper downtime | Idempotent keeper (cron, GitHub Actions, app); anyone may call `charge()`, which can only pay the merchant on schedule. |
