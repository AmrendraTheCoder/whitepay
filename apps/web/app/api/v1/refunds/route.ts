// POST /api/v1/refunds: refund a payment from your refund allowance, by API (secret key). No wallet prompt.
//   Authorization: Bearer wp_sk_test_…   Idempotency-Key: <optional>
//   { "paymentId": "0x…" (the session id), "amount": "2.50" (optional: default = everything still refundable), "reason": "…" }
// → 201 { object: "refund", paymentId, payer, amount, refunded, refundable, txHash, explorer, allowanceLeft }
// The money goes back to the ORIGINAL payer only, never more than they paid (all refund paths counted).
import { after } from "next/server"
import { authenticateSecretKey, refundByApi, sendSiteWebhook, idemHash, SiteError } from "@whitepay/server"
import { json } from "@/lib/json"
import { apiError, idempotent } from "../_lib"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const site = await authenticateSecretKey(req.headers.get("authorization"))
    const rawKey = req.headers.get("idempotency-key")
    const idem = idempotent(`refund:${site.siteId}`, rawKey)
    if (idem.hit) return json(idem.hit, { status: 201, headers: { "idempotent-replayed": "true" } })
    let body: Record<string, unknown>
    try { body = await req.json() } catch { throw new SiteError("bad_request", "Body must be JSON") }
    const refund = await refundByApi(site, body ?? {}, rawKey ? idemHash(`refund:${site.siteId}`, rawKey) : undefined)
    idem.save(refund)
    if (site.webhook && !refund.replayed) after(async () => {
      const payload = { event: "refund.succeeded", site: site.siteId, merchant: site.merchant, ...refund, refundedAt: Math.floor(Date.now() / 1000) }
      await sendSiteWebhook({ site, eventId: `refund_${refund.txHash}`, event: "refund.succeeded", sessionId: refund.paymentId, body: JSON.stringify(payload) }).catch(() => {})
    })
    return json(refund, { status: 201 })
  } catch (e) {
    return apiError(e)
  }
}
