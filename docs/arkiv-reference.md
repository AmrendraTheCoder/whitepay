# Arkiv developer reference (for WhitePay)

Digest of the Arkiv docs (docs.arkiv.network, read in full via the sitemap on 2026-11-05) and the published `@arkiv-network/sdk@1.0.1` package source. Written in our own words. Each section lists its sources.

**Legend:** **[docs]** = stated on docs.arkiv.network · **[src]** = checked in the SDK 1.0.1 tarball (`src/`) · **[skills/MCP]** = Arkiv's skills repo, AI plugin or Mumbai MCP server, not the docs site · **[UNVERIFIED]** = our inference or not tested against Rabdi.

> **Read this first.** The guide pages, the SDK 1.0.1 source and the README agree with each other. The **TypeDoc "API reference"** (`/typescript-sdk/api-reference/*`) and parts of **`llms.txt`** are **stale (pre-1.0 API)**. They show `payload`, `contentType`, `expires`, `cursor()`, `atBlock()`, `fromBlock`, `ne`, `not`, `getEntityCount` and the `tiramisu` chain, and **none of these exist in 1.0.1**. See §11.

Versions: `latest` = **1.0.1** (2026-11-02). Other dist-tags: `next` 0.9.0-next.5, `advanced` 0.8.0-advanced.3, `dev` 1.0.0-dev.2. Peer deps: `viem ^2`, `typescript >=5`. Node 22.10+ or Bun. Subpath exports: `.`, `/query`, `/schema`, `/chains`, `/entity`, `/types`, `/utils`. ESM and CJS.

```bash
npm install @arkiv-network/sdk@1.0.1 viem
```

---

## 1. Concepts

Sources: https://docs.arkiv.network/start-here/introduction/ · https://docs.arkiv.network/schemas/define/ · https://docs.arkiv.network/writing/create/

- **Arkiv** is a "Web3 database", an Ethereum-aligned DB-chain. Writes are signed Ethereum transactions. Reads go through `arkiv_query` JSON-RPC calls. State is committed in a keccak Merkle-Patricia trie. No external indexer is needed for queries.
- **Entity** = one record. It holds up to **32 attributes** (31 if the schema is named). It also has system fields, all prefixed `$`:

| Field | Meaning | Filter/sort? |
|---|---|---|
| `$key` | 32-byte key, assigned at create | yes (type `key`) |
| `$owner` | account that can change it | yes (`addr`) |
| `$creator` | account that created it; never changes | yes (`addr`) |
| `$createdAt` / `$updatedAt` | block numbers | **select only. Can't be filtered or sorted** |
| `$expiresAt` | expiration block | yes (`u64`) |
| `$creationFlags` | `{ readonly, permissionlessExtension, raw }` | select only |

- **Attribute** = a named, typed value. It is either **indexed** (filterable, costs more on each write) or **stored only** (selectable and sortable, cheaper).
- **Schema** (`defineSchema`) is an **SDK-side convention**. The node only sees attributes, each with a type and an indexed bit. A **named** schema adds an indexed `str` attribute `arkiv.schema = "<name>"` to every entity. Queries through the schema filter on that tag automatically.
- **Ownership:** only the owner can patch, extend, transfer or delete. The exception is `permissionlessExtension`, which lets anyone extend. `changeOwnership` moves the owner. `$creator` stays the same.
- **Expiration:** every entity has an expiration block, and **it is required on create**. From that block on, queries don't return the entity and every operation on it fails. You can extend it while it is alive. The max lifetime is **7,884,000 blocks ≈ 182.5 days** from the block the create or extend lands in. A block takes **2 s** on Rabdi. You pay for the lifetime you pick: shorter is cheaper. **No event is emitted when an entity expires.**
- **Creation flags** are fixed at create and default to off:
  - `readonly`: attributes can never change. The entity can still be extended, transferred or deleted.
  - `permissionlessExtension`: any account may extend it.
- **Arkiv is public.** Anyone can write entities with any attribute names, **including your schema tag**. To trust data, filter with `.ownedBy(addr)` or `.createdBy(addr)`. All data is readable by everyone (see §8).
- **Gas token:** GLM. On testnet it is **tGLM**.

## 2. Networks, access keys and client setup

Sources: https://docs.arkiv.network/networks/rabdi/ · https://docs.arkiv.network/networks/older-networks/ · https://docs.arkiv.network/start-here/access-keys/ · https://docs.arkiv.network/start-here/clients/ · https://docs.arkiv.network/guides/react/

### Rabdi (current public testnet)

| Property | Value |
|---|---|
| Chain ID | `7794095` (`0x76edaf`) |
| HTTP RPC | `https://rpc.rabdi.db-chain.testnet.arkiv.network` |
| WS RPC | `wss://rpc.rabdi.db-chain.testnet.arkiv.network` |
| Gas token | tGLM (18 decimals, name "Golem" in the chain def) [src] |
| Block time | 2 s |
| Faucet | https://hub.arkiv.network/faucet |
| Access keys | https://hub.arkiv.network/access-keys |
| Explorer | https://rabdi.explorer.arkiv.network (entity explorer: `/entity-explorer` [MCP]; tx URL `/tx/{hash}` [MCP]) |
| Indexer | `https://indexer.rabdi.db-chain.testnet.arkiv.network` (from the ETHGlobal prize page, not the docs) [UNVERIFIED usage] |
| Arkiv system contract | `0x4400000000000000000000000000000000000044` (same on every Arkiv chain) |

Older networks (data does **not** carry over): Tiramisu `7738577` (replaced by Rabdi), Braga (retired 2026-08-12), Kaolin (retired 2026-05-15).

**Rabdi vs Tiramisu ("moving forward" list):** no `NOT` / `!=`. No `atBlock`: Rabdi keeps no past blocks, so every read is at the latest block. No cursors, `next()`, `hasNextPage()` or `for await`; page with `limit` + `offset` or by key. No `fromBlock` on watchers.

### Access keys (Arkiv Hub)

- The public RPC is **heavily rate-limited** (it can return HTTP 429 [skills]). Get a free key at the Hub: connect a wallet, sign in, pick a network (Rabdi), name the project, solve the captcha, and select Generate. You get **one key per wallet per network**, valid on one network only, with a **monthly quota in cost units**. The Usage tab shows consumption.
  - [skills] Current quota is 100,000,000 units/key. Each `arkiv_query` costs 10 units and other methods cost 0 [UNVERIFIED vs Hub].
- Three ways to send the key: in the URL path `…/rabdi…network/<key>`, an `X-API-KEY: <key>` header, or `Authorization: Bearer <key>`. WebSocket accepts the path form or `X-API-KEY`.
- An unknown key fails every call with HTTP **401**. Over quota, calls can be rejected.
- **Lock it down:** the *Origins* allowlist is attribution only, since non-browser clients can forge `Origin`. The *IP allowlist* (exact IPs, no CIDR) is real access control. Regenerate kills the old key immediately. Delete is permanent.
- `rabdi({ accessKey })` puts the key at the end of both the HTTP and WS URLs. `accessKey: ""` means the public RPC, with a one-time `console.warn`. **Leaving out `accessKey` is a type error and throws `MissingAccessKeyError` at runtime.** [docs+src]
- **Never add a keyed chain to a user's wallet.** The wallet stores the RPC URL and would use your quota for every app. Use `rabdi({ accessKey: "" })` for `addChain` and wagmi.
- [MCP] Treat the full keyed RPC URL as a secret: don't log it, and watch for viem error messages that echo the URL.

### Clients (both are viem clients extended with Arkiv actions)

```ts
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { http, custom, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" })

// Reads: no account, safe in browser
export const publicClient = createPublicClient({ chain, transport: http() })

// Server writes (WhitePay backend): private key from env/secret store
export const walletClient = createWalletClient({
  chain, transport: http(),
  account: privateKeyToAccount(process.env.ARKIV_PRIVATE_KEY as Hex),
})

// Browser wallet, direct (non-wagmi)
const [address] = await window.ethereum.request({ method: "eth_requestAccounts" })
const browserWallet = createWalletClient({ chain, transport: custom(window.ethereum), account: address })
await browserWallet.addChain({ chain: rabdi({ accessKey: "" }) })  // no key!
```

- A **wallet client has only write actions** plus a few viem actions: `waitForTransactionReceipt`, `call`, `simulateContract`, `readContract`, `getBlockNumber`, `addChain`, `sendCalls`, `waitForCallsStatus`, `sendTransaction`, `sendRawTransaction`, `signMessage`, `signTransaction`, `writeContract`. Keep a public client alongside it for reads. [src]
- The public client exposes the viem actions `getBalance`, `getBlock`, `getBlockNumber`, `getChainId`, `getLogs`, `getTransaction`, `getTransactionCount`, `getTransactionReceipt`, `waitForTransactionReceipt` and `watchEvent`, plus the Arkiv actions (§5). [src]
- **wagmi / RainbowKit / Next.js** (guide):
  - Use `chain` (with `NEXT_PUBLIC_ARKIV_ACCESS_KEY`) for the shared public client, and a separate `walletChain = rabdi({ accessKey: "" })` in wagmi `chains`.
  - Build the Arkiv wallet client from `useWalletClient({ chainId: chain.id })`, then `createWalletClient({ chain, transport: custom(walletClient.transport), account: walletClient.account })`.
  - Don't use `window.ethereum` in a wagmi app.
  - Keep `bigint` values out of TanStack query keys, because they can't be hashed.
  - `lib/arkiv.ts` has no browser code, so server components and route handlers can import `publicClient`.
- Debug logging: `DEBUG=arkiv:*` (or a `localStorage.DEBUG` key in the browser). Narrower namespaces include `arkiv:query:*` and `arkiv:actions:wallet:*`. [README]

## 3. Write API (wallet client)

Sources: https://docs.arkiv.network/writing/create/ · https://docs.arkiv.network/writing/expiration/ · https://docs.arkiv.network/writing/change/ · https://docs.arkiv.network/writing/batches/ · SDK `src/clients/decorators/arkivWallet.ts`, `src/actions/wallet/*` [src]

Every write resolves **after the tx is in a block** (it waits for the receipt). Every write takes an optional last `txParams` argument:

```ts
type TxParams = { gas?: bigint; nonce?: number } &
  ({ gasPrice?: bigint } | { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint })  // mutually exclusive
```

| Method | Signature (1.0.1) | Returns |
|---|---|---|
| `createEntity` | `(schema, values, { expiration, flags?, salt? }, txParams?)` | `{ entityKey: Hex, txHash, expiresAt: bigint }` |
| `patchEntity` | `(schema, entityKey, { set?, unset? }, txParams?)` | `{ entityKey, txHash }` |
| `extendEntity` | `({ entityKey, expiration }, txParams?)` | `{ entityKey, txHash, expiresAt }` |
| `changeOwnership` | `({ entityKey, newOwner }, txParams?)` | `{ entityKey, txHash }` |
| `deleteEntity` | `({ entityKey }, txParams?)` | `{ entityKey, txHash }` |
| `executeBatch` | `({ creates?, patches?, extensions?, ownershipChanges?, deletes? }, txParams?)` | `{ txHash, createdEntities, patchedEntities, deletedEntities, extendedEntities, ownershipChanges }` (all `Hex[]`; `createdEntities` follows the order of `creates`) |

Notes:
- **create:** `values` are typed by the schema. Required columns must be present. Optional columns can be omitted. Defaults fill in when a column is omitted. Errors before send: `SchemaMismatchError`, `InvalidValueError`, `EntityTooLargeError`, `InvalidExpiryError`. A tx failure or revert throws `EntityMutationError`.
  - `flags: { readonly?: boolean, permissionlessExtension?: boolean }`.
  - `salt`: the default is 128 random bits, so keys are unguessable. `NO_SALT` gives keys anyone can derive. You can also pass a predicted salt.
- **patch:** `set` writes values. `unset: [...]` removes **optional columns only**, and the patch is typed. Errors: `EmptyPatchError` (nothing to do), `ConflictingMutationError` (same column in set and unset). Patching a `readonly` entity reverts with `ReadOnlyEntity`. **There is no `updateEntity`**; a patch never touches the expiry.
- **extend:** the duration counts **from now, not from the current expiry**. For example, 10 days left + `fromDays(30)` leaves 30 days. An earlier expiry is rejected (`ExpiryNotExtended`). An equal expiry is a no-op. Only the owner can extend unless `permissionlessExtension` is set.
- **changeOwnership:** reverts if `newOwner` is the zero address or the current owner.
- **delete:** removes the entity before expiry. Afterwards it behaves as if expired.
- **executeBatch:** atomic, all or nothing. It can mix schemas, and needs at least one op.
  - Creates are `{ schema, values, expiration, flags?, salt? }`. Patches are `{ schema, entityKey, set?, unset? }`. Extensions are `{ entityKey, expiration }`. Ownership changes are `{ entityKey, newOwner }`. Deletes are `{ entityKey }`.
  - Ops apply in this order (per JSON-RPC docs: "in order"). [UNVERIFIED: the exact order the SDK uses when encoding lists of different kinds]
- **Predicting keys** (to link entities created in the same batch):
  - `publicClient.predictEntityKeys({ owner, count?, salts? })` returns `[{ key, salt }]`. Pass each `salt` to the matching create, in order.
  - A prediction is only valid if no other create from that account lands first.
  - The standalone helper `predictEntityKey` and `publicClient.getEntityNonce(owner)` also exist. [src; the nonce method is undocumented]

### ExpirationTime (import from `@arkiv-network/sdk`)

| Helper | Meaning |
|---|---|
| `fromSeconds(n)` | must be a multiple of 2 s, else `InvalidExpiryError` |
| `fromMinutes / fromHours / fromDays / fromWeeks(n)` | duration |
| `fromMonths(n)` | n × 30 days |
| `fromYears(n)` | exists in src but always exceeds the max, so it throws |
| `fromBlocks(n)` | n blocks |
| `max()` | full 7,884,000 blocks (**1.0.1+ only**) |
| `atBlock(block, { atLeast? })` / `atDate(date, { atLeast? })` | deadline. `atDate` rounds up to the next block. `atLeast` means "deadline or the minimum lifetime, whichever is later" |

- Over the max lifetime, `InvalidExpiryError` is thrown before send (1.0.1). On 1.0.0 it reached the chain and reverted [MCP].
- Durations convert to blocks at 2 s/block, so they are approximate. The exact block is in the returned `expiresAt`.
- `MAX_LIFETIME = 7_884_000n` is exported from the root and from `/entity`.

## 4. Schema system

Sources: https://docs.arkiv.network/schemas/define/ · https://docs.arkiv.network/schemas/column-types/ · https://docs.arkiv.network/reference/limits/

```ts
import { defineSchema, bool, i32, u64, u256, dec, str, addr, key, bytes } from "@arkiv-network/sdk/schema"
const Posts = defineSchema("my-app.posts", {
  author: addr().indexed(), category: str().indexed(), score: dec().indexed(),
  title: str(), body: bytes(), summary: str().optional(), likes: i32().indexed().default(0),
})
const Untagged = defineSchema({ label: str().indexed() })   // unnamed: no tag filter
```

**Column types.** A constructor with no args is a column. With a value, it is a typed value.

| Type | Holds | `.value` in JS | Plain JS accepted? |
|---|---|---|---|
| `bool` | true/false | boolean | `boolean` |
| `i32` | signed 32-bit | number | `number` (a bare number **is i32**) |
| `u64` | 0..2^64−1 | bigint | no, use `u64(5n)` |
| `u256` | 0..2^256−1 | bigint | `bigint` (a bare bigint **is u256**) |
| `dec` | signed decimal, 18 dp | string, e.g. `"4.5"` | no, use `dec("4.5")`. `dec(0.1)` throws; pass strings. More than 18 dp throws |
| `str` | ≤128 **bytes** UTF-8 | string | `string` |
| `addr` | EVM address | checksummed hex | no, use `addr("0x…")`. Mixed case must be valid EIP-55; all-lowercase is OK |
| `key` | another entity's key (not existence-checked) | hex | no, use `key(k)` |
| `bytes` | ≤128 KiB | hex | `Uint8Array` (or hex) |

- `decUnits(v)` gives the scaled bigint. `decFromUnits(units)` converts back. `toValue`, `isArkivValue` are also available.
- **Modifiers** (chainable, any order, each returns a new column): `.indexed()` (not on `bytes`), `.optional()`, `.default(value)`.
- **Indexing rules:** only `.indexed()` columns can be filtered on. Filtering an unindexed column is a **compile error** and throws `InvalidPredicateError` at runtime. Any non-`bytes` column can be **sorted**, indexed or not. Indexing costs extra on every write.
- **Operators per indexed type:** `eq`, `gt`, `gte`, `lt`, `lte`, `between`, `exists`, `hasType`. `startsWith` is **str only**. (The column-types page also lists `ne`, which is wrong for 1.0.1; see §11.)
- **Comparison semantics:** numbers and decimals compare by value, and `false < true`. `str`, `addr` and `key` compare **byte by byte**: no collation, not alphabetical.
- **Attribute naming:**
  - Starts with a letter, then letters, digits, `.`, `-` or `_`. ≤**32 bytes**. Case-sensitive. No `--`.
  - Can't start with `$`.
  - Can't be a reserved word: `AND OR NOT TRUE FALSE BETWEEN STARTSWITH EXISTS TYPEOF ORDER BY ASC DESC`, or a type name (`bool i32 u64 u256 dec str addr key bytes`). **So no column called `key`.**
  - `arkiv.schema` is reserved.
- **Schema name:** any text ≤128 bytes. Namespace it, e.g. `whitepay.receipt`.
- **Limits:** ≤32 columns, or 31 if named. All `bytes` values in one create or patch share **one 128 KiB budget** (`EntityTooLargeError`). To filter on a hash, store it as lowercase hex in an indexed `str` (≤64 bytes recommended).
- **Exported constants:** `MAX_ATTRIBUTES`, `MAX_NAME_BYTES`, `MAX_STRING_BYTES`, `MAX_BYTES_LENGTH`, `MAX_ENTITY_BYTES`, `MAX_LIFETIME`, `MAX_SALT`, `I32_MIN/MAX`, `U64_MAX`, `U256_MAX`, `DECIMAL_SCALE`, `DECIMAL_UNIT`; `MAX_LIMIT` (from `/query`).

## 5. Query API

Sources: https://docs.arkiv.network/querying/select/ · /querying/filter/ · /querying/paginate/ · /querying/sort/ · /querying/count/ · /querying/get-entity/ · /querying/without-schema/ · /reference/query-language/ · /json-rpc/querying-data/ · SDK `src/query/*` [src]

### Public client Arkiv actions [src]

`select(selection?)`, `count()`, `query(exprOrString, opts?)`, `getEntity(key, schema?)`, `predictEntityKeys(...)`, `getEntityNonce(owner)`, `getBlockTiming()` (returns `{ currentBlock: bigint, currentBlockTime: number, blockDuration: number }`), `watchEntityEvents(...)`.

### Builder

```ts
import { and, or, eq, gt, gte, lt, lte, between, startsWith, exists, hasType, asc, desc } from "@arkiv-network/sdk/query"

const page = await publicClient
  .select({ $key: true, $createdAt: true, title: true, score: true })  // or select() / select("*")
  .from(Posts /*, { onMismatch: "throw" | "skip" (default) } */)
  .ownedBy(addr) /* and/or .createdBy(addr) */
  .where(and(eq("category", "news"), gt("score", dec("4"))))           // varargs/arrays, AND-ed across calls
  .orderBy(desc("score"))                                               // ONE key; call after from()
  .limit(20)            // 1..100, default 100
  .offset(40)           // integer >= 0
  .withCount()          // adds page.count (bigint)
  .fetch()
// page: { entities, blockNumber: bigint, skipped: number, count? }
```

- **Selection:** `$`-names are system fields and other names are columns. Rows are flat. Columns come back as typed values, so read `.value`. Reading an unselected field is a compile error.
  - `$attributes: true` returns a map of all attributes. `$attributeSchema: true` returns `{ name: { type, indexed } }` without values; it is **never included in `"*"`**, so select it by name.
  - A selection stored in a variable needs `as const`, or every field becomes optional.
- **Schema mismatch:** an entity that matches but doesn't fit is **skipped**, counted in `page.skipped`. That covers a missing required selected column, the wrong type, or another schema's tag. So a page can hold fewer than `limit` rows, or even zero, while later pages still have rows. `onMismatch: "throw"` throws `SchemaMismatchError` instead.
- **Conditions:** `eq`, `gt/gte/lt/lte`, `between(name, lo, hi)` (inclusive, same type for both bounds), `startsWith(name, prefix)` (str), `exists(name)`, `hasType(name, "i32")`, combined with `and(...)` / `or(...)`. Each condition's value type must match the column: `eq("score", 5)` against a `dec` column is a compile error.
- **NOT supported on Rabdi / SDK 1.0.1:** `ne` / `!=`, `not` / `NOT`, `atBlock`, cursors, `next()`, `hasNextPage()`, `for await`, `fromBlock`. To express "not X", list the values you want with `or(eq…)`. [docs older-networks + src exports]
- **Filterable system fields:** `$key` (key), `$owner` (addr), `$creator` (addr), `$expiresAt` (u64). `ownedBy(a)` is the same as `where(eq("$owner", addr(a)))`, and so on. **Calling `ownedBy` or `createdBy` again replaces the earlier filter.** [src]
- **Every query needs ≥1 condition.** A named schema's tag counts as one. Otherwise it throws `InvalidPredicateError`.
- **Sorting:**
  - `orderBy(asc|desc(name))` takes **one key only**, and calling it again replaces the key. It works on any non-`bytes` column, indexed or not, and on `$key`, `$owner`, `$creator` and `$expiresAt`. **`$createdAt` and `$updatedAt` can't be sorted**: sort them in JS, or store your own timestamp column.
  - Entities without the attribute, or with it stored as another type, sort first with `asc` and last with `desc`. Add `hasType(name, type)` to exclude them.
  - Ties come in the node's order.
  - Without a schema, give the type: `desc("score", "dec")`.
  - Without `orderBy`, "matches come oldest first" (paginate/sort pages) and also "the node's own order" (same page). Treat it as unspecified.
- **Pagination:**
  - Offset paging: sort by `$key` (or a stable column) so pages line up. Writes between requests shift offsets, so rows can repeat or be missed.
  - For exactly-once traversal, **page by key**: `orderBy(asc("$key"))` + `where(gt("$key", key(lastKey)))` + `onMismatch: "throw"` + `limit(100)`. A short page is the last one.
- **Count:** `publicClient.count().from(S).ownedBy(a).where(...).fetch()` returns `bigint`. It needs a condition. It **includes** schema-mismatched entities. Or add `.withCount()` on a select to get the total in the same request.
- **getEntity:**
  - `getEntity(key, Schema)` returns a typed full row and throws `SchemaMismatchError` if the entity doesn't fit.
  - `getEntity(key)` returns system fields plus `$attributes` (`ArkivValue | undefined` each).
  - A missing, deleted or expired entity throws `NoEntityFoundError` (with `.entityKey`).
- **No schema:** omit `.from()`. `where` takes any name, and values come back as `ArkivValue | undefined`, so check `.type`. A wrong-type filter isn't an error, it just doesn't match. Results include every project's data.
- **`query()` one-shot:** `publicClient.query(cond | rawString, { select?, orderBy?, limit?, offset?, count? })` returns `{ entities, blockNumber, count }`. A raw string goes to the node unchecked. An `orderBy` option is appended as `ORDER BY`, so the string must not contain its own.
- `builder.toString()` returns the exact query-language string sent, e.g. `arkiv.schema = str('my-app.posts') AND category = str('news') AND score > dec(4) ORDER BY score:dec DESC`.

### Raw query language

- Comparisons: `name = v`, `<`, `<=`, `>`, `>=`, `name BETWEEN lo AND hi`, `name STARTSWITH str('p')`, `EXISTS(name)`, `TYPEOF(name) = i32`.
- Combinators: `AND` binds tighter than `OR`; use parentheses. The `AND` inside `BETWEEN` belongs to `BETWEEN`.
- Sorting: `ORDER BY attr:type ASC|DESC` (default ASC). System fields don't need a type (`ORDER BY $expiresAt`). One key only.
- Keywords are case-insensitive. `--` starts a line comment.
- Literals: `true`, `i32(-7)`, `u64(1700000000)`, `u256(…)`, `dec(4.5)`, `str('it''s')` (quote doubled), `addr(0x…)`, `key(0x…)`. A bare number is `i32`.
- A comparison also checks the type. It only sees **indexed** attributes, but a sort reads unindexed attributes too.
- Node errors (`QueryError.kind`): `parse`, `type`, `literal`, `limits` (query length or nesting depth).

### JSON-RPC (reads)

| Method | Params | Result |
|---|---|---|
| `arkiv_query` | `[queryString, { select?, limit? (hex, 1..100), offset? (hex) }]` | `{ data: [entity…], blockNumber, count? }` |
| `arkiv_getEntity` | `[key]` | entity, or `null` if not live (all fields except `attributeSchema`) |
| `arkiv_getBlockTiming` | `[]` | `{ current_block, current_block_time (unix s), duration (s since prev block) }` |

- `select` fields (booleans): `key` (default), `owner`, `creator`, `createdAt`, `updatedAt`, `expiresAt`, `creationFlags`, `attributes` (or `{ attributes: { title: true } }` for a subset), `attributeSchema`, `count`.
- Attribute JSON values: `bool` is a boolean, `i32` a number, `u64`/`u256` hex quantities, `dec` a decimal string, `str` a string, `addr`/`key`/`bytes` hex.
- Error codes: `-32001` parse, `-32002` type, `-32003` literal, `-32004` limits, `-32602` bad limit. [MCP] `-32603` "arkiv serves state at the chain head only" for non-latest block tags.
- Writes have **no** `arkiv_*` method; see §7 for raw `execute` calldata.

## 6. Events and watching

Sources: https://docs.arkiv.network/querying/watch-events/ · https://docs.arkiv.network/json-rpc/mutating-entities/ · SDK `watchEntityEvents.ts` [src] · MCP `guides/known-issues`

```ts
const unwatch = publicClient.watchEntityEvents({
  onEntityCreated: ({ entityKey, owner, expiresAt, creationFlags }) => {},
  onEntityPatched: ({ entityKey, owner }) => {},
  onExpiryExtended: ({ entityKey, owner, expiresAt }) => {},     // owner = entity owner, not the extender
  onOwnershipTransferred: ({ entityKey, previousOwner, newOwner }) => {},
  onEntityDeleted: ({ entityKey, owner }) => {},
  onEvent: (e) => { switch (e.type) { case "EntityCreated": /*…*/ } },  // all events, in order; runs before the specific handler
  onError: (err) => {},          // transport/decode/handler errors; default is console.error
  pollingInterval: 1000,         // ms; default = half a block
})
unwatch()
```

- Every event has `entityKey`, `blockNumber`, `transactionHash` and `logIndex`. **Events carry no attribute values**: re-read the entity to see what changed. **There is no expiry event.**
- **There is no `fromBlock` in 1.0.1.** Watching starts at the head.
- On-chain events emitted by `0x44…44`:
  - `EntityCreated(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt, uint8 creationFlags)`
  - `EntityPatched(key, owner)`
  - `ExpiryExtended(key, owner, uint64 expiresAt)`
  - `OwnershipTransferred(key, previousOwner, newOwner)`
  - `EntityDeleted(key, owner)`
  - The ABI is exported as `ENTITY_EVENTS_ABI`.
- **[MCP known issue]** On Rabdi, `eth_getLogs` fails (`-32603 … NotImplemented`) for blocks with logs more than about **1,000 blocks (~30 min)** behind head. `eth_newFilter` and `eth_getBlockReceipts` are unavailable.
  - A watcher that falls behind errors on every poll and **never recovers on its own**. To recover: unwatch, start a new watcher, and reconcile current state with a query.
  - Backfill is impossible. For a specific older tx, use `eth_getTransactionReceipt`.

## 7. Limits, gas/fees and errors

Sources: https://docs.arkiv.network/reference/limits/ · https://docs.arkiv.network/reference/errors/ · https://docs.arkiv.network/json-rpc/mutating-entities/ · SDK `consts.ts`, `utils/arkivTransactions.ts` [src] · MCP `network_status` / `known-issues`

**Limits:** 32 attributes (31 named) · name ≤32 B · `str` ≤128 B · `bytes` ≤128 KiB per value and per create/patch total · lifetime ≤7,884,000 blocks · salt ≤128 bits · page ≤100 rows · the node also limits query length and nesting.

**Fees:**
- Writes cost GLM (tGLM on testnet). The docs give **no price table**, only that **a longer lifetime and more indexes cost more**.
- [src] If you omit `gas`, the SDK uses `min(estimate × 1.25, 2^24)`; an estimate already above 2^24 is used as is. Caller-supplied gas is used as is.
- [skills/MCP] Rabdi estimates can be too low. Recommended: `gas = max(1_000_000 + 400_000 × (ops − 1), 2 × estimate)`, at most `block.gasLimit / 2`. Use a fresh `latest` nonce and `eth_gasPrice`, and check `receipt.status`. Never auto-resend after an uncertain submission. [UNVERIFIED by us]

**SDK errors** (all from `@arkiv-network/sdk`, except `QueryError`, `InvalidPredicateError` and `UnsupportedOperatorError`, which come from `/query`):

| Area | Error | When |
|---|---|---|
| Writes | `EntityMutationError` | tx failed or reverted (not owner, no tGLM, out of gas…); `.txHash` if sent |
| | `SchemaMismatchError` | missing, unknown or wrong-type value |
| | `InvalidValueError` | out of range, bad checksum, >18 dp… |
| | `UntypedValueError` | value isn't typed or a plain bool/number/bigint/string/Uint8Array |
| | `MissingValueError` | `null` value (omit it or `unset` it instead) |
| | `EntityTooLargeError` | bytes >128 KiB |
| | `EmptyPatchError` / `ConflictingMutationError` | patch problems |
| | `InvalidExpiryError` | past, >max, or not whole blocks |
| | `InvalidCreationFlagsError` / `InvalidSaltError` / `NoRandomSourceError` | flags not boolean / salt out of range / no `crypto.getRandomValues` |
| Reads | `NoEntityFoundError` | `getEntity` miss |
| | `UnknownAttributeTypeError` | node returned a type this SDK can't decode (update the SDK) |
| | `InvalidPredicateError` | bad filter or sort, >1 sort key, or no condition |
| | `UnsupportedOperatorError` | `startsWith` with a non-str value |
| | `QueryError` | node rejected the query (`kind`) |
| Chains | `MissingAccessKeyError` | `rabdi()` without a string `accessKey` |
| Schemas | `InvalidAttributeNameError`, `SchemaDefinitionError`, `TooManyAttributesError` | definition problems |

**Contract revert errors** (raw `execute`): `EmptyBatch`, `InvalidOpType`, `NonCanonicalOperationData`, `AttributesNotSorted`, `TooManyAttributes`, `EmptyMutations`, `TombstoneInCreate`, `TombstoneValueNotEmpty`, `SystemAttributeNotWritable`, `InvalidValueType`, `Ident32Empty`, `Ident32InvalidByte`, `EntityNotFound`, `EntityExpired`, `NotOwner`, `ReadOnlyEntity`, `ReservedCreationFlags`, `ExpiryDeadOnArrival`, `ExpiryBeyondMaxLifetime`, `ExpiryNotExtended`, `TransferToZeroAddress`, `TransferToSelf`.

**Raw write format:**
- Send a tx to `0x4400…0044` calling `execute((uint8 op, bytes data)[])`, selector `0x49650044`, with value 0.
- Op codes and their data: 1 create `(uint128 salt, uint64 expiresAt, uint64 minLifetime, uint8 flags, Attribute[])` · 2 patch `(bytes32 key, Attribute[])` · 3 extend `(bytes32 key, uint64 expiresAt, uint64 minLifetime)` · 4 transfer `(bytes32 key, address)` · 5 delete `(bytes32 key)`.
- `Attribute = (bytes32 name, uint8 typeId, bytes value)`:
  - typeId: 0 tombstone, 1 bool, 2 i32, 3 u64, 4 u256, 5 dec (×1e18), 7 bytes, 8 str, 9 addr, 10 key. Add `|0x80` for indexed.
  - Attributes must be **sorted strictly ascending by name**.
- Expiry is resolved as `max(expiresAt, currentBlock + minLifetime)`.
- Key derivation: `keccak256(abi.encodePacked(uint256 chainId, address arkiv, address owner, uint64 nonce, uint128 salt))`. `entityNonce(address)` has selector `0x36917bfd`.

## 8. Encryption and privacy

Sources: https://docs.arkiv.network/start-here/introduction/ ("Arkiv is public") · `arkiv-encryption` npm README [skills/MCP; **not** in the official docs site]

- **Everything on Arkiv is public**: attribute names, values, owner, creator, expiry and events. The official docs have **no encryption page**. Their only guidance is to tag with a namespaced schema and filter by owner or creator to trust data.
- The skills repo points to the community package **`arkiv-encryption`** (latest 1.1.3, author SantiagoDevRel, MIT, Node 22+, WebCrypto).
  - API: `generateKey()` (64-hex secret), `importKey(hexOr32Bytes)`, `encryptBytes(key, data)` (AES-256-GCM, envelope `iv‖ct‖tag`), `decryptBytes(key, envelope)`, `CONTENT_TYPE = "application/vnd.arkiv.encrypted.v1"`, `MAX_PLAINTEXT_BYTES = 100000`.
  - Store the ciphertext in a `bytes` column, and a `contentType` str column next to it.
  - **Encrypted content can't be filtered**, and indexed columns stay public. [UNVERIFIED by us]
- **For WhitePay:**
  - Payer/merchant addresses, amounts and timestamps are public on Whitechain anyway, so mirroring them to Arkiv adds no leak.
  - Do **not** put phone numbers, names, UPI-style handles that link to a real identity, notes or KYC data in plain columns.
  - Put private memos in an encrypted `bytes` column, or keep them off Arkiv. Write down what we kept off Arkiv and why: the prize asks for this.

## 9. AI tools: skills, MCP and Claude Code plugin

Sources: https://docs.arkiv.network/start-here/agent-skill/ · https://hub.arkiv.network/ai-tools · github.com/Arkiv-Network/skills README · github.com/Arkiv-Network/ai-plugin README · live `tools/list` on mcp.arkiv.network (2026-11-05)

- **Claude Code plugin** (recommended: bundles skills, the MCP connection and project rules). Version 0.5.4, targets SDK `>=1.0.0 <2`.
  ```bash
  claude plugin marketplace add Arkiv-Network/ai-plugin
  claude plugin install arkiv@arkiv          # add --scope project for this repo only
  # or inside a session: /plugin marketplace add Arkiv-Network/ai-plugin  then  /plugin install arkiv@arkiv
  ```
  - Restart Claude Code after installing, then start with `/arkiv:arkiv`.
  - It needs Node 20+ on PATH for its SessionStart hook. The hook adds rules only if `package.json` depends on `@arkiv-network/sdk`.
  - Telemetry header opt-out: `ARKIV_TELEMETRY=off`.
- **MCP server** (no key needed): **`https://mcp.arkiv.network/mumbai`** is the ETHGlobal Mumbai profile, the plugin default through 2026-11-10. The General profile is `https://mcp.arkiv.network/`. Transport is streamable HTTP.
  - Manual add in Claude Code: `claude mcp add --transport http arkiv https://mcp.arkiv.network/mumbai` [UNVERIFIED command form; standard Claude Code syntax].
  - Live tools (read-only unless noted):
    - Status and docs: `server_status`, `network_status`, `search_knowledge`, `read_knowledge`, `list_knowledge`.
    - Packages and skills: `list_packages`, `get_package`, `list_skills`, `get_skill`, `get_workflow`.
    - Hackathon checks: `check_schema`, `check_submission` (check a draft against the Mumbai prize rules).
    - Modelling and verification: `generate_entity_model` (Postgres to SDK schema), `verify_entity`, `verify_tx`.
    - Optional and consent-gated: `submit_feedback`, `report_outcome`.
  - `server_status` currently reports `id: mumbai`, serverVersion 2.1.0, event dates 2026-11-05 to 2026-11-07.
- **Standalone skills** (`Arkiv-Network/skills`):
  ```bash
  npx skills add Arkiv-Network/skills --skill arkiv
  ```
  - Swap `arkiv` for a skill name to install one skill. `--all` installs all of them; `-g` / `--global` installs user-wide.
  - Skills: `arkiv` (router), `arkiv-first-write`, `arkiv-data-modeling`, `arkiv-query`, `arkiv-entity-lifecycle`, `arkiv-entity-expiration`, `arkiv-write-safety`, `arkiv-app-integration`, `arkiv-security-trust`, `arkiv-troubleshooting`, `arkiv-encryption`, `arkiv-large-files`, `arkiv-social-graph`, `arkiv-indexing`, `arkiv-feedback`, `arkiv-mcp`.
  - The docs page still says to install **`arkiv-best-practices`**, which is now a **deprecated** entrypoint.

## 10. WhitePay mapping

Our design, based on the API above. **[UNVERIFIED]: not yet compiled or run against Rabdi.** Run `tsc` on it before relying on it.

Principles:
- The **backend wallet owns every entity** (`BACKEND = 0x…`). Every read uses `.ownedBy(BACKEND)`, because anyone can forge the `whitepay.*` tag.
- Customers and merchants are identified by **indexed `addr` columns**, not by `$owner`.
- `$createdAt` can't be filtered or sorted, so we store our own **`u64` unix-seconds** timestamps, indexed.
- USDT amounts are **`u256` base units** (exact, sortable, range-filterable). Confirm USDT decimals on Whitechain.
- Status values are short lowercase `str` values (indexed). "Not equal" isn't available, so query for the positive values.
- Collect-request validity (1 min to 45 days) is the **entity expiration**: an expired request vanishes from queries automatically. Use `fromMinutes(n)`, which always gives whole blocks.

```ts
// lib/arkiv/schemas.ts
import { defineSchema, addr, u64, u256, str, key, bytes, i32 } from "@arkiv-network/sdk/schema"

export const Receipt = defineSchema("whitepay.receipt", {
  merchant:   addr().indexed(),
  payer:      addr().indexed(),
  amount:     u256().indexed(),           // USDT base units
  token:      addr(),                      // USDT contract on Whitechain
  status:     str().indexed(),             // "paid" | "refunded" | "disputed"
  paidAt:     u64().indexed(),             // unix seconds (Whitechain block time)
  wcTxHash:   str().indexed(),             // lowercase 0x… (66 B): idempotency + lookup
  wcBlock:    u64(),
  requestRef: key().indexed().optional(),  // whitepay.request it settled, if any
  merchantId: str().indexed().optional(),  // e.g. "chai.stall@whitepay" (public! no PII)
  memo:       bytes().optional(),          // encrypted envelope only
})

export const PayRequest = defineSchema("whitepay.request", {
  merchant:   addr().indexed(),
  payer:      addr().indexed(),
  amount:     u256().indexed(),
  token:      addr(),
  status:     str().indexed(),             // "pending" | "paid" | "declined" | "cancelled"
  requestedAt: u64().indexed(),            // unix seconds
  validUntil: u64(),                       // unix seconds, for UI; Arkiv expiry enforces it
  receiptRef: key().optional(),            // set when paid
  note:       str().optional(),            // <=128 bytes, public
})

export const Dispute = defineSchema("whitepay.dispute", {
  receiptRef: key().indexed(),
  merchant:   addr().indexed(),
  payer:      addr().indexed(),
  status:     str().indexed(),             // "open" | "resolved" | "rejected"
  reason:     str().indexed(),             // short code, e.g. "not_received"
  openedAt:   u64().indexed(),
  resolvedAt: u64().optional(),
  evidence:   bytes().optional(),          // encrypted
})

export const Daily = defineSchema("whitepay.daily", {
  merchant:   addr().indexed(),
  day:        u64().indexed(),             // unix day index = floor(ts / 86400) (UTC; IST offset if wanted)
  volume:     u256(),                      // sum of paid amounts
  txCount:    i32(),
  refunds:    u256().default(0n),
  updatedAt:  u64(),
})
```

Recommended lifetimes:
- Receipt: `ExpirationTime.max()` (~182 days). Run a job that re-extends receipts still needed, before they expire.
- Request: `fromMinutes(validityMin)`.
- Dispute: `fromDays(90)`, extended while open.
- Daily: `fromDays(180)`.
- Consider `flags: { readonly: true }` on receipts, but then status can't be patched. Alternative: keep receipts mutable and record refunds as a separate entity.

**Query: merchant X's paid receipts, last 7 days, newest first**

```ts
import { eq, gte } from "@arkiv-network/sdk/query"
import { desc } from "@arkiv-network/sdk/query"
import { addr, u64 } from "@arkiv-network/sdk/schema"

const since = BigInt(Math.floor(Date.now() / 1000) - 7 * 86_400)
const page = await publicClient
  .select({ $key: true, payer: true, amount: true, paidAt: true, wcTxHash: true })
  .from(Receipt)
  .ownedBy(BACKEND)
  .where(eq("merchant", addr(X)), eq("status", "paid"), gte("paidAt", u64(since)))
  .orderBy(desc("paidAt"))
  .limit(50).offset(0)
  .withCount()
  .fetch()
// page.entities[i].amount.value: bigint · page.count: bigint · page.skipped: number
// Raw form:
// arkiv.schema = str('whitepay.receipt') AND $owner = addr(0xBACKEND) AND merchant = addr(0xX)
//   AND status = str('paid') AND paidAt >= u64(1730160000) ORDER BY paidAt:u64 DESC
```

**Query: pending collect requests for payer Y** (expired ones are already gone)

```ts
import { asc } from "@arkiv-network/sdk/query"
const pending = await publicClient
  .select({ $key: true, $expiresAt: true, merchant: true, amount: true, note: true, validUntil: true })
  .from(PayRequest)
  .ownedBy(BACKEND)
  .where(eq("payer", addr(Y)), eq("status", "pending"))
  .orderBy(asc("$expiresAt"))          // soonest-expiring first
  .limit(100)
  .fetch()
```

**Batch: on a confirmed Whitechain USDT payment that settles a request**

```ts
import { ExpirationTime } from "@arkiv-network/sdk"
import { key } from "@arkiv-network/sdk/schema"

const [r] = await publicClient.predictEntityKeys({ owner: BACKEND, count: 1 })
const res = await walletClient.executeBatch({
  creates: [{
    schema: Receipt, salt: r.salt, expiration: ExpirationTime.max(),
    values: { merchant: addr(m), payer: addr(p), amount: amt, token: addr(USDT), status: "paid",
              paidAt: u64(ts), wcTxHash: txHash.toLowerCase(), wcBlock: u64(blk), requestRef: key(reqKey) },
  }],
  patches: [
    { schema: PayRequest, entityKey: reqKey, set: { status: "paid", receiptRef: key(r.key) } },
    { schema: Daily, entityKey: dailyKey, set: { volume: newVol, txCount: newCount, updatedAt: u64(ts) } },
  ],
}, { gas: 2_000_000n })   // explicit floor per §7 guidance: 1M + 400k×(3−1) = 1.8M [UNVERIFIED]
const receiptKey = res.createdEntities[0]   // should equal r.key
```

Implementation notes:
- **Serialize all backend writes.** Use one signer and a queue; nonce races also break `predictEntityKeys`.
- **Idempotency:** before creating a receipt, check `count().from(Receipt).ownedBy(BACKEND).where(eq("wcTxHash", h)).fetch()`.
- `Daily` needs a read-modify-write. The first payment of the day `creates` it, so find it with `where(eq("merchant", …), eq("day", u64(d)))`.
- Patching a request that has already expired reverts with `EntityExpired`, and the whole batch fails. Check `$expiresAt` against `getBlockTiming().currentBlock` first, or handle `EntityMutationError` by writing the receipt alone.
- **Live dashboard:** `watchEntityEvents({ onEntityCreated })`, then `getEntity(key, Receipt)`, filtering on `owner === BACKEND`. Events have no attributes. Reconcile with a query after any `onError`, because of the ~1000-block log window.
- **Next.js:** run queries in route handlers or server components with a server-only `ARKIV_ACCESS_KEY` (IP allowlist if the host has a static IP). If a browser key is unavoidable, restrict it with Origins.
- **Prize deliverables** (from the Mumbai prize page via MCP):
  - README: writer wallet address(es) and one runnable query.
  - `/arkiv/schema.md`, `/arkiv/friction.md`, `/arkiv/reach.md`, `/arkiv/why-arkiv.md`, `/arkiv/how-you-use-arkiv.md`.
  - At least one user-visible feature must **read** from Arkiv.
  - Public open-source repo, with an AI-usage statement.
  - `check_schema` / `check_submission` on the MCP can pre-check these.

## 11. Gotchas, doc inconsistencies and version changes

1. **The TypeDoc API reference is stale (pre-1.0).** It shows `createEntity({ payload, contentType, attributes, expires })`, `@arkiv-network/sdk/attr`, `jsonToPayload`, `stringToPayload`, `MimeType`, `MAX_PAYLOAD_BYTES`, `InvalidContentTypeError`, `NoMoreResultsError`, `getEntityCount()`, `SelectQueryBuilder.cursor()/atBlock()`, `QueryResult.next()/hasNextPage()`, `watchEntityEvents({ fromBlock })`, and chains `tiramisu`/`localhost` only. **1.0.1 has none of these** (it has `rabdi`, `localhost`). Trust the guide pages and `node_modules/@arkiv-network/sdk/dist/*.d.ts`.
2. **`llms.txt`** advertises `ne`, `not`, `cursor`, `next`, `for await` and `atBlock`, and `llms-full.txt` returns 404. The SDK 1.0.1 `/query` exports are only `and, or, eq, gt, gte, lt, lte, between, startsWith, exists, hasType, asc, desc, render, runQuery, …`. **There is no `ne`/`not`.**
3. The column-types page says "every indexed column takes `eq`, `ne`, …". That is wrong for Rabdi and 1.0.1.
4. Option names changed: **`expiration`** (not `expires`) on create, extend and batch items. Create and patch take the **schema as the first positional arg**, while extend, transfer and delete take one object. There is no payload or content type: store blobs in `bytes`.
5. `ExpirationTime.max()` and `MAX_LIFETIME` exist only in **1.0.1+**. On 1.0.0, an over-max expiry reverted on-chain instead of throwing locally.
6. Extending counts **from now**, not additively.
7. `getBlockTiming()` (SDK) returns camelCase `{ currentBlock, currentBlockTime, blockDuration }`, while JSON-RPC returns snake_case.
8. `$createdAt` and `$updatedAt` can be selected but **can't be filtered or sorted**. Add your own `u64` time column.
9. `ownedBy` / `createdBy` replace the previous filter instead of AND-ing. A bare `5` is `i32` and a bare `5n` is `u256`, so wrap `u64(…)` and `dec(…)`.
10. Pages can be short or empty (`skipped`) while more data exists. Don't treat a short page as the end unless you use `onMismatch: "throw"`.
11. Reads are **head-only**: no historical reads, and `-32603` for old block tags. Multi-page scans aren't snapshot-consistent.
12. Rabdi `eth_getLogs` only works for about the last 1,000 blocks (Arkiv issue #283). Watchers can't backfill or recover by themselves. [MCP known-issues]
13. Gas estimates can be low. Consider explicit `gas` (§7).
14. The docs agent-skill page names `arkiv-best-practices`; the skills repo deprecates it in favour of `arkiv`.
15. The SDK README's sample `package.json` still shows `"@arkiv-network/sdk": "^0.9.0"`. Pin `1.0.1`.
16. Undocumented but present in 1.0.1: `publicClient.getEntityNonce(owner)`, `predictEntityKey()`, `ExpirationTime.fromYears` (always over the max), `CountQueryBuilder`, `SYSTEM_FIELDS`, `render`, `runQuery`, `toRpcSelect`, `INDEXED_FLAG`.
17. Never put a keyed RPC URL in a user's wallet (`addChain` / wagmi). Use `rabdi({ accessKey: "" })` there.
18. The data in the prize page and MCP is a dated snapshot (checked 2026-11-03). Re-check `server_status` before relying on it.
