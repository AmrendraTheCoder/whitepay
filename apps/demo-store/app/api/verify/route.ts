// Used by the thank-you screen to show "verified on-chain" (same check as the webhook).
import { verifyWhitePayPayment } from "@whitepay/checkout/server"
import { privateKeyToAccount } from "viem/accounts"
import type { Hex } from "viem"

export async function GET(req: Request) {
  const u = new URL(req.url)
  const tx = u.searchParams.get("tx") as Hex | null
  if (!tx) return Response.json({ ok: false, reason: "missing tx" }, { status: 400 })
  const shop = privateKeyToAccount(process.env.STORE_MERCHANT_PK as Hex).address
  const v = await verifyWhitePayPayment({ txHash: tx, merchant: shop, orderId: (u.searchParams.get("orderId") as Hex) ?? undefined })
  return Response.json({ ...v, amount: v.amount?.toString(), block: v.block?.toString() })
}
