// POST /api/v1/checkout/sessions: the shop's SERVER creates a checkout session with its secret key.
//   Authorization: Bearer wp_sk_test_…   Idempotency-Key: <optional, your own unique id>
//   { "amount": "12.40", "reference": "order_1042", "description": "2 items", "successUrl": "https://…", "cancelUrl": "https://…" }
// → 201 { id, object: "checkout.session", status: "open", url (hosted page), payUrl (WondrPay app), expiresAt, … }
import { after } from "next/server"
import { authenticateSecretKey, createCheckoutSession, SiteError } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"
import { apiError, idempotent, origin } from "../../_lib"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const site = await authenticateSecretKey(req.headers.get("authorization"))
    const idem = idempotent(site.siteId, req.headers.get("idempotency-key"))
    if (idem.hit) return json(idem.hit, { status: 201, headers: { "idempotent-replayed": "true" } })
    let body: Record<string, unknown>
    try { body = await req.json() } catch { throw new SiteError("bad_request", "Body must be JSON") }
    const { session, publish } = await createCheckoutSession(site, body ?? {}, origin(req))
    // the hosted page is addressed by the order digest and works before the Arkiv write lands (~5 s): write after
    after(async () => {
      for (let i = 0; i < 3; i++) {
        try { await publish(); return } catch (e) { console.error(`[v1] session publish ${i + 1} failed`, errorMessage(e)) }
        await new Promise((r) => setTimeout(r, 700 + Math.random() * 1300))
      }
    })
    idem.save(session)
    return json(session, { status: 201 })
  } catch (e) {
    return apiError(e)
  }
}
