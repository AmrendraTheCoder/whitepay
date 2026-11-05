// WhitePay Checkout SDK docs: the universal, framework-free way to accept USDT on Whitechain.
import type { Metadata } from "next"
import { ButtonLink, CodeBlock, Section, SectionHeader } from "@whitepay/ui"
import { SDK_SRI } from "./sri"

export const metadata: Metadata = { alternates: { canonical: "/developers" }, title: "Developers · Checkout SDK", description: "Accept USDT on Whitechain on any website: one script tag, one button, signed webhooks." }

const ORIGIN = "https://whitepay.vercel.app"
const SRC = `${ORIGIN}/sdk/v1.2.1/checkout.js`
const Code = ({ children }: { children: string }) => <CodeBlock code={children} />

export default function Developers() {
  return (
    <Section>
      <SectionHeader level={1} eyebrow="Checkout SDK v1.2.1" title="Accept USDT on any website."
        description="One script tag, one button, one server call. Shoppers scan, confirm with their fingerprint and pay with no gas; you get a signed webhook and an on-chain receipt."
        actions={<><ButtonLink href="https://whitepay-demo-store.vercel.app" variant="highlight">Live demo store</ButtonLink><ButtonLink href="https://whitepay-demo-store.vercel.app/plain.html" variant="secondary">Plain HTML demo</ButtonLink><ButtonLink href="https://github.com/AmrendraTheCoder/whitepay/tree/main/packages/checkout" variant="ghost">Source</ButtonLink></>} />
      <div className="doc">

      <section>
        <h2><span className="doc-step">1</span>Load the SDK (browser)</h2>
        <p>Pin an exact version with Subresource Integrity: versioned files (<code>/sdk/v1.2.1/</code>) never change, and if the bytes ever differ the browser refuses to run them. <code>/sdk/v1/checkout.js</code> always serves the latest 1.x for quick prototypes (no SRI).</p>
        <Code>{`<script src="${SRC}"\n        integrity="${SDK_SRI}"\n        crossorigin="anonymous" defer></script>`}</Code>
        <p>Using a Content-Security-Policy? Allow <code>{ORIGIN}</code> in <code>script-src</code> (or put your nonce on the tag), <code>connect-src</code> and <code>img-src</code>.</p>
      </section>

      <section>
        <h2><span className="doc-step">2</span>Add the button</h2>
        <Code>{`<whitepay-button order-endpoint="/api/create-order"\n                 payload='{"sku":"chai-kit"}'\n                 label="Pay 2.50 USDT"></whitepay-button>\n\n<script>\n  document.addEventListener("whitepay:paid", (e) => showThanks(e.detail))\n</script>`}</Code>
        <div className="table-wrap"><table className="table"><tbody>
          <tr><td><code>order-endpoint</code></td><td>Your same-origin route that signs the order (step 3). Cross-origin endpoints are refused.</td></tr>
          <tr><td><code>payload</code></td><td>JSON sent to your endpoint (product id, cart id). Never the price.</td></tr>
          <tr><td><code>label</code></td><td>Button text.</td></tr>
          <tr><td><code>whitepay:created</code></td><td><code>{"{ entityKey, payUrl, deadline }"}</code> the order is live on Arkiv, QR shown</td></tr>
          <tr><td><code>whitepay:paid</code></td><td><code>{"{ entityKey, orderId, txHash, explorer, amount }"}</code> UI hint only: fulfil from the webhook</td></tr>
          <tr><td><code>whitepay:expired</code> / <code>whitepay:error</code></td><td>QR expired unpaid / something failed (<code>{"{ message }"}</code>)</td></tr>
        </tbody></table></div>
        <p>It is a standard Web Component, so it works in React, Next.js, Vue (<code>isCustomElement</code>), Svelte, Angular (<code>CUSTOM_ELEMENTS_SCHEMA</code>), WordPress, Shopify themes and plain HTML.</p>
      </section>

      <section>
        <h2><span className="doc-step">3</span>Sign the order (your server)</h2>
        <Code>{`import { createWhitePayOrder } from "@whitepay/checkout/server"\n\nconst CATALOG = { "chai-kit": "2.50" }            // prices live on the server\n\napp.post("/api/create-order", async (req, res) => {\n  const amount = CATALOG[req.body.payload?.sku]\n  if (!amount) return res.status(400).json({ error: "unknown product" })\n  res.json(await createWhitePayOrder({\n    merchantKey: process.env.SHOP_PK,               // your registered shop key, never in the browser\n    amount,\n    webhook: "https://shop.example/api/webhook",\n  }))\n})`}</Code>
        <p>Your shop key signs <code>merchant, amount, orderId, deadline</code> (EIP-712). The WhitePay router contract only settles that exact amount, to your payout address, once.</p>
      </section>

      <section>
        <h2 id="webhooks"><span className="doc-step">4</span>Fulfil from the webhook</h2>
        <Code>{`import { verifyWhitePayWebhook, verifyWhitePayPayment } from "@whitepay/checkout/server"\n\napp.post("/api/webhook", express.text({ type: "*/*" }), async (req, res) => {\n  const auth = await verifyWhitePayWebhook({ rawBody: req.body, headers: new Headers(req.headers) })\n  if (!auth.ok) return res.status(401).end()          // forged, tampered or replayed\n  if (await db.seen(auth.eventId)) return res.end()   // idempotent\n  const { txHash, orderId, amount } = auth.event\n  const v = await verifyWhitePayPayment({ txHash, merchant: SHOP, orderId, minAmount: BigInt(amount) })\n  if (v.ok) await fulfil(orderId)                      // money confirmed on Whitechain\n  res.end()\n})`}</Code>
        <div className="table-wrap"><table className="table"><tbody>
          <tr><td><code>x-whitepay-signature</code></td><td>EIP-191 signature of <code>whitepay-webhook:v1:&lt;timestamp&gt;:&lt;keccak256(body)&gt;</code></td></tr>
          <tr><td><code>x-whitepay-timestamp</code></td><td>Unix seconds; rejected if older than 5 minutes</td></tr>
          <tr><td><code>x-whitepay-event-id</code></td><td>Unique per payment: de-duplicate on it</td></tr>
          <tr><td>Signer</td><td><code>0x27d2F6770F18E1C0Eefc129124747407Ef44aBe1</code> (also at <a href="/api/webhook-key">/api/webhook-key</a>)</td></tr>
        </tbody></table></div>
      </section>

      <section>
        <h2><span className="doc-step">5</span>Subscriptions (Autopay)</h2>
        <p>Same button, <code>mode="subscribe"</code>. The shopper approves once with their fingerprint; WhitePay charges every period with zero gas and sends you a signed webhook per payment.</p>
        <Code>{`<whitepay-button mode="subscribe" order-endpoint="/api/create-subscription"\n                 label="Subscribe · 4.99 USDT / month"></whitepay-button>\n\n// server\nimport { createWhitePaySubscription } from "@whitepay/checkout/server"\napp.post("/api/create-subscription", async (_req, res) => res.json(await createWhitePaySubscription({\n  merchantKey: process.env.SHOP_PK, title: "Pro plan", amount: "4.99", period: "monthly", cycles: 12,\n  webhook: "https://shop.example/api/webhook",   // subscription.started | charged | completed | cancelled | failed\n})))`}</Code>
        <ul className="doc-list">
          <li><b>One signature:</b> the shopper signs a single EIP-2612 <code>permit</code> to a tiny contract made only for their subscription. Its address commits to every term, so one wallet prompt approves exactly that shop, amount, period and number of payments.</li>
          <li><b>How it runs:</b> each upcoming payment is an Arkiv entity whose expiry is its countdown. At 0 the keeper calls the contract's <code>charge()</code>, deletes the entity and creates the next one.</li>
          <li><b>Hard limits on-chain:</b> never early, never late (missed windows are skipped), never more than amount × cycles, never to anyone but you.</li>
          <li><b>Cancel:</b> one signature switches the subscription's contract off; you can also cancel from your side.</li>
          <li><b>Verify charges:</b> the contract emits <code>Charged(cycle, amount)</code>; the webhook carries the tx hash.</li>
        </ul>
      </section>

      <section>
        <h2>Security model</h2>
        <ul className="doc-list">
          <li><b>Price tampering:</b> impossible from the browser. The amount is in the shop-signed order and enforced by the contract.</li>
          <li><b>Fake payments:</b> the browser event is only a hint; fulfilment needs a signed webhook <i>and</i> a <code>PaymentSettled</code> event on-chain.</li>
          <li><b>Replay:</b> EIP-3009 nonces are single-use on-chain; webhooks expire after 5 minutes and carry an event id.</li>
          <li><b>Supply chain:</b> versioned SDK path + SRI hash. The SDK never touches keys or money.</li>
          <li><b>XSS in the SDK:</b> every network value is regex-validated and written with <code>textContent</code>; links use <code>noopener noreferrer</code>.</li>
          <li><b>SSRF:</b> webhooks only go to https:443 hostnames resolving to public IPs, re-checked before every send, redirects not followed.</li>
          <li><b>Abuse:</b> per-IP rate limits, JSON-only writes, body caps, cross-site POST blocking and per-payer relayer limits on WhitePay.</li>
          <li><b>Refunds:</b> only from your payout wallet, only to the original payer, capped at the amount paid (on-chain).</li>
        </ul>
      </section>
      <footer className="wp-note">Whitechain Sepolia testnet · official USDT <code>0xcedf…55a7</code> · receipts on Arkiv · names on ENS</footer>
      </div>
    </Section>
  )
}
