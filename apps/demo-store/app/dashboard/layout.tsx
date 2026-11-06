// The merchant console is WondrPay's product (the store just embeds it), so it wears WondrPay's own
// palette and type (Manrope, brand blue + lime, dark by default) instead of the store's chai theme.
import { Manrope } from "next/font/google"
import type { Metadata } from "next"

const sans = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-wp", display: "swap" })

export const metadata: Metadata = { title: "Orders · WondrPay Business", description: "Chai & Co. orders and refund requests, settled on Whitechain." }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className={`wpc ${sans.variable}`}>{children}</div>
}
