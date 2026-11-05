"use client"
import { useMemo, useState } from "react"
import { Icon, Identicon, prettyName, useWalletData, activityLabel, Toast, type Activity } from "../ui"
import { usdt } from "@/lib/format"

type Filter = "all" | "out" | "in" | "shops" | "people" | "autopay" | "refunds"
const FILTERS: { id: Filter; label: string; test: (r: Activity) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "out", label: "Sent", test: (r) => r.direction === "out" },
  { id: "in", label: "Received", test: (r) => r.direction === "in" },
  { id: "shops", label: "Shops", test: (r) => r.kind === "p2m" },
  { id: "people", label: "People", test: (r) => r.kind === "p2p" || r.kind === "transfer" },
  { id: "autopay", label: "Subscriptions", test: (r) => r.kind === "autopay" },
  { id: "refunds", label: "Refunds", test: (r) => r.kind === "refund" },
]
const PERIODS = [
  { id: "30", label: "Last 30 days", secs: 30 * 86400 },
  { id: "90", label: "Last 3 months", secs: 90 * 86400 },
  { id: "all", label: "All time", secs: Infinity },
] as const

/** Transaction history: search, filter chips, period, month groups with sent / received / net. */
export default function Transactions() {
  const { rows, toast } = useWalletData()
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("all")

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, (rows ?? []).filter(f.test).length])) as Record<Filter, number>, [rows])

  const months = useMemo(() => {
    const since = Date.now() / 1000 - PERIODS.find((p) => p.id === period)!.secs
    const test = FILTERS.find((f) => f.id === filter)!.test
    const needle = q.trim().toLowerCase()
    const groups = new Map<string, { label: string; year: number; out: bigint; inn: bigint; items: Activity[] }>()
    for (const r of rows ?? []) {
      if (r.at < since || !test(r)) continue
      const label = prettyName(r.counterpartyName, r.counterparty)
      if (needle && !label.toLowerCase().includes(needle) && !r.counterparty.toLowerCase().includes(needle) && !usdt(r.amount).includes(needle)) continue
      const d = new Date(r.at * 1000)
      const k = `${d.getFullYear()}-${d.getMonth()}`
      if (!groups.has(k)) groups.set(k, { label: d.toLocaleString("en-IN", { month: "long" }), year: d.getFullYear(), out: 0n, inn: 0n, items: [] })
      const g = groups.get(k)!
      g.items.push(r)
      if (r.direction === "out") g.out += BigInt(r.amount); else g.inn += BigInt(r.amount)
    }
    return [...groups.values()]
  }, [rows, q, filter, period])

  return (
    <main className="shell">
      <Toast text={toast} />
      <div className="searchbar sticky-top">
        <div className="search" style={{ paddingLeft: 10 }}>
          <a href="/app" aria-label="Back" style={{ display: "grid", placeItems: "center", padding: 6, color: "var(--text)" }}>{Icon.back()}</a>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, address or amount" inputMode="search"
            style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "var(--text)", font: "inherit", fontSize: 17 }} />
          {q && <button className="chip" onClick={() => setQ("")} aria-label="Clear search">✕</button>}
        </div>
      </div>

      <div className="filter-row" role="tablist" aria-label="Filter transactions">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={`fchip ${filter === f.id ? "on" : ""}`} onClick={() => setFilter(f.id)} disabled={f.id !== "all" && !counts[f.id]}>
            {f.label}{rows && f.id !== "all" ? <span className="n">{counts[f.id]}</span> : null}
          </button>
        ))}
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <select className="period" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} aria-label="Period">
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <span className="sub">Receipts from Arkiv + every USDT transfer on Whitechain</span>
      </div>

      {rows === null && (
        <div className="list">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="item">
              <span className="pic skel circle" />
              <div className="grow"><span className="skel" style={{ width: "60%", height: 16 }} /><br /><span className="skel" style={{ width: "35%", height: 12, marginTop: 8 }} /></div>
              <span className="skel" style={{ width: 54, height: 16 }} />
            </div>
          ))}
        </div>
      )}
      {rows && months.length === 0 && <div className="empty">{rows.length ? "Nothing matches these filters." : "No transactions yet."}</div>}
      {months.map((m) => {
        const net = m.inn - m.out
        return (
          <section key={`${m.year}-${m.label}`}>
            <div className="month-head month-head-2">
              <div><div className="y">{m.year}</div><div className="m">{m.label}</div></div>
              <div className="tots">
                <span className="neg">−{usdt(m.out)}</span>
                <span className="pos">+{usdt(m.inn)}</span>
                <span className={`net ${net < 0n ? "neg" : "pos"}`}>net {net < 0n ? "−" : "+"}{usdt(net < 0n ? -net : net)} USDT</span>
              </div>
            </div>
            <div className="list">
              {m.items.map((r) => {
                const incoming = r.direction === "in"
                const label = prettyName(r.counterpartyName, r.counterparty)
                return (
                  <a key={r.key} className="item tx-row" href={r.explorer} target="_blank" rel="noreferrer">
                    <span className="tx-av">
                      <Identicon seed={r.counterparty} name={r.counterpartyName} size={46} />
                      <span className={`dir ${incoming ? "in" : "out"}`} aria-hidden>{incoming ? "↓" : "↑"}</span>
                    </span>
                    <div className="grow">
                      <div className="t">{incoming ? `From ${label}` : `To ${label}`}</div>
                      <div className="sub">{new Date(r.at * 1000).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {activityLabel(r)}{r.source === "chain" ? " · on-chain" : ""}</div>
                    </div>
                    <div className={`amt ${incoming ? "pos" : "neg"}`}>{incoming ? "+" : "−"}{usdt(r.amount)}</div>
                  </a>
                )
              })}
            </div>
          </section>
        )
      })}
    </main>
  )
}
