// WondrPay for Business portal: a shop's websites and keys.
//  GET  ?merchant=0x…  → { sites, orderSigner }   (public: no secrets are ever stored in readable form)
//  POST { action: "create" | "rotate" | "revoke", merchant, siteId, issuedAt, signature, name?, domains?, webhook? }
//       signed by the shop wallet over siteApprovalMessage; create/rotate return the secret key ONCE.
import { isAddress, isHex, getAddress, type Address, type Hex } from "viem"
import { listSites, createSite, rotateSiteKey, revokeSite, orderSignerAddress, SiteError } from "@whitepay/server"
import { json } from "@/lib/json"
import { apiError } from "../../v1/_lib"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: Request) {
  const m = new URL(req.url).searchParams.get("merchant") ?? ""
  if (!isAddress(m)) return json({ error: { type: "bad_request", message: "pass ?merchant=0x…" } }, { status: 400 })
  try {
    return json({ sites: await listSites(getAddress(m)), orderSigner: orderSignerAddress() })
  } catch (e) {
    return apiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => null)) as Record<string, any> | null
    if (!b || !isAddress(b.merchant) || !isHex(b.signature) || typeof b.siteId !== "string" || !Number.isInteger(b.issuedAt))
      throw new SiteError("bad_request", "pass action, merchant, siteId, issuedAt and signature")
    const base = { merchant: getAddress(b.merchant as Address), siteId: b.siteId, issuedAt: b.issuedAt, signature: b.signature as Hex }
    if (b.action === "create") return json(await createSite({ ...base, name: b.name, domains: b.domains, webhook: b.webhook }), { status: 201 })
    if (b.action === "rotate") return json(await rotateSiteKey(base))
    if (b.action === "revoke") return json(await revokeSite(base))
    throw new SiteError("bad_request", "action must be create, rotate or revoke")
  } catch (e) {
    return apiError(e)
  }
}
