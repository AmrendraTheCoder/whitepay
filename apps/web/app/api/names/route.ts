// Personal WhitePay names (UPI VPA) on ENSv2: GET ?label= availability, POST claim (wallet sig + World ID).
import { isAddress, isHex, type Address, type Hex } from "viem"
import { claimPersonName } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: Request) {
  const label = (new URL(req.url).searchParams.get("label") ?? "").toLowerCase()
  try {
    const ens: any = await import("@whitepay/server/ens")
    const r = await ens.isLabelAvailable(label)
    return json({ available: r.available, reason: r.reason ?? null, name: r.name })
  } catch (e) {
    return json({ available: false, reason: errorMessage(e) })
  }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { label: string; address: string; issuedAt: number; signature: string; result: any }
    if (!isAddress(b.address) || !isHex(b.signature) || !b.result) return json({ error: "malformed claim" }, { status: 400 })
    const r = await claimPersonName({ label: String(b.label), address: b.address as Address, issuedAt: Number(b.issuedAt), signature: b.signature as Hex, result: b.result })
    return json(r)
  } catch (e) {
    console.error(`[world] ${new URL(req.url).pathname} denied:`, errorMessage(e))
    return json({ error: errorMessage(e), denied: true }, { status: 403 })
  }
}
