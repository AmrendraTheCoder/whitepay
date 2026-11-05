"use client"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import "./transactions.css"
import { Icon, Identicon, prettyName, useWalletData, activityLabel, Toast, type Activity } from "../ui"
import { usdt } from "@/lib/format"

type Dir = "all" | "out" | "in"
type Cat = "shops" | "people" | "autopay" | "refunds"
const DIRS: { id: Dir; label: string; test: (r: Activity) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "out", label: "Sent", test: (r) => r.direction === "out" },
  { id: "in", label: "Received", test: (r) => r.direction === "in" },
]
const CATS: { id: Cat; label: string; color: string; test: (r: Activity) => boolean }[] = [
  { id: "shops", label: "Shops", color: "#3DE0FF", test: (r) => r.kind === "p2m" },
  { id: "people", label: "People", color: "#DDF05A", test: (r) => r.kind === "p2p" || r.kind === "transfer" },
  { id: "autopay", label: "Subscriptions", color: "#FF5CC8", test: (r) => r.kind === "autopay" },
  { id: "refunds", label: "Refunds", color: "#FFA53D", test: (r) => r.kind === "refund" },
]
const PERIODS = [
  { id: "7", label: "Last 7 days", secs: 7 * 86400 },
  { id: "30", label: "Last 30 days", secs: 30 * 86400 },
  { id: "90", label: "Last 3 months", secs: 90 * 86400 },
  { id: "year", label: "This year", secs: -1 },
  { id: "all", label: "All time", secs: Infinity },
] as const
type PeriodId = (typeof PERIODS)[number]["id"]
const sinceOf = (id: PeriodId) => {
  const p = PERIODS.find((x) => x.id === id)!
  if (p.secs === -1) return new Date(new Date().getFullYear(), 0, 1).getTime() / 1000
  return Date.now() / 1000 - p.secs
}

/** Period picker: a real dropdown (listbox popover) instead of the native select. */
function PeriodPicker({ value, onChange, counts }: { value: PeriodId; onChange: (v: PeriodId) => void; counts: Record<PeriodId, number> }) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLUListElement>(null)
  // the menu lives in a portal on <body> (no clipping by scroll rows or transformed parents), anchored to the button
  useLayoutEffect(() => {
    if (!open) return
    const place = () => { const r = box.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 8, left: Math.min(r.left, window.innerWidth - 246) }) }
    place()
    window.addEventListener("scroll", place, true); window.addEventListener("resize", place)
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place) }
  }, [open])
  useEffect(() => {
    if (!open) return
    setHi(PERIODS.findIndex((p) => p.id === value))
    const out = (e: PointerEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !menu.current?.contains(t)) setOpen(false) }
    document.addEventListener("pointerdown", out)
    return () => document.removeEventListener("pointerdown", out)
  }, [open, value])
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false)
    else if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setHi((h) => (h + 1) % PERIODS.length) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + PERIODS.length) % PERIODS.length) }
    else if ((e.key === "Enter" || e.key === " ") && open) { e.preventDefault(); onChange(PERIODS[hi].id); setOpen(false) }
  }
  const cur = PERIODS.find((p) => p.id === value)!
  return (
    <div className="pp-wrap" ref={box} onKeyDown={key}>
      <button className={`pp-btn ${open ? "open" : ""} ${value !== "all" ? "set" : ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        <span>{cur.label}</span>
        <svg className="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && pos && createPortal(
        <ul ref={menu} className="pp-menu" role="listbox" aria-label="Time period" style={{ top: pos.top, left: pos.left }} onKeyDown={key}>
          {PERIODS.map((p, i) => (
            <li key={p.id} role="option" aria-selected={p.id === value} className={`${i === hi ? "hi" : ""} ${p.id === value ? "sel" : ""}`}
              onMouseEnter={() => setHi(i)} onClick={() => { onChange(p.id); setOpen(false) }}>
              <span className="ck">{p.id === value ? "✓" : ""}</span>
              <span className="l">{p.label}</span>
              <span className="c">{counts[p.id]}</span>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  )
}

/** Transaction history: search, direction + type filters, period, month groups with sent / received / net. */
export default function Transactions() {
  const { rows, toast } = useWalletData()
  const [q, setQ] = useState("")
  const [dir, setDir] = useState<Dir>("all")
  const [cat, setCat] = useState<Cat | null>(null)
  const [period, setPeriod] = useState<PeriodId>("all")

  const all = rows ?? []
  const inPeriod = useMemo(() => { const since = sinceOf(period); return all.filter((r) => r.at >= since) }, [rows, period]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirTest = DIRS.find((d) => d.id === dir)!.test
  // counts follow the other filters, so every number shown is what you'd get by tapping it
  const dirCounts = useMemo(() => Object.fromEntries(DIRS.map((d) => [d.id, inPeriod.filter((r) => d.test(r) && (!cat || CATS.find((c) => c.id === cat)!.test(r))).length])) as Record<Dir, number>, [inPeriod, cat])
  const catCounts = useMemo(() => Object.fromEntries(CATS.map((c) => [c.id, inPeriod.filter((r) => dirTest(r) && c.test(r)).length])) as Record<Cat, number>, [inPeriod, dir]) // eslint-disable-line react-hooks/exhaustive-deps
  const periodCounts = useMemo(() => Object.fromEntries(PERIODS.map((p) => { const since = sinceOf(p.id); return [p.id, all.filter((r) => r.at >= since && dirTest(r) && (!cat || CATS.find((c) => c.id === cat)!.test(r))).length] })) as Record<PeriodId, number>, [rows, dir, cat]) // eslint-disable-line react-hooks/exhaustive-deps
  const visibleCats = CATS.filter((c) => catCounts[c.id] > 0 || c.id === cat)

  const months = useMemo(() => {
    const catTest = cat ? CATS.find((c) => c.id === cat)!.test : () => true
    const needle = q.trim().toLowerCase()
    const groups = new Map<string, { label: string; year: number; out: bigint; inn: bigint; items: Activity[] }>()
    for (const r of inPeriod) {
      if (!dirTest(r) || !catTest(r)) continue
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
  }, [inPeriod, q, dir, cat]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = months.reduce((n, m) => n + m.items.length, 0)
  const filtered = dir !== "all" || cat !== null || period !== "all" || q.trim() !== ""

  return (
    <main className="shell">
      <Toast text={toast} />
      <div className="searchbar sticky-top">
        <div className="search" style={{ paddingLeft: 10 }}>
          <a href="/app" aria-label="Back" style={{ display: "grid", placeItems: "center", padding: 6, color: "var(--text)" }}>{Icon.back()}</a>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, address or amount" inputMode="search"
            style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "var(--text)", font: "inherit", fontSize: 17 }} />
          {q && <button className="chip" onClick={() => setQ("")} aria-label="Clear search">{Icon.close(14)}</button>}
        </div>
      </div>

      <div className="tx-filters">
        <div className="tx-seg" role="tablist" aria-label="Direction" style={{ ["--i" as string]: DIRS.findIndex((d) => d.id === dir) }}>
          <span className="thumb" aria-hidden />
          {DIRS.map((d) => (
            <button key={d.id} role="tab" aria-selected={dir === d.id} className={dir === d.id ? "on" : ""} onClick={() => setDir(d.id)}>
              {d.label}{rows ? <span className="n">{dirCounts[d.id]}</span> : null}
            </button>
          ))}
        </div>
        <div className="tx-row2">
          <PeriodPicker value={period} onChange={setPeriod} counts={periodCounts} />
          <div className="cat-pills" role="group" aria-label="Type">
            {visibleCats.map((c) => (
              <button key={c.id} aria-pressed={cat === c.id} className={`cat ${cat === c.id ? "on" : ""}`} style={{ ["--c" as string]: c.color }} onClick={() => setCat((x) => (x === c.id ? null : c.id))}>
                <i aria-hidden />{c.label}<span className="n">{catCounts[c.id]}</span>
              </button>
            ))}
          </div>
        </div>
        {rows && (
          <div className="tx-summary" aria-live="polite">
            <span>{shown} {shown === 1 ? "transaction" : "transactions"}{filtered ? (shown === 1 ? " matches" : " match") : ""}</span>
            {filtered && <button onClick={() => { setDir("all"); setCat(null); setPeriod("all"); setQ("") }}>Clear filters</button>}
          </div>
        )}
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
      {rows && rows.length > 0 && <div className="tx-source">Receipts from Arkiv + every USDT transfer on Whitechain</div>}
    </main>
  )
}
