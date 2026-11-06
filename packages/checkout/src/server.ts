// @whitepay/checkout/server: what a merchant's backend needs (2 functions).
//  createWondrPayOrder: sign an EIP-712 order with the shop's key and publish it as a WondrPay request.
//  verifyWondrPayPayment: trustlessly confirm a payment on Whitechain from its tx hash (use in webhooks).
import { createPublicClient, decodeEventLog, getAddress, http, keccak256, parseUnits, recoverMessageAddress, toBytes, toHex, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { orderTypedData, ROUTER_ADDRESS, ROUTER_ABI, whitechainSepolia, type Order } from "@whitepay/shared"

export type CreatedOrder = { entityKey: Hex; payUrl: string; amount: string; deadline: string; orderId: Hex }

export async function createWondrPayOrder(p: {
  /** the shop's private key (registered as a WondrPay merchant; payout + order signer) */
  merchantKey: Hex
  /** USDT, e.g. "2.50" */
  amount: string
  whitepayUrl?: string
  /** seconds the QR stays payable (60-1800, default 300) */
  ttlSeconds?: number
  /** https URL WondrPay POSTs to when paid */
  webhook?: string
  note?: string
}): Promise<CreatedOrder> {
  if (!/^\d+(\.\d{1,6})?$/.test(p.amount) || Number(p.amount) <= 0) throw new Error("invalid amount")
  const shop = privateKeyToAccount(p.merchantKey)
  const order: Order = {
    merchant: shop.address,
    amount: parseUnits(p.amount, 6),
    orderId: toHex(crypto.getRandomValues(new Uint8Array(32))),
    deadline: BigInt(Math.floor(Date.now() / 1000) + Math.min(Math.max(p.ttlSeconds ?? 300, 60), 1800)),
  }
  const merchantSig = await shop.signTypedData(orderTypedData(ROUTER_ADDRESS, order))
  const r = await fetch(`${p.whitepayUrl ?? "https://wondrpay.vercel.app"}/api/requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      order: { merchant: order.merchant, amount: order.amount.toString(), orderId: order.orderId, deadline: order.deadline.toString() },
      merchantSig, webhook: p.webhook, note: p.note,
    }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error ?? `WondrPay ${r.status}`)
  return d as CreatedOrder
}

/** Don't trust a webhook body: read the PaymentSettled event from Whitechain yourself. */
export async function verifyWondrPayPayment(p: { txHash: Hex; merchant: Address; orderId?: Hex; minAmount?: bigint; rpcUrl?: string }) {
  const client = createPublicClient({ chain: whitechainSepolia, transport: http(p.rpcUrl) })
  const receipt = await client.getTransactionReceipt({ hash: p.txHash })
  if (receipt.status !== "success") return { ok: false as const, reason: "transaction failed" }
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(ROUTER_ADDRESS)) continue
    try {
      const ev = decodeEventLog({ abi: ROUTER_ABI, data: log.data, topics: log.topics })
      if (ev.eventName !== "PaymentSettled") continue
      const a = ev.args as { paymentId: Hex; orderId: Hex; merchant: Address; payer: Address; amount: bigint }
      if (getAddress(a.merchant) !== getAddress(p.merchant)) continue
      if (p.orderId && a.orderId.toLowerCase() !== p.orderId.toLowerCase()) continue
      if (p.minAmount && a.amount < p.minAmount) return { ok: false as const, reason: "amount too low" }
      return { ok: true as const, orderId: a.orderId, payer: a.payer, amount: a.amount, block: receipt.blockNumber }
    } catch {}
  }
  return { ok: false as const, reason: "no matching WondrPay payment in this transaction" }
}

/** Address that signs WondrPay webhooks (also published at https://wondrpay.vercel.app/api/webhook-key). */
export const WHITEPAY_WEBHOOK_SIGNER: Address = "0x27d2F6770F18E1C0Eefc129124747407Ef44aBe1"

/**
 * Authenticate an incoming webhook BEFORE trusting it: checks the EIP-191 signature over
 * "whitepay-webhook:v1:<timestamp>:<keccak256(rawBody)>" and rejects anything older than maxAgeSeconds
 * (replay protection). Pass the RAW body text (read with req.text(), not req.json()).
 * Then still confirm the money on-chain with verifyWondrPayPayment and de-duplicate by event id.
 */
export async function verifyWondrPayWebhook(p: { rawBody: string; headers: Headers; maxAgeSeconds?: number; signer?: Address }) {
  const ts = Number(p.headers.get("x-whitepay-timestamp"))
  const sig = p.headers.get("x-whitepay-signature") as Hex | null
  const eventId = p.headers.get("x-whitepay-event-id") ?? ""
  if (!ts || !sig || !/^0x[0-9a-fA-F]{130}$/.test(sig)) return { ok: false as const, reason: "missing signature headers" }
  const age = Math.floor(Date.now() / 1000) - ts
  if (age > (p.maxAgeSeconds ?? 300) || age < -60) return { ok: false as const, reason: "stale or future timestamp (replay?)" }
  const message = `whitepay-webhook:v1:${ts}:${keccak256(toBytes(p.rawBody))}`
  const from = await recoverMessageAddress({ message, signature: sig }).catch(() => null)
  if (!from || getAddress(from) !== getAddress(p.signer ?? WHITEPAY_WEBHOOK_SIGNER)) return { ok: false as const, reason: "bad signature" }
  return { ok: true as const, eventId, event: JSON.parse(p.rawBody) as { event: string; orderId: Hex; txHash: Hex; amount: string; merchant: Address; payer: Address } }
}

// ------------------------------------------------------------------ subscriptions (Autopay)
import { PERIODS, planTypedData, type PeriodKey } from "@whitepay/shared/autopay"

export type CreatedSubscription = { planKey: Hex; subscribeUrl: string; amount: string; period: number; periodLabel: string; cycles: number; expiresAt: string }

/**
 * Publish a subscription plan signed by the shop key. Pass single: true for a checkout button
 * (one subscriber, offer expires in ttlSeconds); omit it for a shareable "subscribe" link.
 * Webhook events: subscription.started / .charged / .completed / .cancelled / .failed.
 */
export async function createWondrPaySubscription(p: {
  merchantKey: Hex; title: string; amount: string; period: PeriodKey; cycles: number
  single?: boolean; ttlSeconds?: number; webhook?: string; whitepayUrl?: string
}): Promise<CreatedSubscription> {
  if (!/^\d+(\.\d{1,6})?$/.test(p.amount) || Number(p.amount) <= 0) throw new Error("invalid amount")
  const shop = privateKeyToAccount(p.merchantKey)
  const plan = {
    merchant: shop.address, amount: parseUnits(p.amount, 6), period: PERIODS[p.period].seconds, cycles: p.cycles,
    planId: toHex(crypto.getRandomValues(new Uint8Array(32))),
    expiresAt: BigInt(Math.floor(Date.now() / 1000) + Math.min(Math.max(p.ttlSeconds ?? 900, 120), 30 * 86400)),
  }
  const r = await fetch(`${p.whitepayUrl ?? "https://wondrpay.vercel.app"}/api/plans`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan: { ...plan, amount: plan.amount.toString(), expiresAt: plan.expiresAt.toString() },
      merchantSig: await shop.signTypedData(planTypedData(plan)), title: p.title, periodKey: p.period, single: p.single ?? true, webhook: p.webhook }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error ?? `WondrPay ${r.status}`)
  return { planKey: d.planKey, subscribeUrl: d.subscribeUrl, amount: plan.amount.toString(), period: plan.period, periodLabel: PERIODS[p.period].label, cycles: p.cycles, expiresAt: plan.expiresAt.toString() }
}

const DIRECT_PAYMENT_EVENT = [{ type: "event", name: "DirectPayment", inputs: [
  { name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true },
  { name: "amount", type: "uint256", indexed: false }, { name: "memo", type: "bytes32", indexed: false } ] }] as const

/** Confirm an autopay charge on Whitechain: a DirectPayment from the subscriber to you, via the WondrPay router. */
export async function verifyWondrPaySubscriptionCharge(p: { txHash: Hex; merchant: Address; subscriber: Address; minAmount?: bigint; rpcUrl?: string }) {
  const client = createPublicClient({ chain: whitechainSepolia, transport: http(p.rpcUrl) })
  const receipt = await client.getTransactionReceipt({ hash: p.txHash })
  if (receipt.status !== "success") return { ok: false as const, reason: "transaction failed" }
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(ROUTER_ADDRESS)) continue
    try {
      const ev = decodeEventLog({ abi: DIRECT_PAYMENT_EVENT, data: log.data, topics: log.topics })
      if (getAddress(ev.args.to) !== getAddress(p.merchant) || getAddress(ev.args.from) !== getAddress(p.subscriber)) continue
      if (p.minAmount && ev.args.amount < p.minAmount) return { ok: false as const, reason: "amount too low" }
      return { ok: true as const, amount: ev.args.amount, memo: ev.args.memo, block: receipt.blockNumber }
    } catch {}
  }
  return { ok: false as const, reason: "no matching autopay charge in this transaction" }
}
