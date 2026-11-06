import type { Metadata } from "next"
import { ButtonLink, Card, CodeBlock, Grid, Section, SectionHeader, type IconName } from "@whitepay/ui"

export const metadata: Metadata = { title: "Security", description: "How WondrPay protects your money: rules enforced on-chain, keys that never leave your phone, signed webhooks, a strict web security layer and a public test suite.", alternates: { canonical: "/security" } }

const LAYERS: { id: string; title: string; icon: IconName; items: [string, string][] }[] = [
  { id: "money", title: "Money rules, enforced on-chain", icon: "lock", items: [
    ["Exact amounts only", "Shops sign merchant, amount, order id and deadline (EIP-712). The payment router settles only that, once."],
    ["No replays", "USDT authorizations carry single-use nonces, so a payment can never be submitted twice."],
    ["No front-running", "Payments use receiveWithAuthorization: only the WondrPay router can execute them."],
    ["Safe refunds", "Only the shop's payout wallet can refund, only to the original payer, never more than was paid."],
  ] },
  { id: "keys", title: "Your keys", icon: "key", items: [
    ["Never leave the phone", "AES-GCM encrypted with a passkey (fingerprint or Face ID) or a PBKDF2-hardened PIN with lockout."],
    ["Unlock once per session", "Stays unlocked for 15 idle minutes in that tab only, and locks when you close it."],
    ["MetaMask too", "External wallets still approve every signature, with WondrPay's PIN or fingerprint check in front."],
  ] },
  { id: "web", title: "Web layer", icon: "shield", items: [
    ["Strict CSP", "A fresh nonce on every request with 'strict-dynamic', no framing, and HSTS preload."],
    ["CSRF and abuse", "JSON-only writes, cross-site origins refused, per-IP rate limits and body-size caps."],
    ["Signed webhooks", "EIP-191 signatures with a 5-minute replay window, sent only to public HTTPS hosts."],
    ["Pinned SDK", "Immutable versioned files with Subresource Integrity. Network data is never inserted as HTML."],
  ] },
]

const SUITE = `✔ CSP with per-request nonce + strict-dynamic
✔ CSRF: cross-site POST /api/pay blocked (403)
✔ SSRF: webhook to cloud metadata refused
✔ forged order signature rejected
✔ store: replayed webhook rejected (401)
✔ SDK matches the pinned SRI hash

28 passed, 0 failed`

export default function Security() {
  return (
    <>
      <Section>
        <SectionHeader level={1} eyebrow="Security" title="Your money moves only when you say so." description="The rules that protect your money are enforced by smart contracts on Whitechain, not by promises in our database." />
      </Section>
      {LAYERS.map((l, i) => (
        <Section key={l.id} tone={i % 2 ? "default" : "muted"} aria-labelledby={l.id}>
          <SectionHeader id={l.id} title={l.title} />
          <Grid cols={2}>{l.items.map(([t, d]) => <Card key={t} title={t}><p>{d}</p></Card>)}</Grid>
        </Section>
      ))}
      <Section aria-labelledby="verify">
        <div className="split">
          <div className="wp-stack">
            <SectionHeader id="verify" eyebrow="Verify it yourself" title="A test suite anyone can run." description="28 live checks covering CSP nonces, clickjacking, CSRF, oversized bodies, forged orders, SSRF, forged and replayed webhooks, price tampering and SDK integrity." />
            <div className="wp-cluster">
              <ButtonLink href="https://github.com/AmrendraTheCoder/whitepay/blob/main/scripts/security-check.sh" variant="secondary">View the suite</ButtonLink>
              <ButtonLink href="https://github.com/AmrendraTheCoder/whitepay/security" variant="ghost">Report a vulnerability</ButtonLink>
            </div>
          </div>
          <CodeBlock code={SUITE} label="Security suite output" />
        </div>
      </Section>
    </>
  )
}
