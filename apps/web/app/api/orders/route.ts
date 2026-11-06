// Merchant orders: every paid order (Arkiv receipts) with what was bought, who paid, when, refunds,
// and the refund-request case attached to it, if any. Public data (receipts and cases are on Arkiv).
import { isAddress, type Address } from "viem"
import { listReceipts, listRefundCases, refundKeeper } from "@whitepay/server"
import { EXPLORER_URL } from "@whitepay/shared"
import { after } from "next/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const merchant = new URL(req.url).searchParams.get("merchant") ?? ""
  if (!isAddress(merchant)) return json({ error: "pass ?merchant=" }, { status: 400 })
  try {
    const [page, cases] = await Promise.all([listReceipts({ merchant: merchant as Address, limit: 200 }), listRefundCases({ merchant: merchant as Address })])
    const byPayment = new Map<string, typeof cases>()
    for (const c of cases) byPayment.set(c.paymentId.toLowerCase(), [...(byPayment.get(c.paymentId.toLowerCase()) ?? []), c])
    const orders = (page.entities as any[])
      .filter((r) => (r.kind?.value ?? "p2m") === "p2m")
      .map((r) => {
        const pid = String(r.paymentId?.value ?? "").toLowerCase()
        const cs = byPayment.get(pid) ?? []
        return {
          paymentId: pid,
          orderId: r.orderId?.value ?? null,
          item: r.item?.value ?? null,
          payer: r.payer.value,
          amount: String(r.amount.value),
          refunded: String(r.refunded?.value ?? 0),
          status: r.status.value,
          paidAt: Number(r.paidAt.value),
          txHash: r.wcTxHash.value,
          explorer: `${EXPLORER_URL}/tx/${r.wcTxHash.value}`,
          refund: cs[0] ?? null, // newest case for this order
        }
      })
    after(() => refundKeeper().catch(() => {}))
    return json({ orders, cases })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}
