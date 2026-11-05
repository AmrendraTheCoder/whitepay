// What the shop's server has done for an order (e.g. "webhook verified, fulfilled"). Read-only.
import { eventsFor } from "@/lib/events"
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("orderId") ?? new URL(req.url).searchParams.get("mandateKey") ?? ""
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return Response.json({ error: "bad orderId" }, { status: 400 })
  return Response.json({ events: eventsFor(id) }, { headers: { "cache-control": "no-store" } })
}
