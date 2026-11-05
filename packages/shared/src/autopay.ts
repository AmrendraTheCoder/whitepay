// WhitePay Autopay (UPI AutoPay-style subscriptions), shared by app, server and SDK.
//
//  Plan     merchant signs the terms (EIP-712 "SubscriptionPlan"): amount, period, number of cycles.
//  Mandate  the subscriber approves ONCE (PIN / fingerprint) and signs one EIP-3009
//           ReceiveWithAuthorization per cycle. Cycle i can only execute inside its own window
//           [dueAt_i - EARLY, dueAt_i + grace], only through the WhitePay router (to = router),
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
