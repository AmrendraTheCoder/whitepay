// POST /api/v1/links/:linkId/session → a fresh checkout session for a payment link (no key needed: the price and
// website are fixed by the link). Used by /l/:linkId and by <wondrpay-button link="pl_…">. CORS: any site.
import { sessionFromLink } from "@whitepay/server"
import { json as rawJson, CORS, preflight } from "@/lib/json"
import { apiError, origin } from "../../../_lib"

export const runtime = "nodejs"
export const maxDuration = 60
export const OPTIONS = preflight
const json = (d: unknown, init?: ResponseInit) => rawJson(d, { ...init, headers: { ...CORS, ...(init?.headers ?? {}) } })

export async function POST(req: Request, ctx: { params: Promise<{ linkId: string }> }) {
  try {
    const { linkId } = await ctx.params
    return json(await sessionFromLink(linkId, origin(req)), { status: 201 })
  } catch (e) {
    const r = apiError(e)
    for (const [k, val] of Object.entries(CORS)) r.headers.set(k, val)
    return r
  }
}
