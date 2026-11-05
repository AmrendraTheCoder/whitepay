// Subscriber approves autopay (all cycles signed once on the device); list subscriptions.
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem"
import { after } from "next/server"
import { subscribe, listMandates, runKeeper, PolicyError } from "@whitepay/server"
import { EXPLORER_URL } from "@whitepay/shared"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: Request) {
  const u = new URL(req.url)
  const s = u.searchParams.get("subscriber"), m = u.searchParams.get("merchant")
  if (!(s && isAddress(s)) && !(m && isAddress(m))) return json({ error: "pass ?subscriber= or ?merchant=" }, { status: 400 })
  after(() => runKeeper({ minIntervalMs: 15_000 }).catch(() => {})) // opportunistic keeper tick
  try {
    const rows = await listMandates({ subscriber: s && isAddress(s) ? (getAddress(s) as Address) : undefined, merchant: m && isAddress(m) ? (getAddress(m) as Address) : undefined })
    return json({ now: Math.floor(Date.now() / 1000), rows: rows.map((r) => ({ ...r, lastTxUrl: r.lastTx ? `${EXPLORER_URL}/tx/${r.lastTx}` : null })) })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}

type Body = { planKey: string; subscriber: string; subscriptionId: string; startAt: number; signatures: string[] }
export async function POST(req: Request) {
  let b: Body
  try { b = await req.json() } catch { return json({ error: "bad json" }, { status: 400 }) }
  if (!isHex(b.planKey) || b.planKey.length !== 66 || !isAddress(b.subscriber) || !isHex(b.subscriptionId) || b.subscriptionId.length !== 66
    || !Array.isArray(b.signatures) || b.signatures.length > 12 || !b.signatures.every((s) => isHex(s) && s.length === 132) || !Number.isInteger(b.startAt))
    return json({ error: "malformed subscription" }, { status: 400 })
  try {
    const r = await subscribe({ planKey: b.planKey as Hex, subscriber: b.subscriber as Address, subscriptionId: b.subscriptionId as Hex, startAt: b.startAt, signatures: b.signatures as Hex[] })
    return json(r)
  } catch (e) {
    if (e instanceof PolicyError) return json({ error: e.message, code: e.code }, { status: 403 })
    return json({ error: errorMessage(e) }, { status: 400 })
  }
}
