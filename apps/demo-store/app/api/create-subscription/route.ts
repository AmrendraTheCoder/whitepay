// ── WHITEPAY INTEGRATION ③ (server, autopay) ── sign a subscription plan for this shopper's checkout.
import { createWhitePaySubscription } from "@whitepay/checkout/server"
import type { Hex } from "viem"

// the plan terms live on the SERVER (demo: 3 × 0.10 USDT, every 2 minutes so judges can watch it run)
const CLUB = { title: "Chai Club (demo)", amount: "0.10", period: "demo" as const, cycles: 3 }

export async function POST() {
  try {
    const plan = await createWhitePaySubscription({
      merchantKey: process.env.STORE_MERCHANT_PK as Hex, ...CLUB, single: true, ttlSeconds: 900,
      whitepayUrl: process.env.WHITEPAY_URL ?? "https://whitepay.vercel.app",
      webhook: process.env.STORE_URL?.startsWith("https://") ? `${process.env.STORE_URL}/api/webhook` : undefined,
    })
    return Response.json(plan)
  } catch (e) {
    console.error("[create-subscription]", (e as Error).message)
    return Response.json({ error: "could not create the subscription" }, { status: 502 })
  }
}
