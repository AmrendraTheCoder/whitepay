// Backend verification of World ID proofs. The client's "success" is never trusted on its own.
import { isAddress, isHex, type Address, type Hex } from "viem"
import { verifyMerchantHuman, verifyMerchantByLink, verifyStepUp, issueStepUpToken, knownHuman, humanSessions, rememberHuman, WORLD_ACTIONS } from "@whitepay/server"
import { after } from "next/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

type Body =
  | { purpose: "merchant"; address: string; result: any }
  | { purpose: "step-up"; address: string; paymentRef: string; result?: any; known?: boolean }
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
  // World refused a repeat one-time proof ("already used this check") and this person has no World ID session to
  // re-prove: a wallet whose person already passed World ID (name, verified shop) passes. The token is bound to
  // this payer + payment, and the payment itself still needs the payer's own signature (PIN / fingerprint).
  if (b.purpose === "step-up" && !b.result && b.known) {
    if (!isAddress(b.address) || !isHex(b.paymentRef)) return json({ error: "malformed request" }, { status: 400 })
    try {
      const [known, sessions] = await Promise.all([knownHuman(b.address as Address), humanSessions(b.address as Address)])
      if (!known) return json({ error: "This wallet hasn't passed World ID yet. Claim your WondrPay name with World ID first.", denied: true }, { status: 403 })
      if (sessions.length) return json({ error: "Confirm it in World App (your World ID session).", denied: true }, { status: 403 })
      return json({ ...issueStepUpToken(b.address as Address, b.paymentRef as Hex), via: known.via })
    } catch (e) {
      return json({ error: errorMessage(e) }, { status: 502 })
    }
  }
  if (!isAddress(b.address) || !b.result) return json({ error: "malformed request" }, { status: 400 })
  try {
    if (b.purpose === "merchant") return json(await verifyMerchantHuman(b.address as Address, b.result, after))
    if (b.purpose === "step-up") {
      if (!isHex(b.paymentRef)) return json({ error: "missing paymentRef" }, { status: 400 })
      const address = b.address as Address
      return json(await verifyStepUp(address, b.paymentRef as Hex, b.result, await humanSessions(address).catch(() => []),
        (n) => rememberHuman(address, WORLD_ACTIONS.stepUp(), n)))
    }
    return json({ error: "unknown purpose" }, { status: 400 })
  } catch (e) {
    console.error(`[world] ${new URL(req.url).pathname} denied:`, errorMessage(e))
    return json({ error: errorMessage(e), denied: true }, { status: 403 })
  }
}
