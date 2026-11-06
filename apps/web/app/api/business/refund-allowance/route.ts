// Refund allowance (portal).
//  GET  ?merchant=0x… → { payout, agent, allowance, nonce, payoutBalance }   what the payout wallet needs to sign
//  POST { merchant, value, deadline, signature }  the payout wallet's EIP-2612 permit; WondrPay submits it (pays gas).
//       USDT itself checks the signature, so only the payout wallet can set its allowance. value "0" switches it off.
import { isAddress, isHex, getAddress, type Hex } from "viem"
import { allowanceState, setRefundAllowance, SiteError } from "@whitepay/server"
import { json } from "@/lib/json"
import { apiError } from "../../v1/_lib"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: Request) {
  try {
    const m = new URL(req.url).searchParams.get("merchant") ?? ""
    if (!isAddress(m)) throw new SiteError("bad_request", "pass ?merchant=0x…")
    return json(await allowanceState(getAddress(m)))
  } catch (e) {
    return apiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => null)) as Record<string, any> | null
    if (!b || !isAddress(b.merchant) || !isHex(b.signature) || typeof b.value !== "string" || typeof b.deadline !== "string")
      throw new SiteError("bad_request", "pass merchant, value, deadline and signature")
    return json(await setRefundAllowance({ merchant: getAddress(b.merchant), value: b.value, deadline: b.deadline, signature: b.signature as Hex }))
  } catch (e) {
    return apiError(e)
  }
}
