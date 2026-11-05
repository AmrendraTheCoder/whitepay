import type { Metadata } from "next"
import { headers } from "next/headers"
import { SDK_SRC, SDK_SRI } from "@/lib/sdk"
import "./store.css"

export const metadata: Metadata = {
  title: "Chai & Co. · a store that accepts WhitePay",
  description: "Demo merchant website integrating the WhitePay Checkout SDK: USDT on Whitechain, zero gas for shoppers.",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined // per-request CSP nonce (proxy.ts)
  return (
    <html lang="en">
      <head>
        {/* ── WHITEPAY INTEGRATION ① ── load the SDK: one script tag, pinned with Subresource Integrity */}
        <script src={SDK_SRC} integrity={SDK_SRI} crossOrigin="anonymous" nonce={nonce} defer />
      </head>
      <body>{children}</body>
    </html>
  )
}
