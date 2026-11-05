import type { Metadata } from "next"
import { headers } from "next/headers"
import { SDK_SRC, SDK_SRI } from "@/lib/sdk"
import { Fraunces, Inter } from "next/font/google"
import "@whitepay/ui/styles.css"
import "./store.css"
import { Providers } from "./providers"

const display = Fraunces({ subsets: ["latin"], weight: ["500", "600", "700"], style: ["normal", "italic"], variable: "--f-display", display: "swap" })
const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--f-sans", display: "swap" })

export const metadata: Metadata = {
  title: "Chai & Co. · Small-batch chai from Mumbai, paid with WhitePay",
  description: "Demo merchant website integrating the WhitePay Checkout SDK: USDT on Whitechain, zero gas for shoppers.",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined // per-request CSP nonce (proxy.ts)
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <head>
        {/* ── WHITEPAY INTEGRATION ① ── load the SDK: one script tag, pinned with Subresource Integrity */}
        <script src={SDK_SRC} integrity={SDK_SRI} crossOrigin="anonymous" nonce={nonce} defer />
      </head>
      <body data-theme="chai"><Providers>{children}</Providers></body>
    </html>
  )
}
