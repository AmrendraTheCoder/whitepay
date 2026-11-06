// GET /api/business/sites/:siteId/health?merchant=0x… → integration checklist + recent webhook deliveries (portal).
import { isAddress, getAddress } from "viem"
import { siteHealth, listDeliveries, SiteError } from "@whitepay/server"
import { json } from "@/lib/json"
import { apiError } from "../../../../v1/_lib"

export const runtime = "nodejs"

export async function GET(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  try {
    const { siteId } = await ctx.params
    const m = new URL(req.url).searchParams.get("merchant") ?? ""
    if (!isAddress(m)) throw new SiteError("bad_request", "pass ?merchant=0x…")
    const [health, deliveries] = await Promise.all([siteHealth(getAddress(m), siteId), listDeliveries(siteId, 20)])
    return json({ ...health, deliveries })
  } catch (e) {
    return apiError(e)
  }
}
