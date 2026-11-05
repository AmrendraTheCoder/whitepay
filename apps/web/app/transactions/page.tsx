"use client"
import { useMemo, useState } from "react"
import { Icon, avatarColor, initial, prettyName, useWalletData, type Activity } from "../ui"
import { usdt } from "@/lib/format"

/** GPay "Transaction history": search, month header with total spent, rows. Data read from Arkiv receipts. */
export default function Transactions() {
  const { wallet, rows } = useWalletData()
  const [q, setQ] = useState("")
  const me = wallet?.address.toLowerCase() ?? ""

  const months = useMemo(() => {
    const groups = new Map<string, { label: string; year: number; spent: bigint; items: Activity[] }>()
    for (const r of rows ?? []) {
      const incoming = r.merchant.toLowerCase() === me
      const other = incoming ? r.payer : r.merchant
      const label = prettyName(incoming ? undefined : r.merchantName, other)
      if (q && !label.toLowerCase().includes(q.toLowerCase()) && !(r.merchantName ?? "").includes(q.toLowerCase())) continue
      const d = new Date(r.paidAt * 1000)
      const k = `${d.getFullYear()}-${d.getMonth()}`
      if (!groups.has(k)) groups.set(k, { label: d.toLocaleString("en-IN", { month: "long" }), year: d.getFullYear(), spent: 0n, items: [] })
      const g = groups.get(k)!
      g.items.push(r)
      if (!incoming) g.spent += BigInt(r.amount)
    }
    return [...groups.values()]
  }, [rows, me, q])

  return (
    <main className="shell">
      <div className="searchbar">
        <div className="search" style={{ paddingLeft: 10 }}>
          <a href="/" aria-label="Back" style={{ display: "grid", placeItems: "center", padding: 6, color: "var(--text)" }}>{Icon.back()}</a>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions"
            style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "var(--text)", font: "inherit", fontSize: 17 }} />
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-start", gap: 8 }}>
        <span className="badge badge-brand">Receipts on Arkiv</span>
        <span className="badge badge-brand">Settled on Whitechain</span>
      </div>

      {rows === null && <div className="empty">Loading from Arkiv…</div>}
      {rows?.length === 0 && <div className="empty">No transactions yet.</div>}
      {months.map((m) => (
        <section key={`${m.year}-${m.label}`}>
          <div className="month-head">
            <div><div className="y">{m.year}</div><div className="m">{m.label}</div></div>
            <div className="tot">{usdt(m.spent)} <span style={{ fontSize: 15, color: "var(--muted)" }}>USDT</span></div>
          </div>
          <div className="list">
            {m.items.map((r) => {
              const incoming = r.merchant.toLowerCase() === me
              const other = incoming ? r.payer : r.merchant
              const name = incoming ? undefined : r.merchantName
              return (
                <a key={r.key} className="item" href={r.explorer} target="_blank" rel="noreferrer">
                  <span className="pic" style={{ background: avatarColor(name ?? other) }}>{initial(name ?? other.slice(2))}</span>
                  <div className="grow">
                    <div className="t">{incoming ? `From ${prettyName(undefined, other)}` : prettyName(name, other)}</div>
                    <div className="sub">{new Date(r.paidAt * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "long" })} · {r.kind === "p2p" ? "Person" : "Shop QR"}</div>
                  </div>
                  <div className="amt" style={incoming ? { color: "var(--ok)" } : undefined}>{incoming ? "+" : ""}{usdt(r.amount)}</div>
                </a>
              )
            })}
          </div>
        </section>
      ))}
    </main>
  )
}
