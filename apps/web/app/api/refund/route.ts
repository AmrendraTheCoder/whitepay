// Merchant refunds (gasless). GET: on-chain refund state + the nonce the merchant must sign.
// POST: relay the merchant-signed authorization. The router only ever pays the ORIGINAL payer,
// capped at what was paid, and only accepts an authorization from the shop's payout wallet.
import { isAddress, isHex, type Address, type Hex } from "viem"
import { refundInfo, relayRefund, shortErr } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
const isId = (x: unknown): x is Hex => typeof x === "string" && isHex(x) && x.length === 66

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("paymentId")
  if (!isId(id)) return json({ error: "pass ?paymentId=" }, { status: 400 })
  try {
    const info = await refundInfo(id)
    return info ? json(info) : json({ error: "unknown payment" }, { status: 404 })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}

type Body = { paymentId: string; amount: string; auth: { from: string; validAfter: string; validBefore: string; signature: string } }

export async function POST(req: Request) {
  let b: Body
  try { b = await req.json() } catch { return json({ error: "bad json" }, { status: 400 }) }
  if (!isId(b.paymentId) || !b.auth || !isAddress(b.auth.from) || !isHex(b.auth.signature) || !/^\d+$/.test(String(b.amount)))
    return json({ error: "malformed refund" }, { status: 400 })
  const amount = BigInt(b.amount)
  try {
    const info = await refundInfo(b.paymentId)
    if (!info) return json({ error: "unknown payment" }, { status: 404 })
    if (amount <= 0n || amount > info.refundable) return json({ error: "amount exceeds what can still be refunded" }, { status: 400 })
    const r = await relayRefund({
      paymentId: b.paymentId,
      amount,
      auth: { from: b.auth.from as Address, validAfter: BigInt(b.auth.validAfter), validBefore: BigInt(b.auth.validBefore), signature: b.auth.signature as Hex },
    })
    return json({ ok: true, txHash: r.txHash, explorer: r.explorer, refunded: r.info?.refunded, refundable: r.info?.refundable, payer: info.payer })
  } catch (e) {
    return json({ error: shortErr(e) }, { status: 400 })
  }
}
