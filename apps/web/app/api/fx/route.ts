// GET /api/fx → { rates: { INR: 93.9, EUR: 0.895, … }, at } USDT → fiat, for "≈ ₹…" next to USDT amounts. Display only.
import { usdtRates } from "@whitepay/server"
import { json, CORS } from "@/lib/json"

export const runtime = "nodejs"

export async function GET() {
  const fx = await usdtRates()
  if (!fx) return json({ rates: {}, at: 0 }, { headers: { ...CORS, "cache-control": "public, max-age=60" } })
  return json(fx, { headers: { ...CORS, "cache-control": "public, max-age=300, stale-while-revalidate=3600" } })
}
