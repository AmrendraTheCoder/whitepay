// Merchant: publish a payment request. The order is signed on the merchant's OWN device;
// the server only checks the signature against MerchantRegistry and writes the Arkiv entity.
import { isAddress, isHex, type Address, type Hex } from "viem"
import { preparePaymentRequest, publishPaymentRequest, getMerchantByAddress, assertSafeWebhookUrl } from "@whitepay/server"
import { after } from "next/server"
import { REQUEST_TTL } from "@whitepay/shared"
import { json, errorMessage, CORS, preflight } from "@/lib/json"

export const runtime = "nodejs"

type Body = {
  order: { merchant: string; amount: string; orderId: string; deadline: string }
  merchantSig: string
  note?: string
  /** optional https URL WhitePay POSTs to when this request is paid (<=128 chars) */
  webhook?: string
}

export const OPTIONS = preflight

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Body
    const o = b.order
    if (!o || !isAddress(o.merchant) || !isHex(o.orderId) || o.orderId.length !== 66 || !isHex(b.merchantSig))
      return json({ error: "malformed order" }, { status: 400 })
    const amount = BigInt(o.amount)
    if (amount <= 0n || amount > 1_000_000_000n) return json({ error: "Amount must be between 0 and 1000 USDT" }, { status: 400 })

    const webhook = b.webhook ? String(b.webhook) : undefined
    if (webhook && webhook.length > 128) return json({ error: "webhook must be at most 128 characters" }, { status: 400, headers: CORS })
    const order = { merchant: o.merchant as Address, amount, orderId: o.orderId as Hex, deadline: BigInt(o.deadline) }
    const ttl = Number(order.deadline) - Math.floor(Date.now() / 1000)
    // fast path (~0.5 s, all in parallel): webhook SSRF check, merchant profile, signature vs on-chain registry
    const [hookErr, profile, prepared] = await Promise.all([
      webhook ? assertSafeWebhookUrl(webhook).then(() => null, (e) => errorMessage(e)) : Promise.resolve(null),
      getMerchantByAddress(o.merchant as Address),
      preparePaymentRequest({ merchant: order.merchant, amount, kind: ttl > REQUEST_TTL.p2mQr + 30 ? "invoice" : "p2m_qr", note: b.note, webhook, signed: { order, merchantSig: b.merchantSig as Hex } }),
    ])
    if (hookErr) return json({ error: hookErr }, { status: 400, headers: CORS })
    if (!profile) return json({ error: "Sign up as a merchant first" }, { status: 403, headers: CORS })
    ;(prepared.values as Record<string, unknown>).merchantName = profile.ensName
    // slow: the Arkiv write (~5-7 s) happens after the response; one retry if the first attempt fails
    after(async () => {
      // concurrent writes from the one Arkiv writer can collide on its nonce: retry with a little jitter
      for (let i = 0; i < 3; i++) {
        try { await publishPaymentRequest(prepared); return } catch (e) { console.error(`[requests] publish attempt ${i + 1} failed`, errorMessage(e)) }
        await new Promise((r) => setTimeout(r, 700 + Math.random() * 1300))
      }
    })
    const origin = process.env.NEXT_PUBLIC_APP_URL?.startsWith("https") ? process.env.NEXT_PUBLIC_APP_URL : new URL(req.url).origin
    const ref = prepared.digest // the QR's id: fixed by the merchant's signature, known before the Arkiv write
    return json({
      entityKey: ref,
      payUrl: `${origin}/pay?req=${ref}`,
      amount: prepared.order.amount,
      deadline: prepared.order.deadline,
      orderId: prepared.order.orderId,
      publishing: true,
    }, { headers: CORS })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 400, headers: CORS })
  }
}
