"use client"
// Store-wide state shared by every page: bag, wishlist, WondrPay checkout events, order confirmation,
// and the Developer view log. Lives in the root layout so it survives client-side navigation.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Button, ButtonLink, Dialog, Drawer, Icon, QuantityStepper, Spinner, useToast } from "@whitepay/ui"
import { WHITEPAY_URL, SDK_SRC } from "@/lib/sdk"
import { BY_SKU, PRICE, MAX_QTY } from "@/lib/catalog"
import { ProductImage } from "@/lib/packshot"
import { DevPanel, gh, type Log } from "./dev-panel"

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "wondrpay-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { "order-endpoint"?: string; payload?: string; label?: string; mode?: "subscribe"; "data-items"?: string }
    }
  }
}

export type Line = { sku: string; qty: number; size?: string }
type Paid = { orderId: string; txHash?: string; explorer?: string; amount: string; entityKey: string }
type Sub = { mandateKey: string; subscriber?: string; amount: string; cycles: number }

export const units = (usdt: string) => BigInt(Math.round(Number(usdt) * 1e6))
export const fmt = (b: bigint) => `${b / 1_000_000n}.${(b % 1_000_000n).toString().padStart(6, "0").slice(0, 2)}`
const CART_KEY = "kesar.cart.v1"
const WISH_KEY = "kesar.wish.v1"
export const ORDERS_KEY = "kesar.orders.v1"
export const WALLETS_KEY = "kesar.wallets.v1"
/** An order paid in this browser, kept locally so "My orders" shows it at once (with sizes) before WondrPay indexes it. */
export type LocalOrder = { orderId: string; txHash?: string; explorer?: string; amount: string; items: Line[]; at: number; payer?: string }
export const readLocal = <T,>(k: string, fallback: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? "null"); return v ?? fallback } catch { return fallback } }
const saveOrder = (o: LocalOrder) => {
  try {
    const all = readLocal<LocalOrder[]>(ORDERS_KEY, []).filter((x) => x.orderId !== o.orderId)
    localStorage.setItem(ORDERS_KEY, JSON.stringify([o, ...all].slice(0, 50)))
    if (o.payer) {
      const w = readLocal<string[]>(WALLETS_KEY, []).filter((a) => a.toLowerCase() !== o.payer!.toLowerCase())
      localStorage.setItem(WALLETS_KEY, JSON.stringify([o.payer, ...w].slice(0, 5)))
    }
  } catch {}
}
const lineKey = (l: Pick<Line, "sku" | "size">) => `${l.sku}|${l.size ?? ""}`
/** What the server sees: sku + qty only (it prices from its own catalog). Same sku in two sizes is merged. */
export const orderItems = (lines: Line[]) => Object.values(lines.reduce<Record<string, { sku: string; qty: number }>>((m, l) => {
  m[l.sku] = { sku: l.sku, qty: Math.min(MAX_QTY, (m[l.sku]?.qty ?? 0) + l.qty) }
  return m
}, {}))

type Ctx = {
  cart: Line[]; count: number; total: bigint
  add: (sku: string, size?: string, qty?: number) => void
  setQty: (l: Line, q: number) => void
  openBag: () => void
  wish: string[]; toggleWish: (sku: string) => void
  sdkReady: boolean; inspect: boolean; sub: Sub | null
}
const StoreCtx = createContext<Ctx | null>(null)
export const useStore = () => {
  const c = useContext(StoreCtx)
  if (!c) throw new Error("useStore outside StoreProvider")
  return c
}

/** Integration marker shown in Developer view's "highlight" mode. */
export function Marker({ n, title }: { n: string; title: string }) {
  const { inspect } = useStore()
  if (!inspect) return null
  return <a className="marker" href={gh(n)} target="_blank" rel="noopener noreferrer" title={title} aria-label={`Integration point ${n}: ${title} (view source)`}>{n === "②" ? "2" : n}</a>
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast()
  const [cart, setCart] = useState<Line[]>([])
  const [wish, setWish] = useState<string[]>([])
  const [bagOpen, setBagOpen] = useState(false)
  const [paid, setPaid] = useState<{ p: Paid; items: Line[] } | null>(null)
  const [verified, setVerified] = useState<"checking" | "ok" | "bad">("checking")
  const [sub, setSub] = useState<Sub | null>(null)
  const [devOpen, setDevOpen] = useState(false)
  const [inspect, setInspect] = useState(false)
  const [logs, setLogs] = useState<Log[]>([])
  const [sdkReady, setSdkReady] = useState(false)
  const pending = useRef<Line[]>([])
  const seen = useRef(new Set<string>())
  const loaded = useRef(false)
  const push = useCallback((l: Omit<Log, "at">) => setLogs((x) => [{ ...l, at: Date.now() }, ...x].slice(0, 60)), [])

  // bag + wishlist persistence (this browser only); unknown SKUs from an old catalog are dropped
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]")
      if (Array.isArray(c)) setCart(c.filter((l) => BY_SKU[l?.sku] && Number.isInteger(l.qty) && l.qty > 0))
      const w = JSON.parse(localStorage.getItem(WISH_KEY) ?? "[]")
      if (Array.isArray(w)) setWish(w.filter((s) => typeof s === "string" && BY_SKU[s]))
    } catch {}
    loaded.current = true
  }, [])
  useEffect(() => { if (loaded.current) try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch {} }, [cart])
  useEffect(() => { if (loaded.current) try { localStorage.setItem(WISH_KEY, JSON.stringify(wish)) } catch {} }, [wish])

  const count = cart.reduce((n, l) => n + l.qty, 0)
  const total = useMemo(() => cart.reduce((s, l) => s + units(PRICE[l.sku]) * BigInt(l.qty), 0n), [cart])
  const setQty = useCallback((l: Line, q: number) => setCart((c) => {
    const k = lineKey(l)
    if (q <= 0) return c.filter((x) => lineKey(x) !== k)
    const next = Math.min(MAX_QTY, q)
    return c.some((x) => lineKey(x) === k) ? c.map((x) => (lineKey(x) === k ? { ...x, qty: next } : x)) : [...c, { sku: l.sku, size: l.size, qty: next }]
  }), [])
  const add = useCallback((sku: string, size?: string, qty = 1) => {
    setCart((c) => {
      const k = lineKey({ sku, size })
      const cur = c.find((x) => lineKey(x) === k)
      return cur ? c.map((x) => (x === cur ? { ...x, qty: Math.min(MAX_QTY, x.qty + qty) } : x)) : [...c, { sku, size, qty }]
    })
    toast.show({ message: `${BY_SKU[sku].brand} ${BY_SKU[sku].name} added to bag`, tone: "success", action: { label: "View bag", onClick: () => setBagOpen(true) } })
  }, [toast])
  const toggleWish = useCallback((sku: string) => setWish((w) => {
    const has = w.includes(sku)
    toast.show({ message: has ? "Removed from wishlist" : "Saved to wishlist", tone: has ? undefined : "success" })
    return has ? w.filter((s) => s !== sku) : [sku, ...w]
  }), [toast])

  // WondrPay checkout events (integration point 2)
  useEffect(() => {
    customElements.whenDefined("wondrpay-button").then(() => {
      setSdkReady(true)
      push({ src: "sdk", msg: `SDK v${(window as { WondrPay?: { version: string } }).WondrPay?.version ?? "?"} loaded from ${new URL(SDK_SRC).host}, integrity verified`, tone: "ok" })
    })
    const on = (name: string, f: (detail: any, e: Event) => void) => { const h = (e: Event) => f((e as CustomEvent).detail, e); document.addEventListener(name, h); return () => document.removeEventListener(name, h) }
    const offs = [
      on("wondrpay:created", (d, e) => {
        if (d.entityKey) {
          try { pending.current = JSON.parse((e.target as HTMLElement).dataset.items ?? "[]") } catch { pending.current = [] }
          push({ src: "sdk", msg: `Order created · request ${d.entityKey.slice(0, 10)}… · QR valid until ${new Date(d.deadline * 1000).toLocaleTimeString()}` })
        } else push({ src: "sdk", msg: `Subscription offer ${d.planKey?.slice(0, 10)}… signed by the store` })
      }),
      on("wondrpay:paid", (d: Paid) => { push({ src: "sdk", msg: `Paid ${Number(d.amount) / 1e6} USDT · tx ${d.txHash?.slice(0, 10)}…`, tone: "ok" }); setBagOpen(false); setPaid({ p: d, items: pending.current }) }),
      on("wondrpay:subscribed", (d: Sub) => { push({ src: "sdk", msg: `Subscribed · mandate ${d.mandateKey.slice(0, 10)}… · first ${Number(d.amount) / 1e6} USDT paid`, tone: "ok" }); setSub(d); toast.show({ message: "Welcome to Kesar Glow Box", tone: "success" }) }),
      on("wondrpay:expired", () => push({ src: "sdk", msg: "Payment window expired · request removed from Arkiv", tone: "bad" })),
      on("wondrpay:error", (d) => push({ src: "sdk", msg: `Error · ${d.message}`, tone: "bad" })),
    ]
    return () => offs.forEach((f) => f())
  }, [push, toast])

  // After payment: our server re-checks the chain and reports what its webhook handler did.
  useEffect(() => {
    if (!paid?.p.txHash) return
    const { p, items } = paid
    setVerified("checking")
    if (items.length) setCart((c) => c.filter((l) => !items.some((i) => i.sku === l.sku)))
    const local: LocalOrder = { orderId: p.orderId, txHash: p.txHash, explorer: p.explorer, amount: p.amount, items, at: Date.now() }
    saveOrder(local)
    fetch(`/api/verify?tx=${p.txHash}&orderId=${p.orderId}`).then((r) => r.json()).then((v) => {
      setVerified(v.ok ? "ok" : "bad")
      if (v.ok && v.payer) saveOrder({ ...local, payer: v.payer }) // remember which wallet paid: "My orders" lists its orders
      push({ src: "chain", msg: v.ok ? `PaymentSettled confirmed in block ${v.block}` : `On-chain check: ${v.reason}`, tone: v.ok ? "ok" : "bad" })
    }).catch(() => setVerified("bad"))
    return poll(`orderId=${p.orderId}`, 12, 1500)
  }, [paid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sub) return
    return poll(`mandateKey=${sub.mandateKey}`, 110, 5000, () => fetch(`${WHITEPAY_URL}/api/autopay/tick`, { mode: "no-cors", credentials: "omit" }).catch(() => {}))
  }, [sub]) // eslint-disable-line react-hooks/exhaustive-deps

  function poll(query: string, times: number, every: number, each?: () => void) {
    let n = 0
    const t = setInterval(async () => {
      each?.()
      const d = await fetch(`/api/order-status?${query}`).then((r) => r.json()).catch(() => null)
      for (const e of d?.events ?? []) {
        const k = `${e.at}${e.msg}`
        if (seen.current.has(k)) continue
        seen.current.add(k)
        push({ src: "server", msg: e.msg, tone: e.msg.includes("✓") ? "ok" : undefined })
      }
      if (++n >= times) clearInterval(t)
    }, every)
    return () => clearInterval(t)
  }

  const ctx: Ctx = { cart, count, total, add, setQty, openBag: () => setBagOpen(true), wish, toggleWish, sdkReady, inspect, sub }
  const items = orderItems(cart)
  const mrpTotal = cart.reduce((s, l) => s + units(BY_SKU[l.sku].mrp) * BigInt(l.qty), 0n)

  return (
    <StoreCtx.Provider value={ctx}>
      <div className={inspect ? "inspecting" : undefined}>{children}</div>

      <Drawer open={bagOpen} onClose={() => setBagOpen(false)} title={count ? `Bag · ${count} ${count === 1 ? "item" : "items"}` : "Bag"}
        footer={cart.length > 0 && (
          <div className="wp-stack summary">
            <dl>
              <div><dt>Total MRP</dt><dd>{fmt(mrpTotal)} USDT</dd></div>
              <div><dt>Discount on MRP</dt><dd className="free">−{fmt(mrpTotal - total)} USDT</dd></div>
              <div><dt>Delivery</dt><dd className="free">Free</dd></div>
              <div><dt>Network fee</dt><dd className="free">None, paid by WondrPay</dd></div>
              <div className="summary-total"><dt>Total amount</dt><dd>{fmt(total)} USDT</dd></div>
            </dl>
            {items.length > 8 ? <p className="wp-muted">Up to 8 different products per order. Remove a few to check out.</p> : (
              <div className="checkout-slot">
                <Marker n="②" title="bag checkout: same button, items payload" />
                <wondrpay-button order-endpoint="/api/create-order" payload={JSON.stringify({ items })} data-items={JSON.stringify(cart)} label={`Place order · ${fmt(total)} USDT`} />
              </div>
            )}
            <p className="secure"><Icon name="lock" size={14} /> Prices are signed by our server. You approve in WondrPay.</p>
          </div>
        )}>
        {cart.length === 0 ? (
          <div className="empty">
            <div className="empty-art"><ProductImage p={BY_SKU["dew-facewash"]} /></div>
            <h3 className="wp-title-3">Hey, it feels so light!</h3>
            <p className="wp-muted">There is nothing in your bag. Let&apos;s add some items.</p>
            <ButtonLink href="/wishlist" variant="secondary" onClick={() => setBagOpen(false)}>Add items from wishlist</ButtonLink>
          </div>
        ) : (
          <ul className="bag-lines">
            {cart.map((l) => {
              const p = BY_SKU[l.sku]
              return (
                <li key={lineKey(l)}>
                  <Link href={`/p/${p.sku}`} className="thumb" onClick={() => setBagOpen(false)}><ProductImage p={p} /></Link>
                  <div className="wp-stack" data-gap="2">
                    <b>{p.brand}</b>
                    <span className="wp-muted bag-name">{p.name}</span>
                    {l.size && <span className="bag-size">Size: {l.size}</span>}
                    <QuantityStepper value={l.qty} onChange={(n) => setQty(l, n)} max={MAX_QTY} label={p.name} size="sm" />
                  </div>
                  <div className="line-total"><b>{fmt(units(p.price) * BigInt(l.qty))}</b>{p.mrp !== p.price && <s>{fmt(units(p.mrp) * BigInt(l.qty))}</s>}</div>
                </li>
              )
            })}
          </ul>
        )}
      </Drawer>

      <Dialog open={!!paid} onClose={() => setPaid(null)} title="Order confirmed" description={paid ? `Order ${paid.p.orderId.slice(2, 10).toUpperCase()} · ${fmt(BigInt(paid.p.amount))} USDT` : undefined}
        footer={<div className="wp-cluster dialog-actions">
          <ButtonLink href="/orders" variant="secondary" onClick={() => setPaid(null)}>My orders</ButtonLink>
          {paid?.p.explorer && <ButtonLink href={paid.p.explorer} variant="secondary">View receipt</ButtonLink>}
          <Button onClick={() => setPaid(null)}>Continue shopping</Button>
        </div>}>
        <div className="wp-stack">
          <p>Thank you! We&apos;ve received your payment.</p>
          {paid && paid.items.length > 0 && (
            <ul className="order-lines">{paid.items.map((l) => <li key={lineKey(l)}><span>{BY_SKU[l.sku]?.brand} {BY_SKU[l.sku]?.name}{l.size ? ` · ${l.size}` : ""} × {l.qty}</span><b>{fmt(units(PRICE[l.sku]) * BigInt(l.qty))}</b></li>)}</ul>
          )}
          <p className="verify" data-state={verified} role="status">
            {verified === "checking" ? <><Spinner label="Confirming" /> Confirming your payment on Whitechain…</>
              : verified === "ok" ? <><Icon name="check" size={18} /> Payment confirmed on-chain. We&apos;re packing your order.</>
              : "We couldn't confirm it yet. We'll keep checking."}
          </p>
        </div>
      </Dialog>

      <Button className="dev-toggle" variant="primary" size="sm" iconLeft="code" onClick={() => setDevOpen(true)} hidden={devOpen}>
        Developer view{logs.length > 1 && <span className="count" aria-label={`${logs.length} events`}>{logs.length}</span>}
      </Button>
      <DevPanel open={devOpen} onClose={() => setDevOpen(false)} logs={logs} inspect={inspect} setInspect={setInspect} />
    </StoreCtx.Provider>
  )
}
