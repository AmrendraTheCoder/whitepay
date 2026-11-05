"use client"
import { useMemo, useState } from "react"
import { Icon, avatarColor, initial, prettyName, useWalletData, activityLabel, Toast, type Activity } from "../ui"
import { usdt } from "@/lib/format"

/** GPay "Transaction history": search, month header with total spent, rows. Data read from Arkiv receipts. */
export default function Transactions() {
  const { rows, toast } = useWalletData()
  const [q, setQ] = useState("")

  const months = useMemo(() => {
    const groups = new Map<string, { label: string; year: number; spent: bigint; items: Activity[] }>()
    for (const r of rows ?? []) {
      const label = prettyName(r.counterpartyName, r.counterparty)
      if (q && !label.toLowerCase().includes(q.toLowerCase()) && !r.counterparty.toLowerCase().includes(q.toLowerCase())) continue
      const d = new Date(r.at * 1000)
      const k = `${d.getFullYear()}-${d.getMonth()}`
      if (!groups.has(k)) groups.set(k, { label: d.toLocaleString("en-IN", { month: "long" }), year: d.getFullYear(), spent: 0n, items: [] })
      const g = groups.get(k)!
      g.items.push(r)
      if (r.direction === "out") g.spent += BigInt(r.amount)
    }
    return [...groups.values()]
  }, [rows, q])

  return (
    <main className="shell">
      <Toast text={toast} />
      <div className="searchbar">
        <div className="search" style={{ paddingLeft: 10 }}>
          <a href="/app" aria-label="Back" style={{ display: "grid", placeItems: "center", padding: 6, color: "var(--text)" }}>{Icon.back()}</a>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions"
            style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "var(--text)", font: "inherit", fontSize: 17 }} />
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-start", gap: 8 }}>
        <span className="badge badge-brand">WhitePay receipts (Arkiv)</span>
        <span className="badge badge-brand">All USDT transfers (Whitechain)</span>
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
      {rows?.length === 0 && <div className="empty">No transactions yet.</div>}
      {months.map((m) => (
        <section key={`${m.year}-${m.label}`}>
          <div className="month-head">
            <div><div className="y">{m.year}</div><div className="m">{m.label}</div></div>
            <div className="tot">{usdt(m.spent)} <span style={{ fontSize: 15, color: "var(--muted)" }}>USDT</span></div>
          </div>
          <div className="list">
            {m.items.map((r) => {
              const incoming = r.direction === "in"
              const label = prettyName(r.counterpartyName, r.counterparty)
              return (
                <a key={r.key} className="item" href={r.explorer} target="_blank" rel="noreferrer">
                  <span className="pic" style={{ background: avatarColor(r.counterpartyName ?? r.counterparty) }}>{initial(r.counterpartyName ?? r.counterparty.slice(2))}</span>
                  <div className="grow">
                    <div className="t">{incoming ? `From ${label}` : label}</div>
                    <div className="sub">{new Date(r.at * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "long" })} · {activityLabel(r)}{r.source === "chain" ? " · on-chain" : ""}</div>
                  </div>
                  <div className="amt" style={incoming ? { color: "var(--ok)" } : undefined}>{incoming ? "+" : "−"}{usdt(r.amount)}</div>
                </a>
              )
            })}
          </div>
        </section>
      ))}
    </main>
  )
}
