// WondrPay Autopay (UPI AutoPay-style subscriptions), shared by app, server and SDK.
//
//  Plan     merchant signs the terms (EIP-712 "SubscriptionPlan"): amount, period, number of cycles.
//  Mandate  the subscriber approves ONCE (PIN / fingerprint) and signs one EIP-3009
//           ReceiveWithAuthorization per cycle. Cycle i can only execute inside its own window
//           [dueAt_i - EARLY, dueAt_i + grace], only through the WondrPay router (to = router),
//           only to that merchant, only that amount. The USDT contract enforces all of it.
//  Due      one Arkiv entity per upcoming cycle. Its Arkiv expiry is the countdown. When the timer
//           hits 0 the keeper pays that cycle, deletes the entity and creates the next one:
//           due → 0 → payment → next due → 0 → payment → … until the last cycle.
//  Cancel   the subscriber signs USDT CancelAuthorization for every unused cycle; the relayer
//           submits them, so the remaining payments become impossible on-chain (not just hidden).
import { encodeAbiParameters, keccak256, toBytes, type Address, type Hex } from "viem"
import { USDT_DOMAIN, ROUTER_ADDRESS, directNonce, receiveAuthTypedData } from "./index"

export const PERIODS = {
  demo: { seconds: 120, label: "every 2 minutes (demo)", grace: 600 },
  daily: { seconds: 86_400, label: "daily", grace: 2 * 86_400 },
  weekly: { seconds: 7 * 86_400, label: "weekly", grace: 2 * 86_400 },
  monthly: { seconds: 30 * 86_400, label: "every 30 days", grace: 3 * 86_400 },
} as const
export type PeriodKey = keyof typeof PERIODS
export const isPeriod = (p: string): p is PeriodKey => Object.hasOwn(PERIODS, p)
export const MAX_CYCLES = 12
/** a cycle may execute this many seconds before its due time (clock skew between keeper and chain) */
export const EARLY_SECONDS = 30

export type Plan = {
  merchant: Address
  amount: bigint // per cycle, USDT base units
  period: number // seconds
  cycles: number // total charges, incl. the first one (charged at subscribe time)
  planId: Hex // random bytes32
  expiresAt: bigint // offer valid until (unix s)
}

export const PLAN_TYPES = {
  SubscriptionPlan: [
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "period", type: "uint64" },
    { name: "cycles", type: "uint16" },
    { name: "planId", type: "bytes32" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const

export const planTypedData = (p: Plan) => ({
  domain: { name: "WhitePayAutopay", version: "1", chainId: 1874, verifyingContract: ROUTER_ADDRESS },
  types: PLAN_TYPES,
  primaryType: "SubscriptionPlan" as const,
  message: { ...p, period: BigInt(p.period), cycles: p.cycles },
})

/** memo of cycle i (0-based) of a subscription; doubles as the router payDirect memo */
export const cycleMemo = (subscriptionId: Hex, cycle: number): Hex =>
  keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
    [keccak256(toBytes("WHITEPAY_AUTOPAY")), subscriptionId, BigInt(cycle)]))

export const cycleDueAt = (startAt: number, period: number, cycle: number) => startAt + cycle * period

export const cycleWindow = (startAt: number, period: number, grace: number, cycle: number) => {
  const due = cycleDueAt(startAt, period, cycle)
  return { validAfter: BigInt(Math.max(0, due - EARLY_SECONDS)), validBefore: BigInt(due + grace) }
}

/** what the subscriber signs for cycle i */
export const cycleAuthTypedData = (p: { subscriber: Address; merchant: Address; amount: bigint; subscriptionId: Hex; cycle: number; startAt: number; period: number; grace: number }) => {
  const w = cycleWindow(p.startAt, p.period, p.grace, p.cycle)
  return receiveAuthTypedData({
    from: p.subscriber, to: ROUTER_ADDRESS, value: p.amount, ...w,
    nonce: directNonce(p.merchant, cycleMemo(p.subscriptionId, p.cycle)),
  })
}

export const CANCEL_AUTHORIZATION_TYPES = {
  CancelAuthorization: [
    { name: "authorizer", type: "address" },
    { name: "nonce", type: "bytes32" },
  ],
} as const

export const cancelAuthTypedData = (authorizer: Address, nonce: Hex) => ({
  domain: USDT_DOMAIN,
  types: CANCEL_AUTHORIZATION_TYPES,
  primaryType: "CancelAuthorization" as const,
  message: { authorizer, nonce },
})

/** pack / unpack the per-cycle 65-byte signatures stored in the mandate entity */
export const packSigs = (sigs: Hex[]): Hex => `0x${sigs.map((s) => s.slice(2).padStart(130, "0")).join("")}` as Hex
export const unpackSig = (packed: Hex, i: number): Hex => `0x${packed.slice(2 + i * 130, 2 + (i + 1) * 130)}` as Hex

// ============================================================ v2: ONE signature per subscription
// The subscriber signs a single EIP-2612 permit whose spender is a per-subscription clone
// (AutopayFactory, contracts/src/Autopay.sol). The clone's address is derived from ALL the terms,
// so that one signature = consent to exactly this merchant, amount, period, cycle count and start.
// The clone charges each cycle only inside its window and never more than amount × cycles.
export const AUTOPAY_FACTORY: Address = "0x00F61E008AAC480f3D81F959d659c43dDe72ac66"

export type Terms = {
  subscriber: Address; merchant: Address; amount: bigint; period: bigint; startAt: bigint; grace: bigint; cycles: number; subscriptionId: Hex
}
const TERMS_COMPONENTS = [
  { name: "subscriber", type: "address" }, { name: "merchant", type: "address" }, { name: "amount", type: "uint128" },
  { name: "period", type: "uint64" }, { name: "startAt", type: "uint64" }, { name: "grace", type: "uint64" },
  { name: "cycles", type: "uint16" }, { name: "subscriptionId", type: "bytes32" },
] as const

export const AUTOPAY_FACTORY_ABI = [
  { type: "function", name: "mandateAddress", stateMutability: "view", inputs: [{ name: "t", type: "tuple", components: TERMS_COMPONENTS }], outputs: [{ type: "address" }] },
  { type: "function", name: "start", stateMutability: "nonpayable", inputs: [{ name: "t", type: "tuple", components: TERMS_COMPONENTS }, { name: "deadline", type: "uint256" }, { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" }], outputs: [{ type: "address" }] },
  { type: "error", name: "BadTerms", inputs: [] },
  { type: "error", name: "NoAllowance", inputs: [] },
  { type: "error", name: "NotDue", inputs: [] },
] as const

export const AUTOPAY_MANDATE_ABI = [
  { type: "function", name: "charge", stateMutability: "nonpayable", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ name: "sig", type: "bytes" }], outputs: [] },
  { type: "function", name: "pending", stateMutability: "view", inputs: [], outputs: [{ name: "cycle", type: "uint16" }, { name: "dueAt", type: "uint64" }, { name: "chargeable", type: "bool" }] },
  { type: "function", name: "cancelled", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "chargedCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "event", name: "Charged", inputs: [{ name: "cycle", type: "uint16", indexed: true }, { name: "amount", type: "uint256", indexed: false }, { name: "chargedCount", type: "uint16", indexed: false }] },
  { type: "error", name: "Cancelled_", inputs: [] },
  { type: "error", name: "Finished", inputs: [] },
  { type: "error", name: "NotDue", inputs: [] },
  { type: "error", name: "NotAuthorized", inputs: [] },
] as const

export const USDT_PERMIT_ABI = [
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
] as const

export const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
  ],
} as const

/** the ONE signature a subscriber gives: allow this subscription's clone to pull at most amount × cycles */
export const autopayPermitTypedData = (p: { owner: Address; spender: Address; value: bigint; nonce: bigint; deadline: bigint }) => ({
  domain: USDT_DOMAIN, types: PERMIT_TYPES, primaryType: "Permit" as const, message: p,
})

export const termsFor = (p: { subscriber: Address; merchant: Address; amount: bigint; period: number; grace: number; cycles: number; startAt: number; subscriptionId: Hex }): Terms => ({
  subscriber: p.subscriber, merchant: p.merchant, amount: p.amount, period: BigInt(p.period), startAt: BigInt(p.startAt),
  grace: BigInt(p.grace), cycles: p.cycles, subscriptionId: p.subscriptionId,
})

/** gasless cancel: one signature, verified by the clone itself */
export const cancelMandateTypedData = (mandate: Address, subscriptionId: Hex) => ({
  domain: { name: "WhitePayAutopay", version: "1", chainId: 1874, verifyingContract: mandate },
  types: { CancelAutopay: [{ name: "mandate", type: "address" }, { name: "subscriptionId", type: "bytes32" }] },
  primaryType: "CancelAutopay" as const,
  message: { mandate, subscriptionId },
})

// ============================================================ reminder mode (default)
// Nothing is pre-approved. Each payment, including the first, is a single EIP-3009 authorization the
// subscriber signs when that payment is requested (cycleAuthTypedData for that cycle only, valid only in
// its own window). Unpaid by the end of the window = skipped, never charged later.
export type SubscriptionMode = "reminder" | "autopay"
/** EIP-191 message the subscriber signs to stop a reminder subscription */
export const reminderCancelMessage = (mandateKey: Hex) => `WondrPay: cancel subscription ${mandateKey.toLowerCase()}`
