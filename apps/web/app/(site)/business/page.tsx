import type { Metadata } from "next"
import { ButtonLink, Card, CheckList, Grid, Section, SectionHeader } from "@whitepay/ui"

export const metadata: Metadata = {
  title: "Business",
  description: "Accept USDT at the counter, online and on subscription. Instant settlement to your wallet, no gas for customers, refunds, webhooks and CSV exports.",
  alternates: { canonical: "/business" },
}

const COMPARE = [
  ["Fee", "0.3–0.5% (free on testnet)", "1.8–3%", "3–6%"],
  ["Settlement", "About 1 second, to your wallet", "1–3 days", "1–5 days"],
  ["Chargebacks", "None: refunds are your decision", "Yes", "Rare"],
  ["Who can pay", "Anyone with a phone", "Card holders", "Bank accounts"],
  ["Receipts", "Tamper-evident, on Arkiv", "Processor database", "Bank statement"],
]

export default function Business() {
  return (
    <>
      <Section>
        <SectionHeader level={1} eyebrow="WondrPay for Business" title="Get paid in digital dollars, settled in a second."
          description="Money goes straight to your wallet. No payout queue, no chargebacks, no card network, and customers pay no gas."
          actions={<><ButtonLink href="/add?type=business" variant="highlight" size="lg">Open a business account</ButtonLink><ButtonLink href="https://wondrpay-demo-store.vercel.app" variant="secondary" size="lg">Try the demo store</ButtonLink></>} />
        <Grid cols={3}>
          <Card icon="qr" title="At the counter"><p>Type an amount and show the QR. Your screen confirms the moment the payment settles.</p><ButtonLink href="/merchant" variant="ghost" size="sm" iconRight="arrowRight">Open the terminal</ButtonLink></Card>
          <Card icon="globe" title="On your website"><p>Add the WondrPay button to any site. Your server signs the price, so it can't be changed in the browser.</p><ButtonLink href="/developers" variant="ghost" size="sm" iconRight="arrowRight">Checkout docs</ButtonLink></Card>
          <Card icon="repeat" title="On subscription"><p>Sell plans that renew with one tap, or with Autopay. Every renewal arrives with a signed webhook.</p><ButtonLink href="#subscriptions" variant="ghost" size="sm" iconRight="arrowRight">How it works</ButtonLink></Card>
        </Grid>
      </Section>

      <Section tone="muted" aria-labelledby="compare">
        <SectionHeader id="compare" eyebrow="Compare" title="Built for merchants, not middlemen." />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col"><span className="wp-visually-hidden">Feature</span></th><th scope="col">WondrPay</th><th scope="col">Cards</th><th scope="col">Bank transfer abroad</th></tr></thead>
            <tbody>{COMPARE.map(([k, us, card, bank]) => <tr key={k}><th scope="row">{k}</th><td className="us">{us}</td><td>{card}</td><td>{bank}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>

      <Section id="subscriptions" aria-labelledby="subs">
        <div className="split">
          <div className="wp-stack">
            <SectionHeader id="subs" eyebrow="Subscriptions" title="Recurring revenue your customers can trust." />
            <CheckList items={[
              <><b>Pay-on-request by default.</b> Each renewal is a one-tap approval in WondrPay.</>,
              <><b>Autopay when they want it.</b> One signature, with amount, period and count fixed on-chain.</>,
              <><b>Never early, never more.</b> Payments can only run in their window and up to the agreed total.</>,
              <><b>Signed webhooks</b> for started, charged, completed, cancelled and failed.</>,
            ]} />
          </div>
          <Card title="Create a plan in your dashboard">
            <p>Set the name, price, billing period and number of payments. Share the link or QR, or sell it from your site with <code>mode="subscribe"</code>.</p>
            <div className="wp-cluster"><ButtonLink href="/merchant" variant="primary">Open dashboard</ButtonLink></div>
          </Card>
        </div>
      </Section>

      <Section tone="muted" aria-labelledby="start">
        <SectionHeader id="start" eyebrow="Get started" title="Live in four steps." />
        <Grid as="ol" cols={4} className="reset-list">
          {[["Create a business wallet", "Kept separate from personal money."], ["Claim your shop name", "your-shop.wondrpay.eth, a real ENS name."], ["Verify with World ID", "One verified shop per person."], ["Take payments", "Counter QR, website checkout or subscriptions."]].map(([t, d], i) => (
            <Card as="li" key={t} title={`${i + 1}. ${t}`}><p>{d}</p></Card>
          ))}
        </Grid>
      </Section>
    </>
  )
}
