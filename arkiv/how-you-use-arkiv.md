# How WhitePay uses Arkiv

**Who can edit:** only the WhitePay writer `0x4D5910272479420d1383100b3986d5fc9d5D658F` (entity owner). Users never write directly. Their actions are signed on-device and verified by the backend before an entity is created or patched. All reads use `.ownedBy(writer)`.

## Feature mapping
| Feature (screen) | Entity | Filters used | Written when | Expiry | What the user sees |
|---|---|---|---|---|---|
| **Shop QR** (Shop tab → "Show QR") | `whitepay.request` (create) | n/a | The shop's device signs an order; the backend checks the signer against `MerchantRegistry`, then creates the entity | **= order TTL (5 min)** | A QR with a live countdown; the entity key is in the QR link |
| **Pay screen** (`/pay?req=…`) | `whitepay.request` (read by key) | `getEntity(key)` + `$owner` check | n/a | Gone after the TTL, shown as "Request expired" | Merchant name, amount, countdown and **4 verification ticks**: owner, digest, on-chain signer, still valid |
| **Settlement** (after the relayer pays) | `whitepay.receipt` (create) + `whitepay.request` (patch `status=paid`, `receiptRef`) in one batch | idempotency: `wcTxHash` = tx | The Whitechain tx confirms | receipt ~182 d | The shop screen flips to "Received ✓"; rescanning shows "Already paid" |
| **Shop dashboard "Received"** | `whitepay.receipt` | `merchant = addr`, `ORDER BY paidAt DESC` | n/a | n/a | List of incoming payments with QR/direct labels |
| **Transactions, Home "Pay again", Money totals** | `whitepay.receipt` | `merchant = me OR payer = me` | n/a | n/a | History with names and types; people/shops you paid; spent/received totals (merged with on-chain transfers by tx hash) |
| **Shop directory / verified badge** | `whitepay.merchant` | `address =` or `label =` | Shop sign-up; patched `verified=true` after World ID | ~182 d | Business name and ✓ badge on the pay screen and You; handle availability check |
| **Name by address** (Home banner, You, resolve) | `whitepay.person` | `address =` | Personal name claim (World ID) | ~182 d | "amrendravs.whitepay.eth" shown for a wallet (ENS has no reverse lookup for our names) |
| **World ID status / one per human** | `whitepay.worldclaim` | `address =`; `nullifier = AND action = AND purpose =` | After World ID verification | ~182 d | The badge instead of the "Verify" button; a second wallet of the same human gets the name *moved*, not duplicated |

## Does each Arkiv feature change something users see?
| Arkiv feature | What it changes for users |
|---|---|
| **Expiration** | QR requests vanish on time (the countdown is real) |
| **Owner** | Forged requests are rejected on the pay screen |
| **Indexed attributes** | History, dashboard and directory lookups all come from Arkiv |
| **Batch** | The receipt and the "paid" status flip together, so a QR never shows "pending" after payment |
| **Keys** (`receiptRef`, `requestRef`) | Link a request to its receipt, used for the "Already paid" page with an explorer link |
