// Autopay engine: merchant plans, subscriber mandates, per-cycle "due" entities on Arkiv and the keeper
// that turns an expiring countdown into a gasless payment. Model and guarantees: shared/src/autopay.ts.
import { ExpirationTime, NoEntityFoundError } from "@arkiv-network/sdk"
import { addr, u64, key } from "@arkiv-network/sdk/schema"
import { and, eq, lte, desc } from "@arkiv-network/sdk/query"
import { bytesToHex, decodeEventLog, getAddress, hexToBytes, parseSignature, recoverMessageAddress, recoverTypedDataAddress, type Address, type Hex } from "viem"
import { SubPlan, Mandate, DueCycle } from "@whitepay/shared/arkiv"
import { REGISTRY_ABI, USDT_ADDRESS, directNonce } from "@whitepay/shared"
import {
  PERIODS, MAX_CYCLES, EARLY_SECONDS, isPeriod, planTypedData, cycleAuthTypedData, cycleWindow, cycleMemo, cycleDueAt,
  cancelAuthTypedData, unpackSig, type Plan, type PeriodKey,
  AUTOPAY_FACTORY, AUTOPAY_FACTORY_ABI, AUTOPAY_MANDATE_ABI, USDT_PERMIT_ABI, autopayPermitTypedData, termsFor, cancelMandateTypedData,
  reminderCancelMessage,
} from "@whitepay/shared/autopay"
import { arkiv, wc } from "./clients"
import { config } from "./config"
import { relayDirectPayment, shortErr } from "./relayer"
import { settleOnArkiv } from "./requests"
import { getMerchantByAddress } from "./merchants"
import { assertSafeWebhookUrl, deliverWebhook } from "./webhooks"

const now = () => Math.floor(Date.now() / 1000)
const expiry = (seconds: number) => ExpirationTime.fromSeconds(Math.max(2, Math.ceil(seconds / 2) * 2))
const val = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x)
const hex = (x: any): Hex => (typeof x === "string" ? (x as Hex) : bytesToHex(x))
const owned = (e: any) => getAddress(e.$owner) === getAddress(arkiv().owner)

// ------------------------------------------------------------------------------------ plans
export async function createPlan(p: { plan: Plan; merchantSig: Hex; title: string; periodKey: string; single?: boolean; webhook?: string }) {
  const { plan } = p
  if (!isPeriod(p.periodKey) || PERIODS[p.periodKey].seconds !== plan.period) throw new Error("unknown billing period")
  if (!Number.isInteger(plan.cycles) || plan.cycles < 1 || plan.cycles > MAX_CYCLES) throw new Error(`1-${MAX_CYCLES} cycles`)
  if (plan.amount <= 0n || plan.amount > 1_000_000_000n) throw new Error("amount must be 0-1000 USDT per cycle")
  const ttl = Number(plan.expiresAt) - now()
  if (ttl < 60 || ttl > 30 * 86_400) throw new Error("offer must be valid between 1 minute and 30 days")
  const title = p.title.trim().slice(0, 60)
  if (!title) throw new Error("plan needs a title")
  if (p.webhook) await assertSafeWebhookUrl(p.webhook)

  const m = await wc().pub.readContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "get", args: [plan.merchant] })
  if (!m.active) throw new Error("merchant is not registered/active")
  const signer = await recoverTypedDataAddress({ ...planTypedData(plan), signature: p.merchantSig })
  // the shop's own wallet or its registered order-signer key may publish plans
  if (![m.signer, plan.merchant].some((x) => x.toLowerCase() === signer.toLowerCase())) throw new Error("plan not signed by the merchant")
  const profile = await getMerchantByAddress(plan.merchant)

  const values = {
    merchant: addr(plan.merchant), merchantName: profile?.ensName ?? undefined, title, amount: plan.amount,
    period: u64(BigInt(plan.period)), periodKey: p.periodKey, cycles: plan.cycles, planId: plan.planId.toLowerCase(),
    expiresAt: u64(plan.expiresAt), merchantSig: hexToBytes(p.merchantSig), single: !!p.single, status: "open",
    webhook: p.webhook, createdAt: u64(BigInt(now())),
  } as any
  // the plan's public id is its planId (fixed by the merchant's signature), so the subscribe QR can be shown
  // before the Arkiv write lands; publishPlan does the write (call it after responding)
  return { planKey: plan.planId.toLowerCase() as Hex, publish: () => publishPlan(values, ttl) }
}

async function publishPlan(values: any, ttl: number) {
  for (let i = 0; i < 3; i++) {
    try { return await arkiv().writer.createEntity(SubPlan, values, { expiration: expiry(ttl) }, { gas: 1_500_000n }) }
    catch (e) { console.error(`[plans] publish attempt ${i + 1} failed`, (e as Error).message.split("\n")[0]); if (i === 2) throw e }
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 1300))
  }
}

export type PlanView = Awaited<ReturnType<typeof getPlan>>
export async function getPlan(ref: Hex) {
  try {
    const a = arkiv()
    const byId = await a.pub.select({ $key: true }).from(SubPlan).ownedBy(a.owner).where(eq("planId", ref.toLowerCase())).limit(1).fetch().catch(() => null)
    const planKey = ((byId?.entities as any[] | undefined)?.[0]?.$key as Hex | undefined) ?? ref
    const e = (await a.pub.getEntity(planKey, SubPlan)) as any
    if (!owned(e)) return null
    const plan: Plan = {
      merchant: getAddress(val(e.merchant)), amount: BigInt(val(e.amount)), period: Number(val(e.period)),
      cycles: Number(val(e.cycles)), planId: val(e.planId), expiresAt: BigInt(val(e.expiresAt)),
    }
    return {
      planKey, plan, title: val(e.title) as string, periodKey: val(e.periodKey) as PeriodKey, merchantName: val(e.merchantName) as string | undefined,
      merchantSig: hex(val(e.merchantSig)), single: !!val(e.single), status: val(e.status) as string,
      mandateRef: (val(e.mandateRef) || undefined) as Hex | undefined, webhook: (val(e.webhook) || undefined) as string | undefined,
    }
  } catch (err) {
    if (err instanceof NoEntityFoundError) return null
    throw err
  }
}

// ----------------------------------------------------------------------------- subscribing
/**
 * v2 subscribe: the subscriber gave ONE signature, an EIP-2612 permit to their subscription's clone
 * (address derived from all the terms). We deploy the clone, apply the permit and charge cycle 1 in one tx.
 */
export async function subscribe(p: { planKey: Hex; subscriber: Address; subscriptionId: Hex; startAt: number; permit: { deadline: number; signature: Hex } }) {
  const pv = await getPlan(p.planKey)
  if (!pv) throw new Error("this plan has expired or does not exist")
  if (pv.single && pv.status !== "open") throw new Error("this checkout plan was already used")
  if (Number(pv.plan.expiresAt) < now()) throw new Error("this plan offer has expired")
  // never trust the stored plan blindly: re-check the merchant's signature against the on-chain registry
  const m = await wc().pub.readContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "get", args: [pv.plan.merchant] })
  const signer = await recoverTypedDataAddress({ ...planTypedData(pv.plan), signature: pv.merchantSig })
  if (!m.active || ![m.signer, pv.plan.merchant].some((x) => x.toLowerCase() === signer.toLowerCase())) throw new Error("plan signature is not valid")
  if (Math.abs(p.startAt - now()) > 120) throw new Error("subscription start time is off; check the device clock")
  if (p.permit.deadline < now() || p.permit.deadline > now() + 3600) throw new Error("approval expired; try again")

  const { plan } = pv
  const grace = PERIODS[pv.periodKey].grace
  const subscriber = getAddress(p.subscriber)
  if (subscriber === plan.merchant) throw new Error("a shop can't subscribe to itself")
  const terms = termsFor({ subscriber, merchant: plan.merchant, amount: plan.amount, period: plan.period, grace, cycles: plan.cycles, startAt: p.startAt, subscriptionId: p.subscriptionId })
  const { pub, relayer } = wc()
  const [vault, nonce] = await Promise.all([
    pub.readContract({ address: AUTOPAY_FACTORY, abi: AUTOPAY_FACTORY_ABI, functionName: "mandateAddress", args: [terms] }),
    pub.readContract({ address: USDT_ADDRESS, abi: USDT_PERMIT_ABI, functionName: "nonces", args: [subscriber] }),
  ])
  // the single signature must be the subscriber's permit for exactly this clone and amount × cycles
  const total = plan.amount * BigInt(plan.cycles)
  const who = await recoverTypedDataAddress({ ...autopayPermitTypedData({ owner: subscriber, spender: vault, value: total, nonce, deadline: BigInt(p.permit.deadline) }), signature: p.permit.signature }).catch(() => null)
  if (!who || getAddress(who) !== subscriber) throw new Error("the approval signature doesn't match these subscription terms")

  const { r, s: sig_s, v, yParity } = parseSignature(p.permit.signature)
  let request
  try {
    ;({ request } = await pub.simulateContract({ account: relayer.account, address: AUTOPAY_FACTORY, abi: AUTOPAY_FACTORY_ABI, functionName: "start",
      args: [terms, BigInt(p.permit.deadline), Number(v ?? BigInt(27 + (yParity ?? 0))), r, sig_s] }))
  } catch (err) {
    throw new Error(friendlyChainError(shortErr(err)))
  }
  const txHash = await relayer.writeContract(request)
  const rc = await pub.waitForTransactionReceipt({ hash: txHash })
  if (rc.status !== "success") throw new Error("starting the subscription reverted")
  const first = { txHash, block: rc.blockNumber, explorer: `${config.explorer}/tx/${txHash}` }
  const receipt = await settleOnArkiv({ merchant: plan.merchant, merchantName: pv.merchantName, payer: subscriber, amount: plan.amount, paymentId: cycleMemo(p.subscriptionId, 0), txHash, block: rc.blockNumber, kind: "autopay" }).catch(() => null)

  const a = arkiv()
  const last = plan.cycles === 1
  const endsAt = cycleDueAt(p.startAt, plan.period, plan.cycles - 1) + grace
  const nextDue = cycleDueAt(p.startAt, plan.period, 1)
  const [mk] = await a.pub.predictEntityKeys({ owner: a.owner, count: 1 })
  const res = await a.writer.executeBatch({
    creates: [
      { schema: Mandate, salt: mk.salt, expiration: expiry(Math.max(endsAt - now(), 3600) + 7 * 86_400), values: {
        subscriber: addr(subscriber), merchant: addr(plan.merchant), merchantName: pv.merchantName, title: pv.title, planRef: key(pv.planKey),
        subscriptionId: p.subscriptionId.toLowerCase(), amount: plan.amount, period: u64(BigInt(plan.period)), grace: u64(BigInt(grace)),
        cycles: plan.cycles, startAt: u64(BigInt(p.startAt)), paidCycles: 1, nextDueAt: u64(BigInt(last ? 0 : nextDue)),
        status: last ? "completed" : "active", vault: addr(vault), webhook: pv.webhook, lastTx: txHash, updatedAt: u64(BigInt(now())),
      } as any },
      ...(last ? [] : [{ schema: DueCycle, expiration: expiry(nextDue + grace - now()), values: {
        mandateRef: key(mk.key), subscriber: addr(subscriber), merchant: addr(plan.merchant), cycle: 1, amount: plan.amount,
        dueAt: u64(BigInt(nextDue)), status: "scheduled", attempts: 0,
      } as any }]),
    ],
    patches: pv.single ? [{ schema: SubPlan, entityKey: pv.planKey, set: { status: "subscribed", mandateRef: key(mk.key) } }] : [],
  } as any, { gas: 4_000_000n })

  notify(pv.webhook, `${p.subscriptionId}:0`, { event: "subscription.started", mandateKey: mk.key, planKey: p.planKey, subscriptionId: p.subscriptionId, vault,
    merchant: plan.merchant, subscriber, amount: plan.amount.toString(), cycle: 1, cycles: plan.cycles, txHash, explorer: first.explorer, nextDueAt: last ? null : nextDue })
  return { mandateKey: mk.key as Hex, vault, arkivTx: res.txHash, firstTx: txHash, explorer: first.explorer, receiptKey: receipt?.receiptKey, nextDueAt: last ? null : nextDue }
}

/** Plan checks shared by both modes. */
async function loadPlanForSubscribe(planKey: Hex, subscriberRaw: Address, startAt: number) {
  const pv = await getPlan(planKey)
  if (!pv) throw new Error("this plan has expired or does not exist")
  if (pv.single && pv.status !== "open") throw new Error("this checkout plan was already used")
  if (Number(pv.plan.expiresAt) < now()) throw new Error("this plan offer has expired")
  const m = await wc().pub.readContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "get", args: [pv.plan.merchant] })
  const signer = await recoverTypedDataAddress({ ...planTypedData(pv.plan), signature: pv.merchantSig })
  if (!m.active || ![m.signer, pv.plan.merchant].some((x) => x.toLowerCase() === signer.toLowerCase())) throw new Error("plan signature is not valid")
  if (Math.abs(startAt - now()) > 120) throw new Error("subscription start time is off; check the device clock")
  const subscriber = getAddress(subscriberRaw)
  if (subscriber === pv.plan.merchant) throw new Error("a shop can't subscribe to itself")
  return { pv, subscriber, grace: PERIODS[pv.periodKey].grace }
}

/** a reminder-mode due entity outlives its pay window by a day, so the keeper can see a missed payment */
const REMINDER_TAIL = 86_400

/**
 * Reminder mode (default): the subscriber signs ONLY the first payment now. Every later payment is
 * requested when due and approved by the subscriber with one signature (payReminderCycle).
 */
export async function subscribeReminder(p: { planKey: Hex; subscriber: Address; subscriptionId: Hex; startAt: number; signature: Hex }) {
  const { pv, subscriber, grace } = await loadPlanForSubscribe(p.planKey, p.subscriber, p.startAt)
  const { plan } = pv
  const td = cycleAuthTypedData({ subscriber, merchant: plan.merchant, amount: plan.amount, subscriptionId: p.subscriptionId, cycle: 0, startAt: p.startAt, period: plan.period, grace })
  const who = await recoverTypedDataAddress({ ...td, signature: p.signature }).catch(() => null)
  if (!who || getAddress(who) !== subscriber) throw new Error("the payment signature doesn't match this subscription")
  let first
  try {
    first = await chargeCycle({ subscriber, merchant: plan.merchant, amount: plan.amount, subscriptionId: p.subscriptionId, startAt: p.startAt, period: plan.period, grace, cycle: 0, signature: p.signature })
  } catch (err) { throw new Error(friendlyChainError(shortErr(err))) }
  const receipt = await settleOnArkiv({ merchant: plan.merchant, merchantName: pv.merchantName, payer: subscriber, amount: plan.amount, paymentId: cycleMemo(p.subscriptionId, 0), txHash: first.txHash, block: first.block, kind: "autopay" }).catch(() => null)

  const a = arkiv()
  const last = plan.cycles === 1
  const nextDue = cycleDueAt(p.startAt, plan.period, 1)
  const endsAt = cycleDueAt(p.startAt, plan.period, plan.cycles - 1) + grace + REMINDER_TAIL
  const [mk] = await a.pub.predictEntityKeys({ owner: a.owner, count: 1 })
  await a.writer.executeBatch({
    creates: [
      { schema: Mandate, salt: mk.salt, expiration: expiry(Math.max(endsAt - now(), 3600) + 7 * 86_400), values: {
        subscriber: addr(subscriber), merchant: addr(plan.merchant), merchantName: pv.merchantName, title: pv.title, planRef: key(pv.planKey),
        subscriptionId: p.subscriptionId.toLowerCase(), amount: plan.amount, period: u64(BigInt(plan.period)), grace: u64(BigInt(grace)),
        cycles: plan.cycles, startAt: u64(BigInt(p.startAt)), paidCycles: 1, nextDueAt: u64(BigInt(last ? 0 : nextDue)), nextCycle: last ? plan.cycles : 1,
        missedCycles: 0, mode: "reminder", status: last ? "completed" : "active", webhook: pv.webhook, lastTx: first.txHash, updatedAt: u64(BigInt(now())),
      } as any },
      ...(last ? [] : [dueCreate(mk.key, subscriber, plan.merchant, plan.amount, 1, nextDue, nextDue + grace + REMINDER_TAIL - now())]),
    ],
    patches: pv.single ? [{ schema: SubPlan, entityKey: pv.planKey, set: { status: "subscribed", mandateRef: key(mk.key) } }] : [],
  } as any, { gas: 4_000_000n })
  notify(pv.webhook, `${p.subscriptionId}:0`, { event: "subscription.started", mode: "reminder", mandateKey: mk.key, planKey: p.planKey, subscriptionId: p.subscriptionId,
    merchant: plan.merchant, subscriber, amount: plan.amount.toString(), cycle: 1, cycles: plan.cycles, txHash: first.txHash, explorer: first.explorer, nextDueAt: last ? null : nextDue })
  return { mandateKey: mk.key as Hex, mode: "reminder" as const, firstTx: first.txHash, explorer: first.explorer, receiptKey: receipt?.receiptKey, nextDueAt: last ? null : nextDue }
}

const dueCreate = (mandateKey: Hex, subscriber: Address, merchant: Address, amount: bigint, cycle: number, dueAt: number, ttl: number) => ({
  schema: DueCycle, expiration: expiry(ttl), values: {
    mandateRef: key(mandateKey), subscriber: addr(subscriber), merchant: addr(merchant), cycle, amount, dueAt: u64(BigInt(dueAt)), status: "scheduled", attempts: 0,
  } as any,
})

async function dueOf(mandateKey: Hex) {
  const a = arkiv()
  const r = await a.pub.select().from(DueCycle).ownedBy(a.owner).where(eq("mandateRef", key(mandateKey))).limit(3).fetch()
  const e = (r.entities as any[])[0]
  return e ? { key: e.$key as Hex, cycle: Number(val(e.cycle)), dueAt: Number(val(e.dueAt)), status: val(e.status) as string } : null
}

/** Reminder mode: the subscriber approves the payment that was requested (one signature). */
export async function payReminderCycle(p: { mandateKey: Hex; subscriber: Address; cycle: number; signature: Hex }) {
  const m = await getMandate(p.mandateKey)
  if (!m) throw new Error("subscription not found")
  if (getAddress(p.subscriber) !== m.subscriber) throw new Error("only the subscriber can pay this")
  if (m.mode !== "reminder") throw new Error("this subscription runs on autopay")
  if (m.status !== "active") throw new Error(`subscription is ${m.status}`)
  const d = await dueOf(p.mandateKey)
  if (!d || d.cycle !== p.cycle) throw new Error("this payment isn't requested right now")
  if (now() < d.dueAt - EARLY_SECONDS) throw new Error(`this payment opens in ${d.dueAt - EARLY_SECONDS - now()} s`)
  if (now() > d.dueAt + m.grace) throw new Error("the window for this payment has closed; it was skipped")
  const td = cycleAuthTypedData({ subscriber: m.subscriber, merchant: m.merchant, amount: m.amount, subscriptionId: m.subscriptionId, cycle: p.cycle, startAt: m.startAt, period: m.period, grace: m.grace })
  const who = await recoverTypedDataAddress({ ...td, signature: p.signature }).catch(() => null)
  if (!who || getAddress(who) !== m.subscriber) throw new Error("the payment signature doesn't match this request")
  let r
  try {
    r = await chargeCycle({ subscriber: m.subscriber, merchant: m.merchant, amount: m.amount, subscriptionId: m.subscriptionId, startAt: m.startAt, period: m.period, grace: m.grace, cycle: p.cycle, signature: p.signature })
  } catch (err) { throw new Error(friendlyChainError(shortErr(err))) }
  await settleOnArkiv({ merchant: m.merchant, merchantName: m.merchantName, payer: m.subscriber, amount: m.amount, paymentId: cycleMemo(m.subscriptionId, p.cycle), txHash: r.txHash, block: r.block, kind: "autopay" }).catch(() => null)
  await advanceReminder(m, d.key, p.cycle, { paid: true, txHash: r.txHash })
  notify(m.webhook, `${m.subscriptionId}:${p.cycle}`, { event: p.cycle + 1 >= m.cycles ? "subscription.completed" : "subscription.charged", mode: "reminder", mandateKey: m.key,
    subscriptionId: m.subscriptionId, merchant: m.merchant, subscriber: m.subscriber, amount: m.amount.toString(), cycle: p.cycle + 1, cycles: m.cycles, txHash: r.txHash, explorer: r.explorer })
  return { txHash: r.txHash, explorer: r.explorer, nextDueAt: p.cycle + 1 >= m.cycles ? null : cycleDueAt(m.startAt, m.period, p.cycle + 1) }
}

/** paid or missed → delete this due, schedule the next one (or finish) in one Arkiv transaction */
async function advanceReminder(m: MandateView, dueKey: Hex, cycle: number, r: { paid: boolean; txHash?: Hex }) {
  const last = cycle + 1 >= m.cycles
  const nextDue = cycleDueAt(m.startAt, m.period, cycle + 1)
  await arkiv().writer.executeBatch({
    deletes: [{ entityKey: dueKey }],
    creates: last ? [] : [dueCreate(m.key, m.subscriber, m.merchant, m.amount, cycle + 1, nextDue, nextDue + m.grace + REMINDER_TAIL - now())],
    patches: [{ schema: Mandate, entityKey: m.key, set: {
      ...(r.paid ? { paidCycles: m.paidCycles + 1, lastTx: r.txHash } : { missedCycles: (m.missedCycles ?? 0) + 1 }),
      nextCycle: last ? m.cycles : cycle + 1, nextDueAt: u64(BigInt(last ? 0 : nextDue)), status: last ? "completed" : "active", updatedAt: u64(BigInt(now())) } }],
  } as any, { gas: 3_000_000n })
}

const friendlyChainError = (e: string) =>
  /exceeds balance|insufficient/i.test(e) ? "Not enough USDT for the first payment"
  : /NoAllowance|invalid signature|ERC2612/i.test(e) ? "The approval signature wasn't accepted by the USDT contract"
  : /NotDue/i.test(e) ? "This subscription was already started"
  : e

/** v2: ask the clone to take the cycle that is due now (it enforces the window itself). */
async function chargeVault(vault: Address) {
  const { pub, relayer } = wc()
  const [cycle, , chargeable] = await pub.readContract({ address: vault, abi: AUTOPAY_MANDATE_ABI, functionName: "pending" })
  if (!chargeable) return null
  const { request } = await pub.simulateContract({ account: relayer.account, address: vault, abi: AUTOPAY_MANDATE_ABI, functionName: "charge" })
  const txHash = await relayer.writeContract(request)
  const rc = await pub.waitForTransactionReceipt({ hash: txHash, timeout: 20_000 })
  if (rc.status !== "success") throw new Error("charge reverted")
  let charged = Number(cycle)
  for (const log of rc.logs) {
    try { const ev = decodeEventLog({ abi: AUTOPAY_MANDATE_ABI, data: log.data, topics: log.topics }); if (ev.eventName === "Charged") charged = Number((ev.args as any).cycle) } catch {}
  }
  return { txHash, block: rc.blockNumber, explorer: `${config.explorer}/tx/${txHash}`, cycle: charged }
}

async function chargeCycle(p: { subscriber: Address; merchant: Address; amount: bigint; subscriptionId: Hex; startAt: number; period: number; grace: number; cycle: number; signature: Hex }) {
  const w = cycleWindow(p.startAt, p.period, p.grace, p.cycle)
  return relayDirectPayment({
    to: p.merchant, amount: p.amount, memo: cycleMemo(p.subscriptionId, p.cycle),
    auth: { from: p.subscriber, validAfter: w.validAfter, validBefore: w.validBefore, signature: p.signature },
  })
}

function notify(webhook: string | undefined, eventId: string, payload: Record<string, unknown>) {
  if (webhook) void deliverWebhook(webhook, eventId, payload).catch(() => {})
}

// ---------------------------------------------------------------------------------- reads
export type MandateView = NonNullable<Awaited<ReturnType<typeof getMandate>>>
export async function getMandate(mandateKey: Hex) {
  try {
    const e = (await arkiv().pub.getEntity(mandateKey, Mandate)) as any
    if (!owned(e)) return null
    return parseMandate(mandateKey, e)
  } catch (err) {
    if (err instanceof NoEntityFoundError) return null
    throw err
  }
}
const parseMandate = (k: Hex, e: any) => ({
  key: k, subscriber: getAddress(val(e.subscriber)), merchant: getAddress(val(e.merchant)), merchantName: val(e.merchantName) as string | undefined,
  title: val(e.title) as string, planRef: val(e.planRef) as Hex, subscriptionId: val(e.subscriptionId) as Hex, amount: BigInt(val(e.amount)),
  period: Number(val(e.period)), grace: Number(val(e.grace)), cycles: Number(val(e.cycles)), startAt: Number(val(e.startAt)),
  paidCycles: Number(val(e.paidCycles)), nextDueAt: Number(val(e.nextDueAt)), status: val(e.status) as string,
  auths: val(e.auths) ? hex(val(e.auths)) : undefined, vault: val(e.vault) ? getAddress(val(e.vault)) : undefined,
  mode: (val(e.mode) || "autopay") as "reminder" | "autopay", nextCycle: val(e.nextCycle) != null ? Number(val(e.nextCycle)) : Number(val(e.paidCycles)),
  missedCycles: Number(val(e.missedCycles) ?? 0),
  webhook: (val(e.webhook) || undefined) as string | undefined, lastTx: val(e.lastTx) as string | undefined, updatedAt: Number(val(e.updatedAt)),
})

export async function listMandates(p: { subscriber?: Address; merchant?: Address }) {
  const a = arkiv()
  const conds = [...(p.subscriber ? [eq("subscriber", addr(p.subscriber))] : []), ...(p.merchant ? [eq("merchant", addr(p.merchant))] : [])]
  const page = await a.pub.select().from(Mandate).ownedBy(a.owner).where(and(...conds)).orderBy(desc("updatedAt")).limit(50).fetch()
  return (page.entities as any[]).map((e) => {
    const m = parseMandate(e.$key, e)
    return { ...m, auths: undefined, expiresAtBlock: e.$expiresAt?.toString() }
  })
}

// ---------------------------------------------------------------------------------- keeper
// a lease, not a boolean: if a serverless instance is frozen mid-run the lock frees itself after 90 s
let runningSince = 0
let lastRun = 0
const LEASE_MS = 90_000
/** Pay every cycle whose countdown hit 0. Safe to call often and concurrently (on-chain nonces make double-pay impossible). */
export async function runKeeper(opts: { minIntervalMs?: number } = {}) {
  if (Date.now() - runningSince < LEASE_MS) return { skipped: true, reason: "a keeper run is in progress", paid: [], failed: [] }
  if (Date.now() - lastRun < (opts.minIntervalMs ?? 0)) return { skipped: true, reason: "ran moments ago", paid: [], failed: [] }
  runningSince = Date.now()
  lastRun = Date.now()
  const paid: { mandate: Hex; cycle: number; tx: Hex }[] = []
  const failed: { mandate: Hex; cycle: number; error: string }[] = []
  try {
    const a = arkiv()
    const due = await a.pub.select().from(DueCycle).ownedBy(a.owner)
      .where(lte("dueAt", u64(BigInt(now() + EARLY_SECONDS - 5)))).orderBy(desc("dueAt")).limit(30).fetch()
    for (const e of due.entities as any[]) {
      if (Date.now() - runningSince > 40_000) break // finish well inside the 60 s function limit; next tick continues
      const dueKey = e.$key as Hex
      let cycle = Number(val(e.cycle))
      const mandateKey = val(e.mandateRef) as Hex
      const m = await getMandate(mandateKey)
      if (!m || m.status !== "active" || cycle < m.paidCycles) {
        await a.writer.deleteEntity({ entityKey: dueKey }).catch(() => {})
        continue
      }
      if (m.mode === "reminder") {
        // reminders: ask when due, skip when the window closes. The subscriber pays it themselves.
        const dueAt = Number(val(e.dueAt))
        try {
          if (now() > dueAt + m.grace) {
            await advanceReminder(m, dueKey, cycle, { paid: false })
            notify(m.webhook, `${m.subscriptionId}:${cycle}:missed`, { event: "subscription.missed", mode: "reminder", mandateKey, subscriptionId: m.subscriptionId, subscriber: m.subscriber, cycle: cycle + 1, cycles: m.cycles })
          } else if (val(e.status) === "scheduled" && now() >= dueAt - EARLY_SECONDS) {
            await a.writer.patchEntity(DueCycle, dueKey, { set: { status: "requested" } }, { gas: 1_000_000n })
            notify(m.webhook, `${m.subscriptionId}:${cycle}:requested`, { event: "subscription.payment_requested", mode: "reminder", mandateKey, subscriptionId: m.subscriptionId,
              subscriber: m.subscriber, amount: m.amount.toString(), cycle: cycle + 1, cycles: m.cycles, payBy: dueAt + m.grace })
          }
        } catch (err) { failed.push({ mandate: mandateKey, cycle, error: shortErr(err).slice(0, 120) }) }
        continue
      }
      try {
        let r: { txHash: Hex; block: bigint; explorer: string }
        if (m.vault) {
          const c = await chargeVault(m.vault)
          if (!c) continue // the clone says it isn't due yet (clock skew): try on the next tick
          cycle = c.cycle // the clone may have skipped a window that closed
          r = c
        } else {
          r = await chargeCycle({ subscriber: m.subscriber, merchant: m.merchant, amount: m.amount, subscriptionId: m.subscriptionId, startAt: m.startAt, period: m.period, grace: m.grace, cycle, signature: unpackSig(m.auths!, cycle) })
        }
        await settleOnArkiv({ merchant: m.merchant, merchantName: m.merchantName, payer: m.subscriber, amount: m.amount, paymentId: cycleMemo(m.subscriptionId, cycle), txHash: r.txHash, block: r.block, kind: "autopay" }).catch(() => null)
        const last = cycle + 1 >= m.cycles
        const nextDue = cycleDueAt(m.startAt, m.period, cycle + 1)
        // depletion → payment → next countdown, in one Arkiv transaction
        await a.writer.executeBatch({
          deletes: [{ entityKey: dueKey }],
          creates: last ? [] : [{ schema: DueCycle, expiration: expiry(nextDue + m.grace - now()), values: {
            mandateRef: key(mandateKey), subscriber: addr(m.subscriber), merchant: addr(m.merchant), cycle: cycle + 1, amount: m.amount,
            dueAt: u64(BigInt(nextDue)), status: "scheduled", attempts: 0 } as any }],
          patches: [{ schema: Mandate, entityKey: mandateKey, set: {
            paidCycles: cycle + 1, nextDueAt: u64(BigInt(last ? 0 : nextDue)), status: last ? "completed" : "active", lastTx: r.txHash, updatedAt: u64(BigInt(now())) } }],
        } as any, { gas: 3_000_000n })
        paid.push({ mandate: mandateKey, cycle, tx: r.txHash })
        notify(m.webhook, `${m.subscriptionId}:${cycle}`, { event: last ? "subscription.completed" : "subscription.charged", mandateKey, subscriptionId: m.subscriptionId,
          merchant: m.merchant, subscriber: m.subscriber, amount: m.amount.toString(), cycle: cycle + 1, cycles: m.cycles, txHash: r.txHash, explorer: r.explorer, nextDueAt: last ? null : nextDue })
      } catch (err) {
        const msg = shortErr(err).slice(0, 120)
        failed.push({ mandate: mandateKey, cycle, error: msg })
        const dueAt = Number(val(e.dueAt))
        const expired = now() > dueAt + m.grace - 60
        await a.writer.executeBatch({
          patches: [
            { schema: DueCycle, entityKey: dueKey, set: { status: "retrying", attempts: Number(val(e.attempts) ?? 0) + 1, lastError: msg } },
            ...(expired ? [{ schema: Mandate, entityKey: mandateKey, set: { status: "failed", updatedAt: u64(BigInt(now())) } }] : []),
          ],
        } as any, { gas: 1_500_000n }).catch(() => {})
        if (expired) notify(m.webhook, `${m.subscriptionId}:${cycle}:failed`, { event: "subscription.failed", mandateKey, subscriptionId: m.subscriptionId, cycle: cycle + 1, reason: msg })
      }
    }
  } finally {
    runningSince = 0
  }
  return { skipped: false, reason: "", paid, failed }
}

// ---------------------------------------------------------------------------------- cancel
const CANCEL_ABI = [{ type: "function", name: "cancelAuthorization", stateMutability: "nonpayable", inputs: [
  { name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }, { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" }], outputs: [] }] as const

/** Revoke every unused cycle ON-CHAIN (USDT cancelAuthorization, gasless via the relayer), then close the mandate. */
export async function cancelMandate(p: { mandateKey: Hex; subscriber: Address; cancels?: { cycle: number; signature: Hex }[]; signature?: Hex }) {
  const m = await getMandate(p.mandateKey)
  if (!m) throw new Error("subscription not found")
  if (getAddress(p.subscriber) !== m.subscriber) throw new Error("only the subscriber can cancel")
  if (m.status !== "active") throw new Error(`subscription is already ${m.status}`)
  if (m.vault) return cancelVault(m, p.signature)
  if (m.mode === "reminder") {
    // nothing is pre-approved on-chain in reminder mode: a signed request is enough to stop future requests
    if (!p.signature) throw new Error("missing cancellation signature")
    const who = await recoverMessageAddress({ message: reminderCancelMessage(m.key), signature: p.signature }).catch(() => null)
    if (!who || getAddress(who) !== m.subscriber) throw new Error("cancellation is not signed by the subscriber")
    const a = arkiv()
    const dues = await a.pub.select({ $key: true }).from(DueCycle).ownedBy(a.owner).where(eq("mandateRef", key(m.key))).limit(5).fetch()
    await a.writer.executeBatch({ deletes: (dues.entities as any[]).map((d) => ({ entityKey: d.$key })),
      patches: [{ schema: Mandate, entityKey: m.key, set: { status: "cancelled", nextDueAt: u64(0n), updatedAt: u64(BigInt(now())) } }] } as any, { gas: 2_000_000n })
    notify(m.webhook, `${m.subscriptionId}:cancelled`, { event: "subscription.cancelled", mode: "reminder", mandateKey: m.key, subscriptionId: m.subscriptionId, subscriber: m.subscriber })
    return { revoked: m.cycles - m.nextCycle, txs: [] as string[] }
  }
  if (!p.cancels) throw new Error("missing cancellation signatures")
  const remaining = Array.from({ length: m.cycles - m.paidCycles }, (_, i) => m.paidCycles + i)
  const txs: Hex[] = []
  for (const cycle of remaining) {
    const c = p.cancels!.find((x) => x.cycle === cycle)
    if (!c) throw new Error(`missing cancellation for cycle ${cycle + 1}`)
    const nonce = directNonce(m.merchant, cycleMemo(m.subscriptionId, cycle))
    const who = await recoverTypedDataAddress({ ...cancelAuthTypedData(m.subscriber, nonce), signature: c.signature }).catch(() => null)
    if (!who || getAddress(who) !== m.subscriber) throw new Error(`cancellation ${cycle + 1} is not signed by the subscriber`)
    const used = await wc().pub.readContract({ address: USDT_ADDRESS, abi: [{ type: "function", name: "authorizationState", stateMutability: "view", inputs: [{ type: "address" }, { type: "bytes32" }], outputs: [{ type: "bool" }] }] as const, functionName: "authorizationState", args: [m.subscriber, nonce] })
    if (used) continue
    const { r, s, v, yParity } = parseSignature(c.signature)
    const { request } = await wc().pub.simulateContract({ account: wc().relayer.account, address: USDT_ADDRESS, abi: CANCEL_ABI, functionName: "cancelAuthorization",
      args: [m.subscriber, nonce, Number(v ?? BigInt(27 + (yParity ?? 0))), r, s] })
    txs.push(await wc().relayer.writeContract(request))
  }
  for (const h of txs) await wc().pub.waitForTransactionReceipt({ hash: h })

  const a = arkiv()
  const dues = await a.pub.select({ $key: true }).from(DueCycle).ownedBy(a.owner).where(eq("mandateRef", key(p.mandateKey))).limit(5).fetch()
  await a.writer.executeBatch({
    deletes: (dues.entities as any[]).map((d) => ({ entityKey: d.$key })),
    patches: [{ schema: Mandate, entityKey: p.mandateKey, set: { status: "cancelled", nextDueAt: u64(0n), updatedAt: u64(BigInt(now())) } }],
  } as any, { gas: 2_000_000n })
  notify(m.webhook, `${m.subscriptionId}:cancelled`, { event: "subscription.cancelled", mandateKey: p.mandateKey, subscriptionId: m.subscriptionId, subscriber: m.subscriber, cancelledCycles: remaining.length })
  return { revoked: remaining.length, txs: txs.map((t) => `${config.explorer}/tx/${t}`) }
}

export const remainingCycles = (m: { cycles: number; paidCycles: number }) => Math.max(0, m.cycles - m.paidCycles)

/** v2 cancel: ONE signature; the clone verifies it and refuses every future charge. */
async function cancelVault(m: MandateView, signature?: Hex) {
  if (!signature) throw new Error("missing cancellation signature")
  const who = await recoverTypedDataAddress({ ...cancelMandateTypedData(m.vault!, m.subscriptionId), signature }).catch(() => null)
  if (!who || getAddress(who) !== m.subscriber) throw new Error("cancellation is not signed by the subscriber")
  const { pub, relayer } = wc()
  const { request } = await pub.simulateContract({ account: relayer.account, address: m.vault!, abi: AUTOPAY_MANDATE_ABI, functionName: "cancel", args: [signature] })
  const txHash = await relayer.writeContract(request)
  await pub.waitForTransactionReceipt({ hash: txHash })
  const a = arkiv()
  const dues = await a.pub.select({ $key: true }).from(DueCycle).ownedBy(a.owner).where(eq("mandateRef", key(m.key))).limit(5).fetch()
  await a.writer.executeBatch({
    deletes: (dues.entities as any[]).map((d) => ({ entityKey: d.$key })),
    patches: [{ schema: Mandate, entityKey: m.key, set: { status: "cancelled", nextDueAt: u64(0n), updatedAt: u64(BigInt(now())) } }],
  } as any, { gas: 2_000_000n })
  notify(m.webhook, `${m.subscriptionId}:cancelled`, { event: "subscription.cancelled", mandateKey: m.key, subscriptionId: m.subscriptionId, subscriber: m.subscriber, vault: m.vault, cancelledCycles: m.cycles - m.paidCycles })
  return { revoked: m.cycles - m.paidCycles, txs: [`${config.explorer}/tx/${txHash}`] }
}
