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
  if ((!merchant || !isAddress(merchant)) && (!payer || !isAddress(payer)))
    return json({ error: "pass ?merchant= or ?payer=" }, { status: 400 })
  try {
    const page = await listReceipts({
      merchant: merchant && isAddress(merchant) ? (merchant as Address) : undefined,
      payer: payer && isAddress(payer) ? (payer as Address) : undefined,
      limit: 20,
    })
    const rows = (page.entities as any[]).map((r) => ({
      key: r.$key,
      merchant: r.merchant.value,
      merchantName: r.merchantName?.value,
      payer: r.payer.value,
      amount: BigInt(r.amount.value),
      status: r.status.value,
      paidAt: Number(r.paidAt.value),
      txHash: r.wcTxHash.value,
      explorer: `${EXPLORER_URL}/tx/${r.wcTxHash.value}`,
    }))
    return json({ total: page.count, rows })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}
