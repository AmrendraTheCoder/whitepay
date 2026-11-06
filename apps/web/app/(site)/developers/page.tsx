// WondrPay Checkout SDK docs: the universal, framework-free way to accept USDT on Whitechain.
import type { Metadata } from "next"
import { ButtonLink, CodeBlock, Section, SectionHeader } from "@whitepay/ui"
import { SDK_SRI } from "./sri"

export const metadata: Metadata = { alternates: { canonical: "/developers" }, title: "Developers · API & Checkout SDK", description: "Accept USDT on Whitechain on any website: API keys from the WondrPay Business portal, hosted checkout, a Pay button and signed webhooks." }

const ORIGIN = "https://wondrpay.vercel.app"
const SRC = `${ORIGIN}/sdk/v1.4.0/checkout.js`
const Code = ({ children }: { children: string }) => <CodeBlock code={children} />

export default function Developers() {
  return (
    <Section>
      <SectionHeader level={1} eyebrow="API v1 · Checkout SDK v1.4.0" title="Accept USDT on any website."
        description="Get API keys in the WondrPay Business portal, create a checkout session from your server and send the customer to WondrPay's hosted checkout. They pay with no gas; the money lands in your own wallet and you get a signed webhook."
        actions={<><ButtonLink href="/portal" variant="highlight">Get API keys</ButtonLink><ButtonLink href="https://wondrpay-demo-store.vercel.app" variant="secondary">Live demo store</ButtonLink><ButtonLink href="https://wondrpay-demo-store.vercel.app/plain.html" variant="secondary">Plain HTML demo</ButtonLink><ButtonLink href="https://github.com/AmrendraTheCoder/whitepay/tree/main/packages/checkout" variant="ghost">Source</ButtonLink></>} />
      <div className="doc">

      <nav className="doc-toc" aria-label="On this page">
        <a href="#api">API keys (recommended)</a><a href="#auth">Authentication</a><a href="#sessions">Checkout sessions</a>
        <a href="#hosted">Hosted checkout</a><a href="#button-api">Pay button + API keys</a><a href="#session-webhooks">Webhooks</a>
        <a href="#links">Payment links</a><a href="#refunds">Refunds API</a><a href="#node">Node helpers</a><a href="#woocommerce">WooCommerce</a><a href="#shopify">Shopify</a><a href="#team">Team</a><a href="#errors">Errors & limits</a><a href="#sdk">Sign orders yourself</a><a href="#security">Security</a>
      </nav>

      <section id="api">
        <h2><span className="doc-step">A</span>API keys: how it fits together</h2>
        <ol className="doc-list">
          <li><b>Open the <a href="/portal">WondrPay Business portal</a></b>, pick (or create) the wallet that should receive the money, and set up your shop name.</li>
          <li><b>Add your website</b> with the domains your checkout runs on. Your wallet approves it once. You get a <b>publishable key</b> <code>wp_pk_test_…</code> and a <b>secret key</b> <code>wp_sk_test_…</code> (shown once).</li>
          <li><b>Your server creates a checkout session</b> with the secret key and sends the customer to <code>session.url</code>.</li>
          <li><b>The customer pays</b> in the WondrPay app, gasless. USDT settles on Whitechain straight to your payout wallet.</li>
          <li><b>You fulfil the order</b> from the signed <code>checkout.session.completed</code> webhook (or by retrieving the session). The customer lands back on your <code>successUrl</code>.</li>
        </ol>
        <p>Non-custodial by design: with a website switched on, WondrPay's order key signs orders for your shop, but the payment contract only ever pays your registered payout wallet. A leaked secret key can create checkouts; it can never move or redirect money. Switching off your last website hands order signing back to your wallet.</p>
      </section>

      <section id="auth">
        <h2><span className="doc-step">B</span>Authentication</h2>
        <div className="table-wrap"><table className="table"><tbody>
          <tr><td><code>wp_sk_test_…</code></td><td>Secret key. Server only, in an environment variable. Send as <code>Authorization: Bearer wp_sk_test_…</code>. Rotate any time in the portal (the old key stops at once).</td></tr>
          <tr><td><code>wp_pk_test_…</code></td><td>Publishable key. Safe in browser code; identifies your website.</td></tr>
          <tr><td><code>Idempotency-Key</code></td><td>Optional header on POST. Same key from the same website within 24 h returns the first session instead of making a new one.</td></tr>
          <tr><td>Test mode</td><td>All keys are test keys today: Whitechain Sepolia and test USDT. Live keys come with mainnet.</td></tr>
        </tbody></table></div>
      </section>

      <section id="sessions">
        <h2><span className="doc-step">C</span>Create a checkout session</h2>
        <p><code>POST {ORIGIN}/api/v1/checkout/sessions</code></p>
        <Code>{`curl ${ORIGIN}/api/v1/checkout/sessions \\
  -H "Authorization: Bearer $WONDRPAY_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order_1042" \\
  -d '{
    "amount": "12.40",
    "reference": "order_1042",
    "description": "Kulhad mug ×2",
    "successUrl": "https://shop.example.com/thank-you",
    "cancelUrl": "https://shop.example.com/cart"
  }'`}</Code>
        <div className="table-wrap"><table className="table"><thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead><tbody>
          <tr><td><code>amount</code></td><td>string, required</td><td>USDT as a decimal string, <code>"0.01"</code> to <code>"1000"</code>, up to 6 decimals. Numbers are accepted only if exact; send strings.</td></tr>
          <tr><td><code>reference</code></td><td>string</td><td>Your order id, 1-64 of <code>A-Z a-z 0-9 . _ - : # /</code>. Comes back in the webhook.</td></tr>
          <tr><td><code>description</code></td><td>string</td><td>Shown on the checkout (up to 120 characters). Public on Arkiv, so no personal data.</td></tr>
          <tr><td><code>successUrl</code> / <code>cancelUrl</code></td><td>URL</td><td>https on one of your website's domains (<code>http://localhost</code> allowed while testing). We add <code>wondrpay_session</code> and <code>wondrpay_status</code>.</td></tr>
          <tr><td><code>expiresIn</code></td><td>seconds</td><td>300-1800, default 900 (15 min). The price is locked until then.</td></tr>
        </tbody></table></div>
        <p>Response <code>201</code>:</p>
        <Code>{`{
  "id": "0x9f3c…e1",                  // the session id (= on-chain payment id)
  "object": "checkout.session",
  "status": "open",                   // open | paid | expired
  "amount": "12.40", "currency": "USDT",
  "reference": "order_1042",
  "url": "${ORIGIN}/checkout/0x9f3c…e1",   // send the customer here
  "payUrl": "${ORIGIN}/pay?req=0x9f3c…e1", // opens straight in the WondrPay app
  "expiresAt": 1793975000,
  "merchant": "0xAB…", "merchantName": "kesar.wondrpay.eth",
  "button": { "entityKey": "0x9f3c…e1", "payUrl": "…", "amount": "12400000", "deadline": "1793975000", "orderId": "0x…" }
}`}</Code>
        <h3>Retrieve a session</h3>
        <p><code>GET {ORIGIN}/api/v1/checkout/sessions/:id</code> with the same secret key. Returns the session with <code>status</code> and, once paid, <code>payment: {"{ txHash, payer, explorer }"}</code>. A key can only read its own website's sessions.</p>
        <Code>{`// Node.js / Next.js route: create, then redirect
const r = await fetch("${ORIGIN}/api/v1/checkout/sessions", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.WONDRPAY_SECRET_KEY}\`, "Content-Type": "application/json", "Idempotency-Key": cart.id },
  body: JSON.stringify({ amount: cart.totalUsdt, reference: cart.id, successUrl: "https://shop.example.com/thank-you" }),
})
if (!r.ok) throw new Error((await r.json()).error.message)
const session = await r.json()
return Response.redirect(session.url, 303)`}</Code>
      </section>

      <section id="hosted">
        <h2><span className="doc-step">D</span>Hosted checkout</h2>
        <p><code>/checkout/:id</code> shows your shop name (ENS), the World ID badge, the amount, your description and order reference, and a live countdown. On a computer it shows a QR for the WondrPay app; on a phone, a Pay button. It watches for the payment and then sends the customer to your <code>successUrl</code> after 5 seconds (they can stay). Expired or invalid sessions explain what happened and link back to <code>cancelUrl</code>.</p>
        <p>Customers pay with the WondrPay app (QR or <code>/pay</code>), or with <b>MetaMask or any browser wallet</b> right on the page: the wallet switches to Whitechain Sepolia, recomputes the order digest and signs one EIP-3009 authorization. It's a signature, not a transaction, so they pay no gas.</p>
        <p>Amounts are always in USDT. Next to them the page shows an estimate in the customer's own currency (for example <i>≈ ₹1,165</i>, from their browser's locale, at a rate refreshed every 10 minutes). It's for display only; nothing is converted.</p>
        <p>The page never signs anything or touches money itself. Wallets re-check the order against the on-chain registry before signing.</p>
      </section>

      <section id="button-api">
        <h2><span className="doc-step">E</span>Pay button with API keys</h2>
        <p>Prefer a modal on your own page? Keep the <a href="#sdk">Pay button</a> and have your order endpoint return <code>session.button</code>:</p>
        <Code>{`app.post("/api/create-order", async (req, res) => {
  const amount = CATALOG[req.body.payload?.sku]          // price from your server, never the browser
  const r = await fetch("${ORIGIN}/api/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: \`Bearer \${process.env.WONDRPAY_SECRET_KEY}\`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount, reference: req.body.cartId }),
  })
  res.json((await r.json()).button)                      // { entityKey, payUrl, amount, deadline, orderId }
})`}</Code>
      </section>

      <section id="session-webhooks">
        <h2><span className="doc-step">F</span>Webhooks for sessions</h2>
        <p>Set a webhook URL on your website in the portal. When a session is paid we POST <code>checkout.session.completed</code>, signed exactly like <a href="#webhooks">order webhooks</a> (same headers, same signer, verify with <code>verifyWondrPayWebhook</code>):</p>
        <Code>{`{
  "event": "checkout.session.completed",
  "sessionId": "0x9f3c…e1", "site": "4be1…", "reference": "order_1042",
  "orderId": "0x…", "merchant": "0xAB…", "payer": "0x97…",
  "amount": "12400000",                 // USDT micro-units (6 decimals)
  "txHash": "0x…", "explorer": "https://explorer.testnet.whitechain.io/tx/0x…",
  "receiptKey": "0x…", "paidAt": 1793974321
}`}</Code>
        <p>Fulfil once per <code>x-whitepay-event-id</code>. To double-check, retrieve the session or call <code>verifyWondrPayPayment</code> with the tx hash.</p>
        <p>Every delivery to your website is logged in the <a href="/portal">portal</a> for 30 days: event, HTTP status your server answered, tries. <b>Resend</b> re-sends the exact same bytes with the same event id (so your de-duplication still works). <b>Send test webhook</b> posts a signed <code>{"{ \"event\": \"test.ping\" }"}</code> so you can check your endpoint before the first sale. Answer <code>2xx</code> quickly; anything else is retried 3 times and shown as failed.</p>
      </section>

      <section id="links">
        <h2><span className="doc-step">G</span>Payment links (no code)</h2>
        <p>Make a link with a fixed title and price in the portal (<i>Payment links</i>). Share <code>{ORIGIN}/l/pl_…</code> or its QR anywhere. Each visit starts a fresh 15-minute checkout on that website, and the payment shows up in the link's stats and in your webhooks with <code>link</code> and <code>reference: "link:pl_…"</code>. Switch a link off at any time.</p>
        <p>Put a link's button on any page, even a static one with no server:</p>
        <Code>{`<script src="${SRC}" integrity="${SDK_SRI}" crossorigin="anonymous" defer></script>
<wondrpay-button link="pl_3c4bfa1a852b395c983e" label="Pay 12.40 USDT"></wondrpay-button>`}</Code>
        <div className="table-wrap"><table className="table"><tbody>
          <tr><td><code>GET /api/v1/links/:id</code></td><td>Public facts: title, amount (micro-USDT), shop name, verified, active</td></tr>
          <tr><td><code>POST /api/v1/links/:id/session</code></td><td>Send <code>{"{}"}</code> as JSON. Creates a session for the link (no key needed: price and shop are fixed by the link). 10 a minute per IP.</td></tr>
        </tbody></table></div>
      </section>

      <section id="refunds">
        <h2><span className="doc-step">H</span>Refunds by API</h2>
        <p>Refund from your server with your secret key, with no wallet prompt each time. First approve a <b>refund allowance</b> in the <a href="/portal">portal</a> (<i>Refunds by API</i>): your payout wallet signs one USDT approval (EIP-2612 permit) for a cap, such as 50 USDT, and WondrPay submits it and pays the gas.</p>
        <Code>{`curl ${ORIGIN}/api/v1/refunds \\
  -H "Authorization: Bearer $WONDRPAY_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: refund_order_1042" \\
  -d '{ "paymentId": "0x9f3c…e1", "amount": "2.50", "reason": "damaged item" }'

→ 201 { "object": "refund", "amount": "2500000", "refunded": "2500000", "refundable": "9900000",
        "txHash": "0x…", "explorer": "…", "allowanceLeft": "47500000" }`}</Code>
        <ul className="doc-list">
          <li><b>Where the money goes:</b> always back to the wallet that paid, never anywhere else.</li>
          <li><b>How much:</b> never more than was paid, counting every refund so far (refund requests, the dashboard and the API all see one total).</li>
          <li><b>Exposure:</b> at most the allowance left. Raise it or switch it off in the portal at any time.</li>
          <li><b>Default amount:</b> leave out <code>amount</code> to refund everything still refundable.</li>
          <li><b>Retries:</b> the same <code>Idempotency-Key</code> returns the first refund, even on another server.</li>
          <li><b>Webhook:</b> your website gets a signed <code>refund.succeeded</code> event.</li>
        </ul>
      </section>

      <section id="node">
        <h2><span className="doc-step">I</span>Node helpers</h2>
        <p><code>@whitepay/checkout/server</code> wraps the API:</p>
        <Code>{`import { createWondrPayCheckoutSession, getWondrPayCheckoutSession } from "@whitepay/checkout/server"

const session = await createWondrPayCheckoutSession({
  secretKey: process.env.WONDRPAY_SECRET_KEY!,
  amount: "12.40", reference: cart.id, description: "Kulhad mug ×2",
  successUrl: "https://shop.example.com/thank-you", idempotencyKey: cart.id,
})
// hosted:  res.redirect(303, session.url)
// button:  res.json(session.button)

const s = await getWondrPayCheckoutSession({ secretKey: process.env.WONDRPAY_SECRET_KEY!, id: session.id })
if (s.status === "paid") fulfil(cart.id, s.payment!.txHash)`}</Code>
      </section>

      <section id="woocommerce">
        <h2><span className="doc-step">J</span>WooCommerce</h2>
        <p><a href="/downloads/wondrpay-for-woocommerce.zip">Download the WondrPay for WooCommerce plugin</a> (v0.1.0, MIT). Then, in WordPress, go to Plugins → Add New → Upload Plugin and activate it.</p>
        <ol className="doc-list">
          <li>In the <a href="/portal">portal</a>, add a website with your shop's domain and set its webhook URL to <code>https://your-shop/?wc-api=wondrpay</code>.</li>
          <li>WooCommerce → Settings → Payments → <i>WondrPay (USDT)</i>: enable it and paste the secret key.</li>
          <li>Optional: approve a refund allowance to refund from the WooCommerce order screen.</li>
        </ol>
        <p>At checkout the plugin creates a session and sends the customer to WondrPay's hosted checkout. When the webhook arrives, or the customer comes back to the thank-you page, the plugin asks the WondrPay API whether that order's session is paid, and only then completes the order. USD stores charge 1:1; other currencies are converted at WondrPay's display rate.</p>
      </section>

      <section id="shopify">
        <h2><span className="doc-step">K</span>Shopify</h2>
        <p>Shopify only lists new payment providers through its Payments Partner program, so for now use payment links. No app is needed.</p>
        <ul className="doc-list">
          <li><b>Pay button on product pages.</b> Make a payment link per product in the portal, then in <i>Online Store → Themes → Edit code</i> add the SDK to <code>theme.liquid</code> and a button to your product template:</li>
        </ul>
        <Code>{`<!-- theme.liquid, before </head> -->
<script src="${SRC}" integrity="${SDK_SRI}" crossorigin="anonymous" defer></script>

<!-- sections/main-product.liquid: product metafield custom.wondrpay_link = "pl_…" -->
{% if product.metafields.custom.wondrpay_link %}
  <wondrpay-button link="{{ product.metafields.custom.wondrpay_link }}"
                   label="Pay {{ product.price | money_without_currency }} USDT"></wondrpay-button>
{% endif %}`}</Code>
        <ul className="doc-list">
          <li><b>Manual payment method.</b> In <i>Settings → Payments → Manual payment methods</i>, add "Pay with WondrPay (USDT)". When an order comes in, send the customer a payment link for the total (or the product's link) and mark the order paid when the webhook arrives.</li>
          <li><b>Confirming payments:</b> the link's webhook carries <code>link</code> and <code>reference: "link:pl_…"</code>, and each link's stats show up in the portal.</li>
        </ul>
      </section>

      <section id="team">
        <h2><span className="doc-step">L</span>Team access</h2>
        <p>In the portal's <i>Team</i> section the shop owner can add a teammate's wallet as a <b>developer</b>, for example a web agency. The developer opens <a href="/portal">/portal</a> with their own wallet and manages the shop's websites, with no shared passwords and no access to the owner's wallet.</p>
        <div className="table-wrap"><table className="table"><thead><tr><th>Action</th><th>Owner</th><th>Developer</th></tr></thead><tbody>
          <tr><td>Add or switch off a website</td><td>✓</td><td>-</td></tr>
          <tr><td>New secret key</td><td>✓</td><td>✓</td></tr>
          <tr><td>Create or switch off payment links</td><td>✓</td><td>✓</td></tr>
          <tr><td>Send test webhook, resend webhooks</td><td>✓</td><td>✓</td></tr>
          <tr><td>Add or remove teammates</td><td>✓</td><td>-</td></tr>
          <tr><td>Receive payouts, approve refunds</td><td>owner's wallet only</td><td>-</td></tr>
        </tbody></table></div>
        <p>Each action is signed by the wallet that took it, and the server checks that wallet's role at the moment of the request. Removing a teammate takes effect within a few seconds.</p>
      </section>

      <section id="errors">
        <h2><span className="doc-step">M</span>Errors and limits</h2>
        <p>Errors are <code>{"{ \"error\": { \"type\", \"message\" } }"}</code>; messages are written to show to a developer as is.</p>
        <div className="table-wrap"><table className="table"><thead><tr><th>Status</th><th>type</th><th>When</th></tr></thead><tbody>
          <tr><td>400</td><td><code>bad_request</code></td><td>Bad amount, reference, URL or expiresIn</td></tr>
          <tr><td>401</td><td><code>unauthorized</code></td><td>Missing, malformed, wrong or rotated secret key</td></tr>
          <tr><td>403</td><td><code>forbidden</code></td><td>Website switched off, or a return URL outside your domains</td></tr>
          <tr><td>404</td><td><code>not_found</code></td><td>Session doesn't exist or belongs to another website</td></tr>
          <tr><td>429</td><td>-</td><td>More than 60 session creates a minute per IP (respect <code>retry-after</code>)</td></tr>
          <tr><td>500</td><td><code>api_error</code></td><td>Our side. Retry with the same <code>Idempotency-Key</code>; nothing was charged</td></tr>
        </tbody></table></div>
        <p>Up to 5 websites and 20 active payment links per shop. A website's domains also limit where customers can be sent back to.</p>
      </section>

      <section id="sdk">
        <h2>Or: sign orders yourself (SDK)</h2>
        <p>The original integration, for shops that keep their own order-signing key on their server. Everything below still works, including for shops that also use API keys.</p>
      </section>

      <section>
        <h2><span className="doc-step">1</span>Load the SDK (browser)</h2>
        <p>Pin an exact version with Subresource Integrity: versioned files (<code>/sdk/v1.4.0/</code>) never change, and if the bytes ever differ the browser refuses to run them. <code>/sdk/v1/checkout.js</code> always serves the latest 1.x for quick prototypes (no SRI).</p>
        <Code>{`<script src="${SRC}"\n        integrity="${SDK_SRI}"\n        crossorigin="anonymous" defer></script>`}</Code>
        <p>Using a Content-Security-Policy? Allow <code>{ORIGIN}</code> in <code>script-src</code> (or put your nonce on the tag), <code>connect-src</code> and <code>img-src</code>.</p>
      </section>

      <section>
        <h2><span className="doc-step">2</span>Add the button</h2>
        <Code>{`<wondrpay-button order-endpoint="/api/create-order"\n                 payload='{"sku":"chai-kit"}'\n                 label="Pay 2.50 USDT"></wondrpay-button>\n\n<script>\n  document.addEventListener("wondrpay:paid", (e) => showThanks(e.detail))\n</script>`}</Code>
        <div className="table-wrap"><table className="table"><tbody>
          <tr><td><code>order-endpoint</code></td><td>Your same-origin route that signs the order (step 3). Cross-origin endpoints are refused.</td></tr>
          <tr><td><code>payload</code></td><td>JSON sent to your endpoint (product id, cart id). Never the price.</td></tr>
          <tr><td><code>label</code></td><td>Button text.</td></tr>
          <tr><td><code>wondrpay:created</code></td><td><code>{"{ entityKey, payUrl, deadline }"}</code> the order is live on Arkiv, QR shown</td></tr>
          <tr><td><code>wondrpay:paid</code></td><td><code>{"{ entityKey, orderId, txHash, explorer, amount }"}</code> UI hint only: fulfil from the webhook</td></tr>
          <tr><td><code>wondrpay:expired</code> / <code>wondrpay:error</code></td><td>QR expired unpaid / something failed (<code>{"{ message }"}</code>)</td></tr>
        </tbody></table></div>
        <p>It is a standard Web Component, so it works in React, Next.js, Vue (<code>isCustomElement</code>), Svelte, Angular (<code>CUSTOM_ELEMENTS_SCHEMA</code>), WordPress, Shopify themes and plain HTML.</p>
      </section>

      <section>
        <h2><span className="doc-step">3</span>Sign the order (your server)</h2>
        <Code>{`import { createWondrPayOrder } from "@whitepay/checkout/server"\n\nconst CATALOG = { "chai-kit": "2.50" }            // prices live on the server\n\napp.post("/api/create-order", async (req, res) => {\n  const amount = CATALOG[req.body.payload?.sku]\n  if (!amount) return res.status(400).json({ error: "unknown product" })\n  res.json(await createWondrPayOrder({\n    merchantKey: process.env.SHOP_PK,               // your registered shop key, never in the browser\n    amount,\n    webhook: "https://shop.example/api/webhook",\n  }))\n})`}</Code>
        <p>Your shop key signs <code>merchant, amount, orderId, deadline</code> (EIP-712). The WondrPay router contract only settles that exact amount, to your payout address, once.</p>
      </section>

      <section>
        <h2 id="webhooks"><span className="doc-step">4</span>Fulfil from the webhook</h2>
        <Code>{`import { verifyWondrPayWebhook, verifyWondrPayPayment } from "@whitepay/checkout/server"\n\napp.post("/api/webhook", express.text({ type: "*/*" }), async (req, res) => {\n  const auth = await verifyWondrPayWebhook({ rawBody: req.body, headers: new Headers(req.headers) })\n  if (!auth.ok) return res.status(401).end()          // forged, tampered or replayed\n  if (await db.seen(auth.eventId)) return res.end()   // idempotent\n  const { txHash, orderId, amount } = auth.event\n  const v = await verifyWondrPayPayment({ txHash, merchant: SHOP, orderId, minAmount: BigInt(amount) })\n  if (v.ok) await fulfil(orderId)                      // money confirmed on Whitechain\n  res.end()\n})`}</Code>
        <div className="table-wrap"><table className="table"><tbody>
          <tr><td><code>x-whitepay-signature</code></td><td>EIP-191 signature of <code>whitepay-webhook:v1:&lt;timestamp&gt;:&lt;keccak256(body)&gt;</code></td></tr>
          <tr><td><code>x-whitepay-timestamp</code></td><td>Unix seconds; rejected if older than 5 minutes</td></tr>
          <tr><td><code>x-whitepay-event-id</code></td><td>Unique per payment: de-duplicate on it</td></tr>
          <tr><td>Signer</td><td><code>0x27d2F6770F18E1C0Eefc129124747407Ef44aBe1</code> (also at <a href="/api/webhook-key">/api/webhook-key</a>)</td></tr>
        </tbody></table></div>
      </section>

      <section>
        <h2><span className="doc-step">5</span>Subscriptions (Autopay)</h2>
        <p>Same button, <code>mode="subscribe"</code>. The shopper approves once with their fingerprint; WondrPay charges every period with zero gas and sends you a signed webhook per payment.</p>
        <Code>{`<wondrpay-button mode="subscribe" order-endpoint="/api/create-subscription"\n                 label="Subscribe · 4.99 USDT / month"></wondrpay-button>\n\n// server\nimport { createWondrPaySubscription } from "@whitepay/checkout/server"\napp.post("/api/create-subscription", async (_req, res) => res.json(await createWondrPaySubscription({\n  merchantKey: process.env.SHOP_PK, title: "Pro plan", amount: "4.99", period: "monthly", cycles: 12,\n  webhook: "https://shop.example/api/webhook",   // subscription.started | charged | completed | cancelled | failed\n})))`}</Code>
        <ul className="doc-list">
          <li><b>One signature:</b> the shopper signs a single EIP-2612 <code>permit</code> to a tiny contract made only for their subscription. Its address commits to every term, so one wallet prompt approves exactly that shop, amount, period and number of payments.</li>
          <li><b>How it runs:</b> each upcoming payment is an Arkiv entity whose expiry is its countdown. At 0 the keeper calls the contract's <code>charge()</code>, deletes the entity and creates the next one.</li>
          <li><b>Hard limits on-chain:</b> never early, never late (missed windows are skipped), never more than amount × cycles, never to anyone but you.</li>
          <li><b>Cancel:</b> one signature switches the subscription's contract off; you can also cancel from your side.</li>
          <li><b>Verify charges:</b> the contract emits <code>Charged(cycle, amount)</code>; the webhook carries the tx hash.</li>
        </ul>
      </section>

      <section id="security">
        <h2>Security model</h2>
        <ul className="doc-list">
          <li><b>Price tampering:</b> impossible from the browser. The amount is in the shop-signed order and enforced by the contract.</li>
          <li><b>Fake payments:</b> the browser event is only a hint; fulfilment needs a signed webhook <i>and</i> a <code>PaymentSettled</code> event on-chain.</li>
          <li><b>Replay:</b> EIP-3009 nonces are single-use on-chain; webhooks expire after 5 minutes and carry an event id.</li>
          <li><b>Supply chain:</b> versioned SDK path + SRI hash. The SDK never touches keys or money.</li>
          <li><b>XSS in the SDK:</b> every network value is regex-validated and written with <code>textContent</code>; links use <code>noopener noreferrer</code>.</li>
          <li><b>SSRF:</b> webhooks only go to https:443 hostnames resolving to public IPs, re-checked before every send, redirects not followed.</li>
          <li><b>Abuse:</b> per-IP rate limits, JSON-only writes, body caps, cross-site POST blocking and per-payer relayer limits on WondrPay.</li>
          <li><b>Refunds:</b> only from your payout wallet, only to the original payer, capped at the amount paid (on-chain).</li>
          <li><b>API keys:</b> secret keys are 32 random bytes, stored only as SHA-256 and compared in constant time; every website change is approved by the shop wallet's signature. Keys can create checkouts but never change where money goes.</li>
        </ul>
      </section>
      <footer className="wp-note">Whitechain Sepolia testnet · official USDT <code>0xcedf…55a7</code> · receipts on Arkiv · names on ENS</footer>
      </div>
    </Section>
  )
}
