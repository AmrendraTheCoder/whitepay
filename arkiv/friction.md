# Arkiv friction log (what we hit while building WondrPay)

| # | Issue | Expected | What happened | How to reproduce |
|---|---|---|---|---|
| 1 | **Rabdi RPC outage** | `eth_chainId` / `balance` answer | Cloudflare **522 Connection timed out** from `rpc.rabdi.db-chain.testnet.arkiv.network` for a while on 5 Nov; it later recovered on its own | `cast chain-id --rpc-url https://rpc.rabdi.db-chain.testnet.arkiv.network` during an incident. There was no status page to check |
| 2 | **SDK 1.0.1 rewrite vs stale reference** | The TypeDoc "API reference" matches the SDK | The reference still documents the pre-1.0 API (`payload`, `contentType`, `expires`, `cursor()`, `atBlock`). We had to use the guide pages and SDK source | Compare docs.arkiv.network API reference with `@arkiv-network/sdk@1.0.1` exports |
| 3 | **No `NOT` / `!=`** | Filter "status != paid" | Not supported on Rabdi (llms.txt still lists `ne`/`not`). We query the positive values instead | `select().from(S).where(ne(...))`: `ne` isn't exported |
| 4 | **`$createdAt` / `$updatedAt` not filterable or sortable** | "Newest first" by creation time | Can't filter or sort, so every schema carries its own indexed `u64` timestamp (`paidAt`, `requestedAt`, …) | `orderBy(desc("$createdAt"))` |
| 5 | **Event logs only ~1000 blocks back** | A watcher can backfill | A watcher that falls behind errors repeatedly and can't recover; we reconcile with a query instead (via MCP known-issues) | `eth_getLogs` for a block >1000 behind head |
| 6 | **Anyone can write our schema tag** | Schema names are namespaced | Any wallet can create `whitepay.request` entities. A payer could be shown a forged request, so **every read uses `.ownedBy(writer)`**, and payers also re-verify the signed order on Whitechain | Create an entity with `defineSchema("whitepay.request", …)` from another wallet |
| 7 | **Patching an expired entity reverts the whole batch** | Receipt write succeeds; request patch is skipped | `executeBatch({creates:[receipt], patches:[expiredRequest]})` reverts entirely (`EntityExpired`). We catch it and write the receipt alone | Pay a request a second before its TTL ends, then batch-patch it |
| 8 | **MetaMask can't add the Rabdi RPC** | "Add network" succeeds | MetaMask showed "**Could not fetch chain ID. Is your RPC URL correct?**" while `cast chain-id` from a terminal returned `7794095` | MetaMask → Add network → RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network` |
| 9 | **Faucet needs a captcha per wallet** | Script-friendly funding for a backend writer | Funding a server-only wallet needs a human to solve the captcha on hub.arkiv.network ("Use a different address") | Try to fund a fresh writer address |
| 10 | **Gas estimates can be low** | SDK default gas works | Arkiv guidance recommends ≥1M + 400k per extra op. We set explicit `gas` (1.5M create, 2–2.5M batch) to avoid underestimation | Large batch without an explicit `gas` |

## What would help most
1. **Correct the API reference** to match the 1.0.x SDK.
2. **Make `$createdAt` filterable.**
3. **A status page / health endpoint for Rabdi.**
4. **A "skip patches on expired entities" option** for `executeBatch`.
