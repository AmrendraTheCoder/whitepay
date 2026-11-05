// Arkiv entity schemas for WhitePay (Rabdi testnet, chain 7794095, @arkiv-network/sdk 1.0.1).
// Design notes: docs/arkiv-reference.md §10.
//  - The backend wallet owns every entity; ALWAYS read with .ownedBy(BACKEND): anyone can write our tags.
//  - $createdAt is not filterable, so each schema carries its own indexed u64 unix-seconds timestamp.
//  - Amounts are u256 USDT base units (6 decimals).
//  - Everything is public: no PII in clear text; encrypted envelopes only in bytes columns.
import { defineSchema, addr, u64, u256, str, key, bytes, i32 } from "@arkiv-network/sdk/schema"

export const Receipt = defineSchema("whitepay.receipt", {
  merchant: addr().indexed(),
  payer: addr().indexed(),
  amount: u256().indexed(),
  token: addr(),
  status: str().indexed(), // "paid" | "partially_refunded" | "refunded" | "disputed"
  paidAt: u64().indexed(),
  paymentId: str().indexed(), // router paymentId (order digest), lowercase 0x…
  wcTxHash: str().indexed(), // idempotency + explorer link
  wcBlock: u64(),
  refunded: u256().default(0n),
  requestRef: key().indexed().optional(),
  merchantName: str().indexed().optional(), // ENS name, e.g. chai-shop.whitepay.eth
  memo: bytes().optional(), // encrypted envelope only
})

export const PayRequest = defineSchema("whitepay.request", {
  merchant: addr().indexed(),
  payer: addr().indexed(),
  amount: u256().indexed(),
  token: addr(),
  status: str().indexed(), // "pending" | "paid" | "declined" | "cancelled"
  requestedAt: u64().indexed(),
  validUntil: u64(), // UI countdown; Arkiv expiration enforces it
  orderId: str().indexed(),
  merchantName: str().optional(),
  receiptRef: key().optional(),
  note: str().optional(), // <=128 bytes, public
})

export const Dispute = defineSchema("whitepay.dispute", {
  receiptRef: key().indexed(),
  paymentId: str().indexed(),
  merchant: addr().indexed(),
  payer: addr().indexed(),
  status: str().indexed(), // "open" | "resolved" | "rejected"
  reason: str().indexed(), // "not_received" | "wrong_amount" | "duplicate" | "other"
  openedAt: u64().indexed(),
  resolvedAt: u64().optional(),
  evidence: bytes().optional(), // encrypted
})

export const Daily = defineSchema("whitepay.daily", {
  merchant: addr().indexed(),
  day: u64().indexed(), // floor(unix / 86400), UTC
  volume: u256(),
  txCount: i32(),
  refunds: u256().default(0n),
  updatedAt: u64(),
})

export const ARKIV_CHAIN_ID = 7794095
export const ARKIV_RPC = "https://rpc.rabdi.db-chain.testnet.arkiv.network"
export const ARKIV_EXPLORER = "https://rabdi.explorer.arkiv.network"
