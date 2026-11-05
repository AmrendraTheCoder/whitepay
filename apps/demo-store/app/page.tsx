"use client"
import { useEffect, useState } from "react"

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "whitepay-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { "order-endpoint"?: string; payload?: string; label?: string }
    }
  }
}

const PRODUCTS = [
  { sku: "chai-kit", name: "Masala Chai Kit", price: "2.50", emoji: "🫖", blurb: "Assam tea, cardamom, ginger. Brews 20 cups." },
  { sku: "tote-bag", name: "Chai & Co. Tote", price: "1.20", emoji: "👜", blurb: "Organic cotton, block-printed in Jaipur." },
  { sku: "sticker-pack", name: "Sticker Pack", price: "0.40", emoji: "✨", blurb: "Six vinyl stickers for your laptop." },
]

type Paid = { orderId: string; txHash: string; explorer: string; amount: string }

export default function Store() {
  const [paid, setPaid] = useState<Paid | null>(null)
  const [verified, setVerified] = useState<string>("")

  // THE MERCHANT INTEGRATION, front end: listen for the paid event
  useEffect(() => {
    const onPaid = (e: Event) => setPaid((e as CustomEvent<Paid>).detail)
    document.addEventListener("whitepay:paid", onPaid)
    return () => document.removeEventListener("whitepay:paid", onPaid)
  }, [])

  useEffect(() => {
    if (!paid?.txHash) return
    setVerified("Checking Whitechain…")
    fetch(`/api/verify?tx=${paid.txHash}&orderId=${paid.orderId}`).then((r) => r.json())
      .then((v) => setVerified(v.ok ? `Verified on-chain in block ${v.block} ✓` : `Not verified: ${v.reason}`))
  }, [paid])

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px 60px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 800 }}>Chai &amp; Co.</div>
        <span style={{ fontSize: 13, background: "#2b1d12", color: "#faf7f2", padding: "6px 12px", borderRadius: 999 }}>Demo store · pays with WhitePay</span>
      </header>
      <p style={{ color: "#7a5a43", maxWidth: 560 }}>
        A separate website that accepts USDT on Whitechain with the WhitePay checkout. Shoppers pay no gas;
        the order is settled to <b>demo-store.whitepay.eth</b> and verified on-chain by this shop&apos;s server.
      </p>

      {paid && (
        <section style={{ background: "#fff", border: "2px solid #12a86b", borderRadius: 20, padding: 20, margin: "20px 0" }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Thank you! Order paid ✓</div>
          <div style={{ color: "#7a5a43", marginTop: 6 }}>{verified}</div>
          <a href={paid.explorer} target="_blank" rel="noreferrer" style={{ color: "#2448ff", fontWeight: 700 }}>View transaction on Whitechain ↗</a>
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18, marginTop: 22 }}>
        {PRODUCTS.map((p) => (
          <article key={p.sku} style={{ background: "#fff", borderRadius: 22, padding: 20, boxShadow: "0 10px 30px rgba(43,29,18,.08)" }}>
            <div style={{ fontSize: 64, textAlign: "center", background: "#f3ebe0", borderRadius: 16, padding: "18px 0" }}>{p.emoji}</div>
            <h3 style={{ margin: "14px 0 4px" }}>{p.name}</h3>
            <div style={{ color: "#7a5a43", fontSize: 14, minHeight: 40 }}>{p.blurb}</div>
            <div style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 14px" }}>{p.price} USDT</div>
            <whitepay-button order-endpoint="/api/create-order" payload={JSON.stringify({ sku: p.sku })} label={`Pay ${p.price} USDT`} />
          </article>
        ))}
      </div>

      <details style={{ marginTop: 36, background: "#fff", borderRadius: 16, padding: 16 }}>
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>How this store integrates WhitePay (≈20 lines)</summary>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{`// layout.tsx: 1 line
<Script src="https://whitepay.vercel.app/sdk/checkout.js" />

// page.tsx: button + event (3 lines)
<whitepay-button order-endpoint="/api/create-order" payload='{"sku":"chai-kit"}' />
document.addEventListener("whitepay:paid", (e) => showThankYou(e.detail))

// api/create-order/route.ts: sign + publish (8 lines)
const order = await createWhitePayOrder({ merchantKey: process.env.STORE_MERCHANT_PK,
  amount: CATALOG[sku], webhook: \`\${process.env.STORE_URL}/api/webhook\` })
return Response.json(order)

// api/webhook/route.ts: verify on-chain, then fulfil (5 lines)
const v = await verifyWhitePayPayment({ txHash, merchant: SHOP, orderId, minAmount })
if (v.ok) fulfil(orderId)`}</pre>
      </details>
    </main>
  )
}
