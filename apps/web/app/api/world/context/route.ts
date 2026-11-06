// IDKit needs a backend-signed RP context (nonce + timestamps) for every proof request.
// ?purpose=name | shop | pay&ref=0x<paymentRef>  (each purpose is its own one-time World action)
import { getAddress, isAddress, isHex } from "viem"
import { rpContext, rpSessionContext, humanSessions, WORLD_ACTIONS, worldConfigured } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const u = new URL(req.url)
  const purpose = u.searchParams.get("purpose")
  const ref = u.searchParams.get("ref") ?? ""
  const action =
    purpose === "name" ? WORLD_ACTIONS.claim
    : purpose === "shop" ? WORLD_ACTIONS.shop
    : purpose === "pay" && isHex(ref) && ref.length >= 18 ? WORLD_ACTIONS.stepUp(ref)
    : purpose === "refund" ? WORLD_ACTIONS.refund
    : purpose === "reward" ? WORLD_ACTIONS.stepUp() // unlimited action; each proof is bound to one claim via its signal
    : null
  if (!action) return json({ error: "unknown purpose" }, { status: 400 })
  if (!worldConfigured()) return json({ error: "World ID is not configured on this server" }, { status: 503 })
  try {
    // a person with a World ID session re-proves it (World refuses repeat one-time proofs: "already used")
    const address = u.searchParams.get("address") ?? ""
    if (purpose === "pay" && isAddress(address)) {
      const [sessionId] = await humanSessions(getAddress(address)).catch(() => [] as string[])
      if (sessionId) return json({ mode: "session", sessionId, ...rpSessionContext("Confirm a large WondrPay payment") }, { headers: { "cache-control": "no-store" } })
    }
    return json(rpContext(action, purpose === "refund" ? "Request a refund on WondrPay (proves you are one real person)" : purpose === "reward" ? "Claim your WondrPay rewards" : undefined))
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 500 })
  }
}
