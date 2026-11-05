import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Business",
  description: "Accept USDT at the counter, online and on subscription. Instant settlement to your wallet, zero gas for customers, refunds, webhooks and CSV exports.",
  alternates: { canonical: "/business" },
}

const WAYS = [
  { ic: "⌗", t: "At the counter", d: "Type an amount, show the QR. A live screen says \"Received\" the moment it settles, like a soundbox.", cta: ["Open shop terminal", "/merchant"] },
  { ic: "🛒", t: "On your website", d: "Add the WhitePay button to any site. Your server signs the price, so it can't be changed in the browser.", cta: ["Checkout SDK docs", "/developers"] },
  { ic: "🔁", t: "On subscription", d: "Sell plans with Autopay. Customers approve once; every payment lands on schedule with a signed webhook.", cta: ["How Autopay works", "#autopay"] },
]

export default function Business() {
  return (
    <>
      <section className="s-page-head">
        <div className="s-wrap">
          <div className="s-kicker">WhitePay for Business</div>
          <h1>Get paid in digital dollars, settled in a second.</h1>
          <p className="s-sub">Money goes straight to your wallet with no payout queue, no chargebacks and no card network. Customers pay zero gas.</p>
          <div className="s-hero-cta"><Link href="/add?type=business" className="s-btn s-btn-lime s-btn-lg">Open a business account</Link><a href="https://whitepay-demo-store.vercel.app" target="_blank" rel="noopener noreferrer" className="s-btn s-btn-ghost s-btn-lg">Try the live demo store ↗</a></div>
        </div>
      </section>

      <section className="s-section" style={{ paddingTop: 40 }}>
        <div className="s-wrap s-grid-3">
          {WAYS.map((w) => (
            <div key={w.t} className="s-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="s-step-ic" style={{ marginBottom: 6 }}>{w.ic}</div>
              <h3>{w.t}</h3><p style={{ flex: 1 }}>{w.d}</p>
              <Link href={w.cta[1]} style={{ color: "var(--s-lime)", fontWeight: 700, textDecoration: "none" }}>{w.cta[0]} →</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="s-section s-section-alt">
        <div className="s-wrap">
          <div className="s-kicker">Compare</div>
          <h2 className="s-h2">Built for merchants, not middlemen.</h2>
          <table className="s-cmp">
            <thead><tr><th /><th className="us">WhitePay</th><th>Cards</th><th>Cross-border transfer</th></tr></thead>
            <tbody>
              <tr><td>Fee</td><td className="us">0.3–0.5% (free on testnet)</td><td>1.8–3%</td><td>3–6%</td></tr>
              <tr><td>Settlement</td><td className="us">~1 second, to your wallet</td><td>1–3 days</td><td>1–5 days</td></tr>
              <tr><td>Chargebacks</td><td className="us">None: refunds are your call</td><td>Yes</td><td>Rare</td></tr>
              <tr><td>Global customers</td><td className="us">Anyone with a phone</td><td>Card holders</td><td>Bank accounts</td></tr>
              <tr><td>Receipts</td><td className="us">Tamper-evident, on Arkiv</td><td>Processor database</td><td>Bank statement</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="s-section" id="autopay">
        <div className="s-wrap s-split">
          <div>
            <div className="s-kicker">Autopay</div>
            <h2 className="s-h2">Subscriptions your customers can trust.</h2>
            <ul className="s-list">
              <li><span><b>Approve once.</b> One fingerprint signs every scheduled payment up front.</span></li>
              <li><span><b>Pays itself.</b> Each upcoming payment is a live countdown on Arkiv; at zero it settles gas-free.</span></li>
              <li><span><b>Time-locked.</b> No payment can run early, run twice or change amount; the USDT contract enforces it.</span></li>
              <li><span><b>Signed webhooks</b> for started, charged, completed, cancelled and failed.</span></li>
            </ul>
          </div>
          <div className="s-card">
            <h3>Create a plan in your dashboard</h3>
            <p>Name, price, billing period (daily, weekly, every 30 days) and number of payments. Share the link or QR, or sell it from your site with <code className="s-mono">{'mode="subscribe"'}</code>.</p>
            <div className="s-hero-cta" style={{ marginBottom: 0 }}><Link href="/merchant" className="s-btn s-btn-blue">Open dashboard</Link></div>
          </div>
        </div>
      </section>

      <section className="s-section s-section-alt">
        <div className="s-wrap">
          <div className="s-kicker">Get started</div>
          <h2 className="s-h2">Live in four steps.</h2>
          <div className="s-steps" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {[["Create a business wallet", "Separate from personal money, like GPay for Business."], ["Claim your shop name", "your-shop.whitepay.eth, a real ENS name."], ["Verify with World ID", "One verified shop per human: the ✓ badge."], ["Take payments", "QR at the counter, SDK online, Autopay plans."]].map(([t, d]) => (
              <div key={t} className="s-step"><h3 style={{ fontSize: 18 }}>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
