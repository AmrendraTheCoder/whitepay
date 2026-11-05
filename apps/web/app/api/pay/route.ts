// Payer submits their signed EIP-3009 authorization. The server re-verifies the request,
// the relayer settles on Whitechain (paying the gas), then the receipt is written to Arkiv.
import { isAddress, isHex, type Address, type Hex } from "viem"
import { fetchRequest, verifyRequest, relayOrderPayment, settleOnArkiv, PolicyError, checkStepUpToken } from "@whitepay/server"
import { after } from "next/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

type Body = {
  entityKey: string
  auth: { from: string; validAfter: string; validBefore: string; signature: string }
  stepUpToken?: string
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: "bad json" }, { status: 400 })
  }
  const { entityKey, auth } = body
  if (!isHex(entityKey) || !auth || !isAddress(auth.from) || !isHex(auth.signature))
    return json({ error: "malformed payment" }, { status: 400 })

  try {
    const view = await fetchRequest(entityKey as Hex)
    const v = await verifyRequest(view)
    if (!v.ok) return json({ error: v.reason, code: "invalid_request" }, { status: 409 })

    const paid = await relayOrderPayment({
      order: v.order,
      merchantSig: v.merchantSig,
      auth: {
        from: auth.from as Address,
        validAfter: BigInt(auth.validAfter),
        validBefore: BigInt(auth.validBefore),
        signature: auth.signature as Hex,
      },
      stepUpVerified: checkStepUpToken(body.stepUpToken, auth.from as Address, v.digest),
    })

    let receiptKey: Hex | null = null
    try {
      const s = await settleOnArkiv({
        request: view!,
        merchant: v.order.merchant,
        merchantName: view!.merchantName,
        payer: auth.from as Address,
        amount: v.order.amount,
        paymentId: paid.paymentId,
        txHash: paid.txHash,
        block: paid.block,
      })
      receiptKey = s.receiptKey
    } catch (e) {
      // money already moved on-chain; the receipt can be re-indexed from the PaymentSettled event
      console.error("arkiv settle failed", errorMessage(e))
    }

    // notify the merchant's server (it should still verify on-chain with the tx hash)
    if (view!.webhook) {
      const payload = {
        event: "payment.settled", entityKey, orderId: v.order.orderId, merchant: v.order.merchant, payer: auth.from,
        amount: v.order.amount.toString(), txHash: paid.txHash, explorer: paid.explorer, receiptKey, paidAt: Math.floor(Date.now() / 1000),
      }
      after(() => fetch(view!.webhook!, { method: "POST", headers: { "content-type": "application/json", "user-agent": "WhitePay-Webhook/1" }, body: JSON.stringify(payload) })
        .then((r) => console.log("[webhook]", view!.webhook, r.status)).catch((e) => console.error("[webhook] failed", errorMessage(e))))
    }
    return json({ txHash: paid.txHash, explorer: paid.explorer, gasUsed: paid.gasUsed, receiptKey, amount: v.order.amount })
  } catch (e) {
    if (e instanceof PolicyError) return json({ error: e.message, code: e.code }, { status: 403 })
    return json({ error: errorMessage(e) }, { status: 500 })
  }
}
