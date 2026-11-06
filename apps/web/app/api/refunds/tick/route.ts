// Keeper: re-open refund requests a shop left unanswered for their whole 7-day window (daily cron + on demand).
import { refundKeeper } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET() {
  try { return json(await refundKeeper()) } catch (e) { return json({ error: errorMessage(e) }, { status: 502 }) }
}
