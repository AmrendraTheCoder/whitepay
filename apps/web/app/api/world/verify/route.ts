// Backend verification of World ID proofs. The client's "success" is never trusted on its own.
import { isAddress, isHex, type Address, type Hex } from "viem"
import { verifyMerchantHuman, verifyMerchantByLink, verifyStepUp } from "@whitepay/server"
import { after } from "next/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

type Body =
  | { purpose: "merchant"; address: string; result: any }
  | { purpose: "step-up"; address: string; paymentRef: string; result: any }
  | { purpose: "merchant-link"; address: string; from: string; issuedAt: number; signature: string; fromSignature: string; result?: undefined }

export async function POST(req: Request) {
  let b: Body
  try {
    b = await req.json()
  } catch {
    return json({ error: "bad json" }, { status: 400 })
  }
  if (b.purpose === "merchant-link") {
    if (!isAddress(b.address) || !isAddress(b.from) || !isHex(b.signature) || !isHex(b.fromSignature)) return json({ error: "malformed request" }, { status: 400 })
    try {
      return json(await verifyMerchantByLink({ merchant: b.address as Address, from: b.from as Address, issuedAt: Number(b.issuedAt), signature: b.signature as Hex, fromSignature: b.fromSignature as Hex }, after))
    } catch (e) {
      return json({ error: errorMessage(e), denied: true }, { status: 403 })
    }
  }
  if (!isAddress(b.address) || !b.result) return json({ error: "malformed request" }, { status: 400 })
  try {
    if (b.purpose === "merchant") return json(await verifyMerchantHuman(b.address as Address, b.result, after))
    if (b.purpose === "step-up") {
      if (!isHex(b.paymentRef)) return json({ error: "missing paymentRef" }, { status: 400 })
      return json(await verifyStepUp(b.address as Address, b.paymentRef as Hex, b.result))
    }
    return json({ error: "unknown purpose" }, { status: 400 })
  } catch (e) {
    console.error(`[world] ${new URL(req.url).pathname} denied:`, errorMessage(e))
    return json({ error: errorMessage(e), denied: true }, { status: 403 })
  }
}
