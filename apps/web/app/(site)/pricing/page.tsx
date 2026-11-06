import type { Metadata } from "next"
import { Badge, ButtonLink, Card, CheckList, Grid, Section, SectionHeader } from "@whitepay/ui"

export const metadata: Metadata = { title: "Pricing", description: "Personal payments are free. Merchants pay a small fee only when they get paid. Everything is free during the testnet.", alternates: { canonical: "/pricing" } }

const PLANS = [
  { name: "Personal", price: "Free", unit: "forever", cta: { label: "Open the app", href: "/app", variant: "secondary" as const }, items: ["Send and receive USDT", "No gas fees", "Fingerprint or PIN wallet", "Your own .wondrpay.eth name", "Subscriptions and Autopay"] },
  { name: "Business", price: "0.4%", unit: "per payment received", featured: true, cta: { label: "Open a business account", href: "/add?type=business", variant: "highlight" as const }, items: ["Counter QR terminal", "Checkout SDK and signed webhooks", "Subscription plans", "Refunds and CSV export", "World ID verified badge", "Settlement in about a second"] },
  { name: "Scale", price: "Custom", unit: "volume pricing", cta: { label: "Contact us", href: "https://github.com/AmrendraTheCoder/whitepay/issues", variant: "secondary" as const }, items: ["Everything in Business", "Multiple outlets and staff roles", "Dedicated relayer capacity", "Volume-based fees", "Priority support"] },
]

export default function Pricing() {
  return (
    <Section>
      <SectionHeader level={1} align="center" eyebrow="Pricing" title="Free to pay. Fair to get paid." description="No monthly fees, no setup fees, no gas. Merchants pay only when money arrives." actions={<Badge tone="warning" dot>Everything is free during the testnet</Badge>} />
      <Grid cols={3}>
        {PLANS.map((p) => (
          <Card key={p.name} className="price-card" data-featured={p.featured || undefined} aria-label={`${p.name} plan`}>
            <div className="wp-cluster"><h2 className="wp-title-3">{p.name}</h2>{p.featured && <Badge tone="highlight">Most popular</Badge>}</div>
            <p className="price">{p.price} <small>{p.unit}</small></p>
            <CheckList items={p.items} />
            <ButtonLink href={p.cta.href} variant={p.cta.variant} fullWidth>{p.cta.label}</ButtonLink>
          </Card>
        ))}
      </Grid>
      <p className="wp-note">Mainnet fees are indicative and include network gas. Customers never pay a fee to pay a merchant. Refunds are free.</p>
    </Section>
  )
}
