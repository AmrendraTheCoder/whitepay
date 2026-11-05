import type { Metadata } from "next"
import Script from "next/script"

export const metadata: Metadata = { title: "Chai & Co. · demo store", description: "A separate shop that accepts WhitePay (USDT on Whitechain)." }
const WHITEPAY = process.env.NEXT_PUBLIC_WHITEPAY_URL ?? "https://whitepay.vercel.app"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif", background: "#faf7f2", color: "#2b1d12" }}>
        {children}
        {/* THE MERCHANT INTEGRATION, front end: one script tag */}
        <Script src={`${WHITEPAY}/sdk/checkout.js`} strategy="afterInteractive" />
      </body>
    </html>
  )
}
