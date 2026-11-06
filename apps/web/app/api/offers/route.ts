// Shop offers: GET one shop's offer (?merchant=) or all active offers; POST to publish (merchant-signed).
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem"
import { getOffer, listOffers, setOffer, RewardError } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const m = new URL(req.url).searchParams.get("merchant")
  try {
    if (m) {
      if (!isAddress(m)) return json({ error: "bad merchant" }, { status: 400 })
      return json({ offer: await getOffer(getAddress(m as Address)) })
    }
    return json({ offers: await listOffers() })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  let b: { merchant?: string; text?: string; code?: string; active?: boolean; issuedAt?: number; signature?: string }
  try { b = await req.json() } catch { return json({ error: "bad json" }, { status: 400 }) }
  if (!b.merchant || !isAddress(b.merchant) || typeof b.text !== "string" || typeof b.code !== "string" ||
      typeof b.active !== "boolean" || typeof b.issuedAt !== "number" || !b.signature || !isHex(b.signature))
    return json({ error: "malformed offer" }, { status: 400 })
  try {
    const offer = await setOffer({ merchant: b.merchant as Address, text: b.text, code: b.code, active: b.active, issuedAt: b.issuedAt, signature: b.signature as Hex })
    return json({ offer })
  } catch (e) {
    if (e instanceof RewardError) return json({ error: e.message }, { status: 400 })
    return json({ error: errorMessage(e) }, { status: 500 })
  }
}
