// THE MERCHANT INTEGRATION, server side (2 of 2): WhitePay calls this when an order is paid.
// Never trust the body: confirm the PaymentSettled event on Whitechain, then fulfil the order.
import { verifyWhitePayPayment } from "@whitepay/checkout/server"
import { privateKeyToAccount } from "viem/accounts"
import type { Hex } from "viem"

export async function POST(req: Request) {
  const e = (await req.json()) as { event: string; txHash: Hex; orderId: Hex; amount: string }
  const shop = privateKeyToAccount(process.env.STORE_MERCHANT_PK as Hex).address
  const v = await verifyWhitePayPayment({ txHash: e.txHash, merchant: shop, orderId: e.orderId, minAmount: BigInt(e.amount) })
  console.log("[store webhook]", e.event, e.orderId, v.ok ? "VERIFIED on-chain -> fulfil order" : `REJECTED: ${v.reason}`)
  return Response.json({ received: true, verified: v.ok })
}
