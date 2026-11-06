"use client"
// "≈ ₹1,035" under a USDT amount, in the viewer's currency. Renders nothing until the rate is known (or for USD).
import { useLocalAmount } from "@/lib/fx"

export function LocalAmount({ micro, className = "local-amt" }: { micro: string | bigint | undefined; className?: string }) {
  const text = useLocalAmount(micro)
  if (!text) return null
  return <span className={className} title="Approximate, at today's rate. You pay in USDT.">≈ {text}<span className="sr-only"> approximately, you pay in USDT</span></span>
}
