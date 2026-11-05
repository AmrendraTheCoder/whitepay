import type { Metadata, Viewport } from "next"
import { Manrope } from "next/font/google"
import "./globals.css"
import { headers } from "next/headers"
import { THEME_BOOT } from "@/lib/theme-boot"

// Whitechain uses a geometric grotesk; Manrope is the closest open match.
const sans = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sans", display: "swap" })

export const metadata: Metadata = {
  title: "WhitePay",
  description: "Scan, verify, pay in USDT on Whitechain. No gas, no seed phrase.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "WhitePay", statusBarStyle: "black-translucent" },
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
      <body>{children}</body>
    </html>
  )
}
