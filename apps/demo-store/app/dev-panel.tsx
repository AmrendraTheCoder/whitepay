"use client"
// Developer view: everything a judge / integrator wants to see, kept out of the shopper's way.
import { useState } from "react"
import { LINES } from "@/lib/integration-lines"
import { REPO, SDK_SRC, SDK_SRI } from "@/lib/sdk"

export type Log = { at: number; src: "sdk" | "server" | "chain"; msg: string; tone?: "ok" | "bad" }

export const POINTS = [
  { n: "①", where: "Browser", title: "Load the SDK", code: `<script src="${SDK_SRC}"\n  integrity="${SDK_SRI.slice(0, 22)}…" crossorigin="anonymous" defer></script>`, why: "One tag, pinned with Subresource Integrity: a modified SDK file is refused by the browser." },
  { n: "②", where: "Browser", title: "Button + events", code: `<whitepay-button order-endpoint="/api/create-order"\n  payload='{"items":[{"sku":"chai-kit","qty":2}]}' />\n\ndocument.addEventListener("whitepay:paid", e => …)`, why: "A standard Web Component: React, Vue, Svelte, WordPress or plain HTML." },
  { n: "③", where: "Server", title: "Sign the order", code: `const amount = sum(CATALOG[sku] × qty)   // server prices\nconst order = await createWhitePayOrder({\n  merchantKey: process.env.STORE_MERCHANT_PK, amount,\n  webhook: \`\${STORE_URL}/api/webhook\` })`, why: "The shop key signs amount, order id and deadline (EIP-712). The browser can't change the price." },
  { n: "④", where: "Server", title: "Signed webhook", code: `const auth = await verifyWhitePayWebhook({ rawBody, headers })\nif (!auth.ok) return 401          // forged / replayed\nconst v = await verifyWhitePayPayment({ txHash, merchant, orderId })\nif (v.ok) fulfil(orderId)          // money confirmed on-chain`, why: "Signature, 5-minute replay window, de-duplication, then the money itself is checked on Whitechain." },
  { n: "⑤", where: "Server", title: "Thank-you check", code: `GET /api/verify?tx=0x…&orderId=0x…\n→ { ok: true, payer, amount, block }`, why: "Trustless confirmation from the tx hash, with no WhitePay API needed." },
]

const SNIPPETS: Record<string, string> = {
  HTML: `<script src="${SDK_SRC}"\n  integrity="${SDK_SRI}" crossorigin="anonymous" defer></script>\n<whitepay-button order-endpoint="/api/create-order" payload='{"sku":"chai-kit"}'></whitepay-button>`,
  React: `useEffect(() => { document.head.append(Object.assign(document.createElement("script"),\n  { src: "${SDK_SRC}", integrity: "${SDK_SRI}", crossOrigin: "anonymous" })) }, [])\n\nreturn <whitepay-button order-endpoint="/api/create-order" payload={JSON.stringify({ sku })} />`,
  Vue: `<!-- compilerOptions.isCustomElement = t => t.startsWith("whitepay-") -->\n<whitepay-button order-endpoint="/api/create-order" :payload="JSON.stringify({ sku })" @whitepay:paid="onPaid" />`,
  WordPress: `wp_enqueue_script("whitepay", "${SDK_SRC}", [], null, true);\nadd_shortcode("whitepay", fn($a) => '<whitepay-button order-endpoint="/wp-json/shop/v1/order" payload=\\'{"sku":"'.esc_attr($a["sku"]).'"}\\'></whitepay-button>');`,
}

export const gh = (n: string) => (LINES[n] ? `${REPO}/${LINES[n].file}#L${LINES[n].line}` : REPO)
const loc = (n: string) => (LINES[n] ? `${LINES[n].file}:${LINES[n].line}` : "")
export const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })

export function DevPanel({ open, onClose, logs, inspect, setInspect }: { open: boolean; onClose: () => void; logs: Log[]; inspect: boolean; setInspect: (v: boolean) => void }) {
  const [tab, setTab] = useState<"live" | "points" | "stack" | "security">("live")
  return (
    <aside className={`dev ${open ? "open" : ""}`} aria-label="Developer view" aria-hidden={!open}>
      <div className="dev-head">
        <div><b>Developer view</b><span>How this store uses WhitePay</span></div>
        <button className="icon-btn" onClick={onClose} aria-label="Close developer view">✕</button>
      </div>
      <label className="dev-switch">
        <input type="checkbox" checked={inspect} onChange={(e) => setInspect(e.target.checked)} />
        <span className="track"><span /></span> Highlight integration points on the page
      </label>
      <div className="dev-tabs" role="tablist">
        {([["live", "Live console"], ["points", "Integration"], ["stack", "Any stack"], ["security", "Security"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}{k === "live" && logs.length > 0 && <i>{logs.length}</i>}</button>
        ))}
      </div>
      <div className="dev-body">
        {tab === "live" && (
          <div className="console" aria-live="polite">
            {logs.length === 0 ? <p className="muted">Add something to the bag and pay with WhitePay. The SDK, this shop's server and Whitechain report here in real time.</p> :
              logs.map((l, i) => <div key={i} className={`line ${l.tone ?? ""}`}><span className="t">{clock(l.at)}</span><span className={`src ${l.src}`}>{l.src}</span><span>{l.msg}</span></div>)}
          </div>
        )}
        {tab === "points" && (
          <div className="points">
            <p className="muted">Five touch points, about 20 lines. Each links to the exact line in this store's source.</p>
            {POINTS.map((p) => (
              <div key={p.n} className="point">
                <div className="point-head"><span className="num">{p.n}</span><div><small>{p.where}</small><b>{p.title}</b></div></div>
                <pre>{p.code}</pre>
                <p>{p.why}</p>
                <a href={gh(p.n)} target="_blank" rel="noopener noreferrer">{loc(p.n) || "source"} ↗</a>
              </div>
            ))}
          </div>
        )}
        {tab === "stack" && <StackTab />}
        {tab === "security" && (
          <ul className="sec">
            {[["Price tampering", "Prices live on the server and are signed by the shop key; the router contract settles only that amount."],
              ["Forged / replayed webhooks", "Signed by WhitePay with a timestamp; older than 5 minutes or a bad signature is a 401. Event ids are de-duplicated."],
              ["Fake \"paid\" in the browser", "The browser event is a UI hint; fulfilment waits for PaymentSettled on Whitechain."],
              ["Tampered SDK", "Immutable versioned file + Subresource Integrity (sha384)."],
              ["XSS / clickjacking", "Nonce-based CSP with strict-dynamic and frame-ancestors 'none'."],
              ["Order spam", "Per-IP rate limits, JSON-only writes, cross-site POSTs blocked."]].map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}
          </ul>
        )}
      </div>
      <div className="dev-foot">
        <a href="/plain.html">Same checkout in plain HTML</a>
        <a href="https://whitepay.vercel.app/developers" target="_blank" rel="noopener noreferrer">SDK docs ↗</a>
        <a href={REPO} target="_blank" rel="noopener noreferrer">Source ↗</a>
      </div>
    </aside>
  )
}

function StackTab() {
  const [k, setK] = useState("HTML")
  return (
    <div>
      <p className="muted">The same button and server kit work on every stack.</p>
      <div className="chips">{Object.keys(SNIPPETS).map((s) => <button key={s} aria-pressed={k === s} onClick={() => setK(s)}>{s}</button>)}</div>
      <pre>{SNIPPETS[k]}</pre>
    </div>
  )
}
