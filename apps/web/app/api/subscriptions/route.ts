// Subscriber approves autopay (all cycles signed once on the device); list subscriptions.
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem"
import { after } from "next/server"
import { subscribe, subscribeReminder, listMandates, runKeeper, PolicyError } from "@whitepay/server"
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
    const t = Math.floor(Date.now() / 1000)
    return json({ now: t, rows: rows.map((r) => ({
      ...r, lastTxUrl: r.lastTx ? `${EXPLORER_URL}/tx/${r.lastTx}` : null,
      // reminder mode: a payment is waiting for the subscriber's approval
      payNow: r.mode === "reminder" && r.status === "active" && !!r.nextDueAt && t >= r.nextDueAt - 30 && t <= r.nextDueAt + r.grace,
      payBy: r.mode === "reminder" && r.nextDueAt ? r.nextDueAt + r.grace : null,
    })) })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}

// mode "reminder" (default): `signature` = the first payment only. mode "autopay": `permit` = one approval for all payments.
type Body = { planKey: string; subscriber: string; subscriptionId: string; startAt: number; signature?: string; permit?: { deadline: number; signature: string } }
export async function POST(req: Request) {
  let b: Body
  try { b = await req.json() } catch { return json({ error: "bad json" }, { status: 400 }) }
  if (!isHex(b.planKey) || b.planKey.length !== 66 || !isAddress(b.subscriber) || !isHex(b.subscriptionId) || b.subscriptionId.length !== 66
    || !Number.isInteger(b.startAt)
    || !((b.permit && Number.isInteger(b.permit.deadline) && isHex(b.permit.signature) && b.permit.signature.length === 132) || (typeof b.signature === "string" && isHex(b.signature) && b.signature.length === 132)))
    return json({ error: "malformed subscription" }, { status: 400 })
  try {
    const base = { planKey: b.planKey as Hex, subscriber: b.subscriber as Address, subscriptionId: b.subscriptionId as Hex, startAt: b.startAt }
    const r = b.permit
      ? await subscribe({ ...base, permit: { deadline: b.permit.deadline, signature: b.permit.signature as Hex } })
      : await subscribeReminder({ ...base, signature: b.signature as Hex })
    return json(r)
  } catch (e) {
    if (e instanceof PolicyError) return json({ error: e.message, code: e.code }, { status: 403 })
    return json({ error: errorMessage(e) }, { status: 400 })
  }
}
