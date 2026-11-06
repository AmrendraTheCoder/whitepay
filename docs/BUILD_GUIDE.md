# WondrPay: End-to-End Build Guide

"GPay/UPI on Whitechain": pay a name (ENS) in USDT with no gas for the payer, merchant checkout with signed orders, collect requests, refunds and disputes, receipts on Arkiv, World ID for one-name-per-human and step-up checks.

> **Facts verified on 2026-11-05** against primary sources: docs.whitechain.io, the Blockscout API and live RPC probes, docs.ens.domains, docs.world.org / auth.world.org, docs.arkiv.network and the npm registry. Items marked ⚠️ could not be verified. Re-check anything marked ⚠️ before relying on it.

---

## 0. Corrections to earlier docs (the research changed these)

| Topic | Earlier assumption | Verified now |
|---|---|---|
| Whitechain RPC | Not specified | `https://rpc.testnet.whitechain.io` (wss: `/ws`), 50 req/s per IP. **Don't use** `rpc-testnet.whitechain.io` or viem's `whitechainTestnet`: that is the retired chain 2625. Use viem `whitechainSepolia`. |
| Whitechain mainnet | "Arriving November" | Launched 26 Oct 2026, chain **1875**. We still build on testnet **1874** (required). |
| USDT `0xcedf…f55a7` | Unknown if gasless works | ✅ `TetherTokenV2` behind a proxy: **EIP-3009 + EIP-2612**, 6 decimals, domain `{name:"Tether USD", version:"1", chainId:1874}`. Blocklist yes, not pausable. **Our gasless plan works.** |
| Second USDT | n/a | The docs only mention `0xaa79…8f46` "USDT.e" (bridged, permit only, **no EIP-3009**). The hackathon requires `0xcedf…`, so use that one. |
| Test USDT | "Faucet" | The faucet gives **WBT only** (0.5/24h, GitHub account ≥30 days old). ⚠️ How to get `0xcedf…` USDT is undocumented. **Ask the Whitechain booth.** |
| Smart wallets | Use a provider | No bundler, paymaster or embedded-wallet provider is confirmed for 1874 (⚠️). EntryPoint v0.6/v0.7/v0.8, Permit2 and Multicall3 **are** deployed. **Decision: passkey/EOA + our own relayer**, no 3rd-party AA. |
| ENSv2 | "Live" | ✅ Live on **Sepolia and mainnet** (blog dated 27 Oct 2026). The deployments page still has mixed wording. |
| ENS resolver model | Permissioned Resolver per name | A **resolver belongs to an account**; EAC setter grants apply to every name that resolver serves. **Decision: the WondrPay backend owns one resolver and writes all user records.** |
| ENS registration | Pay in ETH | Pay in **USDC/DAI** (Sepolia has a `MockUSDC` anyone can mint). Commit, wait ≥60s, reveal. 5+ characters = $8/yr. |
| World "Agent Pass" | An SDK | ⚠️ The docs never say "Agent Pass". auth.world.org is **World IdP** (OIDC + step-up). The "mocked proofs" claim is also undocumented. **Ask the World booth.** |
| World IDKit | v2/v3 | **IDKit 4.x** (`@worldcoin/idkit` 4.6.0). Each request needs a backend-signed RP signature. Verify via `POST https://developer.world.org/api/v4/verify/{rp_id}`. |
| Arkiv SDK | payload/annotations/BTL | **`@arkiv-network/sdk` 1.0.1**, a schema-based rewrite: `defineSchema`, `createEntity`, `patchEntity`, `select().from().where()`. Max expiry ≈ **182.5 days**. Rabdi gas token **tGLM**. |
| Arkiv "indexer" URL | A query API | ⚠️ It serves the explorer page. Query through the RPC/SDK only. |

---

## 1. What you must acquire manually (humans only)

Do these **first**. Several have waiting periods.

### Accounts and sign-ups
| # | Item | Where | Notes / time |
|---|---|---|---|
| A1 | GitHub account **≥30 days old** for each teammate who uses the faucet | github.com | Needed for the Whitechain faucet |
| A2 | Public GitHub repo + MIT license, **first commit today** | github.com | Judges check for steady commits |
| A3 | Ankr RPC hacker activation (optional backup RPC) | https://www.ankr.com/rpc/?utm_referral=Whitechain2026 | `https://rpc.ankr.com/whitechain_testnet` works; it's unofficial |
| A4 | World Developer Portal app → `app_id`, `rp_id`, `RP_SIGNING_KEY`; create actions `ens-claim` and `step-up` | https://developer.world.org | Click "Enable World ID 4.0" if asked |
| A5 | (If targeting Agent Pass) World IdP client → `client_id`/`client_secret` (shown **once**), callback URLs | https://auth.world.org/portal | Sandbox identity takes **~1 hour** to issue, so start early |
| A6 | Arkiv access key (Rabdi) | https://hub.arkiv.network/access-keys | Per wallet; sign in + captcha. Add an IP allowlist for the server |
| A7 | Vercel (or similar) account for the live demo URL | vercel.com | ENS requires a live demo link |
| A8 | (Optional, Swarm bonus) Bee node or stamp access, xBZZ + xDAI on Gnosis | docs.ethswarm.org | Skip unless ahead of schedule |

### Wallets
Create **fresh** keys. Never reuse a personal wallet, and never paste a private key into chat.

| Wallet | Purpose | Needs |
|---|---|---|
| `DEPLOYER` | Deploys and owns contracts on 1874 | WBT |
| `RELAYER` (2–3 keys) | Submits gasless transactions | WBT (main ongoing cost) |
| `ORDER_SIGNER` | Merchant backend signs orders (demo merchant) | None (signing only) |
| `ENS_ADMIN` | Owns `wondrpay.eth`, the subname registry and the resolver on Sepolia | Sepolia ETH + MockUSDC |
| `ARKIV_WRITER` | Backend writer and owner of entities | tGLM |
| `CUSTOMER_DEMO`, `MERCHANT_DEMO` | Demo actors | USDT (customer). The merchant needs none (gasless refunds) |

### Funds
| Asset | Source | Amount to aim for |
|---|---|---|
| WBT on 1874 | https://faucet.testnet.whitechain.io (0.5/24h per wallet/IP/GitHub) | ~1–2 WBT total. Pool claims from teammates on **different networks** (limits are per IP) |
| **USDT `0xcedf…` on 1874** | ⚠️ **Whitechain booth / Discord.** The Portal bridge (bridge.testnet.whitechain.io) gives USDT.e, not this token | ≥100 USDT to the customer wallet |
| Sepolia ETH | https://ethglobal.com/faucet (or any Sepolia faucet) | ~0.2 ETH for `ENS_ADMIN` |
| MockUSDC (Sepolia) | `MockUSDC.mint` at `0x240b0316df57887dbbe58b586508b19e633a14aa` (open mint) | Enough for one 5+ character name ($8/yr) |
| tGLM (Arkiv) | https://hub.arkiv.network/faucet (⚠️ amount and cooldown unknown) | Claim on `ARKIV_WRITER` early |

### Questions to ask at booths (write the answers into `docs/booth-answers.md`)
1. **Whitechain:** How do we get test USDT at `0xcedf…f55a7`? Can one project enter both Operate and Scale?
2. **World:** What exactly is "World ID Agent Pass" (World IdP OIDC?), and how do the "mocked proofs" work (which environment and `acr`)?
3. **ENS:** Is a backend-owned PermissionedResolver plus a UserRegistry subname setup "central enough"? Is there any ENSv2 Sepolia gotcha?
4. **Arkiv:** Faucet amount and cooldown, access-key quota, and is a backend-owned entity design OK for "how you use Arkiv"?

---

## 2. Prize selection (cap of 3 partner prizes)
- **Build all four layers as feature flags** and decide on the final day.
- Default submission: **Whitechain Operate**, **ENS Best Use of ENSv2**, and **Arkiv Build (from scratch)**, with **World** as the swap-in if its layer is stronger.
- World is still used in the product either way. It just isn't selected as a prize if we stay at 3.

---

## 3. Tech stack (decisions)
| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces (+ turbo optional) | One repo, shared types |
| Contracts | **Foundry**, solc 0.8.2x, `evm_version = "prague"`, OpenZeppelin | Blockscout verification documented by Whitechain |
| Chain client | **viem ≥ 2.35** (ENSv2 reads need it), wagmi | ENSv2 readiness requirement |
| Customer app | Next.js (App Router) PWA, mobile-first | Live link, QR camera, passkeys |
| Merchant dashboard | Same Next.js app, `/merchant` route | Faster than a second app |
| Backend | Next.js API routes (Node runtime) + a small Postgres or SQLite (Neon/Turso) | Nullifiers, orders, rate limits |
| Relayer | Node worker inside the API (or a separate `apps/relayer`) with viem wallet clients | Our own gas sponsor |
| Checkout SDK | `packages/checkout`: vanilla TS web component `<wondrpay-button>` + React wrapper | "20 lines" integration |
| Demo store | `apps/demo-store` (Vite) using the SDK | A separate demo app, as required |
| Wallet UX | Embedded EOA from a passkey-protected key (WebAuthn PRF), or plain MetaMask fallback | No AA provider confirmed on 1874 |
| World | `@worldcoin/idkit` 4.x (+ `openid-client` if World IdP) | |
| Arkiv | `@arkiv-network/sdk` 1.0.1, optional `arkiv-encryption` | |
| Hosting | Vercel (web), Railway/Fly (relayer if long-running) | |

### Repo layout
```
whitepay/
├─ contracts/                 # Foundry
│  ├─ src/PaymentRouter.sol
│  ├─ src/MerchantRegistry.sol
│  ├─ script/Deploy.s.sol
│  └─ test/*.t.sol
├─ apps/
│  ├─ web/                    # Next.js PWA: customer + /merchant + /api/*
│  └─ demo-store/             # separate store using @whitepay/checkout
├─ packages/
│  ├─ checkout/               # SDK / widget
│  ├─ shared/                 # ABIs, chain configs, EIP-712 types, Arkiv schemas
├─ arkiv/                     # schema.md, friction.md, reach.md, why-arkiv.md, how-you-use-arkiv.md (+ swarm.md)
├─ docs/
├─ deployments/1874.json
├─ README.md  WHITECHAIN_FEEDBACK.md  WORLD_FEEDBACK.md  LICENSE
```

### Environment variables (`.env.example` is committed, `.env` is never committed)
```
# Whitechain
WC_RPC_URL=https://rpc.testnet.whitechain.io
WC_RPC_FALLBACK=https://rpc.ankr.com/whitechain_testnet
USDT_ADDRESS=0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7
DEPLOYER_PK=  RELAYER_PKS=pk1,pk2  ORDER_SIGNER_PK=
ROUTER_ADDRESS=  REGISTRY_ADDRESS=
# ENS (Sepolia)
SEPOLIA_RPC_URL=  ENS_ADMIN_PK=  ENS_PARENT=wondrpay.eth
ENS_USER_REGISTRY=  ENS_RESOLVER=
# World
WORLD_APP_ID=  WORLD_RP_ID=  RP_SIGNING_KEY=  WORLD_ENV=staging
WORLD_IDP_CLIENT_ID=  WORLD_IDP_CLIENT_SECRET=  WORLD_IDP_ISSUER=https://auth.world.org
# Arkiv
ARKIV_ACCESS_KEY=  ARKIV_WRITER_PK=
# App
DATABASE_URL=  WEBHOOK_SECRET=  NEXT_PUBLIC_APP_URL=
```

---

## 4. Architecture (UPI-inspired; details in `upi-inspired-architecture.md`)
```
Customer PWA ──resolve name (ENS, Sepolia, coinType 2147485522)──► payee address on 1874
     │ signs EIP-3009 receiveWithAuthorization (nonce = orderHash)
     ▼
API: policy layer (limits, velocity, World step-up, order check) ──► Relayer (WBT gas)
                                                                       │
                                     PaymentRouter (1874) ◄────────────┘
                                     pulls USDT → pays merchant → emits PaymentSettled
                                                                       │
                       Indexer (watch events) ──► Arkiv: Receipt / PaymentRequest / Dispute / DailyReport
Merchant site ─ @whitepay/checkout ─ server-signed Order ─┘   Merchant dashboard reads Arkiv + chain
```

### Core flow: gasless order payment
1. The merchant backend creates an `Order {merchant, amount, orderId, deadline}` and signs it (EIP-712, `ORDER_SIGNER`). This is UPI's "Reference ID".
2. The customer app shows the merchant's ENS name, verified badge, amount and expiry. The customer signs USDT **`receiveWithAuthorization`** with `to = PaymentRouter` and **`nonce = orderHash`**. Because only `to` may submit it, it can't be front-run, and the nonce binds the signature to this exact order.
3. The API checks the order signature, deadline, limits and velocity, and asks for World step-up if over the limit. The relayer then calls `router.payOrder(order, orderSig, auth)`.
4. The router verifies the order, marks `orderId` used, calls `USDT.receiveWithAuthorization`, transfers to the merchant payout address, and emits `PaymentSettled(paymentId, orderId, merchant, payer, amount)`.
5. The indexer writes a `Receipt` entity to Arkiv and fires the merchant webhook (HMAC-signed).

**Refund (gasless for the merchant):** the merchant signs `receiveWithAuthorization(to = router, nonce = refundHash)`. `router.refund(paymentId, amount, auth)` checks `refunded + amount ≤ paid` and pays the **original payer** only.

**Collect request:** a verified merchant creates a `PaymentRequest` entity on Arkiv with an expiry of 1 min to 45 days (UPI rules), status `pending`. The customer sees it, approves (same flow as above) or rejects. The status is patched to `paid`/`rejected`, or it expires on its own.

**Dispute:** the customer taps a receipt and raises a dispute, which creates a `Dispute` entity referencing the `paymentId`. The merchant resolves it with a refund, and the dispute is patched to `resolved`.

---

## 5. Contracts spec (Foundry)

### `PaymentRouter.sol`
```solidity
struct Order { address merchant; uint256 amount; bytes32 orderId; uint64 deadline; }
// EIP-712 domain: name "WhitePayRouter", version "1", chainId 1874, verifyingContract this

function payOrder(Order calldata o, bytes calldata merchantSig,
    address payer, uint256 validAfter, uint256 validBefore, bytes calldata payerAuthSig) external;
// - require registry.isActive(o.merchant), signer == registry.signerOf(o.merchant)
// - require !usedOrder[o.orderId], block.timestamp <= o.deadline
// - nonce = hashOrder(o); USDT.receiveWithAuthorization(payer, address(this), o.amount, validAfter, validBefore, nonce, payerAuthSig)
// - SafeERC20 transfer to registry.payoutOf(o.merchant); store Payment{payer, merchant, amount, refunded}
// - emit PaymentSettled(paymentId, o.orderId, o.merchant, payer, o.amount)

function refund(bytes32 paymentId, uint256 amount, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes calldata merchantAuthSig) external;
// - caps at amount paid; pays original payer; emit Refunded(paymentId, amount, totalRefunded)

function payDirect(...)  // optional P2P push to a name (no order), for "send to friend"
```
Use `ReentrancyGuard` and `SafeERC20`, never hard-code 18 decimals, and add an `onlyRelayer` modifier (optional, reduces griefing). Events are the source of truth for receipts.

### `MerchantRegistry.sol`
`register(merchant, payout, signer, ensNode)`, `setVerified(merchant, bool)` (admin, after World + manual review), `isActive`, `signerOf`, `payoutOf`. Keep it small.

### Deploy and verify
```bash
forge script script/Deploy.s.sol --rpc-url $WC_RPC_URL --private-key $DEPLOYER_PK --broadcast
forge verify-contract <addr> src/PaymentRouter.sol:PaymentRouter \
  --rpc-url https://rpc.testnet.whitechain.io \
  --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/
#  ^ trailing slash required
```
Write the addresses to `deployments/1874.json` and the README. **Make the first real USDT payment as early as possible** and paste its explorer link into the README (a qualification requirement).

### Tests (minimum)
- Happy path pay
- Replayed `orderId` reverts
- Expired order reverts
- Wrong merchant signature reverts
- Refund over the paid amount reverts
- Partial refunds add up correctly
- Refund goes to the payer only
- Front-run attempt with `receiveWithAuthorization` from a non-router caller fails

Use a mock EIP-3009 token in unit tests, plus one fork test against the real USDT on 1874.

---

## 6. Relayer and policy layer (Whitechain "Scale" angle)
- **Endpoint:** `POST /api/relay/pay`. Flow: validate the body, **simulate** the call (`eth_call`), apply the policy, send with the next relayer key (round-robin keys to avoid nonce contention), return the tx hash.
- **Anti-drain rules** (document all of these in the README):
  - Only calls to our router.
  - Gas price cap.
  - Per-payer and per-IP rate limits.
  - Velocity caps (UPI-style: max 10 collect requests a day and 25 a week to one name).
  - Per-transaction and daily limits.
  - Minimum payment amount.
  - Alert when relayer balance falls below a floor.
  - Relayers hold **only WBT**, never USDT.
- **Relayer funding:** faucet claims plus a top-up from `DEPLOYER`. Explain this in the README ("how the relayer gets WBT").
- **Gas facts:** 1 s blocks, 40M gas/block, 5 gwei minimum base fee.

---

## 7. ENS (Sepolia, ENSv2)
Sources: `/ensv2/tutorial-contract-developers/`, `/learn/deployments#sepolia-ensv2`.

| Contract | Sepolia |
|---|---|
| ETHRegistry | `0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4` |
| ETHRegistrar | `0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3` |
| VerifiableFactory | `0xda70306c98e97ece36f997a21368e53298572991` |
| UserRegistryImpl | `0x9bd8a88719068d09ecee662f36c0e3856708366a` |
| PermissionedResolverImpl | `0x115eb53f0c60696633855f90b138178fb40b2b2c` |
| MockUSDC | `0x240b0316df57887dbbe58b586508b19e633a14aa` |
| UniversalResolver (proxy) | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` |

Steps (scripted in `scripts/ens-setup.ts`; the experimental `ens-cli` is an alternative, not on npm):
1. **Register `wondrpay.eth`** on https://sepolia.app.ens.domains, paid with MockUSDC. If the name is taken, choose a 5+ character fallback and update `ENS_PARENT`.
2. **Deploy the subname registry:** `VerifiableFactory.deployProxy(UserRegistryImpl, salt, initialize([(ENS_ADMIN, ALL_ROLES)]))`.
   - `salt = keccak256(abi.encode(keccak256("UserRegistry"), namehash("wondrpay.eth"), 0))`.
   - Read the address from the `ProxyDeployed` event.
3. **Link it to the parent:** `ETHRegistry.setSubregistry(uint256(labelhash("whitepay")), userRegistry)`.
4. **Deploy one PermissionedResolver** owned by `ENS_ADMIN` via the factory (salt `keccak256(abi.encode(keccak256("OwnedResolver"), owner, 0))`).
5. **Issue a subname on a verified claim:**
   - `userRegistry.register(label, userAddr, address(0), resolver, roleBitmap, expiry)`. Leave `ROLE_CAN_TRANSFER_ADMIN` out of the bitmap (non-transferable). ⚠️ That this blocks transfers is inferred from the docs.
   - Then call `resolver.setAddress(dnsEncode(name), 2147485522, userAddr)`. That coin type is chain 1874 by ENSIP-11, or `toCoinType(1874)` in viem.
   - Plus `setText` for `display`, `verified`, `mcc`, `avatar`.
6. **Revoke / freeze:** `unregister(id)` (keep `ROLE_UNREGISTER` at root), or clear the address record (the "hotlist" kill switch).
7. **Use EAC to show off ENSv2:** `grantSetterRoles` lets a merchant's *cashier* key edit only the `display`/`hours` text records, not the address record. This is an anti-redirect control.
8. **Resolve in the app:** `publicClient.getEnsAddress({ name, coinType: toCoinType(1874) })` on a **Sepolia** client. ⚠️ Test this end to end on day 1.

Gotchas:
- Token IDs change when roles change, so key everything by labelhash.
- A new name returns null until an address record is set.
- Reserved-names list and 2-year reissue cooldown: enforce in our API, which is the only path to `register`.

---

## 8. World ID
**Primary: IDKit 4.x**, which covers both uses.
- **One name per human:** action `ens-claim`, preset `proofOfHuman`, `signal = wallet address`.
  - The backend verifies via `POST https://developer.world.org/api/v4/verify/{rp_id}`.
  - Require `success: true` and the expected environment.
  - Store the nullifier as `NUMERIC(78,0)` with a `UNIQUE(nullifier, action)` constraint.
  - Only then call ENS `register`.
- **Step-up for refunds and over-limit payments:** create a session at enrollment (`IDKit.createSession`). Before the sensitive action, call `proveSession` with `signal = paymentId`. The backend verifies, then lets the relayer proceed.
- **Request signing:** `POST /api/world/rp-signature` uses `signRequest({ signingKeyHex: RP_SIGNING_KEY, action, ttl: 300 })` from `@worldcoin/idkit/signing`.
- **Testing:** `WORLD_ENV=staging` with https://simulator.worldcoin.org/. ⚠️ The docs conflict on simulator vs sandbox app; confirm at the booth.
- **Required failure paths for the demo:**
  - The user cancels the widget: the refund is NOT sent.
  - A reused nullifier on a name claim: claim rejected.
  - An expired RP signature: verification fails.

**Optional (Agent Pass prize): World IdP (OIDC step-up)**
- Authorization Code + PKCE against `https://auth.world.org` with `max_age=0` and an essential `acr` claim (e.g. `https://world.org/oidc/acr/orb`).
- On the backend, validate `iss/aud/exp`, the signature (JWKS), `acr`, `amr` contains `pop`, `auth_time`, and that `sub` matches the account.
- Errors: `access_denied`, `unmet_authentication_requirements`, `invalid_grant`. All of them leave the action blocked.

---

## 9. Arkiv (Rabdi testnet, chain 7794095)
```ts
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { defineSchema, addr, str, u64, dec, bytes } from "@arkiv-network/sdk/schema"
import { and, eq, gt, desc } from "@arkiv-network/sdk/query"
const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" })
```

| Schema | Indexed fields | Expiry | Owner |
|---|---|---|---|
| `whitepay.receipt` | merchant (addr), payer (addr), status (str), createdAt (u64), amount (dec), paymentId (str), txHash (str) | 180 days (max ≈182.5) | backend writer |
| `whitepay.request` | merchant, payer, status `pending/paid/rejected`, createdAt, amount, orderId | **= collect expiry** (default 30 min, max 45 days) | backend writer |
| `whitepay.dispute` | paymentId, payer, merchant, status, createdAt | 90 days | backend writer |
| `whitepay.daily` | merchant, day (u64), total (dec), count (u64) | 180 days | backend writer |

Rules:
- Always query with `.ownedBy(ARKIV_WRITER)`. Anyone can write entities carrying our schema name.
- Store your own indexed `createdAt`. `$createdAt` can't be filtered.
- Wrap numbers: `u64(5n)`, `dec("12.5")`.
- No `!=` / `NOT` operators.
- Max 100 rows per page.
- Data is **public**, so put order descriptions or notes in a `bytes` column encrypted with `arkiv-encryption`. Never store personal data in the clear.

User-visible reads (a prize requirement):
- Customer history
- Merchant dashboard: filter by status and date
- Pending collect requests with a live countdown to expiry
- Disputes inbox
- Daily settlement CSV

Write `/arkiv/schema.md` from the table above.

**Swarm (optional bonus):** receipt PDFs uploaded to Swarm, with the reference in the receipt entity. Requires a Bee node for encryption, and never put a raw encrypted reference in an entity.

---

## 10. Checkout SDK (the "20 lines" deliverable)
```html
<script type="module" src="https://whitepay.app/sdk/checkout.js"></script>
<wondrpay-button merchant="chai-shop.wondrpay.eth" order-endpoint="/api/create-order"></wondrpay-button>
<script>
  document.querySelector('wondrpay-button')
    .addEventListener('paid', e => fetch('/api/fulfill', { method:'POST', body: JSON.stringify(e.detail) }))
</script>
```
- **Merchant server:** a ~10-line `createOrder()` helper from `@whitepay/checkout/server` that signs the order.
- **Webhook verification:** `verifyWebhook(req, WEBHOOK_SECRET)`.
- **Payment link / QR format:** `wondrpay://pay?to=<name>&amount=<n>&order=<id>&sig=<s>`, with a fallback to `https://whitepay.app/pay?...` and an EIP-681 `ethereum:` URI.

---

## 11. Build phases (≈36h; commit after every bullet)

| Phase | Hours | Deliverables | Done when |
|---|---|---|---|
| **0. Setup** | 0–2 | Repo, monorepo skeleton, `.env.example`, wallets, faucet claims, booth questions, World portal app, Arkiv key | WBT on deployer and relayer; USDT funding path known |
| **1. Contracts** | 2–7 | Router, Registry, tests, deploy and **verify** on 1874 | Verified on the explorer; one real USDT `payOrder` tx link in README |
| **2. Relayer + API** | 7–11 | Order signing, `/api/relay/pay`, policy, webhook | Customer pays with **0 WBT** in the wallet |
| **3. Customer PWA** | 11–16 | Wallet onboarding, scan/pay-by-name, confirmation screen, history | Phone demo works end to end |
| **4. ENS** | 16–20 | Parent name, registry, resolver, claim flow, resolution | `ravi.wondrpay.eth` resolves to the 1874 address in the app |
| **5. World** | 20–23 | Name-claim uniqueness, step-up for refunds and over-limit, failure paths | Denied path visibly blocks the action |
| **6. Arkiv** | 23–27 | Indexer → entities, merchant dashboard, collect requests, disputes, CSV | Dashboard reads only from Arkiv + chain |
| **7. SDK + demo store** | 27–30 | `<wondrpay-button>`, demo store | Integration under ~20 lines |
| **8. Polish + docs** | 30–34 | README, feedback files, `/arkiv/*.md`, World debrief, limits section | `submission-auditor` agent passes |
| **9. Video + submit** | 34–36 | 2–4 min video showing customer, merchant, relayer and verification | Submitted with 3 prizes selected |

**Cut order if behind:** Swarm, then World IdP, then disputes, then daily report, then P2P `payDirect`. **Never cut:** a verified contract, a real USDT payment, both views, refunds.

---

## 12. Demo script (2–4 min)
1. **Customer onboarding:** World proof, then claim `ravi.wondrpay.eth`. A second claim with the same human is rejected.
2. **Demo store:** "Pay with WondrPay", phone scans the QR, verified merchant name and amount shown, approve. Settled on Whitechain with **no gas**, and the explorer link is shown.
3. **Merchant dashboard (reads from Arkiv):** the receipt appears and the webhook fires.
4. **Collect request:** a verified merchant sends an invoice with a 2-minute expiry. Show one paid and one expiring live.
5. **Dispute:** dispute, then a partial refund needing World step-up. Show the cancelled step-up blocking the refund, then the approved one.
6. **CSV export.** Close on the README "why Whitechain" line and limitations.

---

## 13. Submission deliverables
- `README.md` with:
  - Setup
  - Architecture diagram
  - Contract addresses + verified links
  - **USDT payment tx link**
  - "Why onchain stablecoin settlement on Whitechain" line
  - Relayer funding + anti-drain section
  - Limitations (scaling, privacy, mocked/staging proofs, custodial aspects)
  - AI-usage disclosure
  - Arkiv writer wallet + runnable query
  - Live demo link
- `WHITECHAIN_FEEDBACK.md`: include the real findings (USDT address mismatch in the docs, faucet gives WBT only, viem `whitechainTestnet` pointing to the retired chain 2625).
- `WORLD_FEEDBACK.md` (debrief): time to first success, friction, missing docs, top improvement.
- `/arkiv/schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` (+ `swarm.md`).
- `LICENSE` (MIT), the demo video, steady commit history.

---

## 14. What to give Claude (so it can build without guessing)

**Paste or put in the repo (safe to share):**
1. Booth answers (`docs/booth-answers.md`), especially the **USDT funding method** and **what Agent Pass is**.
2. The **ENS parent name** you actually registered.
3. **Public addresses** of every wallet in §1 (never private keys).
4. World `app_id`, `rp_id`, action names, and whether you got a World IdP client (IDs only; secrets go in `.env`).
5. Any error messages or tx hashes when something fails.
6. Your prize picks and team split (who owns which phase).

**Keep in `.env` only, never in chat:** private keys, `RP_SIGNING_KEY`, `WORLD_IDP_CLIENT_SECRET`, `ARKIV_ACCESS_KEY`, `WEBHOOK_SECRET`, `DATABASE_URL`.

**Docs Claude should read before each phase** (machine-readable indexes exist):
- Whitechain: https://docs.whitechain.io/llms.txt, plus testnet, deploy-with-foundry, verify-proxy-contracts and templates (github.com/whitechain-labs/templates)
- ENS: https://docs.ens.domains/ensv2/tutorial-contract-developers/, /ensv2/permissioned-resolver/, /ensv2/enhanced-access-control/, /learn/deployments, /web/ensv2-readiness
- World: https://docs.world.org/world-id/idkit/integrate, /idkit/signatures.md, /idkit/session-proofs.md, /api-reference/developer-portal/verify.md, https://auth.world.org/docs/guides/step-up
- Arkiv: https://docs.arkiv.network/llms.txt, /reference/query-language/, /writing/expiration/, /reference/limits/. Also the Arkiv MCP server (https://hub.arkiv.network/ai-tools). Consider adding it to Claude Code.

---

## 15. Open items (⚠️ unverified, check early)
- [ ] How to obtain test USDT `0xcedf…` (booth)
- [ ] "Agent Pass" meaning and mocked proofs (booth)
- [ ] ENS `getEnsAddress` with coinType 2147485522 resolving end to end on Sepolia
- [ ] Leaving `ROLE_CAN_TRANSFER_ADMIN` out actually blocks subname transfer
- [ ] Arkiv faucet amount, cooldown and access-key quota
- [ ] Whether passkey PRF works on both teammates' test phones (fallback: MetaMask mobile)
- [ ] Whether one project can enter both Whitechain Operate and Scale
