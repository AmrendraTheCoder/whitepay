# Arkiv ($15,000)

Web3 database / DB-chain. Entities: wallet-owned, SQL-like queryable, expire when you choose.
- RPC https://rpc.rabdi.db-chain.testnet.arkiv.network · Explorer https://rabdi.explorer.arkiv.network · Indexer https://indexer.rabdi.db-chain.testnet.arkiv.network · Faucet https://hub.arkiv.network/faucet · Access keys https://hub.arkiv.network/access-keys · Chain ID 7794095
- SDK `@arkiv-network/sdk` or JSON-RPC. Docs https://docs.arkiv.network · AI tools https://hub.arkiv.network/ai-tools · Discord https://discord.gg/arkiv

## Prizes (one Arkiv track per team; Swarm bonus stacks; Arkiv = one partner pick)
| Prize | $ | Who | Judged (25% each) |
|---|---|---|---|
| Mirror something Ethereum depends on | 4,000 (3k/1k) | from scratch | friction, reach, why-arkiv, data-quality |
| Build on Arkiv (from scratch) | 4,000 (3k/1k) | new | friction, reach, why-arkiv, how-you-use |
| Build on Arkiv (existing) | 4,000 (3k/1k) | Continuity | same; only new Arkiv work judged |
| Node tooling | 2,000 | new repo next to node | friction, real-use, whats-new, easy-to-run |
| Arkiv + Swarm bonus (new / existing) | 500 each | uses both | `/arkiv/swarm.md` |

## Common qualification
- Writes to Arkiv testnet; ≥1 user-visible feature **reads** from Arkiv (SDK-installed-but-unused or write-only log doesn't count).
- README: writer wallet address(es) + one runnable query.
- `/arkiv/schema.md` (entities, queried fields, owners, expiry) + `/arkiv/friction.md` + **one file per criterion** at the listed path.
- Public repo, open-source license, state AI usage.
- Mirror: not Sourcify; data license permits republishing (link); re-runnable import script in repo.
- Node tooling: never publish slow-query shapes publicly (send privately at Arkiv booth).
- Swarm: `/arkiv/swarm.md` — what on Swarm vs Arkiv, field holding ref, entity key↔ref link, postage batch ID + buyer wallet + Bee node, upload/read files, run steps, video timestamp, friction. Never put an encrypted Swarm reference (contains key) in a public entity unencrypted.

## Fit for WondrPay
Invoices/payment links as expiring entities (expiry = due date), receipts index queryable by merchant/customer/status, accountant export via queries; receipt PDFs on Swarm referenced from entity. Keep money settlement on Whitechain, not Arkiv.
