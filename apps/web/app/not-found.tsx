import Link from "next/link"
import "./(site)/site.css"

export default function NotFound() {
  return (
    <div className="site" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 520 }}>
        <div className="s-kicker">404</div>
        <h1 style={{ fontSize: "clamp(40px,7vw,72px)", fontWeight: 800, margin: "12px 0" }}>This page didn't settle.</h1>
        <p className="s-sub" style={{ margin: "0 auto 26px" }}>The link may be old, or a payment request may have expired (QR codes last 5 minutes).</p>
        <div className="s-hero-cta" style={{ justifyContent: "center" }}><Link href="/" className="s-btn s-btn-lime">Go home</Link><Link href="/app" className="s-btn s-btn-ghost">Open your wallet</Link></div>
      </div>
    </div>
  )
}
