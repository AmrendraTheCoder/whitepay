"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge, Button, ButtonLink, Dialog, Drawer, Icon, QuantityStepper, Skeleton, Spinner, useToast } from "@whitepay/ui"
import { WHITEPAY_URL, SDK_SRC } from "@/lib/sdk"
import { PRODUCTS, PRICE, MAX_QTY, type Product } from "@/lib/catalog"
import { HeroArt, ProductArt, ClubArt } from "@/lib/art"
import { DevPanel, gh, type Log } from "./dev-panel"

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "whitepay-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { "order-endpoint"?: string; payload?: string; label?: string; mode?: "subscribe"; "data-items"?: string }
    }
  }
}

type Line = { sku: string; qty: number }
type Paid = { orderId: string; txHash?: string; explorer?: string; amount: string; entityKey: string }
type Sub = { mandateKey: string; subscriber?: string; amount: string; cycles: number }

const units = (usdt: string) => BigInt(Math.round(Number(usdt) * 1e6))
const fmt = (b: bigint) => `${b / 1_000_000n}.${(b % 1_000_000n).toString().padStart(6, "0").slice(0, 2)}`
const BY_SKU = Object.fromEntries(PRODUCTS.map((p) => [p.sku, p])) as Record<string, Product>
const CART_KEY = "chaico.cart.v1"

const REVIEWS = [
  { name: "Priya", city: "Pune", text: "Tastes like the tapri outside my old office. I paid with my fingerprint and it was done before the kettle boiled." },
  { name: "Daniel", city: "Lisbon", text: "Ordered from Portugal with no card fees and no currency conversion. The receipt link is a nice touch." },
  { name: "Meher", city: "Bandra", text: "The Chai Club box arrives like clockwork and I can cancel from my phone any time." },
]

/** Integration marker shown in Developer view's "highlight" mode. */
function Marker({ show, n, title }: { show: boolean; n: string; title: string }) {
  if (!show) return null
  return <a className="marker" href={gh(n)} target="_blank" rel="noopener noreferrer" title={title} aria-label={`Integration point ${n}: ${title} (view source)`}>{n === "②" ? "2" : n}</a>
}

function Rating({ value, count }: { value: number; count: number }) {
  return (
    <p className="rating" aria-label={`Rated ${value} out of 5 by ${count.toLocaleString()} customers`}>
      <span className="stars" aria-hidden>{Array.from({ length: 5 }, (_, i) => <Icon key={i} name="star" size={14} />)}</span>
      <span aria-hidden>{value} <span className="wp-muted">({count.toLocaleString()})</span></span>
    </p>
  )
}

export default function Store() {
  const toast = useToast()
  const [cart, setCart] = useState<Line[]>([])
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
  const push = useCallback((l: Omit<Log, "at">) => setLogs((x) => [{ ...l, at: Date.now() }, ...x].slice(0, 60)), [])

  // cart persistence (this browser only); unknown SKUs from an old catalog are dropped
  useEffect(() => { try { const c = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]"); if (Array.isArray(c)) setCart(c.filter((l) => BY_SKU[l?.sku] && Number.isInteger(l.qty) && l.qty > 0)) } catch {} }, [])
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch {} }, [cart])

  const count = cart.reduce((n, l) => n + l.qty, 0)
  const total = useMemo(() => cart.reduce((s, l) => s + units(PRICE[l.sku]) * BigInt(l.qty), 0n), [cart])
  const qtyOf = (sku: string) => cart.find((l) => l.sku === sku)?.qty ?? 0
  const setQty = (sku: string, q: number) => setCart((c) => {
    if (q <= 0) return c.filter((l) => l.sku !== sku)
    const next = Math.min(MAX_QTY, q)
    return c.some((l) => l.sku === sku) ? c.map((l) => (l.sku === sku ? { ...l, qty: next } : l)) : [...c, { sku, qty: next }]
  })
  const add = (sku: string) => {
    setQty(sku, qtyOf(sku) + 1)
    toast.show({ message: `${BY_SKU[sku].name} added to your bag`, tone: "success", action: { label: "View bag", onClick: () => setBagOpen(true) } })
  }

  // WhitePay checkout events (integration point 2)
  useEffect(() => {
    customElements.whenDefined("whitepay-button").then(() => {
      setSdkReady(true)
      push({ src: "sdk", msg: `SDK v${(window as { WhitePay?: { version: string } }).WhitePay?.version ?? "?"} loaded from ${new URL(SDK_SRC).host}, integrity verified`, tone: "ok" })
    })
    const on = (name: string, f: (detail: any, e: Event) => void) => { const h = (e: Event) => f((e as CustomEvent).detail, e); document.addEventListener(name, h); return () => document.removeEventListener(name, h) }
    const offs = [
      on("whitepay:created", (d, e) => {
        if (d.entityKey) {
          try { pending.current = JSON.parse((e.target as HTMLElement).dataset.items ?? "[]") } catch { pending.current = [] }
          push({ src: "sdk", msg: `Order created · request ${d.entityKey.slice(0, 10)}… · QR valid until ${new Date(d.deadline * 1000).toLocaleTimeString()}` })
        } else push({ src: "sdk", msg: `Subscription offer ${d.planKey?.slice(0, 10)}… signed by the store` })
      }),
      on("whitepay:paid", (d: Paid) => { push({ src: "sdk", msg: `Paid ${Number(d.amount) / 1e6} USDT · tx ${d.txHash?.slice(0, 10)}…`, tone: "ok" }); setBagOpen(false); setPaid({ p: d, items: pending.current }) }),
      on("whitepay:subscribed", (d: Sub) => { push({ src: "sdk", msg: `Subscribed · mandate ${d.mandateKey.slice(0, 10)}… · first ${Number(d.amount) / 1e6} USDT paid`, tone: "ok" }); setSub(d); toast.show({ message: "Welcome to Chai Club", tone: "success" }) }),
      on("whitepay:expired", () => push({ src: "sdk", msg: "Payment window expired · request removed from Arkiv", tone: "bad" })),
      on("whitepay:error", (d) => push({ src: "sdk", msg: `Error · ${d.message}`, tone: "bad" })),
    ]
    return () => offs.forEach((f) => f())
  }, [push, toast])

  // After payment: our server re-checks the chain and reports what its webhook handler did.
  useEffect(() => {
    if (!paid?.p.txHash) return
    const { p, items } = paid
    setVerified("checking")
    if (items.length) setCart((c) => c.filter((l) => !items.some((i) => i.sku === l.sku)))
    fetch(`/api/verify?tx=${p.txHash}&orderId=${p.orderId}`).then((r) => r.json()).then((v) => {
      setVerified(v.ok ? "ok" : "bad")
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

  return (
    <div className={inspect ? "inspecting" : undefined}>
      <p className="announce">Pay in USDT with <b>WhitePay</b> · no gas · settles in about a second <Badge>Demo store</Badge></p>

      <header className="nav">
        <div className="wp-container nav-inner">
          <a className="brand" href="#top" aria-label="Chai & Co. home">
            <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden><rect width="40" height="40" rx="10" fill="currentColor" /><path d="M11 15h16v8a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z" fill="#e9a23b" /><path d="M27 17h2a3 3 0 0 1 0 6h-2" fill="none" stroke="#e9a23b" strokeWidth="2.4" /></svg>
            <span>Chai &amp; Co.</span>
          </a>
          <nav className="nav-links" aria-label="Main"><a href="#shop">Shop</a><a href="#club">Chai Club</a><a href="#reviews">Reviews</a></nav>
          <Button variant="secondary" size="sm" iconLeft="bag" onClick={() => setBagOpen(true)} aria-label={`Bag, ${count} ${count === 1 ? "item" : "items"}`}>
            Bag{count > 0 && <span className="count" aria-hidden>{count}</span>}
          </Button>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="wp-container hero-inner">
            <div className="hero-copy">
              <span className="wp-eyebrow">Small-batch chai from Mumbai</span>
              <h1 id="hero-title" className="wp-title-1">Chai, the way Mumbai makes it.</h1>
              <p className="wp-lead">Hand-blended Assam, cardamom and ginger, shipped worldwide. Checkout is one scan and one fingerprint: no card, no fees, no forms.</p>
              <div className="wp-cluster">
                <ButtonLink href="#shop" size="lg">Shop the blends</ButtonLink>
                <ButtonLink href="#club" variant="secondary" size="lg">Join Chai Club</ButtonLink>
              </div>
              <dl className="facts">
                <div><dt>Rating</dt><dd>4.9 / 5</dd></div>
                <div><dt>Checkout</dt><dd>~1 second</dd></div>
                <div><dt>Card fees</dt><dd>None</dd></div>
              </dl>
            </div>
            <div className="hero-art"><HeroArt /></div>
          </div>
        </section>

        <section id="shop" className="wp-section" aria-labelledby="shop-title">
          <div className="wp-container">
            <header className="wp-section-header" data-split>
              <div className="wp-stack" data-gap="3"><span className="wp-eyebrow">The shop</span><h2 id="shop-title" className="wp-title-2">Blends and good things</h2></div>
              <p className="wp-muted">Every order ships within 48 hours. Pay in USDT from anywhere.</p>
            </header>
            <ul className="products" aria-busy={!sdkReady}>
              {PRODUCTS.map((p) => {
                const qty = qtyOf(p.sku)
                return (
                  <li key={p.sku} className="product" aria-labelledby={`p-${p.sku}`}>
                    <div className="product-art" data-art={p.art}>{p.badge && <Badge tone="highlight">{p.badge}</Badge>}<ProductArt kind={p.art} /></div>
                    <div className="product-body">
                      <Rating value={p.rating} count={p.reviews} />
                      <h3 id={`p-${p.sku}`} className="product-name">{p.name}</h3>
                      <p className="wp-muted product-desc">{p.tagline}</p>
                      <div className="product-buy">
                        <p className="product-price">{p.price} <span>USDT</span></p>
                        {qty ? <QuantityStepper value={qty} onChange={(n) => setQty(p.sku, n)} max={MAX_QTY} label={p.name} /> : <Button size="sm" onClick={() => add(p.sku)}>Add to bag</Button>}
                      </div>
                      <div className="checkout-slot">
                        <Marker show={inspect} n="②" title="<whitepay-button>, one per product" />
                        {sdkReady ? null : <Skeleton height={44} radius="pill" />}
                        {/* ── WHITEPAY INTEGRATION ② ── the checkout button (the same element powers the bag) */}
                        <whitepay-button hidden={!sdkReady} order-endpoint="/api/create-order" payload={JSON.stringify({ items: [{ sku: p.sku, qty: 1 }] })} data-items={JSON.stringify([{ sku: p.sku, qty: 1 }])} label={`Buy now · ${p.price} USDT`} />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        <section id="club" className="wp-section" data-tone="muted" aria-labelledby="club-title">
          <div className="wp-container club">
            <div className="club-art"><ClubArt /></div>
            <div className="wp-stack club-copy">
              <span className="wp-eyebrow">Chai Club</span>
              <h2 id="club-title" className="wp-title-2">A fresh blend every cycle. You stay in control.</h2>
              <p className="wp-muted">Pay for the first box now. When the next one is due, WhitePay asks you to approve it with one tap, or switch on Autopay to approve once. No gas, and you can cancel any time in WhitePay.</p>
              <ul className="wp-checklist">
                <li><Icon name="check" size={18} /><span><b>0.10 USDT per box</b> (demo: every 2 minutes, 3 boxes)</span></li>
                <li><Icon name="check" size={18} /><span>One-tap renewals, or Autopay</span></li>
                <li><Icon name="check" size={18} /><span>Cancel any time</span></li>
              </ul>
              {sub
                ? <p className="club-done" role="status"><Icon name="check" size={18} /> You're subscribed. Box 1 is paid; the next payment requests appear in Developer view.</p>
                : (
                  <div className="checkout-slot club-cta">
                    <Marker show={inspect} n="②" title='the same button with mode="subscribe"' />
                    {sdkReady ? null : <Skeleton height={52} radius="pill" />}
                    <whitepay-button hidden={!sdkReady} mode="subscribe" order-endpoint="/api/create-subscription" label="Subscribe · 0.10 USDT per box" />
                  </div>
                )}
            </div>
          </div>
        </section>

        <section id="reviews" className="wp-section" aria-labelledby="reviews-title">
          <div className="wp-container">
            <header className="wp-section-header"><span className="wp-eyebrow">Reviews</span><h2 id="reviews-title" className="wp-title-2">What our regulars say</h2></header>
            <ul className="reviews">
              {REVIEWS.map((r) => (
                <li key={r.name}>
                  <figure>
                    <span className="stars" role="img" aria-label="5 out of 5 stars">{Array.from({ length: 5 }, (_, i) => <Icon key={i} name="star" size={14} />)}</span>
                    <blockquote>{r.text}</blockquote>
                    <figcaption><span className="avatar" aria-hidden>{r.name[0]}</span>{r.name}, {r.city}</figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wp-container footer-inner">
          <p className="wp-muted">Chai &amp; Co. is a demo store that shows the WhitePay Checkout SDK. It uses test USDT on Whitechain Sepolia, so no real money or tea changes hands.</p>
          <nav className="wp-cluster" aria-label="Footer">
            <ButtonLink href="/plain.html" variant="ghost" size="sm">Plain HTML checkout</ButtonLink>
            <ButtonLink href="https://whitepay.vercel.app/developers" variant="ghost" size="sm">Checkout SDK</ButtonLink>
            <ButtonLink href="https://whitepay.vercel.app" variant="ghost" size="sm">WhitePay</ButtonLink>
          </nav>
        </div>
      </footer>

      <Drawer open={bagOpen} onClose={() => setBagOpen(false)} title={count ? `Your bag (${count})` : "Your bag"}
        footer={cart.length > 0 && (
          <div className="wp-stack summary">
            <dl>
              <div><dt>Subtotal</dt><dd>{fmt(total)} USDT</dd></div>
              <div><dt>Shipping</dt><dd className="free">Free</dd></div>
              <div><dt>Network fee</dt><dd className="free">None, paid by WhitePay</dd></div>
              <div className="summary-total"><dt>Total</dt><dd>{fmt(total)} USDT</dd></div>
            </dl>
            <div className="checkout-slot">
              <Marker show={inspect} n="②" title="cart checkout: same button, items payload" />
              <whitepay-button order-endpoint="/api/create-order" payload={JSON.stringify({ items: cart })} data-items={JSON.stringify(cart)} label={`Pay ${fmt(total)} USDT with WhitePay`} />
            </div>
            <p className="secure"><Icon name="lock" size={14} /> The price is signed by our server. You approve in WhitePay.</p>
          </div>
        )}>
        {cart.length === 0 ? (
          <div className="empty">
            <div className="empty-art" data-art="kit"><ProductArt kind="kit" /></div>
            <h3 className="wp-title-3">Your bag is empty</h3>
            <p className="wp-muted">Start with our bestseller, the Masala Chai Kit.</p>
            <Button onClick={() => add("chai-kit")}>Add Masala Chai Kit · 2.50 USDT</Button>
          </div>
        ) : (
          <ul className="bag-lines">
            {cart.map((l) => {
              const p = BY_SKU[l.sku]
              return (
                <li key={l.sku}>
                  <div className="thumb" data-art={p.art}><ProductArt kind={p.art} /></div>
                  <div className="wp-stack" data-gap="2">
                    <b>{p.name}</b><span className="wp-muted">{p.price} USDT each</span>
                    <QuantityStepper value={l.qty} onChange={(n) => setQty(l.sku, n)} max={MAX_QTY} label={p.name} size="sm" />
                  </div>
                  <b className="line-total">{fmt(units(p.price) * BigInt(l.qty))}</b>
                </li>
              )
            })}
          </ul>
        )}
      </Drawer>

      <Dialog open={!!paid} onClose={() => setPaid(null)} title="Order confirmed" description={paid ? `Order ${paid.p.orderId.slice(2, 10).toUpperCase()} · ${fmt(BigInt(paid.p.amount))} USDT` : undefined}
        footer={<div className="wp-cluster dialog-actions">
          {paid?.p.explorer && <ButtonLink href={paid.p.explorer} variant="secondary">View receipt</ButtonLink>}
          <Button onClick={() => setPaid(null)}>Continue shopping</Button>
        </div>}>
        <div className="wp-stack">
          <p>Thank you! We've received your payment.</p>
          {paid && paid.items.length > 0 && (
            <ul className="order-lines">{paid.items.map((l) => <li key={l.sku}><span>{BY_SKU[l.sku]?.name} × {l.qty}</span><b>{fmt(units(PRICE[l.sku]) * BigInt(l.qty))}</b></li>)}</ul>
          )}
          <p className="verify" data-state={verified} role="status">
            {verified === "checking" ? <><Spinner label="Confirming" /> Confirming your payment on Whitechain…</>
              : verified === "ok" ? <><Icon name="check" size={18} /> Payment confirmed on-chain. We're packing your order.</>
              : "We couldn't confirm it yet. We'll keep checking."}
          </p>
        </div>
      </Dialog>

      <Button className="dev-toggle" variant="primary" size="sm" iconLeft="code" onClick={() => setDevOpen(true)} hidden={devOpen}>
        Developer view{logs.length > 1 && <span className="count" aria-label={`${logs.length} events`}>{logs.length}</span>}
      </Button>
      <DevPanel open={devOpen} onClose={() => setDevOpen(false)} logs={logs} inspect={inspect} setInspect={setInspect} />
    </div>
  )
}
