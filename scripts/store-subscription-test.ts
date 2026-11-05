// Store autopay over production HTTP: store signs a single-use plan → subscriber gives ONE signature (permit to the
// subscription's own contract)
// → cycle 1 paid → after 2 min the keeper (/api/autopay/tick) pays cycle 2 → store receives signed webhooks.
// Run: npx tsx --env-file=.env scripts/store-subscription-test.ts [store] [whitepay]
import { toHex, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { createPublicClient, http } from "viem"
import { termsFor, autopayPermitTypedData, cancelMandateTypedData, AUTOPAY_FACTORY, AUTOPAY_FACTORY_ABI, USDT_PERMIT_ABI } from "@whitepay/shared/autopay"
import { whitechainSepolia, USDT_ADDRESS } from "@whitepay/shared"

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
  const terms = termsFor({ subscriber: sub.address, merchant: pv.merchant, amount: BigInt(pv.amount), period: pv.period, grace: pv.grace, cycles: pv.cycles, startAt, subscriptionId })
  const chain = createPublicClient({ chain: whitechainSepolia, transport: http() })
  const spender = await chain.readContract({ address: AUTOPAY_FACTORY, abi: AUTOPAY_FACTORY_ABI, functionName: "mandateAddress", args: [terms] })
  const nonce = await chain.readContract({ address: USDT_ADDRESS, abi: USDT_PERMIT_ABI, functionName: "nonces", args: [sub.address] })
  const deadline = startAt + 1800
  let signs = 0
  const signature = await sub.signTypedData(autopayPermitTypedData({ owner: sub.address, spender, value: BigInt(pv.amount) * BigInt(pv.cycles), nonce, deadline: BigInt(deadline) })); signs++
  const body = JSON.stringify({ planKey: plan.planKey, subscriber: sub.address, subscriptionId, startAt, permit: { deadline, signature } })
  const s = await fetch(`${WP}/api/subscriptions`, { method: "POST", headers: { "content-type": "application/json" }, body }).then((r) => r.json())
  if (s.error) throw new Error(s.error)
  console.log(ts(), `2. approved with ${signs} signature (permit → ${spender}); cycle 1 paid`, s.explorer)
  const after = await fetch(`${WP}/api/plans/${plan.planKey}`).then((r) => r.json())
  console.log(ts(), "3. SDK poll sees plan state =", after.state, "mandate", after.mandate?.key)
  const replay = await fetch(`${WP}/api/subscriptions`, { method: "POST", headers: { "content-type": "application/json" }, body }).then((r) => r.json())
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
  const c = await fetch(`${WP}/api/subscriptions/cancel`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mandateKey: after.mandate.key, subscriber: sub.address, signature: await sub.signTypedData(cancelMandateTypedData(spender, subscriptionId)) }) }).then((r) => r.json())
  console.log(ts(), "7. cancelled with 1 signature →", c.error ?? `${c.revoked} remaining payment(s) blocked on-chain ${c.txs?.[0]}`)
  const cancelled = await chain.readContract({ address: spender, abi: [{ type: "function", name: "cancelled", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] }] as const, functionName: "cancelled" })
  console.log(ts(), "   contract cancelled() =", cancelled)
  await sleep(3000)
  console.log(ts(), "8. store server events:", JSON.stringify((await fetch(`${STORE}/api/order-status?mandateKey=${after.mandate.key}`).then((r) => r.json())).events?.map((e: any) => e.msg)))
}
main().catch((e) => { console.error(e); process.exit(1) })
