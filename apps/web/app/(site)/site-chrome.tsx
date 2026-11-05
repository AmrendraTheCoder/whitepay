// Marketing site header + footer (server components).
import Link from "next/link"
import { OpenApp } from "./open-app"

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/business", label: "Business" },
  { href: "/developers", label: "Developers" },
  { href: "/security", label: "Security" },
  { href: "/pricing", label: "Pricing" },
]

export function Logo() {
  return (
    <Link href="/" className="s-logo" aria-label="WhitePay home">
      <img src="/icon.svg" alt="" width={30} height={30} />
      <span>WhitePay</span>
    </Link>
  )
}

export function SiteHeader() {
  return (
    <header className="s-header">
      <div className="s-wrap s-header-in">
        <Logo />
        <nav className="s-nav" aria-label="Main">
          {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
        </nav>
        <div className="s-header-cta">
          <Link href="/business" className="s-btn s-btn-ghost s-hide-sm">Accept payments</Link>
          <OpenApp className="s-btn s-btn-lime" />
        </div>
        <details className="s-menu">
          <summary aria-label="Menu"><span /><span /><span /></summary>
          <div className="s-menu-panel">
            {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
            <Link href="/status">Status</Link>
            <OpenApp className="s-btn s-btn-lime" />
          </div>
        </details>
      </div>
    </header>
  )
}

const COLS = [
  { title: "Product", links: [["Open the app", "/app"], ["Autopay", "/#autopay"], ["Pricing", "/pricing"], ["Status", "/status"]] },
  { title: "Business", links: [["Accept payments", "/business"], ["Checkout SDK", "/developers"], ["Live demo store", "https://whitepay-demo-store.vercel.app"], ["Subscriptions", "/business#autopay"]] },
  { title: "Developers", links: [["Docs", "/developers"], ["Webhooks", "/developers#webhooks"], ["GitHub", "https://github.com/AmrendraTheCoder/whitepay"], ["Contracts", "/status#contracts"]] },
  { title: "Company", links: [["Security", "/security"], ["Terms", "/terms"], ["Privacy", "/privacy"], ["Contact", "https://github.com/AmrendraTheCoder/whitepay/issues"]] },
]

export function SiteFooter() {
  return (
    <footer className="s-footer">
      <div className="s-wrap">
        <div className="s-footer-top">
          <div className="s-footer-brand">
            <Logo />
            <p>Digital-dollar payments that feel like UPI. Scan, confirm with your fingerprint, settled in about a second.</p>
            <div className="s-badges"><span>Whitechain</span><span>ENS</span><span>Arkiv</span><span>World ID</span></div>
          </div>
          {COLS.map((c) => (
            <div key={c.title} className="s-footer-col">
              <h4>{c.title}</h4>
              {c.links.map(([l, h]) => h.startsWith("http") || h.startsWith("mailto")
                ? <a key={l} href={h} target={h.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">{l}</a>
                : <Link key={l} href={h}>{l}</Link>)}
            </div>
          ))}
        </div>
        <div className="s-footer-bottom">
          <span>© 2026 WhitePay. Built for ETHGlobal Mumbai.</span>
          <span className="s-testnet">● Testnet: Whitechain Sepolia test USDT, no real money</span>
        </div>
      </div>
    </footer>
  )
}
