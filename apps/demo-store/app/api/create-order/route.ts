// ── WHITEPAY INTEGRATION ③ (server) ── sign the order with the shop's key and publish it on WhitePay.
import { createWhitePayOrder } from "@whitepay/checkout/server"
import type { Hex } from "viem"
import { recordEvent } from "@/lib/events"

// prices live on the SERVER; the browser only says which product (price tampering is impossible)
const CATALOG: Record<string, string> = { "chai-kit": "2.50", "tote-bag": "1.20", "sticker-pack": "0.40" }

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { payload?: { sku?: unknown } } | null
  const sku = typeof body?.payload?.sku === "string" ? body.payload.sku : ""
  const amount = Object.hasOwn(CATALOG, sku) ? CATALOG[sku] : undefined
  if (!amount) return Response.json({ error: "unknown product" }, { status: 400 })
  try {
    const order = await createWhitePayOrder({
      merchantKey: process.env.STORE_MERCHANT_PK as Hex,
      amount,
      whitepayUrl: process.env.WHITEPAY_URL ?? "https://whitepay.vercel.app",
      webhook: process.env.STORE_URL?.startsWith("https://") ? `${process.env.STORE_URL}/api/webhook` : undefined,
      note: sku,
    })
    recordEvent(order.orderId, `order signed by shop key, published to WhitePay (${amount} USDT)`)
    return Response.json(order)
  } catch (e) {
    console.error("[create-order]", (e as Error).message)
    return Response.json({ error: "could not create the order" }, { status: 502 }) // never leak internals
  }
}
