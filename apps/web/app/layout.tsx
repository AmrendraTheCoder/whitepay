import type { Metadata, Viewport } from "next"
import { Manrope } from "next/font/google"
import "./globals.css"
import { headers } from "next/headers"
import { THEME_BOOT } from "@/lib/theme-boot"
import { TabBarHost } from "./ui"

// Whitechain uses a geometric grotesk; Manrope is the closest open match.
const sans = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sans", display: "swap" })

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wondrpay.vercel.app"

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "WondrPay", template: "%s · WondrPay" },
  description: "Pay anyone in digital dollars. Scan, confirm with your fingerprint, settled on Whitechain in about a second. No gas, no seed phrase.",
  applicationName: "WondrPay",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "WondrPay", statusBarStyle: "black-translucent" },
  openGraph: { type: "website", siteName: "WondrPay", url: SITE, title: "WondrPay · Pay anyone in digital dollars", description: "UPI-style USDT payments on Whitechain. No gas, no seed phrase. Checkout SDK and Autopay for business." },
  twitter: { card: "summary_large_image", title: "WondrPay · Pay anyone in digital dollars", description: "UPI-style USDT payments on Whitechain. No gas, no seed phrase." },
  keywords: ["USDT payments", "stablecoin payments", "Whitechain", "UPI crypto", "gasless payments", "crypto checkout", "ENS", "Arkiv", "World ID", "autopay"],
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#2448ff",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // per-request CSP nonce from proxy.ts (this also makes every page dynamically rendered, as nonces require)
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}<TabBarHost /></body>
    </html>
  )
}
