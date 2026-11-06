import type { Metadata } from "next"
import { Section, SectionHeader } from "@whitepay/ui"
export const metadata: Metadata = { title: "Privacy", description: "What WondrPay stores, where, and what never leaves your device.", alternates: { canonical: "/privacy" } }

export default function Privacy() {
  return (
    <Section>
      <SectionHeader level={1} eyebrow="Legal" title="Privacy" />
      <div className="prose">
        <p><b>Last updated: 6 November 2026.</b> WondrPay is designed to know as little about you as possible.</p>
        <h2>Never leaves your device</h2>
        <p>Your wallet key, PIN and fingerprint. Biometrics are handled entirely by your phone's passkey system; WondrPay only receives a yes/no and an encryption secret it cannot read.</p>
        <h2>Public by design</h2>
        <p>Payments on Whitechain (addresses, amounts, times), your WondrPay name on ENS if you claim one, and payment requests, receipts and subscriptions on Arkiv. These are public blockchains and data networks: anyone can read them, and they can't be deleted by us.</p>
        <h2>World ID</h2>
        <p>When you verify, World ID sends us a zero-knowledge proof and an anonymous identifier (nullifier) for that action. We store the nullifier to enforce "one name / one shop per person". We never receive your name, face or iris data.</p>
        <h2>Our servers</h2>
        <p>Standard request logs (IP address, time, path) kept by our hosting provider for security and rate limiting. No advertising trackers, no analytics cookies, no data sales.</p>
        <h2>On this device</h2>
        <p>Local storage holds your encrypted wallet and preferences (theme, hidden balance). A tab-scoped session keeps your wallet unlocked for 15 idle minutes. Clearing site data removes all of it.</p>
        <h2>Contact</h2>
        <p><a href="https://github.com/AmrendraTheCoder/whitepay/issues" target="_blank" rel="noopener noreferrer">Open an issue on GitHub</a>.</p>
      </div>
    </Section>
  )
}
