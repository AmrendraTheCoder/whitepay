// Has this wallet already been verified? (so the UI shows a badge instead of the button)
import { isAddress, type Address } from "viem"
import { worldStatus, knownHuman } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")
  if (!address || !isAddress(address)) return json({ error: "pass ?address=" }, { status: 400 })
  try {
    const [st, human] = await Promise.all([worldStatus(address as Address), knownHuman(address as Address).catch(() => null)])
    // human: this wallet's person already passed World ID (name, verified shop or rewards), so repeat checks pass
    return json({ ...st, human: !!human, humanVia: human?.via ?? null }, { headers: { "cache-control": "no-store" } })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}
