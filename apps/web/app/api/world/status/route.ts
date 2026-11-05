// Has this wallet already been verified? (so the UI shows a badge instead of the button)
import { isAddress, type Address } from "viem"
import { worldStatus } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")
  if (!address || !isAddress(address)) return json({ error: "pass ?address=" }, { status: 400 })
  try {
    return json(await worldStatus(address as Address))
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}
