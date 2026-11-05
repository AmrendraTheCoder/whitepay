// IDKit needs a backend-signed RP context (nonce + timestamps) for every proof request.
import { rpContext, WORLD_ACTIONS, worldConfigured } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const action = new URL(req.url).searchParams.get("action")
  if (action !== WORLD_ACTIONS.claim && action !== WORLD_ACTIONS.stepUp) return json({ error: "unknown action" }, { status: 400 })
  if (!worldConfigured()) return json({ error: "World ID is not configured on this server" }, { status: 503 })
  try {
    return json({ action, ...rpContext(action) })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 500 })
  }
}
