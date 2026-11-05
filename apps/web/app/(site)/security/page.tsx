import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = { title: "Security", description: "How WhitePay protects your money: on-chain guarantees, keys that never leave your phone, signed webhooks, a strict web security layer and a public attack suite.", alternates: { canonical: "/security" } }

const LAYERS = [
  { t: "Money layer: enforced on-chain", items: [
    ["Exact amounts only", "Shops sign merchant, amount, order id and deadline (EIP-712); the payment router settles only that, once."],
    ["No replays", "USDT authorizations carry single-use nonces; a payment can never be submitted twice."],
    ["Can't be front-run", "Payments use receiveWithAuthorization: only the WhitePay router can execute them."],
    ["Safe refunds", "Only the shop's payout wallet can refund, only to the original payer, capped at what was paid."],
    ["One-signature Autopay", "One permit to a contract made only for that subscription: exact shop, amount and schedule, capped at amount × payments, missed windows skipped, cancel in one tap."],
  ] },
  { t: "Your keys", items: [
    ["Never leave the phone", "AES-GCM encrypted with a passkey (fingerprint / Face ID) or a PBKDF2-hardened PIN with lockout."],
    ["Unlock once per session", "15 idle minutes in that tab only, cleared on lock."],
    ["MetaMask too", "External wallets still approve every signature, and WhitePay adds its own PIN or fingerprint gate."],
  ] },
  { t: "Web layer", items: [
    ["Strict CSP", "Fresh nonce per request with 'strict-dynamic', no framing (clickjacking), HSTS preload."],
    ["CSRF and abuse", "JSON-only writes, cross-site origins refused, per-IP rate limits, body-size caps."],
    ["Signed webhooks", "EIP-191 signatures with a 5-minute replay window and event ids; delivery only to public HTTPS hosts (SSRF guard)."],
    ["Pinned SDK", "Immutable versioned files with Subresource Integrity; network data is never written as HTML."],
  ] },
]

export default function Security() {
  return (
    <>
      <section className="s-page-head">
        <div className="s-wrap">
          <div className="s-kicker">Security</div>
          <h1>Your money moves only when you say so.</h1>
          <p className="s-sub">The rules that protect your money are enforced by smart contracts on Whitechain, not by promises in our database.</p>
        </div>
      </section>
      {LAYERS.map((l, i) => (
        <section key={l.t} className={`s-section ${i % 2 ? "s-section-alt" : ""}`} style={{ paddingTop: i ? undefined : 30 }}>
          <div className="s-wrap">
            <h2 className="s-h2" style={{ fontSize: "clamp(26px,3vw,36px)" }}>{l.t}</h2>
            <div className="s-grid-2" style={{ marginTop: 22 }}>{l.items.map(([t, d]) => <div key={t} className="s-card"><h3>{t}</h3><p>{d}</p></div>)}</div>
          </div>
        </section>
      ))}
      <section className="s-section">
        <div className="s-wrap s-split">
          <div>
            <div className="s-kicker">Verify it yourself</div>
            <h2 className="s-h2" style={{ fontSize: "clamp(26px,3vw,36px)" }}>An attack suite anyone can run.</h2>
            <p className="s-sub">28 live checks: CSP nonces, clickjacking, CSRF, oversized bodies, forged orders, SSRF to cloud metadata, forged and replayed webhooks, price tampering and SDK integrity.</p>
            <div className="s-hero-cta"><a className="s-btn s-btn-ghost" href="https://github.com/AmrendraTheCoder/whitepay/blob/main/scripts/security-check.sh" target="_blank" rel="noopener noreferrer">View the suite ↗</a><a className="s-btn s-btn-ghost" href="https://github.com/AmrendraTheCoder/whitepay/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer">SECURITY.md ↗</a></div>
          </div>
          <div className="s-code"><div className="s-code-head"><i /><i /><i /><span>scripts/security-check.sh</span></div>
            <pre>{`✔ CSP with per-request nonce + strict-dynamic
✔ CSRF: cross-site POST /api/pay blocked (403)
✔ SSRF: webhook to cloud metadata refused
✔ forged order signature rejected
✔ store: replayed (1h old) webhook rejected (401)
✔ SDK matches the pinned SRI hash

`}<span className="s">28 passed, 0 failed</span></pre></div>
        </div>
      </section>
      <section className="s-wrap"><div className="s-card"><h3>Report a vulnerability</h3><p>Found something? Please open a private report on <a href="https://github.com/AmrendraTheCoder/whitepay/security" target="_blank" rel="noopener noreferrer" style={{ color: "var(--s-lime)" }}>GitHub Security</a>. Testnet only: no real funds are at risk. See also our <Link href="/status" style={{ color: "var(--s-lime)" }}>live system status</Link>.</p></div></section>
    </>
  )
}
