// Claim WBT cashback. Requires a fresh World ID proof (action whitepay-pay) whose signal binds it to this wallet
// and exactly these cards, so a bot can't claim, and limits count per human across all their wallets.
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem"
import { claimRewards, RewardError } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  let b: { owner?: string; keys?: string[]; proof?: unknown }
  try { b = await req.json() } catch { return json({ error: "bad json" }, { status: 400 }) }
  if (!b.owner || !isAddress(b.owner) || !Array.isArray(b.keys) || !b.keys.length || b.keys.length > 20 ||
      b.keys.some((k) => !isHex(k) || k.length !== 66) || !b.proof || typeof b.proof !== "object")
    return json({ error: "pass owner, keys and a World ID proof" }, { status: 400 })
  try {
    const r = await claimRewards({ owner: getAddress(b.owner as Address), keys: b.keys as Hex[], proof: b.proof })
    return json(r)
  } catch (e) {
    if (e instanceof RewardError) return json({ error: e.message, code: e.code }, { status: e.code === "pool" || e.code === "busy" ? 503 : 400 })
    return json({ error: errorMessage(e) }, { status: 400 })
  }
}
