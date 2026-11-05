// Public plan view (subscribe page + checkout SDK polling for "subscribed").
import { isHex, type Hex } from "viem"
import { getPlan, getMandate } from "@whitepay/server"
import { PERIODS } from "@whitepay/shared/autopay"
import { json, errorMessage, CORS, preflight } from "@/lib/json"

export const runtime = "nodejs"
export const OPTIONS = preflight

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  if (!isHex(key) || key.length !== 66) return json({ error: "bad plan key" }, { status: 400, headers: CORS })
  try {
    const p = await getPlan(key as Hex)
    // instant subscribe QRs exist a few seconds before their Arkiv write lands: "publishing" = keep polling
    if (!p) return json({ state: "publishing" }, { headers: CORS })
    const m = p.mandateRef ? await getMandate(p.mandateRef) : null
    return json({
      state: p.status, planKey: key, title: p.title, merchant: p.plan.merchant, merchantName: p.merchantName, amount: p.plan.amount,
      period: p.plan.period, periodKey: p.periodKey, periodLabel: PERIODS[p.periodKey]?.label, grace: PERIODS[p.periodKey]?.grace, cycles: p.plan.cycles, expiresAt: p.plan.expiresAt, single: p.single,
      mandate: m ? { key: m.key, status: m.status, subscriber: m.subscriber, paidCycles: m.paidCycles, nextDueAt: m.nextDueAt, lastTx: m.lastTx } : null,
    }, { headers: CORS })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502, headers: CORS })
  }
}
