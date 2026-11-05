"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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

const base = (usdt: string) => BigInt(Math.round(Number(usdt) * 1e6))
const fmt = (b: bigint) => `${b / 1_000_000n}.${(b % 1_000_000n).toString().padStart(6, "0").slice(0, 2)}`
const byS = Object.fromEntries(PRODUCTS.map((p) => [p.sku, p])) as Record<string, Product>
const CART_KEY = "chaico.cart.v1"

const REVIEWS = [
  { n: "Priya", c: "Pune", t: "Tastes exactly like the tapri outside my old office. Paid with my fingerprint and it was done before the kettle boiled." },
  { n: "Daniel", c: "Lisbon", t: "Ordered from Portugal with no card fees and no currency maths. The receipt link is a nice touch." },
  { n: "Meher", c: "Bandra", t: "The Chai Club box shows up like clockwork and I can cancel from my phone anytime. Love the cardamom blend." },
]

export default function Store() {
  const [cart, setCart] = useState<Line[]>([])
  const [drawer, setDrawer] = useState(false)
  const [toast, setToast] = useState("")
  const [paid, setPaid] = useState<{ p: Paid; items: Line[] } | null>(null)
  const [verified, setVerified] = useState<"checking" | "ok" | "bad">("checking")
  const [sub, setSub] = useState<Sub | null>(null)
  const [dev, setDev] = useState(false)
  const [inspect, setInspect] = useState(false)
  const [logs, setLogs] = useState<Log[]>([])
  const [ready, setReady] = useState(false)
  const pending = useRef<Line[]>([])
  const seen = useRef(new Set<string>())
  const push = useCallback((l: Omit<Log, "at">) => setLogs((x) => [{ ...l, at: Date.now() }, ...x].slice(0, 60)), [])

  // cart persistence (per browser)
  useEffect(() => { try { const c = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]"); if (Array.isArray(c)) setCart(c.filter((l) => byS[l.sku])) } catch {} }, [])
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch {} }, [cart])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2200); return () => clearTimeout(t) }, [toast])
  useEffect(() => { document.body.style.overflow = drawer || paid || dev ? "hidden" : ""; }, [drawer, paid, dev])

  const count = cart.reduce((n, l) => n + l.qty, 0)
  const total = useMemo(() => cart.reduce((s, l) => s + base(PRICE[l.sku]) * BigInt(l.qty), 0n), [cart])
  const add = (sku: string) => { setCart((c) => { const f = c.find((l) => l.sku === sku); return f ? c.map((l) => l.sku === sku ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l) : [...c, { sku, qty: 1 }] }); setToast(`${byS[sku].name} added to your bag`) }
  const setQty = (sku: string, q: number) => setCart((c) => (q <= 0 ? c.filter((l) => l.sku !== sku) : c.map((l) => l.sku === sku ? { ...l, qty: Math.min(MAX_QTY, q) } : l)))

  // ── WHITEPAY events (part of integration point ②)
  useEffect(() => {
    customElements.whenDefined("whitepay-button").then(() => { setReady(true); push({ src: "sdk", msg: `SDK v${(window as any).WhitePay?.version ?? "?"} loaded from ${new URL(SDK_SRC).host}, integrity verified`, tone: "ok" }) })
    const on = (n: string, f: (d: any, e: Event) => void) => { const h = (e: Event) => f((e as CustomEvent).detail, e); document.addEventListener(n, h); return () => document.removeEventListener(n, h) }
    const offs = [
      on("whitepay:created", (d, e) => {
        if (d.entityKey) {
          try { pending.current = JSON.parse((e.target as HTMLElement).dataset.items ?? "[]") } catch { pending.current = [] }
          push({ src: "sdk", msg: `order created · request ${d.entityKey.slice(0, 10)}… on Arkiv · QR valid until ${new Date(d.deadline * 1000).toLocaleTimeString()}` })
        } else push({ src: "sdk", msg: `subscription offer ${d.planKey?.slice(0, 10)}… signed by the shop` })
      }),
      on("whitepay:paid", (d: Paid) => { push({ src: "sdk", msg: `paid ${Number(d.amount) / 1e6} USDT · tx ${d.txHash?.slice(0, 10)}…`, tone: "ok" }); setDrawer(false); setPaid({ p: d, items: pending.current }) }),
      on("whitepay:subscribed", (d: Sub) => { push({ src: "sdk", msg: `subscribed · mandate ${d.mandateKey.slice(0, 10)}… · first ${Number(d.amount) / 1e6} USDT paid`, tone: "ok" }); setSub(d); setToast("Welcome to Chai Club ✓") }),
      on("whitepay:expired", () => push({ src: "sdk", msg: "payment window expired · request removed from Arkiv", tone: "bad" })),
      on("whitepay:error", (d) => push({ src: "sdk", msg: `error · ${d.message}`, tone: "bad" })),
    ]
    return () => offs.forEach((f) => f())
  }, [push])

  // after payment: our own server re-checks the chain, and shows what its webhook handler did
  useEffect(() => {
    if (!paid?.p.txHash) return
    const { p, items } = paid
    setVerified("checking")
    if (items.length) setCart((c) => c.filter((l) => !items.some((i) => i.sku === l.sku)))
    fetch(`/api/verify?tx=${p.txHash}&orderId=${p.orderId}`).then((r) => r.json()).then((v) => {
      setVerified(v.ok ? "ok" : "bad")
      push({ src: "chain", msg: v.ok ? `PaymentSettled confirmed in block ${v.block}` : `on-chain check: ${v.reason}`, tone: v.ok ? "ok" : "bad" })
    }).catch(() => setVerified("bad"))
    return poll(`orderId=${p.orderId}`, 12, 1500)
  }, [paid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sub) return
    const stop = poll(`mandateKey=${sub.mandateKey}`, 110, 5000, () => fetch(`${WHITEPAY_URL}/api/autopay/tick`, { mode: "no-cors", credentials: "omit" }).catch(() => {}))
    return stop
  }, [sub]) // eslint-disable-line react-hooks/exhaustive-deps

  function poll(q: string, times: number, every: number, each?: () => void) {
    let n = 0
    const t = setInterval(async () => {
      each?.()
      const d = await fetch(`/api/order-status?${q}`).then((r) => r.json()).catch(() => null)
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

  const Pin = ({ n, title }: { n: string; title: string }) => inspect ? <a className="pin" href={gh(n)} target="_blank" rel="noopener noreferrer" title={title}>{n}</a> : null

  return (
    <div className={inspect ? "inspect" : ""}>
      <div className="announce"><span>Pay in USDT with <b>WhitePay</b> · 0 gas · settled in ~1 second</span><span className="announce-demo">Demo store</span></div>

      <header className="nav">
        <div className="wrap nav-in">
          <a className="brand" href="#top" aria-label="Chai & Co. home">
            <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden><rect width="40" height="40" rx="11" fill="#2a1a10" /><path d="M11 15h16v8a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z" fill="#e9a23b" /><path d="M27 17h2a3 3 0 0 1 0 6h-2" fill="none" stroke="#e9a23b" strokeWidth="2.4" /><path d="M16 9c-1.5 2 1.5 3 0 5M21 9c-1.5 2 1.5 3 0 5" stroke="#fbf5ea" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
            <span>Chai <i>&amp;</i> Co.</span>
          </a>
          <nav className="links"><a href="#shop">Shop</a><a href="#club">Chai Club</a><a href="#story">Our story</a></nav>
          <button className="bag" onClick={() => setDrawer(true)} aria-label={`Open bag, ${count} items`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 8h14l-1 12H6z" /><path d="M9 8a3 3 0 0 1 6 0" /></svg>
            <span>Bag</span>{count > 0 && <b key={count}>{count}</b>}
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero wrap">
          <div className="hero-copy">
            <span className="kicker">Small-batch · Brewed in Mumbai</span>
            <h1>Chai, the way <em>Mumbai</em> makes it.</h1>
            <p>Hand-blended Assam, cardamom and ginger, shipped worldwide. Checkout takes one scan and one fingerprint: no card, no fees, no forms.</p>
            <div className="hero-cta">
              <a className="btn btn-dark" href="#shop">Shop the blends</a>
              <a className="btn btn-light" href="#club">Join Chai Club</a>
            </div>
            <ul className="trust"><li><b>4.9★</b> 2,600+ reviews</li><li><b>~1 s</b> checkout</li><li><b>0</b> card fees</li></ul>
          </div>
          <div className="hero-art">
            <HeroArt />
            <div className="float-card">
              <span className="fc-ic">✓</span>
              <div><b>Paid 2.50 USDT</b><small>with WhitePay · 0.9 s</small></div>
            </div>
          </div>
        </section>

        <section className="howpay wrap" aria-label="How checkout works">
          {[["01", "Add to bag", "Pick your blends. Prices are set by our server, never your browser."], ["02", "Scan with WhitePay", "A QR appears. Scan it, or tap Pay on this device."], ["03", "Fingerprint, done", "Settled on Whitechain in about a second, receipt saved."]].map(([n, t, d]) => (
            <div key={n}><span>{n}</span><b>{t}</b><p>{d}</p></div>
          ))}
        </section>

        <section id="shop" className="shop wrap">
          <div className="section-head">
            <div><span className="kicker">The shop</span><h2>Blends &amp; good things</h2></div>
            <p>Every order ships in 48 hours. Pay in USDT from anywhere in the world.</p>
          </div>
          <div className="grid">
            {PRODUCTS.map((p) => {
              const inBag = cart.find((l) => l.sku === p.sku)?.qty ?? 0
              return (
                <article key={p.sku} className={`card art-${p.art}`}>
                  <div className="card-art">{p.badge && <span className="badge">{p.badge}</span>}<ProductArt kind={p.art} /></div>
                  <div className="card-body">
                    <div className="rating"><span aria-hidden>★★★★★</span> {p.rating} <small>({p.reviews.toLocaleString()})</small></div>
                    <h3>{p.name}</h3>
                    <p>{p.tagline}</p>
                    <div className="tags">{p.notes.map((n) => <span key={n}>{n}</span>)}</div>
                    <div className="price-row">
                      <div className="price">{p.price} <small>USDT</small></div>
                      {inBag ? (
                        <div className="stepper" aria-label={`${p.name} quantity`}><button onClick={() => setQty(p.sku, inBag - 1)} aria-label="Remove one">−</button><b>{inBag}</b><button onClick={() => setQty(p.sku, inBag + 1)} aria-label="Add one">+</button></div>
                      ) : <button className="btn btn-dark btn-sm" onClick={() => add(p.sku)}>Add to bag</button>}
                    </div>
                    <div className="buy-now pin-wrap">
                      <Pin n="②" title="<whitepay-button>: one element per product" />
                      {/* ── WHITEPAY INTEGRATION ② ── the checkout button (same element in the bag) */}
                      <whitepay-button order-endpoint="/api/create-order" payload={JSON.stringify({ items: [{ sku: p.sku, qty: 1 }] })} data-items={JSON.stringify([{ sku: p.sku, qty: 1 }])} label={`Buy now · ${p.price} USDT`} />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          {!ready && <p className="sdk-wait">Loading secure checkout…</p>}
        </section>

        <section id="club" className="club wrap">
          <div className="club-in">
            <div className="club-art"><ClubArt /></div>
            <div className="club-copy">
              <span className="kicker kicker-lime">Chai Club · Subscription</span>
              <h2>A fresh blend, every cycle. You stay in control.</h2>
              <p>Pay for the first box now. When the next one is due, WhitePay sends you a payment request to approve with one tap, or switch on Autopay to approve once. Gas-free, and cancel anytime from WhitePay → You → Subscriptions.</p>
              <ul><li>0.10 USDT per box <small>(demo: every 2 minutes, 3 boxes)</small></li><li>One-tap renewals, or Autopay</li><li>Cancel anytime, no questions</li></ul>
              {sub ? <div className="club-on">✓ You're subscribed. Box 1 is paid; watch each payment request arrive in Developer view.</div> : (
                <div className="pin-wrap club-btn">
                  <Pin n="②" title='same button with mode="subscribe"' />
                  <whitepay-button mode="subscribe" order-endpoint="/api/create-subscription" label="Subscribe · 0.10 USDT / box" />
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="story" className="story wrap">
          <div className="section-head"><div><span className="kicker">Loved worldwide</span><h2>What our regulars say</h2></div></div>
          <div className="reviews">
            {REVIEWS.map((r) => (
              <figure key={r.n}><div className="stars" aria-label="5 stars">★★★★★</div><blockquote>“{r.t}”</blockquote><figcaption><span>{r.n[0]}</span>{r.n} · {r.c}</figcaption></figure>
            ))}
          </div>
          <div className="why">
            <div><b>Why we take WhitePay</b><p>No card fees means better prices for you. Money reaches us in a second, and every payment comes with a receipt anyone can verify.</p></div>
            <a className="btn btn-light" href="https://whitepay.vercel.app" target="_blank" rel="noopener noreferrer">Get WhitePay ↗</a>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-in">
          <div className="brand"><span>Chai <i>&amp;</i> Co.</span></div>
          <p>Chai &amp; Co. is a demo merchant built to show the WhitePay Checkout SDK. Testnet USDT on Whitechain Sepolia: no real money or real tea changes hands.</p>
          <div className="foot-links"><a href="/plain.html">Plain HTML checkout</a><a href="https://whitepay.vercel.app/developers" target="_blank" rel="noopener noreferrer">Checkout SDK</a><a href="https://whitepay.vercel.app" target="_blank" rel="noopener noreferrer">WhitePay</a></div>
        </div>
      </footer>

      {/* bag drawer */}
      <div className={`scrim ${drawer ? "on" : ""}`} onClick={() => setDrawer(false)} aria-hidden />
      <aside className={`drawer ${drawer ? "open" : ""}`} aria-label="Your bag" aria-hidden={!drawer}>
        <div className="drawer-head"><h3>Your bag {count > 0 && <small>({count})</small>}</h3><button className="icon-btn" onClick={() => setDrawer(false)} aria-label="Close bag">✕</button></div>
        {cart.length === 0 ? (
          <div className="empty"><div className="empty-art"><ProductArt kind="kit" /></div><b>Your bag is empty</b><p>Start with our bestselling Masala Chai Kit.</p><button className="btn btn-dark" onClick={() => { add("chai-kit") }}>Add Masala Chai Kit · 2.50</button></div>
        ) : (
          <>
            <div className="lines">
              {cart.map((l) => { const p = byS[l.sku]; return (
                <div key={l.sku} className="line-item">
                  <div className={`thumb art-${p.art}`}><ProductArt kind={p.art} /></div>
                  <div className="li-mid"><b>{p.name}</b><small>{p.price} USDT each</small>
                    <div className="stepper sm"><button onClick={() => setQty(l.sku, l.qty - 1)} aria-label="Remove one">−</button><b>{l.qty}</b><button onClick={() => setQty(l.sku, l.qty + 1)} aria-label="Add one">+</button></div>
                  </div>
                  <div className="li-end"><b>{fmt(base(p.price) * BigInt(l.qty))}</b><button className="link" onClick={() => setQty(l.sku, 0)}>Remove</button></div>
                </div>
              ) })}
            </div>
            <div className="summary">
              <div><span>Subtotal</span><span>{fmt(total)} USDT</span></div>
              <div><span>Shipping</span><span className="free">Free</span></div>
              <div><span>Network fee</span><span className="free">0 · paid by WhitePay</span></div>
              <div className="sum-total"><span>Total</span><span>{fmt(total)} USDT</span></div>
              <div className="pin-wrap pay-wrap">
                <Pin n="②" title="cart checkout: same button, items payload" />
                <whitepay-button order-endpoint="/api/create-order" payload={JSON.stringify({ items: cart })} data-items={JSON.stringify(cart)} label={`Pay ${fmt(total)} USDT with WhitePay`} />
              </div>
              <p className="secure">🔒 Price signed by our server · you approve with your fingerprint in WhitePay</p>
            </div>
          </>
        )}
      </aside>

      {/* order confirmation */}
      {paid && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label="Order confirmed">
          <div className="modal">
            <div className="confetti" aria-hidden>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ left: `${(i * 53) % 100}%`, animationDelay: `${(i % 6) * 0.08}s`, background: ["#e9a23b", "#c2562b", "#5b7a4a", "#2448ff"][i % 4] }} />)}</div>
            <div className="ok-ring">✓</div>
            <h3>Thank you! Order confirmed.</h3>
            <p className="muted">Order #{paid.p.orderId.slice(2, 10).toUpperCase()} · {fmt(BigInt(paid.p.amount))} USDT</p>
            {paid.items.length > 0 && <ul className="mini">{paid.items.map((l) => <li key={l.sku}><span>{byS[l.sku]?.name} × {l.qty}</span><b>{fmt(base(PRICE[l.sku]) * BigInt(l.qty))}</b></li>)}</ul>}
            <div className={`verify ${verified}`}>{verified === "checking" ? <><span className="spin" /> Our server is confirming your payment on Whitechain…</> : verified === "ok" ? "✓ Payment confirmed on-chain. We're packing your order." : "We couldn't confirm it yet. We'll retry automatically."}</div>
            <div className="modal-cta">
              {paid.p.explorer && <a className="btn btn-light" href={paid.p.explorer} target="_blank" rel="noopener noreferrer">View receipt on Whitechain ↗</a>}
              <button className="btn btn-dark" onClick={() => setPaid(null)}>Continue shopping</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast} {toast.includes("bag") && <button onClick={() => { setDrawer(true); setToast("") }}>View bag</button>}</div>}

      <button className={`dev-fab ${dev ? "hide" : ""}`} onClick={() => setDev(true)} aria-label="Open developer view"><span>{"</>"}</span> Developer view{logs.length > 1 && <i>{logs.length}</i>}</button>
      <div className={`scrim ${dev ? "on" : ""}`} onClick={() => setDev(false)} aria-hidden />
      <DevPanel open={dev} onClose={() => setDev(false)} logs={logs} inspect={inspect} setInspect={setInspect} />
    </div>
  )
}
