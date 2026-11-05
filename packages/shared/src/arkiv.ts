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
  webhook: str().optional(), // merchant server URL notified when paid (<=128 bytes)
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

/** Public directory of personal WhitePay names (address -> name), so an address shows its name. */
export const PersonProfile = defineSchema("whitepay.person", {
  address: addr().indexed(),
  label: str().indexed(),
  ensName: str().indexed(),
  registeredAt: u64().indexed(),
  ensIssued: bool().default(false), // true once the ENSv2 subname tx confirmed
})

export const ARKIV_CHAIN_ID = 7794095
export const ARKIV_RPC = "https://rpc.rabdi.db-chain.testnet.arkiv.network"
export const ARKIV_EXPLORER = "https://rabdi.explorer.arkiv.network"

// ---------------------------------------------------------------- Autopay (see autopay.ts)
/** A merchant's signed subscription offer. Lives until the offer expires. */
export const SubPlan = defineSchema("whitepay.plan", {
  merchant: addr().indexed(),
  merchantName: str().optional(),
  title: str(), // e.g. "Chai Club" (<=128 bytes)
  amount: u256().indexed(),
  period: u64(), // seconds
  periodKey: str(), // demo | daily | weekly | monthly
  cycles: i32(),
  planId: str().indexed(),
  expiresAt: u64(),
  merchantSig: bytes(),
  single: bool().default(false), // one subscriber only (checkout-button plans)
  status: str().indexed(), // "open" | "subscribed"
  mandateRef: key().optional(), // set when a single-use plan is taken
  webhook: str().optional(),
  createdAt: u64().indexed(),
})

/** The subscriber's standing approval: all cycle authorizations, signed once. */
export const Mandate = defineSchema("whitepay.mandate", {
  subscriber: addr().indexed(),
  merchant: addr().indexed(),
  merchantName: str().optional(),
  title: str(),
  planRef: key().indexed(),
  subscriptionId: str().indexed(), // bytes32
  amount: u256(),
  period: u64(),
  grace: u64(),
  cycles: i32(),
  startAt: u64().indexed(),
  paidCycles: i32().default(0),
  nextDueAt: u64().indexed(),
  status: str().indexed(), // "active" | "completed" | "cancelled" | "failed"
  auths: bytes(), // cycles × 65-byte ReceiveWithAuthorization signatures
  webhook: str().optional(),
  lastTx: str().optional(),
  updatedAt: u64().indexed(),
})

/** One upcoming charge. Arkiv expiry = dueAt + grace: the entity IS the countdown. */
export const DueCycle = defineSchema("whitepay.due", {
  mandateRef: key().indexed(),
  subscriber: addr().indexed(),
  merchant: addr().indexed(),
  cycle: i32().indexed(),
  amount: u256(),
  dueAt: u64().indexed(),
  status: str().indexed(), // "scheduled" | "retrying"
  attempts: i32().default(0),
  lastError: str().optional(),
})
