// POST /api/business/webhooks: wallet-approved webhook actions from the portal.
//  { action: "ping", merchant, siteId, issuedAt, signature }                 → signed test.ping to the website's webhook
//  { action: "resend", merchant, siteId, deliveryKey, issuedAt, signature }  → same body + event id, re-sent
import { isAddress, isHex, getAddress, type Hex } from "viem"
import { pingWebhook, resendWebhook, SiteError } from "@whitepay/server"
import { json } from "@/lib/json"
import { apiError } from "../../v1/_lib"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => null)) as Record<string, any> | null
    if (!b || !isAddress(b.merchant) || !isHex(b.signature) || typeof b.siteId !== "string" || !Number.isInteger(b.issuedAt))
      throw new SiteError("bad_request", "pass action, merchant, siteId, issuedAt and signature")
    const base = { merchant: getAddress(b.merchant), siteId: b.siteId, issuedAt: b.issuedAt, signature: b.signature as Hex }
    if (b.action === "ping") return json(await pingWebhook(base))
    if (b.action === "resend") {
      if (!isHex(b.deliveryKey) || b.deliveryKey.length !== 66) throw new SiteError("bad_request", "pass deliveryKey")
      return json(await resendWebhook({ ...base, deliveryKey: b.deliveryKey as Hex }))
    }
    throw new SiteError("bad_request", "action must be ping or resend")
  } catch (e) {
    return apiError(e)
  }
}
