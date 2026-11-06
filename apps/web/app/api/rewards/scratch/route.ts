// Scratch a card. No PIN or World ID to scratch: the prize is fixed per card server-side, and WBT cashback
// still needs a World ID claim before anything is paid.
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem"
import { after } from "next/server"
import { scratchCard, RewardError } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  let body: { key?: string; owner?: string }
  try { body = await req.json() } catch { return json({ error: "bad json" }, { status: 400 }) }
  if (!body.key || !isHex(body.key) || body.key.length !== 66 || !body.owner || !isAddress(body.owner))
    return json({ error: "pass key and owner" }, { status: 400 })
  try {
    const r = await scratchCard(body.key as Hex, getAddress(body.owner as Address))
    after(r.persist)
    return json({ card: r.card })
  } catch (e) {
    if (e instanceof RewardError) return json({ error: e.message, code: e.code }, { status: e.code === "not_found" ? 404 : 403 })
    return json({ error: errorMessage(e) }, { status: 500 })
  }
}
