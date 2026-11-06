// Refund requests (trustless case log on Arkiv, see packages/server/src/refund-cases.ts).
// GET  ?merchant= | ?payer= | ?caseId= | ?paymentId=   cases, each re-verified from its signed events
// POST { action: "open" | "respond" | "reply", ... }   every action is signed by the party taking it
import { isAddress, isHex, type Address, type Hex } from "viem"
import { listRefundCases, openRefundRequest, respondToRefund, replyToRefund, refundKeeper } from "@whitepay/server"
import { after } from "next/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60
const id = (x: unknown): x is Hex => typeof x === "string" && isHex(x) && x.length === 66

export async function GET(req: Request) {
  const u = new URL(req.url)
  const q = (k: string) => u.searchParams.get(k) ?? ""
  const f = isAddress(q("merchant")) ? { merchant: q("merchant") as Address }
    : isAddress(q("payer")) ? { payer: q("payer") as Address }
    : id(q("caseId")) ? { caseId: q("caseId") as Hex }
    : id(q("paymentId")) ? { paymentId: q("paymentId") as Hex }
    : null
  if (!f) return json({ error: "pass ?merchant=, ?payer=, ?caseId= or ?paymentId=" }, { status: 400 })
  try {
    const cases = await listRefundCases(f)
    // nudge the keeper whenever a dashboard looks (daily cron is the backstop)
    if ("merchant" in f) after(() => refundKeeper().catch(() => {}))
    return json({ cases })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}

export async function POST(req: Request) {
  let b: any
  try { b = await req.json() } catch { return json({ error: "bad json" }, { status: 400 }) }
  try {
    if (b.action === "open") {
      if (!id(b.paymentId) || !isAddress(b.payer) || !isHex(b.signature)) return json({ error: "malformed request" }, { status: 400 })
      const c = await openRefundRequest({ paymentId: b.paymentId, payer: b.payer, reason: String(b.reason), message: String(b.message ?? ""),
        evidence: b.evidence ? String(b.evidence) : undefined, issuedAt: Number(b.issuedAt), signature: b.signature, result: b.result || undefined })
      return json({ case: c })
    }
    if (b.action === "respond") {
      if (!id(b.caseId) || !isAddress(b.merchant) || !isHex(b.signature) || (b.decision !== "approve" && b.decision !== "reject")) return json({ error: "malformed response" }, { status: 400 })
      const ra = b.refundAuth
      const refundAuth = ra && isAddress(ra.from) && isHex(ra.signature) && /^\d+$/.test(String(ra.value))
        ? { from: ra.from as Address, validAfter: BigInt(ra.validAfter ?? 0), validBefore: BigInt(ra.validBefore), signature: ra.signature as Hex, value: String(ra.value) }
        : undefined
      const c = await respondToRefund({ caseId: b.caseId, merchant: b.merchant, decision: b.decision, percent: Number(b.percent ?? 0),
        message: String(b.message ?? ""), issuedAt: Number(b.issuedAt), signature: b.signature, refundAuth })
      return json({ case: c })
    }
    if (b.action === "reply") {
      if (!id(b.caseId) || !isAddress(b.payer) || !isHex(b.signature)) return json({ error: "malformed reply" }, { status: 400 })
      const c = await replyToRefund({ caseId: b.caseId, payer: b.payer, message: String(b.message ?? ""), evidence: b.evidence ? String(b.evidence) : undefined,
        issuedAt: Number(b.issuedAt), signature: b.signature })
      return json({ case: c })
    }
    return json({ error: "unknown action" }, { status: 400 })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 400 })
  }
}
