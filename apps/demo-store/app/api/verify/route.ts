// ── WHITEPAY INTEGRATION ⑤ (server) ── confirm a payment on Whitechain from its tx hash (thank-you page).
import { verifyWhitePayPayment } from "@whitepay/checkout/server"
import { privateKeyToAccount } from "viem/accounts"
import type { Hex } from "viem"

const HEX32 = /^0x[0-9a-fA-F]{64}$/
export async function GET(req: Request) {
  const u = new URL(req.url)
  const tx = u.searchParams.get("tx") ?? "", orderId = u.searchParams.get("orderId") ?? ""
  if (!HEX32.test(tx) || (orderId && !HEX32.test(orderId))) return Response.json({ ok: false, reason: "bad input" }, { status: 400 })
  const shop = privateKeyToAccount(process.env.STORE_MERCHANT_PK as Hex).address
  const v = await verifyWhitePayPayment({ txHash: tx as Hex, merchant: shop, orderId: (orderId || undefined) as Hex | undefined })
    .catch(() => ({ ok: false as const, reason: "transaction not found yet" }))
  return Response.json({ ...v, amount: v.ok ? v.amount.toString() : undefined, block: v.ok ? v.block.toString() : undefined })
}
