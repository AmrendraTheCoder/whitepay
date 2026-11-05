# WhitePay security model

Run the live attack suite yourself: `scripts/security-check.sh` (27 checks against production WhitePay + the demo store).

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
- External wallets (MetaMask via WalletConnect) still approve every signature in the wallet; WhitePay adds its own PIN/fingerprint gate.
- Shop keys stay on the shop's server (`createWhitePayOrder`). Server secrets live only in Vercel env vars; `.env` is git- and deploy-ignored.

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
- `order-endpoint` must be same-origin; the pay URL must be exactly `https://whitepay.vercel.app/pay?req=<32-byte key>`.
- The `whitepay:paid` browser event is a UI hint only. Shops fulfil from the signed webhook + on-chain check.

## Webhooks

- **Signed:** EIP-191 signature by a dedicated key (`0x27d2F6770F18E1C0Eefc129124747407Ef44aBe1`, published at `/api/webhook-key`) over `whitepay-webhook:v1:<timestamp>:<keccak256(body)>`.
- **Replay-proof:** rejected if older than 5 minutes; unique `x-whitepay-event-id` for de-duplication.
- **SSRF-proof:** https on port 443, hostname only (no IP literals, no credentials), every resolved address must be public (blocks loopback, RFC1918, link-local / cloud metadata, CGNAT, ULA). Checked at order creation and again before every delivery (DNS rebinding); redirects are not followed; 5 s timeout; 3 attempts.
- **Defence in depth:** the merchant SDK's `verifyWhitePayPayment` confirms `PaymentSettled` on Whitechain before fulfilment.

## Known limits (testnet hackathon build)

- Rate limits are per server instance (in-memory). Production: shared store (Upstash/Vercel KV) or the Vercel Firewall.
- The demo store's webhook de-duplication is in-memory; a real shop uses a unique key in its database.
- `style-src 'unsafe-inline'` is allowed because React style attributes need it; styles cannot execute script.

## Autopay (subscriptions)

| Threat | Protection |
|---|---|
| Merchant / WhitePay charging early or extra | Each cycle is a separate EIP-3009 authorization with its own `validAfter`/`validBefore` window (due − 30 s … due + grace), fixed amount, fixed payee (nonce = router `directNonce(merchant, memo)`), `to` = router. The USDT contract enforces all of it. |
| Replaying a payment | Every cycle nonce is single-use on-chain; re-posting an approval is rejected (plan already used / nonce used). |
| "Cancel" that doesn't really cancel | Cancelling submits USDT `cancelAuthorization` for every unused cycle, burning the nonces on-chain. |
| Stolen pre-signed authorizations (they live on Arkiv) | Useless to an attacker: `receiveWithAuthorization` requires `msg.sender == to` (the router), and the router only accepts allow-listed relayers. |
| Forged plan | Plans are EIP-712 signed by the shop key / registered signer and re-verified against MerchantRegistry at subscribe time. |
| Keeper downtime | Each cycle has a grace window; the keeper is idempotent and can be triggered by cron, GitHub Actions or the app; a missed window marks the mandate `failed` (no late surprise charge possible). |
