// Reminder-mode subscription over production HTTP (the default):
//  subscribe = 1 signature (first payment only) → at 0 the payment is REQUESTED (nothing charged)
//  → subscriber approves it with 1 signature → next countdown → cancel with 1 signature.
// Run: npx tsx --env-file=.env scripts/subscription-reminder-test.ts [store] [whitepay]
import { toHex, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { cycleAuthTypedData, reminderCancelMessage } from "@whitepay/shared/autopay"

const STORE = process.argv[2] ?? "https://whitepay-demo-store.vercel.app"
const WP = process.argv[3] ?? "https://whitepay.vercel.app"
const sub = privateKeyToAccount(process.env.CUSTOMER_PK as Hex)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now(), ts = () => `+${Math.round((Date.now() - t0) / 1000)}s`.padEnd(6)
let signatures = 0
const post = (path: string, body: unknown) => fetch(`${WP}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json())
const row = async (key: string) => { const d = await fetch(`${WP}/api/subscriptions?subscriber=${sub.address}`).then((r) => r.json()); return d.rows.find((r: any) => r.key === key) }

async function main() {
  const plan = await fetch(`${STORE}/api/create-subscription`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.json())
  let pv = await fetch(`${WP}/api/plans/${plan.planKey}`).then((r) => r.json())
  for (let i = 0; pv.state === "publishing" && i < 20; i++) { await sleep(1000); pv = await fetch(`${WP}/api/plans/${plan.planKey}`).then((r) => r.json()) }
  console.log(ts(), "1. store plan", plan.planKey.slice(0, 12), `${pv.cycles} × ${Number(pv.amount) / 1e6} USDT ${pv.periodLabel}`)

  const subscriptionId = toHex(crypto.getRandomValues(new Uint8Array(32))) as Hex
  const startAt = Math.floor(Date.now() / 1000)
  const cyc = (cycle: number) => cycleAuthTypedData({ subscriber: sub.address, merchant: pv.merchant, amount: BigInt(pv.amount), subscriptionId, cycle, startAt, period: pv.period, grace: pv.grace })
  const s = await post("/api/subscriptions", { planKey: plan.planKey, subscriber: sub.address, subscriptionId, startAt, signature: await sub.signTypedData(cyc(0)) }); signatures++
  if (s.error) throw new Error(s.error)
  console.log(ts(), `2. subscribed with ${signatures} signature (first payment only), mode=${s.mode}`, s.explorer)

  // early pay must be refused
  const early = await post("/api/subscriptions/pay", { mandateKey: s.mandateKey, subscriber: sub.address, cycle: 1, signature: await sub.signTypedData(cyc(1)) })
  console.log(ts(), "3. paying before it's requested →", early.error)

  while (Date.now() / 1000 < s.nextDueAt - 25) await sleep(5000)
  let r: any
  for (let k = 0; k < 20; k++) {
    await fetch(`${WP}/api/autopay/tick`).catch(() => {})
    r = await row(s.mandateKey)
    if (r?.payNow) break
    await sleep(4000)
  }
  console.log(ts(), `4. countdown hit 0 → payment requested (payNow=${r?.payNow}), paid so far ${r?.paidCycles}/${r?.cycles} (nothing charged automatically)`)

  const p = await post("/api/subscriptions/pay", { mandateKey: s.mandateKey, subscriber: sub.address, cycle: r.nextCycle, signature: await sub.signTypedData(cyc(r.nextCycle)) }); signatures++
  console.log(ts(), `5. approved payment ${r.nextCycle + 1} with 1 signature →`, p.error ?? p.explorer)
  const replay = await post("/api/subscriptions/pay", { mandateKey: s.mandateKey, subscriber: sub.address, cycle: r.nextCycle, signature: await sub.signTypedData(cyc(r.nextCycle)) })
  console.log(ts(), "6. paying the same payment again →", replay.error)
  const after = await row(s.mandateKey)
  console.log(ts(), `7. now ${after.paidCycles}/${after.cycles} paid, next request in ${after.nextDueAt - Math.floor(Date.now() / 1000)} s`)

  const c = await post("/api/subscriptions/cancel", { mandateKey: s.mandateKey, subscriber: sub.address, signature: await sub.signMessage({ message: reminderCancelMessage(s.mandateKey) }) }); signatures++
  console.log(ts(), "8. cancelled with 1 signature →", c.error ?? "ok", "· status:", (await row(s.mandateKey))?.status)
  await sleep(3000)
  console.log(ts(), "9. store webhooks:", JSON.stringify((await fetch(`${STORE}/api/order-status?mandateKey=${s.mandateKey}`).then((r) => r.json())).events?.map((e: any) => e.msg)))
  console.log(ts(), `   total signatures by the subscriber across subscribe + 1 approval + cancel: ${signatures} (one per action)`)
}
main().catch((e) => { console.error(e); process.exit(1) })
