// ── WONDRPAY INTEGRATION ④ (server) ── WondrPay calls this when an order is paid.
// Defence in depth: (1) signature + 5-min replay window, (2) idempotency by event id,
// (3) the money itself is confirmed on Whitechain before the order is fulfilled.
import { verifyWondrPayWebhook, verifyWondrPayPayment, verifyWondrPaySubscriptionCharge } from "@whitepay/checkout/server"
import { privateKeyToAccount } from "viem/accounts"
import type { Hex } from "viem"
import { recordEvent } from "@/lib/events"

const seen = new Set<string>() // per instance; use a DB unique key in production

export async function POST(req: Request) {
  const raw = await req.text()
  if (raw.length > 8192) return Response.json({ error: "too large" }, { status: 413 })
  const auth = await verifyWondrPayWebhook({ rawBody: raw, headers: req.headers })
  if (!auth.ok) {
    console.warn("[store webhook] REJECTED:", auth.reason)
    return Response.json({ error: auth.reason }, { status: 401 })
  }
  if (seen.has(auth.eventId)) return Response.json({ received: true, duplicate: true })
  seen.add(auth.eventId)

  const e = auth.event as typeof auth.event & { subscriber?: Hex; cycle?: number; cycles?: number; mandateKey?: string }
  const shop = privateKeyToAccount(process.env.STORE_MERCHANT_PK as Hex).address
  if (e.event.startsWith("subscription.")) {
    // autopay: started / charged / completed carry a tx to confirm; cancelled / failed are status only
    const ok = e.txHash && e.subscriber ? (await verifyWondrPaySubscriptionCharge({ txHash: e.txHash, merchant: shop, subscriber: e.subscriber as Hex, minAmount: BigInt(e.amount) })).ok : true
    console.log("[store webhook]", e.event, e.mandateKey, e.cycle ? `cycle ${e.cycle}/${e.cycles}` : "", ok ? "signature ✓ + on-chain ✓" : "REJECTED: charge not found")
    recordEvent(e.mandateKey ?? "", `${e.event}${e.cycle ? ` · payment ${e.cycle}/${e.cycles}` : ""}: signature ✓${e.txHash ? ", on-chain ✓" : ""}`)
    return Response.json({ received: true, verified: ok })
  }
  const v = await verifyWondrPayPayment({ txHash: e.txHash, merchant: shop, orderId: e.orderId, minAmount: BigInt(e.amount) })
  console.log("[store webhook]", e.event, e.orderId, v.ok ? "signature ✓ + on-chain ✓ -> fulfil order" : `REJECTED: ${v.reason}`)
  recordEvent(e.orderId, v.ok ? "webhook: signature ✓, on-chain ✓, order fulfilled" : `webhook rejected: ${v.reason}`)
  return Response.json({ received: true, verified: v.ok })
}
