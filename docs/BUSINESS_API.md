# WondrPay for Business: architecture (phase 1)

Self-serve merchant portal, API keys and hosted checkout on top of the existing gasless payment stack.
PRD: https://claude.ai/artifact/CGUkV7FU6MynNEuc6zKQ3J · Public docs: `/developers#api` · Portal: `/portal`.

## 1. Architecture

```
 Shop's server ──Bearer wp_sk──▶ /api/v1/checkout/sessions ─┐           Whitechain Sepolia
                                                            │   ┌──────────────────────────────┐
 Shop owner ──wallet signature──▶ /api/business/sites ──────┼──▶│ MerchantRegistry              │
   (portal /portal)                                         │   │  signer = WondrPay order key  │
                                                            │   │  payout = shop wallet (fixed) │
 Customer ─▶ /checkout/:id (hosted) ─▶ /pay?req=:id ─▶ /api/pay ─▶ PaymentRouter.payOrder  ───▶ USDT to payout
                     ▲   polls /api/requests/:id                       │
                     └──────── redirect to successUrl ◀────────────────┘
                                                            │
                                     Arkiv (data layer) ◀───┘  whitepay.site · whitepay.request · whitepay.receipt
                                     Webhook ──signed──▶ shop's server (checkout.session.completed)
```

Layers:

| Layer | What | Where |
|---|---|---|
| Edge | CSP, method allow-list, JSON-only writes, body cap, per-IP rate limits, cross-site write block (except `/api/v1/`) | `apps/web/proxy.ts` |
| API | v1 public API (secret key), portal API (wallet-signed), existing pay/requests APIs | `apps/web/app/api/**` |
| Domain | sites + keys + sessions; order signing/verification; relayer; webhooks | `packages/server/src/{sites,requests,orders,relayer,webhooks}.ts` |
| Data | Arkiv entities owned by WondrPay's writer; on-chain registry + router are the source of truth for money | `packages/shared/src/arkiv.ts`, `contracts/src` |
| UI | portal, hosted checkout, pay page, docs | `apps/web/app/{portal,checkout,pay,(site)/developers}` |

## 2. Key design decision: delegated order signing

`PaymentRouter.payOrder` accepts an order only if it's signed by the shop's **registered signer**, and always pays the
shop's **registered payout**. Turning on a website sets `signer = WondrPay order key` via `MerchantRegistry.update`
(admin), after the shop wallet signs an approval (`siteApprovalMessage`, names the order key, 10-minute window).
Payout is never touched, so:

- a leaked secret key can create checkouts but cannot move or redirect money;
- shops keep signing their own QR orders in the app: WondrPay countersigns orders signed by the shop wallet
  (`preparePaymentRequest`, and `verifyRequest` for orders created just before the switch);
- revoking the last website hands the signer back to the shop wallet.

## 3. Data flow: one checkout

1. Shop server `POST /api/v1/checkout/sessions` → `authenticateSecretKey` (parse siteId from key, sha256, `timingSafeEqual`).
2. `createCheckoutSession`: validate amount (decimal string → micro-USDT bigint), reference, return URLs (https on the
   site's domains), TTL → `preparePaymentRequest` signs the EIP-712 order with the order key → respond **201** with
   `id = order digest` right away; the Arkiv write runs in `after()` with 3 retries.
3. Customer opens `session.url` (`/checkout/:id`): polls `/api/requests/:id` every 2.5 s (paused while hidden), QR on
   desktop, button on phones → `/pay?req=:id` where their own wallet re-computes the digest and signs EIP-3009.
4. `/api/pay` → `verifyRequest` (owner, digest integrity, registry signer, state) → relayer pays gas → router settles.
5. After the response: Arkiv receipt, scratch card, webhook `checkout.session.completed` (EIP-191 signed, SSRF-guarded).
6. Hosted page sees `paid` → redirects to `successUrl?wondrpay_session=…&wondrpay_status=paid` after 5 s.

## 4. API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/checkout/sessions` | `Bearer wp_sk_test_…`, optional `Idempotency-Key` | create session |
| GET | `/api/v1/checkout/sessions/:id` | secret key (own site only) | status `open/paid/expired` + payment |
| GET | `/api/business/sites?merchant=` | public (no secrets) | list websites + order key address |
| POST | `/api/business/sites` | shop wallet signature | `create` / `rotate` / `revoke` |
| GET | `/api/requests/:id` | public | status for hosted checkout and Pay button |

Errors: `{ error: { type, message } }`, statuses 400/401/403/404/409/429/500 (`SiteError`).

## 5. Schema (Arkiv, owned by WondrPay's writer)

`whitepay.site` (MerchantSite): `siteId`(idx) · `merchant`(idx) · `name` · `domains` · `webhook?` · `mode`(idx) ·
`publishableKey`(idx) · `secretHash` (sha256 hex) · `secretHint` (last 4) · `status`(idx: active|revoked) ·
`createdAt`(idx) · `updatedAt` · `approval` (bytes, the owner's signature: auditable by anyone).

`whitepay.request` (PayRequest) gains: `site`(idx) · `reference`(idx) · `successUrl` · `cancelUrl`.

Readers must filter `ownedBy(writer)`: anyone can write an entity with these schema names.

## 6. Caching

| Key | TTL | Invalidated |
|---|---|---|
| `site:<id>` | 5 s (only non-null cached) | on create/rotate/revoke (same instance); bounds how long a rotated key works elsewhere |
| `registry:<merchant>` | 30 s | on signer change; `verifyRequest` re-reads once on a signer mismatch (other instances) |
| `status:<id>` | 1.5 s | shared by all polls of one checkout |
| Idempotency | 24 h, per instance | n/a: duplicates on another instance are harmless (sessions expire) |

Cross-instance staleness: a rotated/revoked key keeps working on other instances for up to 5 s. For live keys move
`site:`, idempotency and the per-shop write lock to a shared store (Redis/Upstash).

## 7. Edge cases handled

- Approval signed by anyone but the shop wallet → 401; older than 10 minutes → 400; siteId reuse → 409.
- Signer switch fails after the site record is written → record set back to `revoked`.
- Float amounts (`0.1 + 0.2`) → 400; > 1000 or < 0.01 USDT → 400.
- Return URLs: https only (http only for localhost), on the site's domains or subdomains, no credentials.
- A key can't read another site's sessions (404, no existence leak beyond "not found").
- Session created before its Arkiv write lands: hosted page shows "Getting your checkout ready…" and keeps polling.
- Orders signed by the shop wallet before it switched on API keys still verify (countersigned at pay time).

- Approvals are public on Arkiv, so they're single use: `issuedAt` must be newer than the site's `updatedAt`.
- Forged Arkiv entities (anyone can write the schema name): sessions are looked up by digest in WondrPay-owned entities
  only, fields must re-hash to the digest, "paid" comes from the chain; the hosted page and `/api/requests` refuse
  foreign entities, and return URLs must be `https:` (or `http://localhost`), never `javascript:`.
- All `str` fields fit Arkiv's 128-byte limit (URLs, joined domains, byte-trimmed names and descriptions).
- Per-shop write lock: no double creates; a revoke re-checks for websites created meanwhile before handing the signer back.

## 8. Review log

An independent review found 3 high issues (forged "paid" sessions, open redirect/`javascript:` URL from a forged
entity, replayable rotate approvals), 3 medium (60 s key cache, Arkiv byte limits, revoke/create race) and 4 low; all
fixed above and covered by the test.

## 9. Tests

`npx tsx --env-file=.env scripts/business-flow-test.ts`: real testnet run of sign-up → keys → session → gasless
payment → paid status → shop-signed QR still works → bad keys / foreign URLs / float amounts refused → rotate → revoke
→ rotate replay refused → signer handed back. 26 checks, all passing.

## 10. Phase 2 (shipped)

| Piece | Where |
|---|---|
| Webhook delivery log (`whitepay.webhook`, 30 days: event, URL, HTTP status, tries, exact body), **Resend** (same bytes + event id) and **Send test webhook** (`test.ping`), wallet-approved, single use | `business.ts`, `POST /api/business/webhooks`, portal |
| Integration check per website: keys, first paid checkout, webhook set, last webhook answered 2xx; last payment | `siteHealth`, `GET /api/business/sites/:id/health` |
| Payment links (`whitepay.paylink`): fixed title + price on a website; `/l/:id` page; each visit = fresh session (`reference: link:pl_…`); stats from receipts | `createLink/disableLink/sessionFromLink`, `/api/business/links`, `/api/v1/links/:id[/session]` |
| Receipts now carry `site`, `link`, `reference` | `settleOnArkiv` |
| Checkout SDK **v1.4.0**: `<wondrpay-button link="pl_…">` works on a page with no server; error messages from the v1 API shape | `/sdk/v1.4.0/checkout.js` (SRI pinned) |
| MetaMask / browser wallet on the hosted checkout (EIP-3009 signature, no gas) | `/checkout/:id` |
| Node helpers `createWondrPayCheckoutSession`, `getWondrPayCheckoutSession` | `packages/checkout/src/server.ts` |
| Demo store creates orders with its API key (`WONDRPAY_SECRET_KEY`); the old key-signed flow stays as a fallback | `apps/demo-store/app/api/create-order` |

Arkiv's attribute index can trail a fresh patch by several seconds, so anything that must stop at once (a revoked or
rotated key, a switched-off link) is re-read with `getEntity` by key before use.

Test: `npx tsx --env-file=.env scripts/business-phase2-test.ts` (link → session → payment → link stats → health → ping →
log → resend → all green → link off). 15 checks.

## 11. Phase 3

Shipped:

| Piece | Where |
|---|---|
| Teammates (`whitepay.member`): owner adds a wallet as **developer**; developers may rotate keys, create/disable links, ping/resend webhooks; owner only: websites + team. Every action is signed by the acting wallet (`actor`) and its role is checked live (`roleOf`, re-read by key, 3 s cache) | `team.ts`, `/api/business/team`, portal Team + developer view |
| Local currency next to USDT ("≈ ₹1,165") on the hosted checkout and payment links, from the browser locale; rates from CoinGecko, cached 10 min, stale up to 6 h, display only | `fx.ts`, `/api/fx`, `lib/fx.ts`, `local-amount.tsx` |

Test: `scripts/business-phase3-test.ts` (14 checks).

Not built, and why:

| Item | Blocker |
|---|---|
| Live keys on mainnet | No mainnet deployment of the router/registry and no real-USDT relayer budget yet |
| Refund allowance (refunds without the owner's wallet each time) | The router only accepts refunds signed by the payout wallet per refund; needs a new router function (allowance-capped `refundFrom`) and a redeploy |
| WooCommerce plugin | Can be written against the v1 API, but needs a WordPress + PHP test environment (Docker) to ship tested |
| Shopify | Shopify only lists payment providers through its Payments Partner program; until then shops can use payment links |
| Shared cache for keys/idempotency | Needs a Redis/Upstash (or Vercel KV) instance on the account |
