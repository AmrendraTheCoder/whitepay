// Payer: what the app calls after scanning. Fetches the Arkiv entity and runs the 4 checks.
// Merchant: polls the same endpoint for live status (pending -> paid | depleted).
import { isHex, type Hex } from "viem"
import { fetchRequest, verifyRequest, getReceipt, getMerchantByAddress, arkiv } from "@whitepay/server"
import { EXPLORER_URL } from "@whitepay/shared"
import { json as rawJson, errorMessage, CORS, preflight } from "@/lib/json"

// the checkout button polls this from merchants' sites
const json = (d: unknown, init?: ResponseInit) => rawJson(d, { ...init, headers: { ...CORS, ...(init?.headers ?? {}) } })
export const OPTIONS = preflight

export const runtime = "nodejs"

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  if (!isHex(key) || key.length !== 66) return json({ state: "invalid", reason: "not a WhitePay request key" }, { status: 400 })
  try {
    const view = await fetchRequest(key as Hex)
    // instant QRs are addressed by the order digest and appear on Arkiv a few seconds after the QR is shown:
    // "publishing" = keep polling. Callers stop on their own deadline (the QR's countdown).
    if (!view) return json({ state: "publishing", reason: "This request is being published, or it expired" })

    if (view.status === "paid") {
      const receipt = view.receiptRef ? await getReceipt(view.receiptRef as Hex) : null
      return json({
        state: "paid",
        request: publicView(view),
        receipt: receipt && { ...receipt, explorer: `${EXPLORER_URL}/tx/${receipt.txHash}` },
      })
    }

    const [v, profile] = await Promise.all([verifyRequest(view), getMerchantByAddress(view.merchant)])
    if (!v.ok) return json({ state: "invalid", reason: v.reason, request: publicView(view) })
    return json({
      state: "pending",
      verifiedMerchant: v.verifiedMerchant,
      merchantDisplayName: profile?.displayName,
      checks: [
        { label: "Created by WhitePay", detail: `Arkiv owner ${short(arkiv().owner)}` },
        { label: "Amount untampered", detail: "fields match the signed order" },
        { label: "Signed by the merchant", detail: "matches the on-chain registry" },
        { label: "Still valid", detail: "pending, before its deadline" },
      ],
      request: publicView(view),
      order: v.order,
      digest: v.digest,
    })
  } catch (e) {
    return json({ state: "error", reason: errorMessage(e) }, { status: 502 })
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
})
