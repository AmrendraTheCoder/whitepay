// Backend verification of World ID proofs. The client's "success" is never trusted on its own.
import { isAddress, isHex, type Address, type Hex } from "viem"
import { verifyMerchantHuman, verifyStepUp } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

type Body =
  | { purpose: "merchant"; address: string; result: any }
  | { purpose: "step-up"; address: string; paymentRef: string; result: any }

export async function POST(req: Request) {
  let b: Body
  try {
    b = await req.json()
  } catch {
    return json({ error: "bad json" }, { status: 400 })
  }
  if (!isAddress(b.address) || !b.result) return json({ error: "malformed request" }, { status: 400 })
  try {
    if (b.purpose === "merchant") return json(await verifyMerchantHuman(b.address as Address, b.result))
    if (b.purpose === "step-up") {
      if (!isHex(b.paymentRef)) return json({ error: "missing paymentRef" }, { status: 400 })
      return json(await verifyStepUp(b.address as Address, b.paymentRef as Hex, b.result))
    }
    return json({ error: "unknown purpose" }, { status: 400 })
  } catch (e) {
    return json({ error: errorMessage(e), denied: true }, { status: 403 })
  }
}
