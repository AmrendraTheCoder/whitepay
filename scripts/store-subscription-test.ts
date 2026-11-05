// Store autopay over production HTTP: store signs a single-use plan → subscriber approves once (signs every cycle)
// → cycle 1 paid → after 2 min the keeper (/api/autopay/tick) pays cycle 2 → store receives signed webhooks.
// Run: npx tsx --env-file=.env scripts/store-subscription-test.ts [store] [whitepay]
import { toHex, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { cycleAuthTypedData } from "@whitepay/shared/autopay"

const STORE = process.argv[2] ?? "https://whitepay-demo-store.vercel.app"
const WP = process.argv[3] ?? "https://whitepay.vercel.app"
const sub = privateKeyToAccount(process.env.CUSTOMER_PK as Hex)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now(), ts = () => `+${Math.round((Date.now() - t0) / 1000)}s`.padEnd(6)

async function main() {
  const plan = await fetch(`${STORE}/api/create-subscription`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.json())
  if (!plan.planKey) throw new Error(JSON.stringify(plan))
  console.log(ts(), "1. store signed plan", plan.planKey, plan.periodLabel, plan.cycles, "cycles →", plan.subscribeUrl)
  const pv = await fetch(`${WP}/api/plans/${plan.planKey}`).then((r) => r.json())
  const subscriptionId = toHex(crypto.getRandomValues(new Uint8Array(32))) as Hex
  const startAt = Math.floor(Date.now() / 1000)
  const signatures: Hex[] = []
  for (let i = 0; i < pv.cycles; i++)
    signatures.push(await sub.signTypedData(cycleAuthTypedData({ subscriber: sub.address, merchant: pv.merchant, amount: BigInt(pv.amount), subscriptionId, cycle: i, startAt, period: pv.period, grace: pv.grace })))
  const s = await fetch(`${WP}/api/subscriptions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planKey: plan.planKey, subscriber: sub.address, subscriptionId, startAt, signatures }) }).then((r) => r.json())
  if (s.error) throw new Error(s.error)
  console.log(ts(), "2. approved once; cycle 1 paid", s.explorer)
  const after = await fetch(`${WP}/api/plans/${plan.planKey}`).then((r) => r.json())
  console.log(ts(), "3. SDK poll sees plan state =", after.state, "mandate", after.mandate?.key)
  const replay = await fetch(`${WP}/api/subscriptions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planKey: plan.planKey, subscriber: sub.address, subscriptionId, startAt, signatures }) }).then((r) => r.json())
  console.log(ts(), "4. replaying the same approval →", replay.error)
  while (Date.now() / 1000 < s.nextDueAt - 20) await sleep(5000)
  for (let k = 0; k < 15; k++) {
    const t = await fetch(`${WP}/api/autopay/tick`).then((r) => r.json())
    if (t.paid?.length) { console.log(ts(), "5. countdown hit 0 → keeper paid", JSON.stringify(t.paid)); break }
    await sleep(5000)
  }
  const list = await fetch(`${WP}/api/subscriptions?subscriber=${sub.address}`).then((r) => r.json())
  const m = list.rows.find((r: any) => r.key === after.mandate.key)
  console.log(ts(), "6. mandate", m.status, `${m.paidCycles}/${m.cycles}`, "next due in", m.nextDueAt - list.now, "s")
  await sleep(4000)
  console.log(ts(), "7. store server events:", JSON.stringify((await fetch(`${STORE}/api/order-status?mandateKey=${after.mandate.key}`).then((r) => r.json())).events?.map((e: any) => e.msg)))
}
main().catch((e) => { console.error(e); process.exit(1) })
