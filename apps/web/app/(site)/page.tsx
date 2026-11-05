import type { Metadata } from "next"
import Link from "next/link"
import { OpenApp } from "./open-app"
import QRCode from "qrcode"
import { networkStats } from "@/lib/site-stats"

export const metadata: Metadata = {
  title: { absolute: "WhitePay · Pay anyone in digital dollars. No gas, no seed phrase." },
  description: "Scan a QR, confirm with your fingerprint, settled in about a second. USDT payments, shop checkout and autopay on Whitechain, with ENS names and receipts on Arkiv.",
  alternates: { canonical: "/" },
}

const FEATURES = [
  { ic: "⛽", t: "Zero gas, always", d: "WhitePay's relayer pays the network fee. You only ever see the amount you send." },
  { ic: "☝", t: "Fingerprint, not seed phrases", d: "Your key is created and encrypted on your phone. Unlock with fingerprint or a 6-digit PIN, like UPI." },
  { ic: "@", t: "Names, not addresses", d: "Pay ravi.whitepay.eth instead of 0x7a3f…. Every name is a real ENS name on Ethereum." },
  { ic: "🔁", t: "Autopay", d: "Subscribe once, pay on schedule. Each payment is time-locked on-chain and cancelling revokes the rest." },
  { ic: "🧾", t: "Receipts that can't vanish", d: "Every payment writes a receipt to Arkiv: searchable, exportable, owned by no single company." },
  { ic: "🛡", t: "Real humans, real shops", d: "Shops verify with World ID: one verified shop per person. You see the badge before you pay." },
  { ic: "↩", t: "Refunds, not chargebacks", d: "Shops refund in one tap, gas-free. Money can only go back to the wallet that paid, never more than you paid." },
  { ic: "🦊", t: "Bring MetaMask if you like", d: "Connect over WalletConnect and stay in your browser. WhitePay still asks for your PIN or fingerprint first." },
]

const FAQ = [
  ["Is this real money?", "Not yet. WhitePay runs on Whitechain Sepolia testnet with test USDT so anyone can try every feature safely. Mainnet launch follows audits and licensing."],
  ["Do I need a crypto wallet or seed phrase?", "No. WhitePay creates a wallet on your phone in seconds and protects it with your fingerprint or PIN. Already use MetaMask? Connect it over WalletConnect and stay in your browser."],
  ["Who pays the gas fees?", "WhitePay does. Payments use signed USDT authorizations that our relayer submits, so you never need WBT or any other gas token."],
  ["What stops a shop from charging me twice?", "Every payment carries a single-use on-chain nonce and the exact amount the shop signed. Autopay payments can only happen inside their own time window, and cancelling burns the rest on-chain."],
  ["Can a shop refund me?", "Yes, from its dashboard, gas-free. Refunds can only go back to the wallet that paid, and never more than you paid."],
  ["Where is my data stored?", "Keys stay on your device. Payment requests, receipts and subscriptions are public, tamper-evident entities on Arkiv, with no personal data in clear text."],
]

const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"))

export default async function Landing() {
  const [s, qr] = await Promise.all([
    networkStats(),
    QRCode.toString("https://whitepay.vercel.app/business", { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0b1033", light: "#ffffff" } }),
  ])
  return (
    <>
      <section className="s-hero">
        <div className="s-wrap s-hero-grid">
          <div>
            <Link href="/#autopay" className="s-eyebrow"><b>NEW</b> Autopay subscriptions are live</Link>
            <h1>Pay anyone in <em>digital dollars.</em> No gas. No seed phrase.</h1>
            <p className="s-lead">WhitePay is UPI-style payments for USDT. Scan a QR, confirm with your fingerprint, and it settles on Whitechain in about a second, with a receipt you can always find.</p>
            <div className="s-hero-cta">
              <OpenApp className="s-btn s-btn-lime s-btn-lg" big />
              <Link href="/business" className="s-btn s-btn-ghost s-btn-lg">Accept payments →</Link>
            </div>
            <div className="s-proof"><span>No app store needed</span><span>0 gas fees</span><span>Works with MetaMask</span></div>
          </div>
          <div style={{ position: "relative" }}>
            <div className="s-phone" aria-label="WhitePay app preview" role="img">
              <div className="s-screen">
                <div className="s-m-search">🔍&nbsp; Pay friends and merchants</div>
                <div className="s-m-card"><small>USDT balance</small><div className="s-m-bal">1,284.50 <span>USDT</span></div><span className="s-m-pill">0 gas</span> <small style={{ marginLeft: 6 }}>ravi.whitepay.eth</small></div>
                <div className="s-m-tiles"><div><i>⌗</i>Scan QR</div><div><i>↗</i>Pay anyone</div><div><i>⇣</i>Receive</div><div><i>🏪</i>Shop QR</div></div>
                <div>
                  {[["C", "#e8743b", "Chai Shop", "Today · Shop QR", "−2.50"], ["A", "#7c5cff", "Ananya", "Yesterday · Person", "+40.00"], ["C", "#12a86b", "Chai Club", "Autopay · 3 of 12", "−4.99"]].map(([i, c, n, d, a]) => (
                    <div key={n} className="s-m-row"><span className="s-m-av" style={{ background: c }}>{i}</span><div><b>{n}</b><small>{d}</small></div><span className={a.startsWith("+") ? "in" : ""}>{a}</span></div>
                  ))}
                </div>
              </div>
            </div>
            <div className="s-toast"><span className="ok">✓</span><div><b>Paid 2.50 USDT</b><small>chai-shop.whitepay.eth · 0.9 s</small></div></div>
            <div className="s-chip-float">Gas paid by you<small>0.00 WBT</small></div>
          </div>
        </div>
      </section>

      <section className="s-stats" aria-label="Live network">
        <div className="s-wrap s-stats-in">
          <div className="s-stat"><b>~1 s</b><span>settlement on Whitechain</span></div>
          <div className="s-stat"><b>0</b><span>gas paid by users, ever</span></div>
          <div className="s-stat"><b>{fmt(s.receipts)}</b><span>receipts stored on Arkiv</span></div>
          <div className="s-stat"><b>{fmt(s.block)}</b><span className="s-live">latest block, live</span></div>
        </div>
      </section>

      <section className="s-section" id="product">
        <div className="s-wrap">
          <div className="s-kicker">How it works</div>
          <h2 className="s-h2">As simple as UPI. Settled like a blockchain.</h2>
          <p className="s-sub">No exchanges, no gas tokens, no 24-word phrases. Three taps from QR to receipt.</p>
          <div className="s-steps">
            <div className="s-step"><div className="s-step-ic">⌗</div><h3>Scan</h3><p>Point your camera at any WhitePay QR. You see the shop's verified name and the exact amount before anything happens.</p></div>
            <div className="s-step"><div className="s-step-ic">☝</div><h3>Confirm</h3><p>Your fingerprint unlocks the key on your phone, which signs this one payment. Nothing leaves your device but the signature.</p></div>
            <div className="s-step"><div className="s-step-ic">✓</div><h3>Done</h3><p>Settled on Whitechain in about a second, receipt saved to Arkiv, and the shop's screen lights up "Received".</p></div>
          </div>
        </div>
      </section>

      <section className="s-section s-section-alt">
        <div className="s-wrap">
          <div className="s-kicker">Why WhitePay</div>
          <h2 className="s-h2">Everything a payment app should be. Nothing a crypto wallet makes you learn.</h2>
          <div className="s-features">
            {FEATURES.slice(0, 2).map((f) => <div key={f.t} className="s-feature"><div className="ic">{f.ic}</div><h3>{f.t}</h3><p>{f.d}</p></div>)}
            <div className="s-feature"><div className="ic">{FEATURES[2].ic}</div><h3>{FEATURES[2].t}</h3><p>{FEATURES[2].d}</p></div>
            <div className="s-feature wide" id="autopay"><div className="ic" style={{ background: "rgba(255,255,255,.15)" }}>{FEATURES[3].ic}</div><h3>{FEATURES[3].t}: subscriptions without the surprise charges</h3><p>Approve a plan once with your fingerprint. Each payment is a live countdown; at zero it pays itself, gas-free. Every payment can only run in its own window, and cancel means cancelled on-chain.{s.activeAutopay ? ` ${fmt(s.activeAutopay)} autopays running right now.` : ""}</p></div>
            {FEATURES.slice(4).map((f) => <div key={f.t} className="s-feature"><div className="ic">{f.ic}</div><h3>{f.t}</h3><p>{f.d}</p></div>)}
          </div>
        </div>
      </section>

      <section className="s-section">
        <div className="s-wrap s-split">
          <div>
            <div className="s-kicker">For business</div>
            <h2 className="s-h2">Get paid in seconds. Keep what you earn.</h2>
            <p className="s-sub">Show a QR at the counter, add checkout to your site, or sell subscriptions. Money lands directly in your wallet, not a payout queue.</p>
            <ul className="s-list">
              <li><span><b>Counter QR</b> with a live "Received" screen, like a soundbox</span></li>
              <li><span><b>Checkout SDK</b> for any website, in about 20 lines</span></li>
              <li><span><b>Refunds, CSV export and signed webhooks</b> built in</span></li>
              <li><span><b>Verified badge</b> with World ID so customers trust you</span></li>
            </ul>
            <div className="s-hero-cta" style={{ margin: 0 }}><Link href="/business" className="s-btn s-btn-lime">Accept payments</Link><a href="https://whitepay-demo-store.vercel.app" target="_blank" rel="noopener noreferrer" className="s-btn s-btn-ghost">See a live store ↗</a></div>
          </div>
          <div className="s-terminal" aria-hidden>
            <div style={{ color: "var(--s-muted)", fontWeight: 600 }}>Chai Point, Bandra</div>
            <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="amt">2.50 <span style={{ fontSize: 18, color: "var(--s-muted)" }}>USDT</span></div>
            <div style={{ color: "var(--s-ok)", fontWeight: 700, marginTop: 8 }} className="s-live">Waiting for payment · 4:52</div>
          </div>
        </div>
      </section>

      <section className="s-section s-section-alt">
        <div className="s-wrap s-split">
          <div className="s-code">
            <div className="s-code-head"><i /><i /><i /><span>checkout.html</span></div>
            <pre>
              <span className="c">{"<!-- 1. load the SDK (pinned with SRI) -->"}</span>{"\n"}
              <span className="k">{"<script"}</span>{" src="}<span className="s">{'"https://whitepay.vercel.app/sdk/v1.2.0/checkout.js"'}</span>{"\n        integrity="}<span className="s">{'"sha384-…"'}</span>{" crossorigin defer"}<span className="k">{"></script>"}</span>{"\n\n"}
              <span className="c">{"<!-- 2. drop in the button -->"}</span>{"\n"}
              <span className="k">{"<whitepay-button"}</span>{" order-endpoint="}<span className="s">{'"/api/create-order"'}</span>{"\n                 payload="}<span className="s">{`'{"sku":"chai-kit"}'`}</span><span className="k">{" />"}</span>{"\n\n"}
              <span className="c">{"// 3. fulfil from the signed webhook"}</span>{"\n"}
              <span className="k">const</span>{" ok = "}<span className="k">await</span>{" verifyWhitePayWebhook({ rawBody, headers })"}
            </pre>
          </div>
          <div>
            <div className="s-kicker">For developers</div>
            <h2 className="s-h2">One script tag. Any stack.</h2>
            <p className="s-sub">A standard Web Component for the browser and a small TypeScript kit for your server. Works with React, Vue, WordPress or plain HTML. Payments, subscriptions and webhooks, all signed and verifiable on-chain.</p>
            <div className="s-hero-cta"><Link href="/developers" className="s-btn s-btn-blue">Read the docs</Link><a href="https://github.com/AmrendraTheCoder/whitepay" target="_blank" rel="noopener noreferrer" className="s-btn s-btn-ghost">GitHub ↗</a></div>
          </div>
        </div>
      </section>

      <section className="s-section">
        <div className="s-wrap">
          <div className="s-kicker">Security</div>
          <h2 className="s-h2">Your money moves only when you say so.</h2>
          <div className="s-grid-3" style={{ marginTop: 36 }}>
            <div className="s-card"><h3>Keys never leave your phone</h3><p>Encrypted with your fingerprint (passkey) or PIN, with a lockout after 5 wrong tries.</p></div>
            <div className="s-card"><h3>Every amount is signed</h3><p>Shops sign the price; you sign the payment. The smart contract settles that exact amount, once.</p></div>
            <div className="s-card"><h3>Attack-tested</h3><p>Strict CSP, signed webhooks, SSRF guards, rate limits and an open security suite you can run yourself.</p></div>
          </div>
          <p style={{ marginTop: 22 }}><Link href="/security" style={{ color: "var(--s-lime)", fontWeight: 700 }}>How WhitePay is secured →</Link></p>
        </div>
      </section>

      <section className="s-section s-section-alt">
        <div className="s-wrap">
          <div className="s-kicker">FAQ</div>
          <h2 className="s-h2">Questions, answered.</h2>
          <div className="s-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="s-section" style={{ paddingBottom: 0 }}>
        <div className="s-cta">
          <h2>Your first payment takes 30 seconds.</h2>
          <p>Create a wallet in your browser, grab test USDT, and scan any WhitePay QR.</p>
          <div className="s-hero-cta"><OpenApp className="s-btn s-btn-lime s-btn-lg" big /><Link href="/business" className="s-btn s-btn-ghost s-btn-lg" style={{ background: "rgba(255,255,255,.12)" }}>For business</Link></div>
        </div>
      </section>
    </>
  )
}
