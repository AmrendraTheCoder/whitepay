// Arkiv entity schemas for WhitePay (Rabdi testnet, chain 7794095, @arkiv-network/sdk 1.0.1).
// Design notes: docs/arkiv-reference.md §10.
//  - The backend wallet owns every entity; ALWAYS read with .ownedBy(BACKEND): anyone can write our tags.
//  - $createdAt is not filterable, so each schema carries its own indexed u64 unix-seconds timestamp.
//  - Amounts are u256 USDT base units (6 decimals).
//  - Everything is public: no PII in clear text; encrypted envelopes only in bytes columns.
import { defineSchema, addr, u64, u256, str, key, bytes, i32, bool } from "@arkiv-network/sdk/schema"

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
  merchantName: str().indexed().optional(), // payee display/ENS name, e.g. chai-shop.whitepay.eth
  kind: str().indexed().optional(), // "p2m" (merchant order) | "p2p" (person push); `merchant` = payee for p2p
  memo: bytes().optional(), // encrypted envelope only
})

/** A payment in progress. Lives only for its TTL (Arkiv expiration == on-chain order deadline).
 *  Carries the full signed order so a payer can verify it without trusting Arkiv:
 *  recompute `digest` from (merchant, amount, orderId, deadline) and check `merchantSig`
 *  against the MerchantRegistry signer on Whitechain. */
export const PayRequest = defineSchema("whitepay.request", {
  kind: str().indexed(), // "p2m_qr" | "invoice"
  merchant: addr().indexed(),
  amount: u256().indexed(),
  token: addr(),
  status: str().indexed(), // "pending" | "paid" | "declined" | "cancelled"
  requestedAt: u64().indexed(),
  deadline: u64(), // == order.deadline == Arkiv expiry (approx, block-rounded)
  orderId: str().indexed(), // bytes32 hex
  digest: str().indexed(), // EIP-712 order digest == router paymentId == EIP-3009 nonce
  merchantSig: bytes(), // 65-byte order signature
  merchantName: str().optional(), // ENS name shown to the payer
  payer: addr().indexed().optional(), // set for invoices; unknown for a dynamic QR until paid
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

/** Public merchant directory (UPI "merchant whitelist"): who a payee is, shown before paying.
 *  Written by the WhitePay backend after a merchant signs up and is registered on-chain. */
export const MerchantProfile = defineSchema("whitepay.merchant", {
  address: addr().indexed(),
  label: str().indexed(), // ENS label, e.g. "chai-shop"
  ensName: str().indexed(), // full name, e.g. "chai-shop.whitepay.eth"
  displayName: str(),
  category: str().optional(),
  registeredAt: u64().indexed(),
  verified: bool().default(false), // set after World ID verification of the owner
  registryTx: str().optional(),
})

/** World ID uniqueness claims: one human -> one claim per action. The nullifier is RP-scoped and
 *  reveals no identity; storing it publicly is what lets anyone audit "one shop per human". */
export const WorldClaim = defineSchema("whitepay.worldclaim", {
  action: str().indexed(), // "ens-claim"
  nullifier: str().indexed(), // decimal string from the proof
  address: addr().indexed(), // wallet the proof was bound to (signal)
  purpose: str().indexed(), // "merchant-verify" | "name-claim"
  verifiedAt: u64().indexed(),
})

export const ARKIV_CHAIN_ID = 7794095
export const ARKIV_RPC = "https://rpc.rabdi.db-chain.testnet.arkiv.network"
export const ARKIV_EXPLORER = "https://rabdi.explorer.arkiv.network"
