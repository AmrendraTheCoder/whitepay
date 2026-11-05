# Arkiv schema (Rabdi testnet, chain 7794095, `@arkiv-network/sdk` 1.0.1)

- **Writer / owner of every entity:** `0x4D5910272479420d1383100b3986d5fc9d5D658F` (WhitePay backend).
- **Every read filters on `$owner`,** because anyone can write entities that reuse our schema names.
- **Amounts** are `u256` USDT base units (6 decimals).
- **Timestamps** are our own indexed `u64` unix seconds, because `$createdAt` can't be filtered.
- **Source:** `packages/shared/src/arkiv.ts`.

## `whitepay.request`: a payment in progress (dynamic QR / invoice)
| Field | Type | Indexed | Notes |
|---|---|---|---|
| kind | str | ✔ | `p2m_qr` \| `invoice` |
| merchant | addr | ✔ | payee shop |
| amount | u256 | ✔ | |
| token | addr | | USDT `0xcedf…55a7` |
| status | str | ✔ | `pending` → `paid` |
| requestedAt | u64 | ✔ | |
| deadline | u64 | | equals the on-chain order deadline |
| orderId | str | ✔ | bytes32 hex |
| digest | str | ✔ | EIP-712 order digest = router paymentId = EIP-3009 nonce |
| merchantSig | bytes | | 65-byte order signature by the shop's own key |
| merchantName | str | | ENS name |
| payer | addr | ✔ opt | set when paid / for invoices |
| receiptRef | key | opt | → `whitepay.receipt` |
| note, webhook | str | opt | |

**Expiry:** the order TTL, **1–30 min** (QR default 5 min). The same deadline is enforced on-chain, so an expired request disappears from Arkiv *and* reverts with `OrderExpired`.
```
arkiv.schema = str('whitepay.request') AND $owner = addr(0x4D5910272479420d1383100b3986d5fc9d5D658F) AND merchant = addr(0x66858D8623a401aE16eD320b6F927EA796d01254) AND status = str('pending')
```

## `whitepay.receipt`: a settled payment
| Field | Type | Indexed |
|---|---|---|
| merchant (payee), payer | addr | ✔ |
| amount | u256 | ✔ |
| token | addr | |
| status | str | ✔ |
| paidAt | u64 | ✔ |
| paymentId, wcTxHash | str | ✔ |
| wcBlock | u64 | |
| refunded | u256 | (default 0) |
| requestRef | key | ✔ opt |
| merchantName, kind (`p2m`\|`p2p`) | str | ✔ opt |
| memo | bytes | opt (encrypted only) |

**Expiry:** max lifetime (~182 days).
```
arkiv.schema = str('whitepay.receipt') AND $owner = addr(0x4D5910272479420d1383100b3986d5fc9d5D658F) AND merchant = addr(0xCF69aAdd6357Afd3C1b5EcFE3eecA134f49b6e10) ORDER BY paidAt:u64 DESC
```

## `whitepay.merchant`: public shop directory
| Field | Type | Indexed |
|---|---|---|
| address | addr | ✔ |
| label, ensName | str | ✔ |
| displayName, category, registryTx | str | (category/registryTx optional) |
| registeredAt | u64 | ✔ |
| verified | bool | (default false; set after World ID) |

**Expiry:** ~182 days.
```
arkiv.schema = str('whitepay.merchant') AND $owner = addr(0x4D5910272479420d1383100b3986d5fc9d5D658F) AND label = str('masala-corner')
```

## `whitepay.person`: public personal-name directory (address → name)
| Field | Type | Indexed |
|---|---|---|
| address | addr | ✔ |
| label, ensName | str | ✔ |
| registeredAt | u64 | ✔ |
| ensIssued | bool | (default false) |

**Expiry:** ~182 days.
```
arkiv.schema = str('whitepay.person') AND $owner = addr(0x4D5910272479420d1383100b3986d5fc9d5D658F) AND address = addr(0x0916BDBd7A032d4253BA7A2d8eb479364c067ea8)
```

## `whitepay.worldclaim`: World ID uniqueness record
| Field | Type | Indexed |
|---|---|---|
| action | str | ✔ |
| nullifier | str | ✔ (decimal; RP-scoped, reveals no identity) |
| address | addr | ✔ |
| purpose | str | ✔ (`name-claim` \| `merchant-verify`) |
| verifiedAt | u64 | ✔ |

**Expiry:** ~182 days.
```
arkiv.schema = str('whitepay.worldclaim') AND $owner = addr(0x4D5910272479420d1383100b3986d5fc9d5D658F) AND purpose = str('name-claim')
```

## Defined, not yet written by the app
| Schema | Fields (indexed ✔) | Planned expiry |
|---|---|---|
| `whitepay.dispute` | receiptRef ✔, paymentId ✔, merchant ✔, payer ✔, status ✔, reason ✔, openedAt ✔, resolvedAt, evidence (bytes, encrypted) | 90 days |
| `whitepay.daily` | merchant ✔, day ✔ (unix day), volume, txCount (i32), refunds, updatedAt | 180 days |
