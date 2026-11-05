// IDKit needs a backend-signed RP context (nonce + timestamps) for every proof request.
// ?purpose=name | shop | pay&ref=0x<paymentRef>  (each purpose is its own one-time World action)
import { isHex } from "viem"
import { rpContext, WORLD_ACTIONS, worldConfigured } from "@whitepay/server"
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
    : null
  if (!action) return json({ error: "unknown purpose" }, { status: 400 })
  if (!worldConfigured()) return json({ error: "World ID is not configured on this server" }, { status: 503 })
  try {
    return json(rpContext(action))
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 500 })
  }
}
