// Live autopay lifecycle on Whitechain + Arkiv:
//   merchant plan (3 × 0.05 USDT every 2 min) → subscriber signs once → cycle 1 charged now
//   → due entity counts down → keeper pays cycle 2 and creates the next due → cancel revokes cycle 3 on-chain.
// Run: npx tsx --env-file=.env scripts/autopay-test.ts
import { formatUnits, getAddress, parseUnits, toHex, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { ERC20_ABI, USDT_ADDRESS, directNonce } from "@whitepay/shared"
import { PERIODS, planTypedData, cycleAuthTypedData, cancelAuthTypedData, cycleMemo, type Plan } from "@whitepay/shared/autopay"
import { DueCycle } from "@whitepay/shared/arkiv"
import { eq } from "@arkiv-network/sdk/query"
import { key } from "@arkiv-network/sdk/schema"
import { arkiv, wc, createPlan, subscribe, runKeeper, cancelMandate, getMandate } from "@whitepay/server"

const shop = privateKeyToAccount(process.env.MERCHANT_PK as Hex) // chai-shop.whitepay.eth
const sub = privateKeyToAccount(process.env.CUSTOMER_PK as Hex)
const bal = (a: `0x${string}`) => wc().pub.readContract({ address: USDT_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: [a] })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now(), ts = () => `+${Math.round((Date.now() - t0) / 1000)}s`.padEnd(6)

async function dueOf(mk: Hex) {
  const a = arkiv()
  const r = await a.pub.select().from(DueCycle).ownedBy(a.owner).where(eq("mandateRef", key(mk))).limit(5).fetch()
  return (r.entities as any[]).map((e) => ({ cycle: Number(e.cycle.value ?? e.cycle), dueAt: Number(e.dueAt.value ?? e.dueAt), expiresAtBlock: e.$expiresAt?.toString() }))
}

async function main() {
  const p = PERIODS.demo
  const plan: Plan = { merchant: shop.address, amount: parseUnits("0.05", 6), period: p.seconds, cycles: 3, planId: toHex(crypto.getRandomValues(new Uint8Array(32))), expiresAt: BigInt(Math.floor(Date.now() / 1000) + 3600) }
  const { planKey } = await createPlan({ plan, merchantSig: await shop.signTypedData(planTypedData(plan)), title: "Chai Club (test)", periodKey: "demo" })
  console.log(ts(), "1. plan on Arkiv", planKey)

  const b0 = { s: await bal(sub.address), m: await bal(shop.address) }
  const subscriptionId = toHex(crypto.getRandomValues(new Uint8Array(32)))
  const startAt = Math.floor(Date.now() / 1000)
  const signatures: Hex[] = []
  for (let i = 0; i < plan.cycles; i++)
    signatures.push(await sub.signTypedData(cycleAuthTypedData({ subscriber: sub.address, merchant: shop.address, amount: plan.amount, subscriptionId, cycle: i, startAt, period: plan.period, grace: p.grace })))
  const s = await subscribe({ planKey, subscriber: sub.address, subscriptionId, startAt, signatures })
  console.log(ts(), "2. subscribed; cycle 1 charged now", s.explorer)
  console.log(ts(), "   mandate", s.mandateKey, "· due entities:", JSON.stringify(await dueOf(s.mandateKey)))

  // early keeper run must NOT pay (window not open yet)
  const early = await runKeeper()
  console.log(ts(), "3. keeper before due → paid", early.paid.length, "(expected 0)")

  const due = s.nextDueAt!
  while (Math.floor(Date.now() / 1000) < due - 25) await sleep(5000)
  let r
  for (let k = 0; k < 12; k++) { r = await runKeeper(); if (r.paid.length) break; await sleep(5000) }
  console.log(ts(), "4. countdown hit 0 → keeper paid", JSON.stringify(r?.paid), r?.failed.length ? JSON.stringify(r.failed) : "")
  const m = await getMandate(s.mandateKey)
  console.log(ts(), "   mandate:", m?.status, `${m?.paidCycles}/${m?.cycles} paid`, "· next due entity:", JSON.stringify(await dueOf(s.mandateKey)))

  // cancel: revoke cycle 3 on-chain
  const nonce3 = directNonce(shop.address, cycleMemo(subscriptionId, 2))
  const c = await cancelMandate({ mandateKey: s.mandateKey, subscriber: sub.address, cancels: [{ cycle: 2, signature: await sub.signTypedData(cancelAuthTypedData(sub.address, nonce3)) }] })
  const used = await wc().pub.readContract({ address: USDT_ADDRESS, abi: [{ type: "function", name: "authorizationState", stateMutability: "view", inputs: [{ type: "address" }, { type: "bytes32" }], outputs: [{ type: "bool" }] }] as const, functionName: "authorizationState", args: [sub.address, nonce3] })
  console.log(ts(), "5. cancelled:", c.revoked, "cycle revoked on-chain", c.txs[0], "· cycle-3 nonce burned:", used)
  console.log(ts(), "   mandate:", (await getMandate(s.mandateKey))?.status, "· due entities left:", (await dueOf(s.mandateKey)).length)
  const b1 = { s: await bal(sub.address), m: await bal(shop.address) }
  console.log(ts(), `6. subscriber −${formatUnits(b0.s - b1.s, 6)} USDT, shop +${formatUnits(b1.m - b0.m, 6)} USDT (expected 0.1 = 2 cycles)`)
}
main().catch((e) => { console.error(e); process.exit(1) })
