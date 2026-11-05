import "@whitepay/ui/styles.css"
import { ButtonLink, Section, SectionHeader } from "@whitepay/ui"

export default function NotFound() {
  return (
    <div data-theme="ink" className="wp-center-screen">
      <Section>
        <SectionHeader level={1} align="center" eyebrow="404" title="This page doesn't exist."
          description="The link may be old, or a payment request may have expired (payment QR codes last 5 minutes)."
          actions={<><ButtonLink href="/" variant="highlight">Go home</ButtonLink><ButtonLink href="/app" variant="secondary">Open your wallet</ButtonLink></>} />
      </Section>
    </div>
  )
}
