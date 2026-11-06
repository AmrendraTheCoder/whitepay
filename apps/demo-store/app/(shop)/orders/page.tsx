"use client"
// The shopper's "My orders": orders paid from their wallet. No account needed: the wallet that paid is
// remembered in this browser after checkout, and anyone can look up a WondrPay name or address.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Icon, Spinner } from "@whitepay/ui"
import { BY_SKU, PRODUCTS, type Product } from "@/lib/catalog"
import { ProductImage } from "@/lib/packshot"
import { ORDERS_KEY, WALLETS_KEY, fmt, readLocal, useStore, type Line, type LocalOrder } from "../../store-context"

const WP = process.env.NEXT_PUBLIC_WHITEPAY_URL ?? "https://wondrpay.vercel.app"
type Remote = { paymentId: string; orderId: string | null; item: string | null; payer: string; amount: string; refunded: string; status: string; paidAt: number; txHash: string; explorer: string; refund: { status: string; decision?: string } | null }
type Row = { key: string; at: number; amount: bigint; refunded: bigint; txHash?: string; explorer?: string; orderId?: string; items: { p?: Product; label: string; qty: number; size?: string }[]; state: "processing" | "paid" | "refunded" | "partial" | "requested" }

// product names as written on orders, including names used before the store's redesign
const BY_NAME: Record<string, Product> = {
  ...Object.fromEntries(PRODUCTS.map((p) => [p.name.toLowerCase(), p])),
  "cutting chai stickers": BY_SKU["sticker-pack"], "chai & co. tote": BY_SKU["tote-bag"],
}
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const when = (t: number) => new Date(t).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })

/** "Masala Chai Kit ×2,Tote ×1" (the note the server puts on each order) → items */
function parseNote(note: string | null) {
  if (!note) return []
  return note.split(",").map((part) => {
    const m = part.trim().match(/^(.*?)\s*×(\d+)$/)
    const label = (m ? m[1] : part).trim()
    return { p: BY_NAME[label.toLowerCase()], label, qty: m ? Number(m[2]) : 1 }
  })
}
const fromLines = (lines: Line[]) => lines.map((l) => ({ p: BY_SKU[l.sku], label: BY_SKU[l.sku]?.name ?? l.sku, qty: l.qty, size: l.size }))

const STATE: Record<Row["state"], { label: string; tone: string; icon: "check" | "undo" | "receipt" | "activity" }> = {
  processing: { label: "Confirming on Whitechain", tone: "wait", icon: "activity" },
  paid: { label: "Confirmed", tone: "ok", icon: "check" },
  refunded: { label: "Refunded", tone: "muted", icon: "undo" },
  partial: { label: "Partly refunded", tone: "muted", icon: "undo" },
  requested: { label: "Refund requested", tone: "warn", icon: "receipt" },
}

export default function MyOrders() {
  const { add, openBag } = useStore()
  const [wallets, setWallets] = useState<string[]>([])
  const [local, setLocal] = useState<LocalOrder[]>([])
  const [who, setWho] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [data, setData] = useState<{ payer: string; name: string | null; orders: Remote[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const w = readLocal<string[]>(WALLETS_KEY, [])
    setWallets(w); setLocal(readLocal<LocalOrder[]>(ORDERS_KEY, []))
    if (w[0]) setWho(w[0])
    setReady(true)
  }, [])

  const load = useCallback(async (q: string) => {
    setBusy(true); setErr("")
    try {
      const r = await fetch(`/api/my-orders?who=${encodeURIComponent(q)}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setData(d)
      setWallets((ws) => {
        const next = [d.payer, ...ws.filter((a) => a.toLowerCase() !== d.payer.toLowerCase())].slice(0, 5)
        try { localStorage.setItem(WALLETS_KEY, JSON.stringify(next)) } catch {}
        return next
      })
    } catch (e) { setErr((e as Error).message); setData(null) } finally { setBusy(false) }
  }, [])
  useEffect(() => { if (who) void load(who) }, [who, load])

  const rows = useMemo<Row[]>(() => {
    const payer = data?.payer.toLowerCase()
    const mine = local.filter((o) => !payer || !o.payer || o.payer.toLowerCase() === payer)
    const byOrder = new Map(mine.map((o) => [o.orderId.toLowerCase(), o]))
    const out: Row[] = (data?.orders ?? []).map((o) => {
      const l = o.orderId ? byOrder.get(o.orderId.toLowerCase()) : undefined
      if (l) byOrder.delete(l.orderId.toLowerCase())
      const amount = BigInt(o.amount), refunded = BigInt(o.refunded)
      const state: Row["state"] = refunded >= amount && amount > 0n ? "refunded" : refunded > 0n ? "partial" : o.refund && o.refund.status !== "lapsed" && o.refund.status !== "resolved" ? "requested" : "paid"
      return { key: o.paymentId, at: o.paidAt * 1000, amount, refunded, txHash: o.txHash, explorer: o.explorer, orderId: o.orderId ?? undefined, items: l?.items.length ? fromLines(l.items) : parseNote(o.item), state }
    })
    // paid here but not indexed by WondrPay yet (or looked up under another wallet)
    for (const l of byOrder.values()) if (!data || l.payer?.toLowerCase() === payer || !l.payer)
      out.push({ key: l.orderId, at: l.at, amount: BigInt(l.amount), refunded: 0n, txHash: l.txHash, explorer: l.explorer, orderId: l.orderId, items: fromLines(l.items), state: data ? "processing" : "paid" })
    return out.sort((a, b) => b.at - a.at)
  }, [data, local])

  const buyAgain = (r: Row) => { r.items.forEach((i) => i.p && add(i.p.sku, i.size ?? (i.p.sizes.length === 1 ? i.p.sizes[0] : undefined), i.qty)); openBag() }
  const spent = rows.reduce((s, r) => s + r.amount - r.refunded, 0n)

  return (
    <div className="ks-wrap ks-orders">
      <nav aria-label="Breadcrumb" className="ks-crumbs"><Link href="/">Home</Link><span>/</span><b aria-current="page">My orders</b></nav>
      <div className="ks-orders-head">
        <div>
          <h1 className="ks-orders-title">Orders</h1>
          <p className="ks-muted">
            {data ? <>Paid from <b>{data.name ?? short(data.payer)}</b>{data.name && <> · {short(data.payer)}</>} · {rows.length} {rows.length === 1 ? "order" : "orders"} · {fmt(spent)} USDT spent</> : "Every order you paid with WondrPay at Kesar"}
          </p>
        </div>
        <form className="ks-orders-find" onSubmit={(e) => { e.preventDefault(); if (input.trim()) setWho(input.trim()) }}>
          <label htmlFor="who" className="sr-only">WondrPay name or wallet address</label>
          <input id="who" value={input} onChange={(e) => setInput(e.target.value)} placeholder="WondrPay name or wallet address" autoCapitalize="none" spellCheck={false} />
          <button type="submit" disabled={busy || !input.trim()}>{busy ? <Spinner label="Finding" /> : "Find orders"}</button>
        </form>
      </div>

      {wallets.length > 0 && (
        <div className="ks-wallets" role="group" aria-label="Your wallets">
          <span>Your wallets:</span>
          {wallets.map((a) => (
            <button key={a} type="button" className="ks-chip" aria-pressed={data?.payer.toLowerCase() === a.toLowerCase()} onClick={() => setWho(a)}>{short(a)}</button>
          ))}
        </div>
      )}

      {err && <p className="ks-orders-err" role="alert">{err}</p>}

      {!ready || (busy && !data) ? (
        <div className="ks-orders-loading"><Spinner label="Loading orders" /> Loading your orders…</div>
      ) : rows.length === 0 ? (
        <div className="ks-empty">
          <span className="ks-empty-ico" aria-hidden><Icon name="bag" size={28} /></span>
          <h2>{data ? "No orders from this wallet yet" : "No orders yet"}</h2>
          <p>{data ? "Orders you pay with this wallet show up here within a few seconds." : "After you pay with WondrPay we remember your wallet in this browser. Paid before, or on another device? Enter your WondrPay name above."}</p>
          <Link href="/shop" className="ks-btn">Start shopping</Link>
        </div>
      ) : (
        <ul className="ks-order-list">
          {rows.map((r) => {
            const st = STATE[r.state]
            return (
              <li key={r.key} className="ks-order">
                <div className="ks-order-status" data-tone={st.tone}>
                  <span className="ks-order-ico" aria-hidden><Icon name={st.icon} size={16} /></span>
                  <div><b>{st.label}</b><span>{r.state === "processing" ? "Paid just now" : `On ${when(r.at)}`}</span></div>
                  <span className="ks-order-total">{fmt(r.amount)} USDT{r.refunded > 0n && <small>−{fmt(r.refunded)} refunded</small>}</span>
                </div>
                <ul className="ks-order-items">
                  {(r.items.length ? r.items : [{ label: "Order", qty: 1 }]).map((i, n) => (
                    <li key={n}>
                      {"p" in i && i.p ? <Link href={`/p/${i.p.sku}`} className="ks-order-art"><ProductImage p={i.p} width={160} /></Link> : <span className="ks-order-art ks-order-art-blank"><Icon name="bag" size={20} /></span>}
                      <div>
                        {"p" in i && i.p ? <><b>{i.p.brand}</b><span>{i.p.name}</span></> : <b>{i.label}</b>}
                        <small>{"size" in i && i.size ? `Size: ${i.size} · ` : ""}Qty: {i.qty}</small>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="ks-order-foot">
                  <span className="ks-muted">Order #{(r.orderId ?? r.key).slice(2, 10).toUpperCase()}</span>
                  <div className="ks-order-actions">
                    {r.items.some((i) => "p" in i && i.p) && <button type="button" className="ks-obtn" onClick={() => buyAgain(r)}>Buy again</button>}
                    {r.explorer && <a className="ks-obtn" href={r.explorer} target="_blank" rel="noopener noreferrer">Receipt <Icon name="external" size={12} /></a>}
                    {r.txHash && r.state !== "processing" && r.state !== "refunded" && (
                      <a className="ks-obtn ks-obtn-main" href={`${WP}/order?tx=${r.txHash}`} target="_blank" rel="noopener noreferrer">{r.state === "requested" ? "Track refund" : "Return or refund"}</a>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="ks-orders-note"><Icon name="shield" size={14} /> Refunds go back on-chain to the wallet that paid, and never for more than you paid. You request them in WondrPay.</p>
    </div>
  )
}
