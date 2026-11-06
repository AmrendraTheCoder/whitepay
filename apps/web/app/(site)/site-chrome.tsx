// Marketing site header + footer.
import Link from "next/link"
import { ButtonLink, Badge } from "@whitepay/ui"
import { OpenApp, NavLinks } from "./open-app"

export const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/business", label: "Business" },
  { href: "/developers", label: "Developers" },
  { href: "/security", label: "Security" },
  { href: "/pricing", label: "Pricing" },
]

export function Logo() {
  return (
    <Link href="/" className="site-logo" aria-label="WondrPay home">
      <img src="/icon.svg" alt="" width={28} height={28} />
      <span>WondrPay</span>
    </Link>
  )
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wp-container">
        <Logo />
        <nav className="site-nav" aria-label="Main"><NavLinks items={NAV} /></nav>
        <div className="site-header-actions">
          <ButtonLink href="/business" variant="ghost" size="sm">Accept payments</ButtonLink>
          <OpenApp size="sm" />
        </div>
        <details className="site-menu">
          <summary className="wp-btn wp-icon-btn" data-variant="secondary" aria-label="Menu">
            <svg className="wp-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </summary>
          <nav className="site-menu-panel" aria-label="Main">
            <NavLinks items={[...NAV, { href: "/status", label: "Status" }]} />
            <OpenApp fullWidth />
          </nav>
        </details>
      </div>
    </header>
  )
}

const COLS = [
  { title: "Product", links: [["Open the app", "/app"], ["Autopay", "/#autopay"], ["Pricing", "/pricing"], ["Status", "/status"]] },
  { title: "Business", links: [["Accept payments", "/business"], ["Checkout SDK", "/developers"], ["Demo store", "https://wondrpay-demo-store.vercel.app"], ["Subscriptions", "/business#subscriptions"]] },
  { title: "Developers", links: [["Documentation", "/developers"], ["Webhooks", "/developers#webhooks"], ["GitHub", "https://github.com/AmrendraTheCoder/whitepay"], ["Contracts", "/status#contracts"]] },
  { title: "Company", links: [["Security", "/security"], ["Terms", "/terms"], ["Privacy", "/privacy"], ["Contact", "https://github.com/AmrendraTheCoder/whitepay/issues"]] },
] as const

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wp-container">
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <Logo />
            <p>Digital-dollar payments that feel like UPI: scan, confirm with your fingerprint, settled in about a second.</p>
            <Badge tone="warning" dot>Testnet · test USDT only</Badge>
          </div>
          {COLS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h2>{c.title}</h2>
              {c.links.map(([label, href]) => href.startsWith("http")
                ? <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label}</a>
                : <Link key={label} href={href}>{label}</Link>)}
            </nav>
          ))}
        </div>
        <div className="site-footer-bottom">
          <span>© 2026 WondrPay · Built for ETHGlobal Mumbai</span>
          <span>Whitechain · ENS · Arkiv · World ID</span>
        </div>
      </div>
    </footer>
  )
}
