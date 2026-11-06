"use client"
// Chai & Co. shop dashboard: every order paid through the WondrPay SDK, with what was bought, who paid,
// when, refunds, and customers' refund requests (review: approve 20/50/100% or custom, or decline).
import "./dashboard.css"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge, Button, ButtonLink, Drawer, Spinner } from "@whitepay/ui"

type Ev = { key: string; kind: string; at: number; reason?: string; message?: string; evidence?: string; decision?: string; percent?: number; refundAmount?: string; refundTx?: string }
type Case = { caseId: string; paymentId: string; payer: string; amount: string; item?: string; status: "open" | "responded" | "resolved" | "lapsed"; decision?: string; round: number; openedAt: number; until: number; refunded: string; humanRequests30d: number; events: Ev[] }
type Order = { paymentId: string; orderId: string | null; item: string | null; payer: string; amount: string; refunded: string; status: string; paidAt: number; txHash: string; explorer: string; refund: Case | null }

const usd = (v: string | bigint) => (Number(BigInt(v)) / 1e6).toFixed(2)
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const when = (t: number) => new Date(t * 1000).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const left = (t: number) => { const s = t - Date.now() / 1000; if (s <= 0) return "now"; const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m` }
const REASON: Record<string, string> = { not_received: "Not received", damaged: "Arrived damaged", not_as_described: "Not as described", wrong_item: "Wrong item", duplicate: "Charged twice", other: "Something else" }
const EXPLORER = "https://explorer.testnet.whitechain.io/tx/"

function caseBadge(c: Case | null) {
  if (!c) return null
  if (c.status === "open") return <Badge tone="warning" dot>Refund requested</Badge>
  if (c.status === "responded") return <Badge tone={c.decision === "approve" ? "success" : "danger"}>{c.decision === "approve" ? "Refund approved" : "Refund declined"}</Badge>
  return <Badge tone="neutral">{c.status === "resolved" ? "Refund resolved" : "Request expired"}</Badge>
}

export default function Dashboard() {
  const [data, setData] = useState<{ shop: string; orders: Order[]; adminEnabled: boolean } | null>(null)
  const [err, setErr] = useState("")
  const [filter, setFilter] = useState<"all" | "requests" | "refunded">("all")
  const [open, setOpen] = useState<Order | null>(null)
  const load = useCallback(() => fetch("/api/dashboard", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d.error) setErr(d.error); else { setData(d); setErr("") } }).catch((e) => setErr(String(e))), [])
  useEffect(() => { void load(); const t = setInterval(load, 20_000); return () => clearInterval(t) }, [load])

  const stats = useMemo(() => {
    const o = data?.orders ?? []
    const revenue = o.reduce((s, x) => s + BigInt(x.amount), 0n)
    const refunded = o.reduce((s, x) => s + BigInt(x.refunded), 0n)
    return { count: o.length, revenue, refunded, waiting: o.filter((x) => x.refund?.status === "open").length }
  }, [data])
  const rows = (data?.orders ?? []).filter((o) => filter === "all" ? true : filter === "requests" ? !!o.refund : BigInt(o.refunded) > 0n)

  return (
    <main className="db wp-container">
      <header className="db-head">
        <div>
          <a className="db-back" href="/">← Chai &amp; Co.</a>
          <h1 className="wp-title-2">Orders</h1>
          <p className="db-sub">Every order paid with WondrPay, read live from Arkiv and Whitechain{data ? <> · shop wallet <code>{short(data.shop)}</code></> : null}.</p>
        </div>
        <Button variant="secondary" size="sm" iconLeft="repeat" onClick={() => load()}>Refresh</Button>
      </header>

      <section className="db-stats" aria-label="Summary">
        <div><span>Orders</span><b>{data ? stats.count : "…"}</b></div>
        <div><span>Revenue</span><b>{data ? usd(stats.revenue) : "…"} <small>USDT</small></b></div>
        <div><span>Refunded</span><b>{data ? usd(stats.refunded) : "…"} <small>USDT</small></b></div>
        <div className={stats.waiting ? "warn" : ""}><span>Refund requests waiting</span><b>{data ? stats.waiting : "…"}</b></div>
      </section>

      <div className="db-filters" role="tablist" aria-label="Filter orders">
        {(["all", "requests", "refunded"] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f === "all" ? "All orders" : f === "requests" ? "Refund requests" : "Refunded"}
          </button>
        ))}
      </div>

      {err && <p className="db-err">{err}</p>}
      {!data && !err && <div className="db-loading"><Spinner label="Loading orders" /></div>}
      {data && rows.length === 0 && <p className="db-empty">{filter === "all" ? "No orders yet. Buy something on the store to see it here." : "Nothing here yet."}</p>}

      {rows.length > 0 && (
        <div className="db-table" role="table" aria-label="Orders">
          <div className="db-tr db-th" role="row">
            <span role="columnheader">Item</span><span role="columnheader">Customer</span><span role="columnheader">Paid</span><span role="columnheader">Amount</span><span role="columnheader">Status</span>
          </div>
          {rows.map((o) => (
            <button key={o.paymentId} className={`db-tr ${o.refund?.status === "open" ? "attn" : ""}`} role="row" onClick={() => setOpen(o)}>
              <span role="cell" className="db-item">{o.item ?? "Order"}{o.orderId && <small>#{o.orderId.slice(2, 10)}</small>}</span>
              <span role="cell"><code>{short(o.payer)}</code></span>
              <span role="cell">{when(o.paidAt)}</span>
              <span role="cell" className="db-amt">{usd(o.amount)}{BigInt(o.refunded) > 0n && <small>−{usd(o.refunded)} refunded</small>}</span>
              <span role="cell">{caseBadge(o.refund) ?? <Badge tone="success">Paid</Badge>}</span>
            </button>
          ))}
        </div>
      )}

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.item ?? "Order"}>
        {open && <OrderDetail o={open} adminEnabled={!!data?.adminEnabled} onChanged={() => { void load().then(() => setOpen(null)) }} />}
      </Drawer>
    </main>
  )
}

function OrderDetail({ o, adminEnabled, onChanged }: { o: Order; adminEnabled: boolean; onChanged: () => void }) {
  const c = o.refund
  const [decision, setDecision] = useState<"approve" | "reject">("approve")
  const [pct, setPct] = useState(100)
  const [message, setMessage] = useState("")
  const [code, setCode] = useState(() => { try { return sessionStorage.getItem("chai.admin") ?? "" } catch { return "" } })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const live = c && (c.status === "open" || c.status === "responded")
  const amount = (BigInt(o.amount) * BigInt(pct)) / 100n

  const send = async () => {
    setBusy(true); setMsg("")
    try {
      try { sessionStorage.setItem("chai.admin", code) } catch {}
      const r = await fetch("/api/dashboard/refund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ caseId: c!.caseId, decision, percent: pct, message, code }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg(decision === "approve" ? `Refunded ${usd(d.case.refunded)} USDT on Whitechain.` : "Response sent to the customer.")
      setTimeout(onChanged, 1200)
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="dd">
      <dl className="dd-facts">
        <div><dt>Amount</dt><dd>{usd(o.amount)} USDT</dd></div>
        <div><dt>Customer</dt><dd><code>{short(o.payer)}</code></dd></div>
        <div><dt>Paid</dt><dd>{when(o.paidAt)}</dd></div>
        {BigInt(o.refunded) > 0n && <div><dt>Refunded</dt><dd>{usd(o.refunded)} USDT</dd></div>}
        {o.orderId && <div><dt>Order id</dt><dd><code>{short(o.orderId)}</code></dd></div>}
      </dl>
      <ButtonLink href={o.explorer} external variant="ghost" size="sm" iconRight="arrowUpRight">Payment on Whitechain</ButtonLink>

      {c ? (
        <section className="dd-case">
          <h3 className="wp-title-3">Refund request</h3>
          <div className={`dd-state ${c.status}`}>
            {c.status === "open" ? <>Waiting for you · re-opens for another 7 days in {left(c.until)} if unanswered (round {c.round})</>
              : c.status === "responded" ? <>You responded · closes in {left(c.until)} unless the customer replies</>
              : c.status === "resolved" ? <>Resolved {when(c.until)}</> : <>Expired unanswered</>}
          </div>
          <p className="dd-human">✓ Verified human (World ID). This person filed <b>{c.humanRequests30d}</b> refund request{c.humanRequests30d === 1 ? "" : "s"} in the last 30 days, across all their wallets and shops.</p>
          <ol className="dd-tl">
            {c.events.filter((e) => e.kind !== "renewed").map((e) => (
              <li key={e.key} className={e.kind}>
                <div className="dd-tl-head"><b>{e.kind === "opened" ? "Customer asked for a refund" : e.kind === "response" ? (e.decision === "approve" ? `You approved ${e.percent}%` : "You declined") : "Customer replied"}</b><span>{when(e.at)}</span></div>
                {e.reason && <Badge tone="neutral">{REASON[e.reason] ?? e.reason}</Badge>}
                {e.message && <p>{e.message}</p>}
                {e.evidence && <a href={e.evidence} target="_blank" rel="noreferrer nofollow">Proof link ↗</a>}
                {e.refundTx && <a href={EXPLORER + e.refundTx} target="_blank" rel="noreferrer">{usd(e.refundAmount ?? "0")} USDT refunded on Whitechain ↗</a>}
              </li>
            ))}
          </ol>

          {live && (
            <div className="dd-act">
              <div className="dd-seg" role="radiogroup" aria-label="Decision">
                <button role="radio" aria-checked={decision === "approve"} className={decision === "approve" ? "on ok" : ""} onClick={() => setDecision("approve")}>Approve</button>
                <button role="radio" aria-checked={decision === "reject"} className={decision === "reject" ? "on bad" : ""} onClick={() => setDecision("reject")}>Decline</button>
              </div>
              {decision === "approve" && (
                <div className="dd-pcts" role="radiogroup" aria-label="Refund share">
                  {[20, 50, 100].map((p) => <button key={p} role="radio" aria-checked={pct === p} className={pct === p ? "on" : ""} onClick={() => setPct(p)}>{p}%</button>)}
                  <label className="dd-custom">Custom <input inputMode="numeric" value={pct} onChange={(e) => setPct(Math.max(1, Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 1)))} />%</label>
                </div>
              )}
              <textarea maxLength={500} placeholder={decision === "approve" ? "Message to the customer (optional)" : "Why are you declining? The customer sees this."} value={message} onChange={(e) => setMessage(e.target.value)} />
              {adminEnabled ? (
                <input className="dd-code" type="password" autoComplete="off" placeholder="Admin code" value={code} onChange={(e) => setCode(e.target.value)} />
              ) : <p className="db-sub">Set <code>STORE_ADMIN_CODE</code> on the store server to answer from here.</p>}
              <Button variant={decision === "approve" ? "primary" : "secondary"} loading={busy} disabled={!adminEnabled || !code || (decision === "reject" && message.trim().length < 5)} onClick={send}>
                {decision === "approve" ? `Approve & refund ${usd(amount)} USDT` : "Send response"}
              </Button>
              {msg && <p className="dd-msg" role="status">{msg}</p>}
              <p className="db-sub">Approving pays the refund on Whitechain immediately, only to the customer's wallet and never more than they paid. Every decision is signed with the shop key and stored on Arkiv, owned by no one.</p>
            </div>
          )}
        </section>
      ) : <p className="db-sub">No refund request. Customers ask from their WondrPay order page.</p>}
    </div>
  )
}
