// What the rewards claim button should ask World App for:
//  - "enroll":  first time for this person: one uniqueness proof (action WORLD_ACTIONS.reward) that also creates a
//               World ID session
//  - "session": every later claim: a fresh proof of that session (a real World App check, never "already verified")
// GET ?owner=0x..&hint=session_..  (hint = a session id this device remembers from another of your wallets)
import { getAddress, isAddress } from "viem"
import { rewardSessionFor, rpContext, rpSessionContext, WORLD_ACTIONS, worldConfigured } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const u = new URL(req.url)
  const owner = u.searchParams.get("owner") ?? ""
  if (!isAddress(owner)) return json({ error: "pass owner" }, { status: 400 })
  if (!worldConfigured()) return json({ error: "World ID is not configured on this server" }, { status: 503 })
  try {
    const s = await rewardSessionFor(getAddress(owner), u.searchParams.get("hint") ?? undefined)
    if (s) return json({ mode: "session", sessionId: s.sessionId, ...rpSessionContext("Claim your WondrPay rewards") }, { headers: { "cache-control": "no-store" } })
    return json({ mode: "enroll", ...rpContext(WORLD_ACTIONS.reward, "Set up WondrPay rewards (once per person)") }, { headers: { "cache-control": "no-store" } })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 500 })
  }
}
