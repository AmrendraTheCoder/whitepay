// Merchant: publish a payment request. The order is signed on the merchant's OWN device;
// the server only checks the signature against MerchantRegistry and writes the Arkiv entity.
import { isAddress, isHex, type Address, type Hex } from "viem"
import { createPaymentRequest, getMerchantByAddress } from "@whitepay/server"
import { REQUEST_TTL } from "@whitepay/shared"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

type Body = {
  order: { merchant: string; amount: string; orderId: string; deadline: string }
  merchantSig: string
  note?: string
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Body
    const o = b.order
    if (!o || !isAddress(o.merchant) || !isHex(o.orderId) || o.orderId.length !== 66 || !isHex(b.merchantSig))
      return json({ error: "malformed order" }, { status: 400 })
    const amount = BigInt(o.amount)
    if (amount <= 0n || amount > 1_000_000_000n) return json({ error: "Amount must be between 0 and 1000 USDT" }, { status: 400 })

    const profile = await getMerchantByAddress(o.merchant as Address)
    if (!profile) return json({ error: "Sign up as a merchant first" }, { status: 403 })

    const order = { merchant: o.merchant as Address, amount, orderId: o.orderId as Hex, deadline: BigInt(o.deadline) }
    const ttl = Number(order.deadline) - Math.floor(Date.now() / 1000)
    const created = await createPaymentRequest({
      merchant: order.merchant,
      merchantName: profile.ensName,
      amount,
      kind: ttl > REQUEST_TTL.p2mQr + 30 ? "invoice" : "p2m_qr",
      note: b.note,
      signed: { order, merchantSig: b.merchantSig as Hex },
    })
    const origin = req.headers.get("origin") ?? new URL(req.url).origin
    return json({
      entityKey: created.entityKey,
      payUrl: `${origin}/pay?req=${created.entityKey}`,
      amount: created.order.amount,
      deadline: created.order.deadline,
      arkivTx: created.arkivTx,
    })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 400 })
  }
}
