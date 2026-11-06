// Teammates (WondrPay for Business).
//  GET  ?merchant=0x… → { team }            the shop's teammates
//  GET  ?member=0x…   → { shops }           shops where this wallet is a developer
//  POST { action: "add" | "remove", merchant, member, label?, issuedAt, signature }   signed by the shop OWNER
import { isAddress, isHex, getAddress, type Hex } from "viem"
import { listTeam, membershipsOf, addTeammate, removeTeammate, SiteError } from "@whitepay/server"
import { json } from "@/lib/json"
import { apiError } from "../../v1/_lib"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: Request) {
  try {
    const u = new URL(req.url).searchParams
    const m = u.get("merchant"), mem = u.get("member")
    if (m && isAddress(m)) return json({ team: await listTeam(getAddress(m)) })
    if (mem && isAddress(mem)) return json({ shops: await membershipsOf(getAddress(mem)) })
    throw new SiteError("bad_request", "pass ?merchant=0x… or ?member=0x…")
  } catch (e) {
    return apiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => null)) as Record<string, any> | null
    if (!b || !isAddress(b.merchant) || !isAddress(b.member) || !isHex(b.signature) || !Number.isInteger(b.issuedAt))
      throw new SiteError("bad_request", "pass action, merchant, member, issuedAt and signature")
    const base = { merchant: getAddress(b.merchant), member: getAddress(b.member), issuedAt: b.issuedAt, signature: b.signature as Hex }
    if (b.action === "add") return json(await addTeammate({ ...base, label: typeof b.label === "string" ? b.label : undefined }), { status: 201 })
    if (b.action === "remove") return json(await removeTeammate(base))
    throw new SiteError("bad_request", "action must be add or remove")
  } catch (e) {
    return apiError(e)
  }
}
