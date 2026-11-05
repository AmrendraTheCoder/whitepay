// Keeper tick: pays every autopay cycle whose countdown reached 0. Idempotent and safe to call from anywhere
// (Vercel cron, GitHub Actions schedule, the app while open): a cycle's on-chain nonce can only be used once.
import { runKeeper } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

async function tick() {
  try { return json(await runKeeper({ minIntervalMs: 5_000 })) } catch (e) { return json({ error: errorMessage(e) }, { status: 500 }) }
}
export const GET = tick
export const POST = tick
