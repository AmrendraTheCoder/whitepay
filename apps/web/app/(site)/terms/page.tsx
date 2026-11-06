import type { Metadata } from "next"
import { Section, SectionHeader } from "@whitepay/ui"
export const metadata: Metadata = { title: "Terms of use", description: "Terms for using the WondrPay testnet preview.", alternates: { canonical: "/terms" } }

export default function Terms() {
  return (
    <Section>
      <SectionHeader level={1} eyebrow="Legal" title="Terms of use" />
      <div className="prose">
        <p><b>Last updated: 6 November 2026.</b> WondrPay is a hackathon project built for ETHGlobal Mumbai and is offered as a testnet preview. By using it you agree to these terms.</p>
        <h2>1. Testnet only</h2>
        <p>WondrPay runs on Whitechain Sepolia testnet with test USDT, which has no monetary value. Do not send real funds or rely on WondrPay for real payments.</p>
        <h2>2. Your wallet, your responsibility</h2>
        <p>Your wallet key is created and stored on your device, encrypted with your PIN or passkey. We never see it and cannot recover it. If you clear your browser data without a backup, the wallet is gone.</p>
        <h2>3. Payments are final</h2>
        <p>Blockchain payments cannot be reversed by WondrPay. A shop may refund you; refunds can only go to the paying wallet and never exceed the amount paid. Autopay payments run on the schedule you approved until completed or cancelled.</p>
        <h2>4. Merchants</h2>
        <p>Merchants are responsible for the goods and services they sell and for complying with the laws that apply to them. A World ID "verified" badge confirms a unique human runs the shop; it is not an endorsement.</p>
        <h2>5. Public data</h2>
        <p>Payment requests, receipts and subscriptions are written to Arkiv and transactions to Whitechain. Both are public. Do not put personal information in notes.</p>
        <h2>6. No warranty</h2>
        <p>The service is provided "as is", without warranties of any kind, and may change or stop at any time. To the extent permitted by law, the authors are not liable for any loss arising from its use.</p>
        <h2>7. Contact</h2>
        <p>Questions or issues: <a href="https://github.com/AmrendraTheCoder/whitepay/issues" target="_blank" rel="noopener noreferrer">open an issue on GitHub</a>.</p>
      </div>
    </Section>
  )
}
