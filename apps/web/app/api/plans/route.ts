// Merchant publishes a signed subscription plan (from the shop dashboard or a shop's server via the SDK).
import { isAddress, isHex, type Address, type Hex } from "viem"
import { createPlan } from "@whitepay/server"
import { json, errorMessage, CORS, preflight } from "@/lib/json"

export const runtime = "nodejs"
export const OPTIONS = preflight

type Body = { plan: { merchant: string; amount: string; period: number; cycles: number; planId: string; expiresAt: string }; merchantSig: string; title: string; periodKey: string; single?: boolean; webhook?: string }

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Body
    const p = b?.plan
    if (!p || !isAddress(p.merchant) || !isHex(p.planId) || p.planId.length !== 66 || !isHex(b.merchantSig) || !/^\d{1,13}$/.test(String(p.amount)) || !/^\d{1,12}$/.test(String(p.expiresAt)) || typeof b.title !== "string")
      return json({ error: "malformed plan" }, { status: 400, headers: CORS })
    if (b.webhook && (typeof b.webhook !== "string" || b.webhook.length > 128)) return json({ error: "webhook must be at most 128 characters" }, { status: 400, headers: CORS })
    const r = await createPlan({
      plan: { merchant: p.merchant as Address, amount: BigInt(p.amount), period: Number(p.period), cycles: Number(p.cycles), planId: p.planId as Hex, expiresAt: BigInt(p.expiresAt) },
      merchantSig: b.merchantSig as Hex, title: b.title, periodKey: String(b.periodKey), single: !!b.single, webhook: b.webhook,
    })
    const origin = process.env.NEXT_PUBLIC_APP_URL?.startsWith("https") ? process.env.NEXT_PUBLIC_APP_URL : new URL(req.url).origin
    return json({ ...r, subscribeUrl: `${origin}/subscribe?plan=${r.planKey}` }, { headers: CORS })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 400, headers: CORS })
  }
}
