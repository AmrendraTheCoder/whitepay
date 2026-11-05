import type { Metadata } from "next"
import QRCode from "qrcode"
import { Accordion, Badge, ButtonLink, Card, CheckList, CodeBlock, Grid, Icon, NumberTicker, Section, SectionHeader, Spotlight, Stat, Stats, Tilt, type IconName } from "@whitepay/ui"
import { ChainScene } from "./chain-scene"
import { OpenApp } from "./open-app"
import { networkStats } from "@/lib/site-stats"

export const metadata: Metadata = {
  title: { absolute: "WhitePay · Pay anyone in digital dollars" },
  description: "Scan a QR, confirm with your fingerprint, settled in about a second. USDT payments, checkout and subscriptions on Whitechain, with ENS names and receipts on Arkiv.",
  alternates: { canonical: "/" },
}

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: "scan", title: "Scan", body: "Point your camera at a WhitePay QR. You see the shop's verified name and the exact amount before anything happens." },
  { icon: "fingerprint", title: "Confirm", body: "Your fingerprint unlocks the key on your phone, which signs this one payment. Only the signature leaves your device." },
  { icon: "check", title: "Done", body: "Settled on Whitechain in about a second. The receipt is saved to Arkiv and the shop's screen shows the payment." },
]

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "bolt", title: "No gas, ever", body: "WhitePay's relayer pays the network fee. You only ever see the amount you send." },
  { icon: "key", title: "No seed phrase", body: "Your key is created and encrypted on your phone, unlocked by fingerprint or a 6-digit PIN." },
  { icon: "at", title: "Names, not addresses", body: "Pay ravi.whitepay.eth instead of a 42-character address. Every name is a real ENS name." },
  { icon: "repeat", title: "Subscriptions", body: "Approve renewals with one tap, or turn on Autopay. Every payment has hard limits enforced on-chain." },
  { icon: "receipt", title: "Receipts that last", body: "Each payment writes a receipt to Arkiv: searchable, exportable, and not locked in one company's database." },
  { icon: "shield", title: "Verified shops", body: "Shops verify with World ID, one shop per person, so you know a real human is behind the counter." },
]

const FAQ = [
  { id: "real-money", title: "Is this real money?", content: "Not yet. WhitePay runs on Whitechain Sepolia testnet with test USDT, so you can try every feature safely. Mainnet follows audits and licensing." },
  { id: "wallet", title: "Do I need a crypto wallet?", content: "No. WhitePay creates one on your phone in seconds and protects it with your fingerprint or PIN. If you already use MetaMask, connect it with WalletConnect." },
  { id: "gas", title: "Who pays the network fees?", content: "WhitePay does. Payments are signed USDT authorizations that our relayer submits, so you never need a gas token." },
  { id: "double", title: "Can a shop charge me twice?", content: "No. Each payment carries a single-use nonce and the exact amount the shop signed. Subscription payments are capped and can only run in their own time window." },
  { id: "refunds", title: "Can a shop refund me?", content: "Yes, from its dashboard with no fee. A refund can only go back to the wallet that paid, and never for more than you paid." },
  { id: "data", title: "Where is my data stored?", content: "Your key stays on your device. Payment requests and receipts are public, tamper-evident records on Arkiv with no personal data in clear text." },
]

const SNIPPET = `<script src="https://whitepay.vercel.app/sdk/v1.2.1/checkout.js"
        integrity="sha384-…" crossorigin="anonymous" defer></script>

<whitepay-button order-endpoint="/api/create-order"
                 payload='{"sku":"chai-kit"}'></whitepay-button>`

const fmt = (n: number | null) => (n == null ? null : n.toLocaleString("en-US"))

const ROWS = [
  { a: "C", color: "#c2562b", name: "Chai Point", meta: "Today · QR", amount: "−2.50", incoming: false },
  { a: "A", color: "#5b49d6", name: "Ananya", meta: "Yesterday", amount: "+40.00", incoming: true },
  { a: "K", color: "#1f7a52", name: "Chai Club", meta: "Subscription", amount: "−4.99", incoming: false },
]

function PhonePreview() {
  return (
    <figure className="phone" aria-label="The WhitePay wallet home screen">
      <div className="phone-screen" aria-hidden>
        <div className="phone-search"><Icon name="scan" size={14} /> Pay friends and merchants</div>
        <div className="phone-balance"><small>USDT balance</small><b>1,284.50</b><small>ravi.whitepay.eth</small></div>
        <div className="phone-actions">
          {([["scan", "Scan"], ["arrowUpRight", "Pay"], ["qr", "Receive"], ["store", "Shop"]] as const).map(([i, l]) => <span key={l}><i><Icon name={i} size={18} /></i>{l}</span>)}
        </div>
        {ROWS.map((r) => (
          <div key={r.name} className="phone-row"><span className="av" style={{ background: r.color }}>{r.a}</span><div><b>{r.name}</b><small>{r.meta}</small></div><span className={r.incoming ? "in" : undefined}>{r.amount}</span></div>
        ))}
      </div>
    </figure>
  )
}

export default async function Landing() {
  const [s, qr] = await Promise.all([
    networkStats(),
    QRCode.toString("https://whitepay.vercel.app/business", { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0b0d14", light: "#ffffff" } }),
  ])
  return (
    <>
      <section className="site-hero" aria-labelledby="hero-title">
        <div className="wp-container">
          <div className="site-hero-copy">
            <Badge tone="success" dot>Live on Whitechain testnet</Badge>
            <h1 id="hero-title" className="wp-title-1">Pay anyone in digital dollars.</h1>
            <p className="wp-lead">WhitePay brings UPI-style payments to USDT. Scan a QR, confirm with your fingerprint, and it settles in about a second. No gas, no seed phrase.</p>
            <div className="wp-cluster">
              <OpenApp size="lg" label="Get started" />
              <ButtonLink href="/business" variant="secondary" size="lg" iconRight="arrowRight">Accept payments</ButtonLink>
            </div>
            <div className="site-hero-note">
              <span><Icon name="check" size={16} />Works in your browser</span>
              <span><Icon name="check" size={16} />Free for personal use</span>
              <span><Icon name="check" size={16} />MetaMask supported</span>
            </div>
          </div>
          <div className="site-hero-stage"><PhonePreview /></div>
        </div>
      </section>

      <Section size="sm" aria-labelledby="network">
        <SectionHeader id="network" eyebrow="Live network" title="A new block every second." description="This is Whitechain right now. Payments flow in and settle in the next block. Move your cursor over the chain to inspect a block." split />
        <ChainScene startBlock={s.block} />
        <Stats label="Live network numbers">
          <Stat value="~1 s" label="Settlement time" />
          <Stat value="0" label="Gas paid by users" />
          <Stat value={s.receipts == null ? null : <NumberTicker value={s.receipts} />} label="Receipts on Arkiv" />
          <Stat value={s.block == null ? null : <NumberTicker value={s.block} />} label="Latest Whitechain block" live />
        </Stats>
      </Section>

      <Section id="product" aria-labelledby="how">
        <SectionHeader id="how" eyebrow="How it works" title="Three taps from QR to receipt." description="No exchange account, no gas token, no 24-word phrase." />
        <Grid as="ol" cols={3} className="reset-list">
          {STEPS.map((st, i) => <li key={st.title}><Spotlight><Card icon={st.icon} title={`${i + 1}. ${st.title}`}><p>{st.body}</p></Card></Spotlight></li>)}
        </Grid>
      </Section>

      <Section tone="muted" id="autopay" aria-labelledby="features">
        <SectionHeader id="features" eyebrow="Why WhitePay" title="Everything a payment app should do, nothing a crypto wallet makes you learn." />
        <Grid cols={3}>
          {FEATURES.map((f) => <Spotlight key={f.title}><Card icon={f.icon} title={f.title}><p>{f.body}</p></Card></Spotlight>)}
        </Grid>
      </Section>

      <Section aria-labelledby="business">
        <div className="split">
          <div className="wp-stack">
            <SectionHeader id="business" eyebrow="For business" title="Get paid in a second. Keep more of it." description="Show a QR at the counter, add checkout to your site, or sell subscriptions. Money lands in your wallet, not a payout queue." />
            <CheckList items={[
              <><b>Counter QR</b> with a live "received" screen</>,
              <><b>Checkout SDK</b> for any website in about 20 lines</>,
              <><b>Refunds, CSV export and signed webhooks</b> built in</>,
              <><b>Verified badge</b> through World ID</>,
            ]} />
            <div className="wp-cluster">
              <ButtonLink href="/business" variant="highlight">Accept payments</ButtonLink>
              <ButtonLink href="https://whitepay-demo-store.vercel.app" variant="secondary">See a live store</ButtonLink>
            </div>
          </div>
          <Tilt max={10}><Card className="terminal" aria-label="Example counter QR for 2.50 USDT">
            <span className="wp-muted">Chai Point, Bandra</span>
            <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
            <span className="amount">2.50 <span className="wp-muted">USDT</span></span>
            <Badge tone="success" dot>Waiting for payment</Badge>
          </Card></Tilt>
        </div>
      </Section>

      <Section tone="muted" aria-labelledby="developers">
        <div className="split">
          <CodeBlock code={SNIPPET} label="Checkout integration example" />
          <div className="wp-stack">
            <SectionHeader id="developers" eyebrow="For developers" title="One script tag. Any stack." description="A standard Web Component in the browser and a small TypeScript kit on your server. Signed orders, signed webhooks, verifiable on-chain." />
            <div className="wp-cluster">
              <ButtonLink href="/developers" variant="primary" iconRight="arrowRight">Read the docs</ButtonLink>
              <ButtonLink href="https://github.com/AmrendraTheCoder/whitepay" variant="secondary">GitHub</ButtonLink>
            </div>
          </div>
        </div>
      </Section>

      <Section aria-labelledby="security">
        <SectionHeader id="security" eyebrow="Security" title="Your money moves only when you say so." actions={<ButtonLink href="/security" variant="secondary" iconRight="arrowRight">How WhitePay is secured</ButtonLink>} />
        <Grid cols={3}>
          <Spotlight><Card icon="key" title="Keys stay on your phone"><p>Encrypted with your fingerprint (passkey) or PIN, locked after five wrong tries.</p></Card></Spotlight>
          <Spotlight><Card icon="lock" title="Every amount is signed"><p>The shop signs the price, you sign the payment, and the contract settles exactly that, once.</p></Card></Spotlight>
          <Spotlight><Card icon="shield" title="Tested in the open"><p>Strict CSP, signed webhooks, SSRF guards and rate limits, with a public test suite anyone can run.</p></Card></Spotlight>
        </Grid>
      </Section>

      <Section tone="muted" aria-labelledby="faq">
        <SectionHeader id="faq" eyebrow="FAQ" title="Questions, answered." />
        <Accordion items={FAQ} exclusive name="faq" />
      </Section>

      <Section aria-labelledby="cta">
        <SectionHeader id="cta" align="center" title="Your first payment takes 30 seconds." description="Create a wallet in your browser, get test USDT, and scan any WhitePay QR." actions={<><OpenApp size="lg" label="Get started" /><ButtonLink href="/business" variant="secondary" size="lg">For business</ButtonLink></>} />
      </Section>
    </>
  )
}
