// Reminder mode: the subscriber approves the payment that is due (one signature for this payment only).
import { isAddress, isHex, type Address, type Hex } from "viem"
import { payReminderCycle, PolicyError } from "@whitepay/server"
import { after } from "next/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

type Body = { mandateKey: string; subscriber: string; cycle: number; signature: string }
export async function POST(req: Request) {
  let b: Body
  try { b = await req.json() } catch { return json({ error: "bad json" }, { status: 400 }) }
  if (!isHex(b.mandateKey) || b.mandateKey.length !== 66 || !isAddress(b.subscriber) || !Number.isInteger(b.cycle) || b.cycle < 1 || b.cycle > 12
    || !isHex(b.signature) || b.signature.length !== 132)
    return json({ error: "malformed payment" }, { status: 400 })
  try {
    return json(await payReminderCycle({ mandateKey: b.mandateKey as Hex, subscriber: b.subscriber as Address, cycle: b.cycle, signature: b.signature as Hex, defer: after }))
  } catch (e) {
    if (e instanceof PolicyError) return json({ error: e.message, code: e.code }, { status: 403 })
    return json({ error: errorMessage(e) }, { status: 400 })
  }
}
