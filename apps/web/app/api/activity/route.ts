// Unified activity for ANY wallet: WondrPay receipts (Arkiv: names, kind, receipt) merged with every
// on-chain USDT transfer (Whitechain explorer), so swaps, MetaMask sends and direct transfers show too.
import { getAddress, isAddress, type Address } from "viem"
import { listReceipts, config } from "@whitepay/server"
import { EXPLORER_URL, ROUTER_ADDRESS, USDT_ADDRESS } from "@whitepay/shared"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export type ActivityRow = {
  key: string
  direction: "in" | "out"
  counterparty: string
  counterpartyName?: string
  amount: string
  at: number
  kind: "p2m" | "p2p" | "transfer" | "whitepay" | "refund" | "autopay"
  txHash: string
  explorer: string
  source: "arkiv" | "chain"
}

type BsTransfer = {
  from: { hash: string }; to: { hash: string }; total: { value: string }
  timestamp: string; method?: string | null; transaction_hash?: string; tx_hash?: string; log_index?: number
}

export async function GET(req: Request) {
  const a = new URL(req.url).searchParams.get("address")
  if (!a || !isAddress(a)) return json({ error: "pass ?address=" }, { status: 400 })
  const me = getAddress(a as Address)
  const lc = me.toLowerCase()
  try {
    const [receipts, chain] = await Promise.all([
      listReceipts({ party: me, limit: 50 }).then((p) => p.entities as any[]).catch(() => []),
      fetch(`${EXPLORER_URL}/api/v2/addresses/${me}/token-transfers?type=ERC-20&token=${USDT_ADDRESS}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => (d.items ?? []) as BsTransfer[])
        .catch(() => [] as BsTransfer[]),
    ])

    const rows = new Map<string, ActivityRow>()
    // 1) WondrPay receipts (richest data)
    for (const r of receipts) {
      const incoming = String(r.merchant.value).toLowerCase() === lc
      const tx = String(r.wcTxHash.value)
      rows.set(tx.toLowerCase(), {
        key: r.$key,
        direction: incoming ? "in" : "out",
        counterparty: incoming ? r.payer.value : r.merchant.value,
        counterpartyName: incoming ? undefined : r.merchantName?.value,
        amount: BigInt(r.amount.value).toString(),
        at: Number(r.paidAt.value),
        kind: (r.kind?.value ?? "p2m") as ActivityRow["kind"],
        txHash: tx,
        explorer: `${EXPLORER_URL}/tx/${tx}`,
        source: "arkiv",
      })
    }
    // 2) every on-chain USDT transfer not already covered by a receipt
    const router = ROUTER_ADDRESS.toLowerCase()
    for (const t of chain) {
      const tx = (t.transaction_hash ?? t.tx_hash ?? "").toLowerCase()
      if (!tx || rows.has(tx)) continue
      const from = t.from.hash.toLowerCase(), to = t.to.hash.toLowerCase()
      if (from !== lc && to !== lc) continue
      const incoming = to === lc
      const other = incoming ? t.from.hash : t.to.hash
      const viaRouter = other.toLowerCase() === router
      rows.set(tx, {
        key: `${tx}:${t.log_index ?? 0}`,
        direction: incoming ? "in" : "out",
        counterparty: other,
        counterpartyName: viaRouter ? (t.method === "refund" || t.method === "refundDirect" ? "Refund" : "WondrPay payment") : undefined,
        amount: BigInt(t.total.value).toString(),
        at: Math.floor(new Date(t.timestamp).getTime() / 1000),
        kind: viaRouter ? (t.method === "refund" || t.method === "refundDirect" ? "refund" : "whitepay") : "transfer",
        txHash: tx,
        explorer: `${EXPLORER_URL}/tx/${tx}`,
        source: "chain",
      })
    }
    const list = [...rows.values()].sort((x, y) => y.at - x.at)
    return json({ rows: list, router: config.router })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}
