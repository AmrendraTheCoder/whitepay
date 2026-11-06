// Arkiv entity schemas for WondrPay (Rabdi testnet, chain 7794095, @arkiv-network/sdk 1.0.1).
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
  merchantName: str().indexed().optional(), // payee display/ENS name, e.g. chai-shop.wondrpay.eth
  kind: str().indexed().optional(), // "p2m" (merchant order) | "p2p" (person push); `merchant` = payee for p2p
  memo: bytes().optional(), // encrypted envelope only
  item: str().optional(), // what was bought, from the shop's signed order note (e.g. "1×Masala Chai Kit")
  orderId: str().indexed().optional(), // the shop's order id (bytes32 hex), to map back to its own records
  // WondrPay for Business: which website / payment link it came from, and the shop's own reference
  site: str().indexed().optional(),
  link: str().indexed().optional(),
  reference: str().indexed().optional(),
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
  // WondrPay for Business checkout sessions (API key orders)
  site: str().indexed().optional(), // MerchantSite.siteId that created it
  reference: str().indexed().optional(), // the shop's own order id (<=64 chars)
  successUrl: str().optional(), // where the hosted checkout sends the customer after paying
  cancelUrl: str().optional(),
  link: str().indexed().optional(), // PayLink.linkId when a payment link created it
})

/** One webhook delivery to a shop's website (WondrPay for Business): what was sent and how the shop's server
 *  answered, for the portal's delivery log and "Resend". Lives 30 days. */
export const WebhookDelivery = defineSchema("whitepay.webhook", {
  site: str().indexed(),
  merchant: addr().indexed(),
  eventId: str().indexed(),
  event: str().indexed(), // "checkout.session.completed" | "test.ping"
  sessionId: str().indexed().optional(),
  url: str(),
  status: str().indexed(), // "delivered" | "failed"
  httpStatus: i32(), // 0 = no answer / unsafe URL
  attempts: i32(),
  at: u64().indexed(),
  payload: bytes(), // the JSON body, so it can be re-sent byte for byte
})

/** A fixed-price payment link (WondrPay for Business): anyone with the link can pay it; each visit makes a fresh
 *  checkout session signed by WondrPay's order key for the link's website. */
export const PayLink = defineSchema("whitepay.paylink", {
  linkId: str().indexed(), // "pl_" + 20 hex
  merchant: addr().indexed(),
  site: str().indexed(),
  title: str(),
  amount: u256(),
  status: str().indexed(), // "active" | "disabled"
  createdAt: u64().indexed(),
  updatedAt: u64(),
  approval: bytes(),
})

/** A shop's website on WondrPay for Business: its keys and allowed domains. The secret key is stored only as a
 *  SHA-256 hash (keys are 32 random bytes, so the hash can be public). `approval` is the owner's signature. */
export const MerchantSite = defineSchema("whitepay.site", {
  siteId: str().indexed(), // 16 random bytes, hex
  merchant: addr().indexed(),
  name: str(),
  domains: str(), // comma separated hostnames
  webhook: str().optional(),
  mode: str().indexed(), // "test" (Whitechain Sepolia)
  publishableKey: str().indexed(),
  secretHash: str(), // sha256(secret key), hex
  secretHint: str(), // last 4 characters, for the portal
  status: str().indexed(), // "active" | "revoked"
  createdAt: u64().indexed(),
  updatedAt: u64(),
  approval: bytes(), // owner's EIP-191 signature over siteApprovalMessage (65 bytes)
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
 *  Written by the WondrPay backend after a merchant signs up and is registered on-chain. */
export const MerchantProfile = defineSchema("whitepay.merchant", {
  address: addr().indexed(),
  label: str().indexed(), // ENS label, e.g. "chai-shop"
  ensName: str().indexed(), // full name, e.g. "chai-shop.wondrpay.eth"
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

/** Public directory of personal WondrPay names (address -> name), so an address shows its name. */
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
  auths: bytes().optional(), // v1: cycles × 65-byte ReceiveWithAuthorization signatures
  vault: addr().indexed().optional(), // v2: the per-subscription AutopayMandate clone (one permit signature)
  mode: str().indexed().optional(), // "reminder" (approve each payment when asked) | "autopay" (approve once); missing = autopay
  nextCycle: i32().optional(), // index of the payment that is requested / scheduled next
  missedCycles: i32().optional(), // reminder mode: payments not approved inside their window (skipped)
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

// ---------------------------------------------------------------- Rewards (see packages/server/src/rewards.ts)
/** A scratch card earned by paying a listed shop. Arkiv expiry = the card's validity (30 days).
 *  The prize is NOT stored until scratched: it is derived server-side from a secret, so nobody
 *  can read the outcome off Arkiv before scratching. */
export const Reward = defineSchema("whitepay.reward", {
  owner: addr().indexed(),
  merchant: addr().indexed(),
  merchantName: str().optional(),
  paymentTx: str().indexed(), // the qualifying Whitechain payment (idempotency: one card per payment)
  paidAmount: u256(),
  earnedAt: u64().indexed(),
  status: str().indexed(), // "new" | "scratched"
  prize: str().indexed().optional(), // "cashback" | "offer" | "none" (set on scratch)
  amount: u256().optional(), // cashback in USDT base units
  gasMicro: u256().optional(), // gas WondrPay paid to relay the payment, micro-USD (funds come from fee − gas)
  offerText: str().optional(),
  offerCode: str().optional(),
  payoutTx: str().optional(),
  scratchedAt: u64().optional(),
})

/** A shop's public offer, shown on the Rewards page and won from scratch cards. Set by the merchant's signature. */
export const ShopOffer = defineSchema("whitepay.offer", {
  merchant: addr().indexed(),
  merchantName: str().optional(),
  displayName: str().optional(),
  text: str(), // e.g. "10% off your next chai" (<=80 chars)
  code: str(), // e.g. "CHAI10"
  active: bool().indexed().default(true),
  updatedAt: u64().indexed(),
})

// ---------------------------------------------------------------- refund requests
/** One immutable event in a refund case. Created by the WondrPay writer ($creator), then ownership is
 *  moved to the burn address 0x…dEaD, so NOBODY (WondrPay included) can edit or delete it; it only expires.
 *  Authenticity: readers keep only events created by the writer AND carrying a valid signature of
 *  the party that acted (payer for opened/reply, the shop's payout wallet for response). */
export const RefundEvent = defineSchema("whitepay.refundevt", {
  caseId: str().indexed(), // keccak(paymentId, payer): one case per order
  paymentId: str().indexed(),
  merchant: addr().indexed(),
  payer: addr().indexed(),
  kind: str().indexed(), // "opened" | "renewed" | "response" | "reply"
  round: i32(), // 1, 2, ... (each unanswered 7-day window re-opens as the next round)
  at: u64().indexed(),
  deadline: u64(), // opened/renewed: end of this 7-day window; response/reply: at + 12 h
  amount: u256(), // what was paid
  item: str().optional(),
  reason: str().optional(), // opened: category
  message: str().optional(), // opened: the payer's proof text; response/reply: message
  evidence: str().optional(), // opened/reply: optional https link to proof
  decision: str().optional(), // response: "approve" | "reject"
  percent: i32().optional(), // response approve: 1..100
  refundAmount: u256().optional(),
  refundTx: str().optional(), // response approve: Whitechain tx that paid the refund
  human: str().indexed().optional(), // opened: World ID nullifier for the refund action (per human, not per wallet)
  signedAt: u64(), // the timestamp inside the signed message
  sig: bytes(), // EIP-191 signature of the actor over the canonical message
})
