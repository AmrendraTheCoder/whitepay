// ── WONDRPAY INTEGRATION ⑦ (server) ── answer a customer's refund request with the shop key:
// approve a share (refunded on-chain right away, only to the original payer) or decline with a message.
// Moves the shop's money, so it needs the admin code (STORE_ADMIN_CODE), checked in constant time.
import { respondToWondrPayRefund } from "@whitepay/checkout/server"
import { timingSafeEqual, createHash } from "node:crypto"
import type { Hex } from "viem"

export const runtime = "nodejs"
export const maxDuration = 60
const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest())

export async function POST(req: Request) {
  const want = process.env.STORE_ADMIN_CODE
  if (!want) return Response.json({ error: "Set STORE_ADMIN_CODE on the store to answer refunds" }, { status: 503 })
  let b: any
  try { b = await req.json() } catch { return Response.json({ error: "bad json" }, { status: 400 }) }
  if (typeof b.code !== "string" || !same(b.code, want)) return Response.json({ error: "Wrong admin code" }, { status: 401 })
  if (typeof b.caseId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(b.caseId) || (b.decision !== "approve" && b.decision !== "reject"))
    return Response.json({ error: "malformed" }, { status: 400 })
  try {
    const c = await respondToWondrPayRefund({
      merchantKey: process.env.STORE_MERCHANT_PK as Hex, caseId: b.caseId as Hex, decision: b.decision,
      percent: Number(b.percent ?? 100), message: String(b.message ?? "").slice(0, 500),
      whitepayUrl: process.env.WHITEPAY_URL ?? "https://wondrpay.vercel.app",
    })
    return Response.json({ case: c })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 })
  }
}
