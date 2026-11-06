// GET /api/v1/checkout/sessions/:id: status of a session (open | paid | expired), for the shop's server.
// Use it to double-check a webhook or after the customer comes back to your successUrl.
import { isHex, type Hex } from "viem"
import { authenticateSecretKey, getCheckoutSession, SiteError } from "@whitepay/server"
import { json } from "@/lib/json"
import { apiError, origin } from "../../../_lib"

export const runtime = "nodejs"

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const site = await authenticateSecretKey(req.headers.get("authorization"))
    const { id } = await ctx.params
    if (!isHex(id) || id.length !== 66) throw new SiteError("bad_request", "Session ids look like 0x followed by 64 hex characters")
    return json(await getCheckoutSession(site, id as Hex, origin(req)))
  } catch (e) {
    return apiError(e)
  }
}
