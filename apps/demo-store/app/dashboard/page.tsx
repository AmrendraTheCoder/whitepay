"use client"
// Amaron's shop dashboard (WondrPay Business): every order paid through the WondrPay SDK, with what was bought,
// who paid, when, refunds, and customers' refund requests (review: approve 20/50/100% or custom, or decline).
import "./dashboard.css"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge, Button, Drawer } from "@whitepay/ui"
import { BY_SKU, PRODUCTS, type Product } from "@/lib/catalog"
import { ProductImage } from "@/lib/packshot"

type Ev = { key: string; kind: string; at: number; reason?: string; message?: string; evidence?: string; decision?: string; percent?: number; refundAmount?: string; refundTx?: string }
type Case = { caseId: string; paymentId: string; payer: string; amount: string; item?: string; status: "open" | "responded" | "resolved" | "lapsed"; decision?: string; round: number; openedAt: number; until: number; refunded: string; humanRequests30d: number; events: Ev[] }
type Order = { paymentId: string; orderId: string | null; item: string | null; payer: string; amount: string; refunded: string; status: string; paidAt: number; txHash: string; explorer: string; refund: Case | null }
type Filter = "all" | "reply" | "requests" | "refunded"

const usd = (v: string | bigint) => (Number(BigInt(v)) / 1e6).toFixed(2)
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const when = (t: number) => new Date(t * 1000).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const left = (t: number) => { const s = t - Date.now() / 1000; if (s <= 0) return "now"; const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m` }
const ago = (t: number, now: number) => {
  const s = Math.max(0, now / 1000 - t)
  if (s < 60) return "Just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 2 * 86400) return "Yesterday"
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`
  return new Date(t * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}
const REASON: Record<string, string> = { not_received: "Not received", damaged: "Arrived damaged", not_as_described: "Not as described", wrong_item: "Wrong item", duplicate: "Charged twice", other: "Something else" }
const EXPLORER = "https://explorer.testnet.whitechain.io/tx/"

// The order note is "Name ×qty,Name ×qty" (older orders: "sku x1"); match each line back to the catalog.
type Line = { name: string; qty: number; p?: Product }
const BY_NAME: Record<string, Product> = { ...Object.fromEntries(PRODUCTS.map((p) => [p.name.toLowerCase(), p])), "cutting chai stickers": BY_SKU["sticker-pack"] } // the pack's earlier name
function linesOf(item: string | null): Line[] {
  if (!item) return []
  return item.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^(.*?)\s*[×x](\d+)$/)
    const raw = (m ? m[1] : s).trim()
    const p = BY_SKU[raw] ?? BY_NAME[raw.toLowerCase()]
    const name = p?.name ?? (/^[a-z0-9-]+$/.test(raw) ? raw.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) : raw)
    return { name, qty: m ? Number(m[2]) : 1, p }
  })
}

// a small, stable colour bubble per wallet, so repeat customers are easy to spot
function Avatar({ addr, size = 30 }: { addr: string; size?: number }) {
  const h1 = parseInt(addr.slice(2, 6), 16) % 360, h2 = (h1 + 40 + (parseInt(addr.slice(6, 8), 16) % 80)) % 360
  return <span className="db-av" aria-hidden style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${h1} 75% 60%), hsl(${h2} 70% 45%))` }} />
}

function Thumb({ line, count }: { line?: Line; count: number }) {
  return (
    <span className="db-thumb" aria-hidden>
      {line?.p ? <ProductImage p={line.p} width={88} /> : <span className="db-thumb-x">{line ? line.name.slice(0, 1) : "₮"}</span>}
      {count > 1 && <b>{count}</b>}
    </span>
  )
}

function statusOf(o: Order): { tone: "success" | "warning" | "danger" | "neutral"; label: string } {
  const c = o.refund
  if (c?.status === "open") return { tone: "warning", label: "Needs reply" }
  if (o.status === "refunded") return { tone: "neutral", label: "Refunded" }
  if (o.status === "partially_refunded") return { tone: "neutral", label: "Partly refunded" }
  if (c?.status === "responded") return c.decision === "approve" ? { tone: "success", label: "Refund approved" } : { tone: "danger", label: "Refund declined" }
  if (c?.status === "lapsed") return { tone: "neutral", label: "Request expired" }
  return { tone: "success", label: "Paid" }
}

function csv(rows: Order[]) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`
  const head = ["paid_at", "order_id", "items", "customer", "amount_usdt", "refunded_usdt", "status", "tx"]
  const body = rows.map((o) => [new Date(o.paidAt * 1000).toISOString(), o.orderId ?? "", linesOf(o.item).map((l) => `${l.name} x${l.qty}`).join("; "), o.payer, usd(o.amount), usd(o.refunded), statusOf(o).label, o.txHash].map(q).join(","))
  const url = URL.createObjectURL(new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" }))
  const a = Object.assign(document.createElement("a"), { href: url, download: `amaron-orders-${new Date().toISOString().slice(0, 10)}.csv` })
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Dashboard() {
  const [data, setData] = useState<{ shop: string; orders: Order[]; adminEnabled: boolean } | null>(null)
  const [err, setErr] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [q, setQ] = useState("")
  const [open, setOpen] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadedAt, setLoadedAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const load = useCallback(() => {
    setLoading(true)
    return fetch("/api/dashboard", { cache: "no-store" }).then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else { setData(d); setErr(""); setLoadedAt(Date.now()) } })
      .catch((e) => setErr(String(e))).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    void load()
    const t = setInterval(load, 20_000), c = setInterval(() => setNow(Date.now()), 15_000)
    const onFocus = () => { if (document.visibilityState === "visible") void load() }
    document.addEventListener("visibilitychange", onFocus)
    return () => { clearInterval(t); clearInterval(c); document.removeEventListener("visibilitychange", onFocus) }
  }, [load])

  const orders = useMemo(() => data?.orders ?? [], [data])
  const stats = useMemo(() => {
    const revenue = orders.reduce((s, x) => s + BigInt(x.amount), 0n)
    const refunded = orders.reduce((s, x) => s + BigInt(x.refunded), 0n)
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
    const open = orders.filter((x) => x.refund?.status === "open")
    return {
      count: orders.length, revenue, refunded, net: revenue - refunded,
      today: orders.filter((x) => x.paidAt * 1000 >= dayStart.getTime()).length,
      avg: orders.length ? revenue / BigInt(orders.length) : 0n,
      refundedOrders: orders.filter((x) => BigInt(x.refunded) > 0n).length,
      pct: revenue ? Number((refunded * 1000n) / revenue) / 10 : 0,
      waiting: open.length,
      soonest: open.length ? Math.min(...open.map((x) => x.refund!.until)) : 0,
      requests: orders.filter((x) => !!x.refund).length,
    }
  }, [orders])
  const repeat = useMemo(() => orders.reduce<Record<string, number>>((m, o) => ((m[o.payer.toLowerCase()] = (m[o.payer.toLowerCase()] ?? 0) + 1), m), {}), [orders])

  const counts: Record<Filter, number> = { all: stats.count, reply: stats.waiting, requests: stats.requests, refunded: stats.refundedOrders }
  const needle = q.trim().toLowerCase()
  const rows = orders
    .filter((o) => filter === "all" ? true : filter === "reply" ? o.refund?.status === "open" : filter === "requests" ? !!o.refund : BigInt(o.refunded) > 0n)
    .filter((o) => !needle || [o.item ?? "", linesOf(o.item).map((l) => l.name).join(" "), o.payer, o.orderId ?? "", o.txHash].join(" ").toLowerCase().includes(needle))

  return (
    <main className="db">
      <nav className="wpc-bar" aria-label="WondrPay Business">
        <a className="wpc-brand" href="https://wondrpay-app.vercel.app/portal" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 512 512" width="32" height="32" aria-hidden><rect width="512" height="512" rx="120" fill="#2448ff" /><path d="M110 168l50 176 56-128 40 92 40-92 56 128 50-176" fill="none" stroke="#fff" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" /><circle cx="410" cy="110" r="34" fill="#ddf05a" /></svg>
          <span>WondrPay<small>Business</small></span>
        </a>
        <div className="wpc-bar-r">
          <a className="db-back" href="/">← Amaron store</a>
          <span className="wpc-chain"><i aria-hidden />Live on Whitechain Sepolia</span>
        </div>
      </nav>

      <header className="db-head">
        <div>
          <p className="db-eyebrow">Amaron{data ? <> · <code title={data.shop}>{short(data.shop)}</code></> : null}</p>
          <h1>Orders</h1>
          <p className="db-sub">Paid in USDT on Whitechain. Receipts and refund requests live on Arkiv.</p>
        </div>
        <div className="db-head-act">
          <span className="db-updated" aria-live="polite">{loading ? "Updating…" : loadedAt ? `Updated ${ago(loadedAt / 1000, now).toLowerCase()}` : ""}</span>
          <Button variant="secondary" size="sm" iconLeft="repeat" onClick={() => load()} disabled={loading}>Refresh</Button>
          <Button variant="secondary" size="sm" onClick={() => csv(rows)} disabled={!rows.length}>Export CSV</Button>
        </div>
      </header>

      <section className="db-stats" aria-label="Summary">
        <div className="hero">
          <span>Net revenue</span>
          <b>{data ? usd(stats.net) : "–"} <small>USDT</small></b>
          <em>{data ? `${usd(stats.revenue)} gross · ${usd(stats.refunded)} refunded` : " "}</em>
        </div>
        <div>
          <span>Orders</span>
          <b>{data ? stats.count : "–"}</b>
          <em>{data ? `${stats.today} today · avg ${usd(stats.avg)} USDT` : " "}</em>
        </div>
        <div>
          <span>Refunded</span>
          <b>{data ? usd(stats.refunded) : "–"} <small>USDT</small></b>
          <em>{data ? `${stats.refundedOrders} order${stats.refundedOrders === 1 ? "" : "s"} · ${stats.pct}% of gross` : " "}</em>
        </div>
        <button type="button" className={`db-stat-btn ${stats.waiting ? "warn" : ""}`} onClick={() => setFilter("reply")} disabled={!data}>
          <span>Needs your reply</span>
          <b>{data ? stats.waiting : "–"}</b>
          <em>{!data ? " " : stats.waiting ? `Soonest re-opens in ${left(stats.soonest)}` : "All caught up"}</em>
        </button>
      </section>

      <div className="db-tools">
        <div className="db-filters" role="tablist" aria-label="Filter orders">
          {(["all", "reply", "requests", "refunded"] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "reply" ? "Needs reply" : f === "requests" ? "Refund requests" : "Refunded"}
              {data && <i className={f === "reply" && counts.reply ? "hot" : ""}>{counts[f]}</i>}
            </button>
          ))}
        </div>
        <label className="db-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" placeholder="Search item, wallet or order id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        </label>
      </div>

      {err && <p className="db-err" role="alert">Couldn&apos;t load orders: {err}</p>}

      <div className="db-table" role="table" aria-label="Orders" aria-busy={!data}>
        <div className="db-tr db-th" role="row">
          <span role="columnheader">Order</span><span role="columnheader">Customer</span><span role="columnheader">Date</span><span role="columnheader">Status</span><span role="columnheader" className="r">Amount</span><span aria-hidden />
        </div>
        {!data && !err && Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="db-tr db-skel" role="row" aria-hidden><span><i className="sq" /><i /></span><span><i /></span><span><i /></span><span><i /></span><span className="r"><i /></span><span /></div>
        ))}
        {data && rows.length === 0 && (
          <div className="db-empty">
            <b>{needle ? `No orders match “${q.trim()}”` : filter === "all" ? "No orders yet" : filter === "reply" ? "Nothing needs your reply" : "Nothing here yet"}</b>
            <span>{needle ? "Try an item name, a wallet address or an order id." : filter === "all" ? "Buy something on the store to see it here within seconds." : "New refund requests show up here as customers file them."}</span>
          </div>
        )}
        {rows.map((o) => {
          const ls = linesOf(o.item), st = statusOf(o), first = ls[0], more = ls.length - 1
          const units = ls.reduce((n, l) => n + l.qty, 0), times = repeat[o.payer.toLowerCase()] ?? 1
          return (
            <button key={o.paymentId} className={`db-tr ${o.refund?.status === "open" ? "attn" : ""}`} role="row" onClick={() => setOpen(o)}>
              <span role="cell" className="db-item">
                <Thumb line={first} count={ls.length} />
                <span className="db-item-t">
                  <b title={ls.map((l) => `${l.name} ×${l.qty}`).join(", ")}>{first ? first.name : "Checkout payment"}{first && first.qty > 1 && <em> ×{first.qty}</em>}</b>
                  <small>{more > 0 ? <span className="db-more">+{more} more</span> : null}{units ? `${units} item${units === 1 ? "" : "s"}` : "No item details"}{o.orderId && <> · #{o.orderId.slice(2, 8)}</>}</small>
                </span>
              </span>
              <span role="cell" className="db-who">
                <Avatar addr={o.payer} />
                <span><code>{short(o.payer)}</code>{times > 1 && <small>{times} orders</small>}</span>
              </span>
              <span role="cell" className="db-when"><b>{ago(o.paidAt, now)}</b><small>{when(o.paidAt)}</small></span>
              <span role="cell" className="db-st"><Badge tone={st.tone} dot={st.tone === "warning"}>{st.label}</Badge></span>
              <span role="cell" className="db-amt r"><b>{usd(o.amount)}<small> USDT</small></b>{BigInt(o.refunded) > 0n && <small className="neg">−{usd(o.refunded)} refunded</small>}</span>
              <span className="db-chev" aria-hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg></span>
            </button>
          )
        })}
      </div>
      {data && rows.length > 0 && <p className="db-foot">Showing {rows.length} of {orders.length} orders · updates on its own every 20 seconds</p>}

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.orderId ? `Order #${open.orderId.slice(2, 8)}` : "Order"}>
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
  const lines = linesOf(o.item), st = statusOf(o)

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
      {lines.length > 0 && (
        <ul className="dd-items" aria-label="Items">
          {lines.map((l, i) => (
            <li key={i}><Thumb line={l} count={1} /><span><b>{l.name}</b>{l.p && <small>{l.p.brand} · {l.p.price} USDT each</small>}</span><em>×{l.qty}</em></li>
          ))}
        </ul>
      )}
      <dl className="dd-facts">
        <div><dt>Status</dt><dd><Badge tone={st.tone} dot={st.tone === "warning"}>{st.label}</Badge></dd></div>
        <div><dt>Amount</dt><dd>{usd(o.amount)} USDT</dd></div>
        <div><dt>Customer</dt><dd className="dd-who"><Avatar addr={o.payer} size={20} /><code title={o.payer}>{short(o.payer)}</code></dd></div>
        <div><dt>Paid</dt><dd>{when(o.paidAt)}</dd></div>
        {BigInt(o.refunded) > 0n && <div><dt>Refunded</dt><dd>{usd(o.refunded)} USDT</dd></div>}
        {o.orderId && <div><dt>Order id</dt><dd><code>{short(o.orderId)}</code></dd></div>}
      </dl>
      <a className="dd-chain" href={o.explorer} target="_blank" rel="noreferrer"><i aria-hidden />Settled on Whitechain Sepolia · view transaction ↗</a>

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
