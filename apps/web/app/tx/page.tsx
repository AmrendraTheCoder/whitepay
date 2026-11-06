"use client"
// One transaction, larger: who, how much, when, and how it settled, with a link to the explorer.
// Same receipt layout as the order page (shop orders still open /order, which adds refunds).
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { EXPLORER_URL, ROUTER_ADDRESS } from "@whitepay/shared"
import { TopBar } from "../components"
import { LogoLoader, Identicon, prettyName, activityLabel, type Activity } from "../ui"
import { getWallet } from "@/lib/wallet"
import { usdt, short } from "@/lib/format"
import "../refund.css"
import "./tx.css"

type ChainTx = { block?: number; status?: string; confirmations?: number; feeWei?: bigint; method?: string | null }

export default function TxPage() {
  return <Suspense fallback={<main className="shell"><LogoLoader /></main>}><Tx /></Suspense>
}

function Tx() {
  const hash = (useSearchParams().get("h") ?? "").toLowerCase()
  const [wallet, setWallet] = useState<ReturnType<typeof getWallet> | undefined>(undefined)
  useEffect(() => setWallet(getWallet()), [])
  const [row, setRow] = useState<Activity | null | undefined>(undefined)
  const [party, setParty] = useState<{ address: string; name?: string; displayName?: string } | null>(null)
  const [chain, setChain] = useState<ChainTx | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!wallet || !/^0x[0-9a-f]{64}$/.test(hash)) { if (wallet !== undefined) setRow(null); return }
    let live = true
    fetch(`/api/activity?address=${wallet.address}`).then((r) => r.json()).then(async (d) => {
      const r = ((d.rows ?? []) as Activity[]).find((x) => x.txHash.toLowerCase() === hash) ?? null
      if (!live) return
      setRow(r)
      if (!r) return
      // money pushed through the WondrPay router shows the router as the other side: find the real person
      let other = r.counterparty
      if (other.toLowerCase() === ROUTER_ADDRESS.toLowerCase()) {
        const t = await fetch(`${EXPLORER_URL}/api/v2/transactions/${hash}/token-transfers`).then((x) => x.json()).catch(() => null)
        const legs = (t?.items ?? []) as { from: { hash: string }; to: { hash: string } }[]
        const router = ROUTER_ADDRESS.toLowerCase()
        const leg = r.direction === "in" ? legs.find((l) => l.to.hash.toLowerCase() === router)?.from.hash : legs.find((l) => l.from.hash.toLowerCase() === router)?.to.hash
        if (leg) other = leg
      }
      const who = await fetch(`/api/resolve?q=${other}`).then((x) => x.json()).catch(() => ({}))
      if (live) setParty({ address: other, name: who?.name ?? (other === r.counterparty ? r.counterpartyName : undefined), displayName: who?.displayName })
    }).catch(() => live && setRow(null))
    // settlement details straight from the chain
    fetch(`${EXPLORER_URL}/api/v2/transactions/${hash}`).then((x) => x.json()).then((t) => {
      if (!live || !t) return
      setChain({ block: t.block_number ?? t.block, status: t.status ?? t.result, confirmations: t.confirmations, feeWei: t.fee?.value ? BigInt(t.fee.value) : undefined, method: t.method })
    }).catch(() => {})
    return () => { live = false }
  }, [wallet, hash])

  const back = <TopBar back="/transactions" />
  if (wallet === undefined || row === undefined) return <main className="shell">{back}<LogoLoader label="Loading transaction…" /></main>
  if (!wallet) return <main className="shell">{back}<div className="card">Open this on the device with your wallet.</div></main>
  if (row === null)
    return (
      <main className="shell">{back}
        <div className="card stack">
          <h2>Transaction not found</h2>
          <div className="sub">It isn't in this wallet's history.</div>
          {/^0x[0-9a-f]{64}$/.test(hash) && <a className="chip self-start" href={`${EXPLORER_URL}/tx/${hash}`} target="_blank" rel="noreferrer">Look it up on the explorer ↗</a>}
        </div>
      </main>
    )

  const incoming = row.direction === "in"
  const other = party?.address ?? row.counterparty
  const otherName = party?.displayName ?? (party?.name ? prettyName(party.name) : prettyName(row.counterpartyName, other))
  const ens = party?.name && party.name !== otherName ? party.name : undefined
  const named = !!(party?.displayName || party?.name || row.counterpartyName) // else otherName is already the short address
  const viaRouter = row.counterparty.toLowerCase() === ROUTER_ADDRESS.toLowerCase() || row.source === "arkiv"
  const ok = !chain?.status || chain.status === "ok" || chain.status === "success"
  const me = wallet.address
  const explorer = `${EXPLORER_URL}/tx/${row.txHash}`

  return (
    <main className="shell">
      {back}
      <section className="card od-hero">
        <Identicon seed={other} name={party?.name ?? row.counterpartyName} size={64} />
        <div className="od-shop">{incoming ? `From ${otherName}` : `To ${otherName}`}</div>
        {ens && <div className="od-ens">{ens}</div>}
        <div className={`od-amt ${incoming ? "pos" : "neg"}`}>{incoming ? "+" : "−"}{usdt(row.amount)}<span>USDT</span></div>
        <div className="od-pills">
          <span className={`od-pill ${ok ? "paid" : "refunded"}`}>{ok ? (incoming ? "Received" : "Sent") : "Failed"}</span>
          <span className="od-pill tx-kind">{activityLabel(row)}</span>
        </div>
        <a className="od-chain" href={explorer} target="_blank" rel="noreferrer">
          <span className="od-chain-dot" aria-hidden />Settled on Whitechain Sepolia{viaRouter ? " · 0 gas" : ""}<span aria-hidden>↗</span>
        </a>
      </section>

      <section className="card od">
        <div className="od-row"><span>{incoming ? "Received" : "Sent"}</span><b>{usdt(row.amount)} USDT</b></div>
        <div className="od-row"><span>From</span><b>{incoming ? otherName : "You"}{(!incoming || named) && <small className="tx-addr">{short(incoming ? other : me)}</small>}</b></div>
        <div className="od-row"><span>To</span><b>{incoming ? "You" : otherName}{(incoming || named) && <small className="tx-addr">{short(incoming ? me : other)}</small>}</b></div>
        <div className="od-row"><span>When</span><b>{new Date(row.at * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</b></div>
        <div className="od-row"><span>Type</span><b>{activityLabel(row)}{row.source === "arkiv" ? " · WondrPay receipt" : " · on-chain transfer"}</b></div>
        <div className="od-row"><span>Network fee</span><b>{viaRouter ? "0 for you · paid by WondrPay" : chain?.feeWei != null ? `${(Number(chain.feeWei) / 1e18).toPrecision(2)} WBT` : "–"}</b></div>
        {chain?.block != null && <div className="od-row"><span>Block</span><b className="mono">#{chain.block.toLocaleString("en-IN")}{chain.confirmations ? ` · ${chain.confirmations.toLocaleString("en-IN")} confirmations` : ""}</b></div>}
        <div className="od-row"><span>Network</span><b>Whitechain Sepolia · USDT</b></div>
        <button className="od-row od-link tx-copy" onClick={() => { void navigator.clipboard?.writeText(row.txHash); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
          <span>Transaction id</span><b className="mono">{copied ? "Copied" : `${short(row.txHash)} ⧉`}</b>
        </button>
      </section>

      <a className="btn btn-ghost" href={explorer} target="_blank" rel="noreferrer">View on Whitechain explorer ↗</a>
    </main>
  )
}
