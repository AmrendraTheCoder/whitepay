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
const PENDING_KEY = "kesar.pending.v1"
/** An order whose QR is open (or was): watched until paid or expired, even if the popup closes or the page reloads. */
type Pending = { entityKey: string; deadline: number; items: Line[]; at: number }
const isNetErr = (m: string) => /failed to fetch|networkerror|network error|load failed|network request failed|err_internet|timed? ?out/i.test(m)
/** SDK / server errors in words a shopper can act on. */
export function friendlyCheckoutError(m: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "You're offline. Connect to the internet, then tap the button again. Nothing was charged."
  if (isNetErr(m)) return "Couldn't reach the store's server. Your connection may be weak or a firewall is blocking it. Try again. Nothing was charged."
  if (/too many requests/i.test(m)) return "Too many checkout attempts. Wait a minute and try again."
  if (/unknown product or quantity/i.test(m)) return "Your bag has a product or quantity we can't sell (max 10 each, 8 products per order). Adjust it and try again."
  if (/could not create the order|502|503|504/i.test(m)) return "WondrPay couldn't create this order right now (its servers didn't answer). Try again in a moment. Nothing was charged."
  if (/cross-site|json only|oversized/i.test(m)) return "Checkout was blocked by the browser. Reload the page and try again."
  return m
}
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
  const [verified, setVerified] = useState<"checking" | "ok" | "offline" | "bad">("checking")
  const [verifyNote, setVerifyNote] = useState("")
  const [online, setOnline] = useState(true)
  const [sub, setSub] = useState<Sub | null>(null)
  const [devOpen, setDevOpen] = useState(false)
  const [inspect, setInspect] = useState(false)
  const [logs, setLogs] = useState<Log[]>([])
  const [sdkReady, setSdkReady] = useState(false)
  const pending = useRef(new Map<string, Pending>()) // entityKey → order being paid
  const handled = useRef(new Set<string>()) // orders already shown as paid (SDK event and our own watcher can both see it)
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

  const cartRef = useRef(cart)
  cartRef.current = cart
  const count = cart.reduce((n, l) => n + l.qty, 0)
  const total = useMemo(() => cart.reduce((s, l) => s + units(PRICE[l.sku]) * BigInt(l.qty), 0n), [cart])
  // MAX_QTY is per product across all its sizes: the server prices sku × qty and refuses more than 10
  const otherSizes = (c: Line[], sku: string, k: string) => c.reduce((n, x) => (x.sku === sku && lineKey(x) !== k ? n + x.qty : n), 0)
  const setQty = useCallback((l: Line, q: number) => setCart((c) => {
    const k = lineKey(l)
    if (q <= 0) return c.filter((x) => lineKey(x) !== k)
    const next = Math.max(1, Math.min(MAX_QTY - otherSizes(c, l.sku, k), q))
    return c.some((x) => lineKey(x) === k) ? c.map((x) => (lineKey(x) === k ? { ...x, qty: next } : x)) : [...c, { sku: l.sku, size: l.size, qty: next }]
  }), [])
  const add = useCallback((sku: string, size?: string, qty = 1) => {
    const inBag = cartRef.current.reduce((n, x) => (x.sku === sku ? n + x.qty : n), 0)
    const room = MAX_QTY - inBag
    if (room <= 0) { toast.show({ message: `You can buy up to ${MAX_QTY} of ${BY_SKU[sku].name} per order`, tone: "neutral", duration: 7000 }); return }
    const n = Math.min(room, qty)
    setCart((c) => {
      const k = lineKey({ sku, size })
      const cur = c.find((x) => lineKey(x) === k)
      return cur ? c.map((x) => (x === cur ? { ...x, qty: x.qty + n } : x)) : [...c, { sku, size, qty: n }]
    })
    toast.show({ message: `${BY_SKU[sku].brand} ${BY_SKU[sku].name} added to bag`, tone: "success", action: { label: "View bag", onClick: () => setBagOpen(true) } })
  }, [toast])
  const toggleWish = useCallback((sku: string) => setWish((w) => {
    const has = w.includes(sku)
    toast.show({ message: has ? "Removed from wishlist" : "Saved to wishlist", tone: has ? undefined : "success" })
    return has ? w.filter((s) => s !== sku) : [sku, ...w]
  }), [toast])

  const savePending = () => { try { localStorage.setItem(PENDING_KEY, JSON.stringify([...pending.current.values()])) } catch {} }
  /** One place that turns "this order is paid" into the confirmation, however we learned it. */
  const markPaid = useCallback((entityKey: string, p: Paid, via: "sdk" | "watcher") => {
    const id = (p.orderId || entityKey).toLowerCase()
    const o = pending.current.get(entityKey)
    pending.current.delete(entityKey); savePending()
    if (handled.current.has(id)) return
    handled.current.add(id)
    if (via === "watcher") push({ src: "server", msg: `Payment found for request ${entityKey.slice(0, 10)}… (checkout popup was closed or the page reloaded)`, tone: "ok" })
    setBagOpen(false)
    setPaid({ p, items: o?.items ?? [] })
  }, [push])

  // online / offline: say so plainly, and re-check open payments the moment the connection is back
  useEffect(() => {
    setOnline(navigator.onLine)
    const up = () => { setOnline(true); toast.show({ message: "Back online", tone: "success" }) }
    const down = () => setOnline(false)
    window.addEventListener("online", up); window.addEventListener("offline", down)
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down) }
  }, [toast])

  // A checkout button pressed while offline would only fail with "Failed to fetch": stop it and explain.
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (navigator.onLine) return
      if (!e.composedPath().some((n) => n instanceof HTMLElement && n.tagName === "WONDRPAY-BUTTON")) return
      e.stopPropagation(); e.preventDefault()
      toast.show({ message: "You're offline. Connect to the internet to pay. Your bag is saved.", tone: "neutral", duration: 7000 })
    }
    document.addEventListener("click", h, true)
    return () => document.removeEventListener("click", h, true)
  }, [toast])

  // Watch every open payment ourselves. The SDK popup stops watching when it is closed (Esc, tap outside,
  // switching to MetaMask and back late, reload), but the shopper may still pay: we must never miss that.
  useEffect(() => {
    try {
      for (const o of JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as Pending[])
        if (o?.entityKey && o.deadline * 1000 > Date.now() - 600_000) pending.current.set(o.entityKey, o)
    } catch {}
    let stop = false, timer: ReturnType<typeof setTimeout> | undefined, fails = 0
    const tick = async () => {
      if (stop) return
      const list = [...pending.current.values()]
      if (list.length && navigator.onLine && document.visibilityState === "visible") {
        let failed = false
        for (const o of list) {
          try {
            const r = await fetch(`${WHITEPAY_URL}/api/requests/${o.entityKey}`, { cache: "no-store", credentials: "omit" })
            const s = await r.json()
            if (s.state === "paid") {
              const amount = String(s.request?.amount ?? o.items.reduce((t, l) => t + units(PRICE[l.sku] ?? "0") * BigInt(l.qty), 0n))
              markPaid(o.entityKey, { entityKey: o.entityKey, orderId: s.request?.orderId, txHash: s.receipt?.txHash, explorer: s.receipt?.explorer, amount }, "watcher")
            } else if (s.state === "depleted" || (Date.now() / 1000 > o.deadline + 120 && s.state !== "pending")) {
              pending.current.delete(o.entityKey); savePending() // expired unpaid: nothing was charged
            } else if (!r.ok) failed = true
          } catch { failed = true }
        }
        fails = failed ? fails + 1 : 0
      }
      timer = setTimeout(tick, pending.current.size ? Math.min(3000 * 2 ** Math.min(fails, 3), 20000) : 5000)
    }
    void tick()
    const wake = () => { if (document.visibilityState === "visible") { clearTimeout(timer); void tick() } }
    window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake); window.addEventListener("focus", wake)
    return () => { stop = true; clearTimeout(timer); window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake) }
  }, [markPaid])

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
          let items: Line[] = []
          try { items = JSON.parse((e.target as HTMLElement).dataset.items ?? "[]") } catch {}
          // the items are frozen with the order: changing the bag while paying can't change what this order covers
          pending.current.set(d.entityKey, { entityKey: d.entityKey, deadline: Number(d.deadline) || Date.now() / 1000 + 300, items, at: Date.now() })
          savePending()
          push({ src: "sdk", msg: `Order created · request ${d.entityKey.slice(0, 10)}… · QR valid until ${new Date(d.deadline * 1000).toLocaleTimeString()}` })
        } else push({ src: "sdk", msg: `Subscription offer ${d.planKey?.slice(0, 10)}… signed by the store` })
      }),
      on("wondrpay:paid", (d: Paid) => { push({ src: "sdk", msg: `Paid ${Number(d.amount) / 1e6} USDT · tx ${d.txHash?.slice(0, 10)}…`, tone: "ok" }); markPaid(d.entityKey, d, "sdk") }),
      on("wondrpay:subscribed", (d: Sub) => { push({ src: "sdk", msg: `Subscribed · mandate ${d.mandateKey.slice(0, 10)}… · first ${Number(d.amount) / 1e6} USDT paid`, tone: "ok" }); setSub(d); toast.show({ message: "Welcome to Amaron Glow Box", tone: "success" }) }),
      on("wondrpay:expired", () => push({ src: "sdk", msg: "Payment window expired · request removed from Arkiv", tone: "bad" })),
      on("wondrpay:error", (d) => {
        push({ src: "sdk", msg: `Error · ${d.message}`, tone: "bad" })
        toast.show({ message: friendlyCheckoutError(String(d.message ?? "")), tone: "neutral", duration: 7000 })
      }),
    ]
    return () => offs.forEach((f) => f())
  }, [push, toast, markPaid])

  // After payment: our server re-checks the chain and reports what its webhook handler did.
  useEffect(() => {
    if (!paid?.p.txHash) return
    const { p, items } = paid
    setVerified("checking"); setVerifyNote("")
    // take out exactly what was paid for (quantities per line), not everything with the same product
    if (items.length) setCart((c) => c.flatMap((l) => {
      const hit = items.find((i) => i.sku === l.sku && (i.size ?? "") === (l.size ?? ""))
      if (!hit) return [l]
      return l.qty > hit.qty ? [{ ...l, qty: l.qty - hit.qty }] : []
    }))
    const local: LocalOrder = { orderId: p.orderId, txHash: p.txHash, explorer: p.explorer, amount: p.amount, items, at: Date.now() }
    saveOrder(local)
    // The block can take a few seconds to reach every RPC node: retry "not found yet" and network drops
    // with backoff instead of telling a paying customer it failed.
    let stop = false, tries = 0, timer: ReturnType<typeof setTimeout> | undefined
    const check = async () => {
      if (stop) return
      if (!navigator.onLine) { setVerified("offline"); return } // resumed by the "online" listener below
      setVerified("checking")
      try {
        const r = await fetch(`/api/verify?tx=${p.txHash}&orderId=${p.orderId}`, { cache: "no-store" })
        const v = await r.json()
        if (stop) return
        if (v.ok) {
          setVerified("ok")
          if (v.payer) saveOrder({ ...local, payer: v.payer }) // remember which wallet paid: "My orders" lists its orders
          push({ src: "chain", msg: `PaymentSettled confirmed in block ${v.block}`, tone: "ok" })
          return
        }
        const transient = /not found yet|bad input/i.test(v.reason ?? "") || r.status >= 500
        if (!transient || tries >= 8) {
          setVerified("bad"); setVerifyNote(v.reason ? `Whitechain says: ${v.reason}.` : "")
          push({ src: "chain", msg: `On-chain check: ${v.reason}`, tone: "bad" })
          return
        }
      } catch (e) {
        if (stop) return
        setVerifyNote(navigator.onLine ? "Our server didn't answer. Retrying…" : "")
      }
      tries++
      timer = setTimeout(check, Math.min(1500 * 2 ** Math.min(tries, 4), 15000))
    }
    void check()
    const resume = () => { clearTimeout(timer); tries = Math.min(tries, 4); void check() }
    const pause = () => setVerified((v) => (v === "checking" ? "offline" : v))
    window.addEventListener("online", resume); window.addEventListener("offline", pause)
    const stopPoll = poll(`orderId=${p.orderId}`, 12, 1500)
    return () => { stop = true; clearTimeout(timer); window.removeEventListener("online", resume); window.removeEventListener("offline", pause); stopPoll() }
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
      {!online && (
        <div className="net-banner" role="status">
          <b>No internet connection.</b> You can keep browsing your saved bag; checkout and payment checks resume automatically when you&apos;re back online.
        </div>
      )}
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
            {verified === "checking" ? <><Spinner label="Confirming" /> Confirming your payment on Whitechain…{verifyNote && <small className="verify-note">{verifyNote}</small>}</>
              : verified === "ok" ? <><Icon name="check" size={18} /> Payment confirmed on-chain. We&apos;re packing your order.</>
              : verified === "offline" ? <>You&apos;re offline. Your payment is already on Whitechain; we&apos;ll confirm it as soon as you&apos;re back online.</>
              : <>We couldn&apos;t confirm this payment on-chain. {verifyNote} Your receipt link shows the transaction; contact the shop with the order number if it looks wrong.</>}
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
