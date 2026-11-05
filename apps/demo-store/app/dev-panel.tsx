"use client"
// Developer view: how this store uses WhitePay, kept out of the shopper's way in a left drawer.
import { useState } from "react"
import { Badge, ButtonLink, CodeBlock, Drawer, Tabs } from "@whitepay/ui"
import { LINES } from "@/lib/integration-lines"
import { REPO, SDK_SRC, SDK_SRI } from "@/lib/sdk"

export type Log = { at: number; src: "sdk" | "server" | "chain"; msg: string; tone?: "ok" | "bad" }

export const POINTS = [
  { n: "1", where: "Browser", title: "Load the SDK", marker: "①", code: `<script src="${SDK_SRC}"\n  integrity="${SDK_SRI.slice(0, 22)}…" crossorigin="anonymous" defer></script>`, why: "One tag, pinned with Subresource Integrity, so a modified SDK file is refused by the browser." },
  { n: "2", where: "Browser", title: "Button and events", marker: "②", code: `<whitepay-button order-endpoint="/api/create-order"\n  payload='{"items":[{"sku":"chai-kit","qty":2}]}' />\n\ndocument.addEventListener("whitepay:paid", (e) => …)`, why: "A standard Web Component: works in React, Vue, Svelte, WordPress or plain HTML." },
  { n: "3", where: "Server", title: "Sign the order", marker: "③", code: `const amount = sum(CATALOG[sku] × qty)   // server-side prices\nconst order = await createWhitePayOrder({\n  merchantKey: process.env.STORE_MERCHANT_PK, amount,\n  webhook: \`\${STORE_URL}/api/webhook\` })`, why: "The shop key signs amount, order id and deadline (EIP-712). The browser cannot change the price." },
  { n: "4", where: "Server", title: "Verify the webhook", marker: "④", code: `const auth = await verifyWhitePayWebhook({ rawBody, headers })\nif (!auth.ok) return 401           // forged or replayed\nconst v = await verifyWhitePayPayment({ txHash, merchant, orderId })\nif (v.ok) fulfil(orderId)           // money confirmed on-chain`, why: "Signature, 5-minute replay window and de-duplication, then the payment itself is checked on Whitechain." },
  { n: "5", where: "Server", title: "Confirm on the thank-you page", marker: "⑤", code: `GET /api/verify?tx=0x…&orderId=0x…\n→ { ok: true, payer, amount, block }`, why: "Trustless confirmation from the transaction hash, with no call to WhitePay." },
]

const SNIPPETS: Record<string, string> = {
  HTML: `<script src="${SDK_SRC}"\n  integrity="${SDK_SRI}" crossorigin="anonymous" defer></script>\n<whitepay-button order-endpoint="/api/create-order" payload='{"sku":"chai-kit"}'></whitepay-button>`,
  React: `useEffect(() => {\n  document.head.append(Object.assign(document.createElement("script"),\n    { src: "${SDK_SRC}", integrity: "${SDK_SRI}", crossOrigin: "anonymous" }))\n}, [])\n\nreturn <whitepay-button order-endpoint="/api/create-order" payload={JSON.stringify({ sku })} />`,
  Vue: `<!-- compilerOptions.isCustomElement = (t) => t.startsWith("whitepay-") -->\n<whitepay-button order-endpoint="/api/create-order" :payload="JSON.stringify({ sku })" @whitepay:paid="onPaid" />`,
  WordPress: `wp_enqueue_script("whitepay", "${SDK_SRC}", [], null, true);\nadd_shortcode("whitepay", fn($a) => '<whitepay-button order-endpoint="/wp-json/shop/v1/order" payload=\\'{"sku":"'.esc_attr($a["sku"]).'"}\\'></whitepay-button>');`,
}

export const gh = (marker: string) => (LINES[marker] ? `${REPO}/${LINES[marker].file}#L${LINES[marker].line}` : REPO)
const loc = (marker: string) => (LINES[marker] ? `${LINES[marker].file}:${LINES[marker].line}` : "")
export const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })

const SRC_TONE = { sdk: "highlight", server: "success", chain: "neutral" } as const

export function DevPanel({ open, onClose, logs, inspect, setInspect }: { open: boolean; onClose: () => void; logs: Log[]; inspect: boolean; setInspect: (v: boolean) => void }) {
  const [snippet, setSnippet] = useState("HTML")
  return (
    <Drawer open={open} onClose={onClose} side="left" theme="ink" title="Developer view" description="How this store uses WhitePay"
      footer={<div className="wp-cluster"><ButtonLink href="/plain.html" variant="ghost" size="sm">Plain HTML version</ButtonLink><ButtonLink href="https://whitepay.vercel.app/developers" variant="ghost" size="sm">SDK docs</ButtonLink><ButtonLink href={REPO} variant="ghost" size="sm">Source</ButtonLink></div>}>
      <label className="switch">
        <input type="checkbox" role="switch" checked={inspect} onChange={(e) => setInspect(e.target.checked)} />
        <span className="switch-track" aria-hidden><span /></span>
        Highlight integration points on the page
      </label>
      <Tabs label="Developer view sections" items={[
        { id: "live", label: "Live log", badge: logs.length || undefined, content: (
          <div className="log" role="log" aria-live="polite" aria-label="Integration events">
            {logs.length === 0
              ? <p className="wp-muted">Add something to the bag and pay with WhitePay. Events from the SDK, this store's server and Whitechain appear here.</p>
              : logs.map((l, i) => (
                <div key={i} className="log-line" data-tone={l.tone}>
                  <time>{clock(l.at)}</time><Badge tone={SRC_TONE[l.src]}>{l.src}</Badge><span>{l.msg}</span>
                </div>
              ))}
          </div>
        ) },
        { id: "points", label: "Integration", content: (
          <ol className="points">
            {POINTS.map((p) => (
              <li key={p.n}>
                <div className="point-head"><span className="point-n">{p.n}</span><div><small>{p.where}</small><b>{p.title}</b></div></div>
                <CodeBlock code={p.code} label={p.title} />
                <p className="wp-muted">{p.why}</p>
                <a className="point-src" href={gh(p.marker)} target="_blank" rel="noopener noreferrer">{loc(p.marker) || "View source"}</a>
              </li>
            ))}
          </ol>
        ) },
        { id: "stack", label: "Any stack", content: (
          <div className="wp-stack">
            <p className="wp-muted">The same button and server kit work on every stack.</p>
            <div className="wp-cluster" role="radiogroup" aria-label="Framework">
              {Object.keys(SNIPPETS).map((k) => <button key={k} type="button" role="radio" aria-checked={snippet === k} className="wp-btn" data-variant={snippet === k ? "highlight" : "secondary"} data-size="sm" onClick={() => setSnippet(k)}>{k}</button>)}
            </div>
            <CodeBlock code={SNIPPETS[snippet]} label={`${snippet} example`} />
          </div>
        ) },
      ]} />
    </Drawer>
  )
}
