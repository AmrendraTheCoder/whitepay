// ── WONDRPAY INTEGRATION ⑥ (server) ── the shop's orders dashboard: every paid order with the item, payer,
// time, refunds and any refund request, straight from WondrPay (public Arkiv data, re-verified).
import { listWondrPayOrders } from "@whitepay/checkout/server"
import { privateKeyToAccount } from "viem/accounts"
import type { Hex } from "viem"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const shop = privateKeyToAccount(process.env.STORE_MERCHANT_PK as Hex).address
    const d = await listWondrPayOrders({ merchant: shop, whitepayUrl: process.env.WHITEPAY_URL ?? "https://wondrpay.vercel.app" })
    return Response.json({ shop, ...d, adminEnabled: !!process.env.STORE_ADMIN_CODE }, { headers: { "cache-control": "no-store" } })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 })
  }
}
