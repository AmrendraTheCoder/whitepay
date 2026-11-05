// Cancel autopay: the subscriber signs USDT CancelAuthorization for every unused cycle; we submit them (gasless).
import { isAddress, isHex, type Address, type Hex } from "viem"
import { cancelMandate } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

type Body = { mandateKey: string; subscriber: string; cancels: { cycle: number; signature: string }[] }
export async function POST(req: Request) {
  let b: Body
  try { b = await req.json() } catch { return json({ error: "bad json" }, { status: 400 }) }
  if (!isHex(b.mandateKey) || b.mandateKey.length !== 66 || !isAddress(b.subscriber) || !Array.isArray(b.cancels) || b.cancels.length > 12
    || !b.cancels.every((c) => Number.isInteger(c.cycle) && isHex(c.signature) && c.signature.length === 132))
    return json({ error: "malformed cancellation" }, { status: 400 })
  try {
    return json(await cancelMandate({ mandateKey: b.mandateKey as Hex, subscriber: b.subscriber as Address, cancels: b.cancels.map((c) => ({ cycle: c.cycle, signature: c.signature as Hex })) }))
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 400 })
  }
}
