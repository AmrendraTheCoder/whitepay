// Payer: what the app calls after scanning. Fetches the Arkiv entity and runs the 4 checks.
// Merchant: polls the same endpoint for live status (pending -> paid | depleted).
import { isHex, type Hex } from "viem"
import { fetchRequest, verifyRequest, getReceipt, getMerchantByAddress, arkiv, paidOnChain, cached, orderDigest } from "@whitepay/server"
import { EXPLORER_URL } from "@whitepay/shared"
import { json as rawJson, errorMessage, CORS, preflight } from "@/lib/json"

// the checkout button polls this from merchants' sites
const json = (d: unknown, init?: ResponseInit) => rawJson(d, { ...init, headers: { ...CORS, ...(init?.headers ?? {}) } })
export const OPTIONS = preflight

export const runtime = "nodejs"

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  if (!isHex(key) || key.length !== 66) return json({ state: "invalid", reason: "not a WondrPay request key" }, { status: 400 })
  // every open checkout polls every 2 s: answer identical polls within 1.5 s from one shared lookup
  const body = await cached(`status:${key.toLowerCase()}`, 1_500, () => status(key as Hex))
  return json(body, body.state === "error" ? { status: 502 } : undefined)
}

async function status(key: Hex): Promise<Record<string, any>> {
  try {
    const view = await fetchRequest(key as Hex)
    // instant QRs are addressed by the order digest and appear on Arkiv a few seconds after the QR is shown:
    // "publishing" = keep polling. Callers stop on their own deadline (the QR's countdown).
    if (!view) return { state: "publishing", reason: "This request is being published, or it expired" }
    // anyone can write a whitepay.request entity: only ours, with fields matching the signed digest, count
    if (view.owner.toLowerCase() !== arkiv().owner.toLowerCase()
        || orderDigest({ merchant: view.merchant, amount: view.amount, orderId: view.orderId, deadline: view.deadline }).toLowerCase() !== view.digest.toLowerCase())
      return { state: "invalid", reason: "This isn't a WondrPay payment request." }

    // paid on-chain but the Arkiv receipt is still being written (it's done after the payer's response)
    if (view.status !== "paid") {
      const chain = await paidOnChain(view.digest).catch(() => null)
      if (chain) return { state: "paid", request: publicView({ ...view, status: "paid" }), receipt: { txHash: chain.txHash, payer: chain.payer, explorer: `${EXPLORER_URL}/tx/${chain.txHash}`, source: "chain" } }
    }
    if (view.status === "paid") {
      const receipt = view.receiptRef ? await getReceipt(view.receiptRef as Hex) : null
      return ({
        state: "paid",
        request: publicView(view),
        receipt: receipt && { ...receipt, explorer: `${EXPLORER_URL}/tx/${receipt.txHash}` },
      })
    }

    const [v, profile] = await Promise.all([verifyRequest(view), getMerchantByAddress(view.merchant)])
    if (!v.ok) return ({ state: "invalid", reason: v.reason, request: publicView(view) })
    return ({
      state: "pending",
      verifiedMerchant: v.verifiedMerchant,
      merchantDisplayName: profile?.displayName,
      checks: [
        { label: "Created by WondrPay", detail: `Arkiv owner ${short(arkiv().owner)}` },
        { label: "Amount untampered", detail: "fields match the signed order" },
        { label: "Signed by the merchant", detail: "matches the on-chain registry" },
        { label: "Still valid", detail: "pending, before its deadline" },
      ],
      request: publicView(view),
      order: v.order,
      digest: v.digest,
    })
  } catch (e) {
    return { state: "error", reason: errorMessage(e) }
  }
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const publicView = (v: NonNullable<Awaited<ReturnType<typeof fetchRequest>>>) => ({
  entityKey: v.entityKey,
  merchant: v.merchant,
  merchantName: v.merchantName,
  amount: v.amount,
  deadline: v.deadline,
  status: v.status,
  kind: v.kind,
  note: v.note,
  // checkout sessions (WondrPay for Business): where the hosted page sends the customer
  site: v.site,
  reference: v.reference,
  successUrl: safeReturn(v.successUrl),
  cancelUrl: safeReturn(v.cancelUrl),
})

/** Return URLs leave our origin: only https (or http://localhost while testing), never javascript: or data:. */
function safeReturn(u?: string) {
  if (!u) return undefined
  try { const x = new URL(u); return x.protocol === "https:" || (x.protocol === "http:" && x.hostname === "localhost") ? x.toString() : undefined } catch { return undefined }
}
