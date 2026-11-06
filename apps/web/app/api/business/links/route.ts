// Payment links (portal).
//  GET  ?merchant=0x…  → { links } with paid count + volume per link
//  POST { action: "create", merchant, siteId, linkId, title, amount, issuedAt, signature }
//       { action: "disable", merchant, linkId, issuedAt, signature }      (signed by the shop wallet)
import { isAddress, isHex, getAddress, type Hex } from "viem"
import { listLinks, createLink, disableLink, SiteError } from "@whitepay/server"
import { json } from "@/lib/json"
import { apiError, origin } from "../../v1/_lib"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: Request) {
  try {
    const m = new URL(req.url).searchParams.get("merchant") ?? ""
    if (!isAddress(m)) throw new SiteError("bad_request", "pass ?merchant=0x…")
    return json({ links: await listLinks(getAddress(m), origin(req)) })
  } catch (e) {
    return apiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => null)) as Record<string, any> | null
    if (!b || !isAddress(b.merchant) || !isHex(b.signature) || typeof b.linkId !== "string" || !Number.isInteger(b.issuedAt))
      throw new SiteError("bad_request", "pass action, merchant, linkId, issuedAt and signature")
    const base = { merchant: getAddress(b.merchant), ...(isAddress(b.actor) ? { actor: getAddress(b.actor) } : {}), linkId: b.linkId, issuedAt: b.issuedAt, signature: b.signature as Hex }
    if (b.action === "create") return json(await createLink({ ...base, siteId: String(b.siteId ?? ""), title: String(b.title ?? ""), amount: String(b.amount ?? "") }, origin(req)), { status: 201 })
    if (b.action === "disable") return json(await disableLink(base, origin(req)))
    throw new SiteError("bad_request", "action must be create or disable")
  } catch (e) {
    return apiError(e)
  }
}
