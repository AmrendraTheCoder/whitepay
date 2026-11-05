import type { Metadata, Viewport } from "next"
import { Manrope } from "next/font/google"
import "./globals.css"

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
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0c19" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6fd" },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>{children}</body>
    </html>
  )
}
