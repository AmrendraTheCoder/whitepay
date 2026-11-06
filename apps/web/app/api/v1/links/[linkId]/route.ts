// GET /api/v1/links/:linkId → public facts about a payment link (title, price, shop). CORS: the Pay button reads it.
import { publicLink, SiteError } from "@whitepay/server"
import { json as rawJson, CORS, preflight } from "@/lib/json"
import { apiError, origin } from "../../_lib"

export const runtime = "nodejs"
export const OPTIONS = preflight
const json = (d: unknown, init?: ResponseInit) => rawJson(d, { ...init, headers: { ...CORS, ...(init?.headers ?? {}) } })

export async function GET(req: Request, ctx: { params: Promise<{ linkId: string }> }) {
  try {
    const { linkId } = await ctx.params
    const l = await publicLink(linkId, origin(req))
    if (!l) throw new SiteError("not_found", "This payment link doesn't exist")
    return json(l)
  } catch (e) {
    const r = apiError(e)
    for (const [k, val] of Object.entries(CORS)) r.headers.set(k, val)
    return r
  }
}
