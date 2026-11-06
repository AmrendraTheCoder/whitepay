"use client"
// "≈ ₹1,035" next to USDT amounts, in the viewer's own currency (from their browser locale). Display only.
import { useEffect, useState } from "react"

const REGION_CURRENCY: Record<string, string> = {
  IN: "INR", US: "USD", GB: "GBP", UA: "UAH", NG: "NGN", BR: "BRL", TR: "TRY", AR: "ARS", PH: "PHP", ID: "IDR",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", PT: "EUR", IE: "EUR", AT: "EUR", BE: "EUR", FI: "EUR", GR: "EUR",
}
/** The viewer's currency from their locale (en-IN → INR), else null (we then show USDT only). */
export function localCurrency(): string | null {
  if (typeof navigator === "undefined") return null
  const tags = [...(navigator.languages ?? []), navigator.language].filter(Boolean)
  // a tag with its own region (en-IN, pt-PT) beats a guessed one (plain "pt" would guess Brazil)
  for (const tag of [...tags.filter((t) => /-[A-Za-z]{2}\b/.test(t)), ...tags]) {
    try {
      const region = new Intl.Locale(tag).maximize().region
      if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region]
    } catch {}
  }
  return null
}

let shared: Promise<Record<string, number>> | null = null
const loadRates = () => (shared ??= fetch("/api/fx").then((r) => r.json()).then((d) => {
  const rates = d.rates ?? {}
  if (!Object.keys(rates).length) shared = null // try again next time
  return rates
}).catch(() => { shared = null; return {} }))

/** Formatted local approximation of `micro` USDT (6 decimals), or null while loading / when unknown or USD-like. */
export function useLocalAmount(micro: string | bigint | undefined, currency?: string | null) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    const cur = currency === undefined ? localCurrency() : currency
    if (!cur || cur === "USD" || micro == null) return
    let live = true
    void loadRates().then((rates) => {
      const rate = rates[cur]
      if (!live || !rate) return
      const value = (Number(micro) / 1e6) * rate
      try { setText(new Intl.NumberFormat(undefined, { style: "currency", currency: cur, minimumFractionDigits: 0, maximumFractionDigits: value >= 100 ? 0 : 2 }).format(value)) } catch {}
    })
    return () => { live = false }
  }, [micro, currency])
  return text
}
