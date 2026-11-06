// USDT -> local currency, for DISPLAY only ("≈ ₹1,035"). Payments are always in USDT; nothing is converted.
// One CoinGecko call for all supported currencies, cached 10 minutes per instance; stale rates are served for up
// to 6 h if CoinGecko is down, and after that the UI simply shows USDT alone.
import { cached } from "./cache"

export const FX_CURRENCIES = ["INR", "EUR", "USD", "GBP", "UAH", "NGN", "BRL", "TRY", "ARS", "PHP", "IDR"] as const
export type FxCurrency = (typeof FX_CURRENCIES)[number]
let lastGood: { rates: Record<string, number>; at: number } | null = null

export async function usdtRates(): Promise<{ rates: Partial<Record<FxCurrency, number>>; at: number } | null> {
  try {
    return await cached("fx:usdt", 600_000, async () => {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=${FX_CURRENCIES.join(",").toLowerCase()}`, { signal: AbortSignal.timeout(4000) })
      if (!r.ok) throw new Error(`coingecko ${r.status}`)
      const d = (await r.json()) as { tether?: Record<string, number> }
      const rates: Record<string, number> = {}
      for (const c of FX_CURRENCIES) { const x = d.tether?.[c.toLowerCase()]; if (typeof x === "number" && x > 0 && Number.isFinite(x)) rates[c] = x }
      if (!Object.keys(rates).length) throw new Error("no rates")
      lastGood = { rates, at: Math.floor(Date.now() / 1000) }
      return lastGood
    })
  } catch {
    return lastGood && Date.now() / 1000 - lastGood.at < 6 * 3600 ? lastGood : null
  }
}
