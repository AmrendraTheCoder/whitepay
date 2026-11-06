// History (customer) and dashboard (merchant): receipts read from Arkiv.
import { isAddress, type Address } from "viem"
import { listReceipts } from "@whitepay/server"
import { EXPLORER_URL } from "@whitepay/shared"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const u = new URL(req.url)
  const merchant = u.searchParams.get("merchant")
  const payer = u.searchParams.get("payer")
  const account = u.searchParams.get("account")
  if ((!merchant || !isAddress(merchant)) && (!payer || !isAddress(payer)) && (!account || !isAddress(account)))
    return json({ error: "pass ?merchant=, ?payer= or ?account=" }, { status: 400 })
  try {
    const page = await listReceipts({
      merchant: merchant && isAddress(merchant) ? (merchant as Address) : undefined,
      payer: payer && isAddress(payer) ? (payer as Address) : undefined,
      party: account && isAddress(account) ? (account as Address) : undefined,
      limit: Math.min(Math.max(Number(u.searchParams.get("limit") ?? 20) || 20, 1), 200),
    })
    const rows = (page.entities as any[]).map((r) => ({
      key: r.$key,
      merchant: r.merchant.value,
      merchantName: r.merchantName?.value,
      payer: r.payer.value,
      amount: BigInt(r.amount.value),
      status: r.status.value,
      kind: r.kind?.value ?? "p2m",
      paymentId: r.paymentId?.value,
      refunded: BigInt(r.refunded?.value ?? 0),
      item: r.item?.value ?? null,
      orderId: r.orderId?.value ?? null,
      paidAt: Number(r.paidAt.value),
      txHash: r.wcTxHash.value,
      explorer: `${EXPLORER_URL}/tx/${r.wcTxHash.value}`,
    }))
    return json({ total: page.count, rows })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}
