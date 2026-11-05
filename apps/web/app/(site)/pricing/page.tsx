import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = { title: "Pricing", description: "Personal payments are free. Merchants pay a small fee only when they get paid. Everything is free during the testnet.", alternates: { canonical: "/pricing" } }

const PLANS = [
  { name: "Personal", price: "Free", unit: "forever", hot: false, cta: ["Open the app", "/app"], items: ["Send and receive USDT", "Zero gas fees", "Fingerprint / PIN wallet", "Your own .whitepay.eth name", "Autopay subscriptions"] },
  { name: "Business", price: "0.4%", unit: "per payment received", hot: true, cta: ["Open a business account", "/add?type=business"], items: ["Counter QR terminal", "Checkout SDK + signed webhooks", "Autopay plans", "Refunds and CSV export", "World ID verified badge", "Settlement in ~1 second"] },
  { name: "Scale", price: "Custom", unit: "volume pricing", hot: false, cta: ["Talk to us", "https://github.com/AmrendraTheCoder/whitepay/issues"], items: ["Everything in Business", "Multi-outlet and staff roles", "Dedicated relayer capacity", "Volume-based fees", "Priority support"] },
]

export default function Pricing() {
  return (
    <>
      <section className="s-page-head">
        <div className="s-wrap" style={{ textAlign: "center" }}>
          <div className="s-kicker">Pricing</div>
          <h1 style={{ margin: "14px auto 16px" }}>Free to pay. Fair to get paid.</h1>
          <p className="s-sub" style={{ margin: "0 auto" }}>No monthly fees, no setup fees, no gas. Merchants pay only when money arrives.</p>
          <p style={{ marginTop: 18 }}><span className="s-eyebrow"><b>TESTNET</b> Everything is free while WhitePay runs on Whitechain Sepolia</span></p>
        </div>
      </section>
      <section className="s-section" style={{ paddingTop: 30 }}>
        <div className="s-wrap s-grid-3">
          {PLANS.map((p) => (
            <div key={p.name} className={`s-card s-price ${p.hot ? "hot" : ""}`}>
              {p.hot ? <span className="tag">Most popular</span> : <span style={{ height: 24 }} />}
              <h3>{p.name}</h3>
              <div className="big">{p.price} <small>{p.unit}</small></div>
              <ul className="s-list" style={{ margin: "6px 0", flex: 1 }}>{p.items.map((i) => <li key={i}><span>{i}</span></li>)}</ul>
              {p.cta[1].startsWith("http")
                ? <a href={p.cta[1]} target="_blank" rel="noopener noreferrer" className="s-btn s-btn-ghost">{p.cta[0]}</a>
                : <Link href={p.cta[1]} className={`s-btn ${p.hot ? "s-btn-lime" : "s-btn-ghost"}`}>{p.cta[0]}</Link>}
            </div>
          ))}
        </div>
        <div className="s-wrap">
          <p className="s-sub" style={{ marginTop: 28, fontSize: 14.5 }}>Mainnet fees are indicative and include network gas. Customers never pay a fee to pay a merchant. Refunds are free.</p>
        </div>
      </section>
    </>
  )
}
