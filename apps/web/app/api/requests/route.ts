// Merchant: create a payment request (signed order + Arkiv entity with TTL). Returns the QR link.
import { parseUnits } from "viem"
import { createPaymentRequest } from "@whitepay/server"
import { DEMO_MERCHANT, REQUEST_TTL } from "@whitepay/shared"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { amount?: string; ttlSeconds?: number; note?: string }
    const amountStr = String(body.amount ?? "").trim()
    if (!/^\d+(\.\d{1,6})?$/.test(amountStr) || Number(amountStr) <= 0)
      return json({ error: "Enter a valid USDT amount (up to 6 decimals)" }, { status: 400 })
    const amount = parseUnits(amountStr, 6)
    if (amount > parseUnits("1000", 6)) return json({ error: "Demo limit is 1000 USDT" }, { status: 400 })

    const ttl = Math.min(Math.max(Number(body.ttlSeconds) || REQUEST_TTL.p2mQr, REQUEST_TTL.min), REQUEST_TTL.invoiceMax)
    const created = await createPaymentRequest({
      merchant: DEMO_MERCHANT.address,
      merchantName: DEMO_MERCHANT.name,
      amount,
      kind: ttl > REQUEST_TTL.p2mQr ? "invoice" : "p2m_qr",
      ttlSeconds: ttl,
      note: body.note,
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
    return json({ error: errorMessage(e) }, { status: 500 })
  }
}
