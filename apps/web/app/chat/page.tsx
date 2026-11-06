"use client"
// Payments between you and one person or shop, as a conversation: their payments to you on the left, yours on the
// right, grouped by day, newest at the bottom. Top bar: their ENS name + wallet address. Bottom: Pay.
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { getAddress, isAddress } from "viem"
import { getWallet } from "@/lib/wallet"
import { usdt } from "@/lib/format"
import { Icon, Identicon, LogoLoader, prettyName, type Activity } from "../ui"
import "./chat.css"

type Who = { address: string; name?: string; displayName?: string; kind?: string }

export default function ChatPage() {
  return <Suspense fallback={<main className="shell"><LogoLoader /></main>}><Chat /></Suspense>
}

const dayLabel = (t: number) => {
  const d = new Date(t * 1000), now = new Date()
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000)
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase()
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  if (days < 7) return `${d.toLocaleDateString("en-IN", { weekday: "long" })}, ${time}`
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) })}, ${time}`
}
const shortDate = (t: number) => new Date(t * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })

function Chat() {
  const q = useSearchParams()
  const raw = q.get("with") ?? ""
  const other = isAddress(raw) ? getAddress(raw) : null
  const [me, setMe] = useState<string | null | undefined>(undefined)
  const [who, setWho] = useState<Who | null>(other ? { address: other, name: q.get("name") ?? undefined } : null)
  const [rows, setRows] = useState<Activity[] | null>(null)
  const [cards, setCards] = useState<Map<string, { status: string }>>(new Map()) // payment tx -> scratch card
  const [err, setErr] = useState("")
  const [copied, setCopied] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => setMe(getWallet()?.address ?? null), [])
  useEffect(() => {
    if (!other) return
    fetch(`/api/resolve?q=${other}`).then((r) => r.json()).then((d) => d?.address && setWho((w) => ({ ...w, ...d, address: other }))).catch(() => {})
  }, [other])
  useEffect(() => {
    if (!me || !other) return
    let live = true
    fetch(`/api/activity?address=${me}`).then((r) => r.json())
      .then((d) => { if (live) setRows((d.rows ?? []) as Activity[]) })
      .catch(() => { if (live) { setErr("Couldn't load your payments. Check your connection."); setRows([]) } })
    // scratch cards earned by paying this shop, shown right after the payment that earned them
    fetch(`/api/rewards?owner=${me}`).then((r) => r.json()).then((d) => {
      if (!live) return
      const m = new Map<string, { status: string }>()
      for (const c of d.cards ?? []) if (c.paymentTx && c.merchant?.toLowerCase() === other.toLowerCase()) m.set(String(c.paymentTx).toLowerCase(), { status: c.status })
      setCards(m)
    }).catch(() => {})
    return () => { live = false }
  }, [me, other])

  const thread = useMemo(() => {
    if (!rows || !other) return null
    const mine = rows.filter((r) => r.counterparty.toLowerCase() === other.toLowerCase()).sort((a, b) => a.at - b.at)
    // a new day-and-time divider whenever 6 h or more passed since the previous payment
    const out: ({ type: "day"; label: string; key: string } | { type: "pay"; r: Activity } | { type: "card"; key: string; fresh: boolean })[] = []
    let last = 0
    for (const r of mine) {
      if (r.at - last >= 6 * 3600) out.push({ type: "day", label: dayLabel(r.at), key: `d${r.at}` })
      out.push({ type: "pay", r }); last = r.at
      const card = r.direction === "out" ? cards.get(r.txHash.toLowerCase()) : undefined
      if (card) out.push({ type: "card", key: `c${r.key}`, fresh: card.status === "new" })
    }
    return out
  }, [rows, other, cards])
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }) }, [thread?.length])

  if (!other) return <main className="shell"><div className="card">This person couldn't be found. <a href="/app">Go home</a></div></main>
  if (me === undefined) return <main className="shell"><LogoLoader /></main>
  if (me === null) return <main className="shell"><div className="card stack"><h2>Set up WondrPay first</h2><a className="btn btn-primary" href="/app">Create wallet</a></div></main>

  const name = who?.displayName ?? prettyName(who?.name, other)
  const ens = who?.name
  // people by first name (like "Payment to Amrendra"); shops by their full name
  const firstName = who?.kind === "merchant" ? name : (who?.displayName ?? prettyName(who?.name, other)).split(" ")[0]
  const payHref = `/send?to=${other}${ens ? `&name=${encodeURIComponent(ens)}` : ""}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(other); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch {}
  }

  return (
    <main className="chat">
      <header className="chat-top">
        <a className="chat-back" href="/app" aria-label="Back">{Icon.back()}</a>
        <Identicon seed={other} name={ens} size={46} />
        <div className="chat-who">
          <b>{ens ?? name}</b>
          <button className="chat-addr" onClick={copy} aria-label={`Copy wallet address ${other}`}>
            <span className="mono">{other.slice(0, 8)}…{other.slice(-6)}</span>
            <span aria-hidden>{copied ? Icon.check(14) : "⧉"}</span>
          </button>
          <span className="sr-only" aria-live="polite">{copied ? "Address copied" : ""}</span>
        </div>
      </header>

      <section className="chat-body" aria-label={`Payments with ${name}`}>
        {thread === null && <div className="chat-loading"><span className="skel" style={{ width: 220, height: 120, borderRadius: 26 }} /><span className="skel" style={{ width: 220, height: 120, borderRadius: 26, alignSelf: "flex-end" }} /></div>}
        {err && <div className="notice" role="alert">{err}</div>}
        {thread?.length === 0 && !err && (
          <div className="chat-empty">
            <Identicon seed={other} name={ens} size={72} />
            <b>No payments with {name} yet</b>
            <span>Payments between you two will show up here.</span>
          </div>
        )}
        {thread?.map((x) => x.type === "day"
          ? <div key={x.key} className="chat-day" role="separator"><span>{x.label}</span></div>
          : x.type === "card"
            ? (
              <a key={x.key} className="chat-bubble out chat-card" href="/rewards">
                <span className="chat-b-title">{x.fresh ? "You earned a scratch card!" : "Scratch card"}</span>
                <span className="chat-card-art" aria-hidden><span /></span>
                <span className="chat-b-foot">{x.fresh ? "Tap to view" : "Scratched · see rewards"}<span className="chat-chev" aria-hidden>{Icon.chev(18)}</span></span>
              </a>
            )
            : <Bubble key={x.r.key} r={x.r} firstName={firstName} />)}
        <div ref={end} />
      </section>

      <footer className="chat-foot">
        <a className="chat-pay" href={payHref}>Pay</a>
      </footer>
    </main>
  )
}

function Bubble({ r, firstName }: { r: Activity; firstName: string }) {
  const incoming = r.direction === "in"
  const title = r.kind === "refund" ? (incoming ? "Refund to you" : `Refund to ${firstName}`)
    : r.kind === "autopay" ? (incoming ? "Autopay to you" : `Autopay to ${firstName}`)
    : incoming ? "Payment to you" : `Payment to ${firstName}`
  const href = !incoming && r.kind === "p2m" ? `/order?tx=${r.txHash}` : `/tx?h=${r.txHash}`
  return (
    <a className={`chat-bubble ${incoming ? "in" : "out"}`} href={href}>
      <span className="chat-b-title">{title}</span>
      <span className="chat-b-amt">{usdt(r.amount)}<small>USDT</small></span>
      <span className="chat-b-foot">
        <span className="chat-ok" aria-hidden>{Icon.check(13)}</span>
        Paid · {shortDate(r.at)}
        <span className="chat-chev" aria-hidden>{Icon.chev(18)}</span>
      </span>
    </a>
  )
}
