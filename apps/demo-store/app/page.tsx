"use client"
import { useEffect, useRef, useState } from "react"
import { LINES } from "@/lib/integration-lines"
import { REPO, SDK_SRC, SDK_SRI, WHITEPAY_URL } from "@/lib/sdk"

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "whitepay-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { "order-endpoint"?: string; payload?: string; label?: string; mode?: "subscribe" }
    }
  }
}

const PRODUCTS = [
  { sku: "chai-kit", name: "Masala Chai Kit", price: "2.50", emoji: "🫖", tint: "#f6e3c9", blurb: "Assam CTC, cardamom, ginger, clove. Brews 20 cups." },
  { sku: "tote-bag", name: "Chai & Co. Tote", price: "1.20", emoji: "👜", tint: "#e3ecd9", blurb: "Organic cotton, hand block-printed in Jaipur." },
  { sku: "sticker-pack", name: "Sticker Pack", price: "0.40", emoji: "✨", tint: "#e7e2f6", blurb: "Six waterproof vinyl stickers for your laptop." },
]

type Sub = { mandateKey: string; subscriber?: string; amount: string; cycles: number }
type Paid = { orderId: string; txHash?: string; explorer?: string; amount: string; entityKey: string }
type Log = { at: number; src: "sdk" | "server" | "chain"; msg: string; tone?: "ok" | "bad" }

const POINTS = [
  { n: "①", where: "Browser", title: "Load the SDK", code: `<script src="${SDK_SRC}"\n  integrity="${SDK_SRI.slice(0, 22)}…" crossorigin="anonymous" defer></script>`, why: "One tag. Pinned with Subresource Integrity, so a modified SDK file is refused by the browser." },
  { n: "②", where: "Browser", title: "Place the button + listen", code: `<whitepay-button order-endpoint="/api/create-order"\n  payload='{"sku":"chai-kit"}' label="Pay 2.50 USDT" />\n\ndocument.addEventListener("whitepay:paid", e => …)`, why: "A standard web component: works in React, Vue, Svelte, WordPress or plain HTML." },
  { n: "③", where: "Your server", title: "Sign the order", code: `const order = await createWhitePayOrder({\n  merchantKey: process.env.STORE_MERCHANT_PK,\n  amount: CATALOG[sku],          // price from the server\n  webhook: \`\${STORE_URL}/api/webhook\` })`, why: "The shop key signs amount + order id + deadline (EIP-712). The browser can't change the price." },
  { n: "④", where: "Your server", title: "Receive the webhook", code: `const auth = await verifyWhitePayWebhook({ rawBody, headers })\nif (!auth.ok) return 401        // forged / replayed\nconst v = await verifyWhitePayPayment({ txHash, merchant, orderId })\nif (v.ok) fulfil(orderId)        // money confirmed on-chain`, why: "Signed + timestamped + de-duplicated, then the money itself is checked on Whitechain." },
  { n: "⑤", where: "Your server", title: "Thank-you check (optional)", code: `GET /api/verify?tx=0x…&orderId=0x…\n→ { ok: true, payer, amount, block }`, why: "Trustless receipt from the tx hash; no WhitePay API needed." },
]

const SNIPPETS: Record<string, string> = {
  "Plain HTML": `<script src="${SDK_SRC}" integrity="${SDK_SRI}" crossorigin="anonymous" defer></script>\n<whitepay-button order-endpoint="/api/create-order" payload='{"sku":"chai-kit"}'></whitepay-button>\n<script>\n  document.addEventListener("whitepay:paid", (e) => location.href = "/thanks?tx=" + e.detail.txHash)\n</script>`,
  React: `useEffect(() => {\n  const s = Object.assign(document.createElement("script"), { src: "${SDK_SRC}", integrity: "${SDK_SRI}", crossOrigin: "anonymous" })\n  document.head.append(s)\n}, [])\n\nreturn <whitepay-button order-endpoint="/api/create-order" payload={JSON.stringify({ sku })} />`,
  Vue: `<!-- vite.config: compilerOptions.isCustomElement = t => t.startsWith("whitepay-") -->\n<whitepay-button order-endpoint="/api/create-order" :payload="JSON.stringify({ sku })"\n  @whitepay:paid="onPaid" />`,
  WordPress: `// functions.php\nwp_enqueue_script("whitepay", "${SDK_SRC}", [], null, true);\nadd_shortcode("whitepay", fn($a) => '<whitepay-button order-endpoint="/wp-json/shop/v1/order" payload=\\'{"sku":"'.esc_attr($a["sku"]).'"}\\'></whitepay-button>');`,
  "Server (Node)": `import { createWhitePayOrder, verifyWhitePayWebhook, verifyWhitePayPayment } from "@whitepay/checkout/server"\n// any Node / Bun / Deno / edge runtime: Express, Fastify, Next.js, Hono…`,
}

const gh = (n: string) => (LINES[n] ? `${REPO}/${LINES[n].file}#L${LINES[n].line}` : REPO)
const loc = (n: string) => (LINES[n] ? `${LINES[n].file}:${LINES[n].line}` : "")
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })

export default function Store() {
  const [inspect, setInspect] = useState(false)
  const [paid, setPaid] = useState<Paid | null>(null)
  const [verified, setVerified] = useState<"" | "checking" | "ok" | "bad">("")
  const [logs, setLogs] = useState<Log[]>([])
  const [tab, setTab] = useState("Plain HTML")
  const [sdkReady, setSdkReady] = useState(false)
  const seenServer = useRef(new Set<string>())
  const [sub, setSub] = useState<Sub | null>(null)
  const push = (l: Omit<Log, "at">) => setLogs((x) => [{ ...l, at: Date.now() }, ...x].slice(0, 40))

  useEffect(() => {
    const ready = () => setSdkReady(!!customElements.get("whitepay-button"))
    customElements.whenDefined("whitepay-button").then(() => { ready(); push({ src: "sdk", msg: `SDK v${(window as any).WhitePay?.version ?? "?"} loaded from ${new URL(SDK_SRC).host} (integrity verified)`, tone: "ok" }) })
    // WhitePay events (part of integration point ②)
    const on = (name: string, f: (d: any) => void) => { const h = (e: Event) => f((e as CustomEvent).detail); document.addEventListener(name, h); return () => document.removeEventListener(name, h) }
    const offs = [
      on("whitepay:created", (d) => push({ src: "sdk", msg: `whitepay:created · order on Arkiv ${d.entityKey.slice(0, 10)}… · QR expires ${time(d.deadline * 1000)}` })),
      on("whitepay:paid", (d: Paid) => { push({ src: "sdk", msg: `whitepay:paid · ${Number(d.amount) / 1e6} USDT · tx ${d.txHash?.slice(0, 10)}…`, tone: "ok" }); setPaid(d) }),
      on("whitepay:expired", () => push({ src: "sdk", msg: "whitepay:expired · request removed from Arkiv", tone: "bad" })),
      on("whitepay:subscribed", (d: Sub) => { push({ src: "sdk", msg: `whitepay:subscribed · autopay mandate ${d.mandateKey.slice(0, 10)}… · first ${Number(d.amount) / 1e6} USDT paid`, tone: "ok" }); setSub(d) }),
      on("whitepay:error", (d) => push({ src: "sdk", msg: `whitepay:error · ${d.message}`, tone: "bad" })),
    ]
    return () => offs.forEach((f) => f())
  }, [])

  // after payment: our server re-checks the chain, and we show what the webhook handler did
  useEffect(() => {
    if (!paid?.txHash) return
    setVerified("checking")
    fetch(`/api/verify?tx=${paid.txHash}&orderId=${paid.orderId}`).then((r) => r.json()).then((v) => {
      setVerified(v.ok ? "ok" : "bad")
      push({ src: "chain", msg: v.ok ? `on-chain ✓ PaymentSettled in block ${v.block} · payer ${v.payer.slice(0, 8)}…` : `on-chain check failed: ${v.reason}`, tone: v.ok ? "ok" : "bad" })
    })
    let n = 0
    const t = setInterval(async () => {
      const d = await fetch(`/api/order-status?orderId=${paid.orderId}`).then((r) => r.json()).catch(() => null)
      for (const e of d?.events ?? []) {
        const k = `${e.at}${e.msg}`
        if (seenServer.current.has(k)) continue
        seenServer.current.add(k)
        push({ src: "server", msg: e.msg, tone: e.msg.includes("✓") ? "ok" : undefined })
      }
      if (++n > 10 || (d?.events ?? []).some((e: any) => e.msg.startsWith("webhook"))) clearInterval(t)
    }, 1500)
    return () => clearInterval(t)
  }, [paid])

  // autopay: the shop's server receives a signed webhook for every cycle; show them as they land
  useEffect(() => {
    if (!sub) return
    const t = setInterval(async () => {
      // demo speed-up: nudge WhitePay's keeper (it also runs on its own cron); fire-and-forget
      fetch(`${WHITEPAY_URL}/api/autopay/tick`, { mode: "no-cors", credentials: "omit" }).catch(() => {})
      const d = await fetch(`/api/order-status?mandateKey=${sub.mandateKey}`).then((r) => r.json()).catch(() => null)
      for (const e of d?.events ?? []) {
        const k = `${e.at}${e.msg}`
        if (seenServer.current.has(k)) continue
        seenServer.current.add(k)
        push({ src: "server", msg: e.msg, tone: "ok" })
      }
    }, 5000)
    const stop = setTimeout(() => clearInterval(t), 9 * 60_000)
    return () => { clearInterval(t); clearTimeout(stop) }
  }, [sub])

  return (
    <div className={inspect ? "inspect" : ""}>
      <div className="demo-bar">
        <span>🧪 Demo merchant site. It is <b>not</b> WhitePay: it embeds the <b>WhitePay Checkout SDK</b>, like any shop would.</span>
        <button className="toggle" aria-pressed={inspect} onClick={() => setInspect((v) => !v)}>
          <span className="dot" /> {inspect ? "Hide" : "Show"} integration points
        </button>
      </div>

      {inspect && (
        <aside className="legend" aria-label="Integration points">
          <b>WhitePay in this site</b>
          {POINTS.map((p) => (
            <a key={p.n} href={gh(p.n)} target="_blank" rel="noopener noreferrer"><span className="num">{p.n}</span><span>{p.title}<small>{loc(p.n)}</small></span></a>
          ))}
        </aside>
      )}

      <header className="nav">
        <div className="brand"><span className="logo">☕</span> Chai &amp; Co.</div>
        <nav><a href="#shop">Shop</a><a href="#how">How it's integrated</a><a href="#universal">Any website</a><a href="#security">Security</a></nav>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">Small-batch chai from Mumbai</div>
          <h1>Pay in USDT.<br />No gas. No wallet pop-ups.</h1>
          <p>Scan the WhitePay QR with your phone, confirm with your fingerprint, done. Settled on Whitechain in about a second, receipt stored on Arkiv, paid to <b>demo-store.whitepay.eth</b>.</p>
          <div className="chips"><span>⚡ ~1 s settlement</span><span>⛽ 0 gas for you</span><span>🔏 Signed orders</span><span>🧾 On-chain receipt</span></div>
        </div>
        <div className="hero-card" aria-hidden>
          <div className="steam">🫖</div>
          <div className="price">from 0.40 <small>USDT</small></div>
        </div>
      </section>

      {paid && (
        <section className={`thanks ${verified}`}>
          <div className="big">✓</div>
          <div>
            <h2>Thank you! Your order is paid.</h2>
            <p>{verified === "checking" ? "Our server is confirming it on Whitechain…" : verified === "ok" ? "Our server confirmed the payment on-chain. We're packing your order." : verified === "bad" ? "We couldn't confirm it on-chain yet. We'll retry." : ""}</p>
            {paid.explorer && <a href={paid.explorer} target="_blank" rel="noopener noreferrer">View the transaction on Whitechain ↗</a>}
          </div>
        </section>
      )}

      <section id="shop" className="grid">
        {PRODUCTS.map((p) => (
          <article key={p.sku} className="product">
            <div className="art" style={{ background: p.tint }}>{p.emoji}</div>
            <h3>{p.name}</h3>
            <p>{p.blurb}</p>
            <div className="row"><div className="price">{p.price} <small>USDT</small></div></div>
            <div className="pin-wrap">
              {inspect && <a className="pin" href={gh("②")} target="_blank" rel="noopener noreferrer" title={`app/page.tsx: <whitepay-button>`}>②</a>}
              {/* ── WHITEPAY INTEGRATION ② ── the checkout button: one element per product */}
              <whitepay-button order-endpoint="/api/create-order" payload={JSON.stringify({ sku: p.sku })} label={`Pay ${p.price} USDT`} />
            </div>
          </article>
        ))}
        {!sdkReady && <div className="sdk-wait">Loading WhitePay Checkout…</div>}
      </section>

      <section className="club">
        <div>
          <div className="eyebrow">New · Autopay</div>
          <h2>Chai Club: a fresh blend, on autopay</h2>
          <p>Approve once with your fingerprint. WhitePay charges <b>0.10 USDT every 2 minutes</b> (demo speed; real plans run monthly) for 3 payments. Each payment is time-locked on-chain and you can cancel anytime from WhitePay → You → Autopay.</p>
          {sub && <p className="club-on">✓ Autopay on · watch each payment arrive in the console below</p>}
        </div>
        <div className="pin-wrap club-btn">
          {inspect && <a className="pin" href={gh("②")} target="_blank" rel="noopener noreferrer" title="same button, mode=subscribe">②</a>}
          <whitepay-button mode="subscribe" order-endpoint="/api/create-subscription" label="Subscribe · 0.10 USDT / 2 min" />
        </div>
      </section>

      <section className="console" aria-live="polite">
        {inspect && <a className="pin pin-abs" href={gh("④")} target="_blank" rel="noopener noreferrer" title="server webhook handler">③④</a>}
        <div className="console-head"><b>Live integration console</b><span>SDK events · this shop's server · Whitechain</span></div>
        {logs.length === 0 ? <div className="console-empty">Tap a Pay button and watch the SDK, the shop's server and the chain report in.</div> :
          logs.map((l, i) => (
            <div key={i} className={`line ${l.tone ?? ""}`}><span className="t">{time(l.at)}</span><span className={`src ${l.src}`}>{l.src}</span><span>{l.msg}</span></div>
          ))}
      </section>

      <section id="how" className="how">
        <h2>Exactly where WhitePay is integrated</h2>
        <p className="lead">Five touch points, about 20 lines. Each one links to the exact line in this store's source. Turn on <b>Show integration points</b> to see them on the page.</p>
        <div className="flow">
          {POINTS.map((p) => (
            <div key={p.n} className="point">
              <div className="point-head">
                <span className="num">{p.n}</span>
                <div><div className="where">{p.where}</div><div className="title">{p.title}</div></div>
              </div>
              <pre>{p.code}</pre>
              <p>{p.why}</p>
              <a href={gh(p.n)} target="_blank" rel="noopener noreferrer" className="src-link">{loc(p.n) || "source"} ↗</a>
            </div>
          ))}
        </div>
        <div className="seq">
          <div><b>Shopper</b> taps Pay</div><span>→</span>
          <div><b>Shop server</b> signs order ③</div><span>→</span>
          <div><b>WhitePay</b> stores it on Arkiv, shows QR</div><span>→</span>
          <div><b>Phone</b> fingerprint, gasless pay</div><span>→</span>
          <div><b>Whitechain</b> settles</div><span>→</span>
          <div><b>Shop server</b> signed webhook + on-chain ✓ ④</div>
        </div>
      </section>

      <section id="universal" className="universal">
        <h2>One SDK, any website</h2>
        <p className="lead">The button is a standard Web Component and the server kit is plain TypeScript, so the same two pieces work on every stack.</p>
        <div className="tabs" role="tablist">
          {Object.keys(SNIPPETS).map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{k}</button>)}
        </div>
        <pre className="snippet">{SNIPPETS[tab]}</pre>
        <p className="lead">See it with zero framework: <a href="/plain.html">the same checkout on a plain HTML page</a> · <a href={`${WHITEPAY_URL}/developers`} target="_blank" rel="noopener noreferrer">full SDK docs ↗</a></p>
      </section>

      <section id="security" className="security">
        <h2>Security, layer by layer</h2>
        <div className="sec-grid">
          {[
            ["Price tampering", "Prices live on the shop's server; the shop key signs amount + order id + deadline (EIP-712). The router contract rejects any other amount."],
            ["Forged / replayed webhooks", "Every webhook is signed by WhitePay's key with a timestamp; older than 5 min or bad signature = 401. Event ids are de-duplicated."],
            ["Fake \"paid\" in the browser", "The browser event is only a UI hint. Fulfilment happens after the shop's server sees PaymentSettled on Whitechain."],
            ["Tampered SDK / supply chain", "The SDK is pinned with Subresource Integrity (sha384). A changed file is refused by the browser."],
            ["XSS & injected scripts", "Strict nonce-based CSP with 'strict-dynamic'; the SDK writes network data with textContent only and validates every field."],
            ["Clickjacking", "frame-ancestors 'none' + X-Frame-Options DENY on the store and on WhitePay."],
            ["SSRF via webhook URLs", "WhitePay only calls https:443 hostnames that resolve to public IPs, re-checked before every delivery, no redirects."],
            ["Spam / brute force / drain", "Per-IP rate limits on every API, 16–32 KB body caps, JSON-only writes, cross-site POSTs blocked, relayer per-payer limits."],
            ["Double spend / double refund", "EIP-3009 nonces are single-use on-chain; refunds go only to the original payer and are capped at what was paid."],
            ["Key theft", "The shop key never reaches the browser; shoppers' keys never leave their phone (PIN / fingerprint encrypted)."],
          ].map(([t, d]) => <div key={t} className="sec"><b>{t}</b><span>{d}</span></div>)}
        </div>
      </section>

      <footer className="foot">
        Chai &amp; Co. is a demo merchant for WhitePay (ETHGlobal). Testnet USDT on Whitechain Sepolia. ·
        <a href={REPO} target="_blank" rel="noopener noreferrer"> Store source ↗</a>
      </footer>
    </div>
  )
}
