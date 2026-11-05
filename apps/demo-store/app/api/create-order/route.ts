// THE MERCHANT INTEGRATION, server side (1 of 2): sign the order with the shop key and publish it on WhitePay.
import { createWhitePayOrder } from "@whitepay/checkout/server"
import type { Hex } from "viem"

const CATALOG: Record<string, string> = { "chai-kit": "2.50", "tote-bag": "1.20", "sticker-pack": "0.40" }

export async function POST(req: Request) {
  const { payload } = (await req.json()) as { payload?: { sku?: string } }
  const amount = CATALOG[payload?.sku ?? ""] // price from the SERVER catalog, never from the browser
  if (!amount) return Response.json({ error: "unknown product" }, { status: 400 })
  const site = process.env.STORE_URL // e.g. https://whitepay-demo-store.vercel.app
  try {
    const order = await createWhitePayOrder({
      merchantKey: process.env.STORE_MERCHANT_PK as Hex,
      amount,
      whitepayUrl: process.env.WHITEPAY_URL ?? "https://whitepay.vercel.app",
      webhook: site?.startsWith("https://") ? `${site}/api/webhook` : undefined,
      note: payload?.sku,
    })
    return Response.json(order)
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 })
  }
}
