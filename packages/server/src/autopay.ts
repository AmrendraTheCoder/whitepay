// Autopay engine: merchant plans, subscriber mandates, per-cycle "due" entities on Arkiv and the keeper
// that turns an expiring countdown into a gasless payment. Model and guarantees: shared/src/autopay.ts.
import { ExpirationTime, NoEntityFoundError } from "@arkiv-network/sdk"
import { addr, u64, key } from "@arkiv-network/sdk/schema"
import { and, eq, lte, desc } from "@arkiv-network/sdk/query"
import { bytesToHex, getAddress, hexToBytes, parseSignature, recoverTypedDataAddress, type Address, type Hex } from "viem"
import { SubPlan, Mandate, DueCycle } from "@whitepay/shared/arkiv"
import { REGISTRY_ABI, USDT_ADDRESS, directNonce } from "@whitepay/shared"
import {
  PERIODS, MAX_CYCLES, EARLY_SECONDS, isPeriod, planTypedData, cycleAuthTypedData, cycleWindow, cycleMemo, cycleDueAt,
  cancelAuthTypedData, packSigs, unpackSig, type Plan, type PeriodKey,
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

  const r = await arkiv().writer.createEntity(SubPlan, {
    merchant: addr(plan.merchant), merchantName: profile?.ensName ?? undefined, title, amount: plan.amount,
    period: u64(BigInt(plan.period)), periodKey: p.periodKey, cycles: plan.cycles, planId: plan.planId.toLowerCase(),
    expiresAt: u64(plan.expiresAt), merchantSig: hexToBytes(p.merchantSig), single: !!p.single, status: "open",
    webhook: p.webhook, createdAt: u64(BigInt(now())),
  } as any, { expiration: expiry(ttl) }, { gas: 1_500_000n })
  return { planKey: r.entityKey, arkivTx: r.txHash }
}

export type PlanView = Awaited<ReturnType<typeof getPlan>>
export async function getPlan(planKey: Hex) {
  try {
    const e = (await arkiv().pub.getEntity(planKey, SubPlan)) as any
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
export async function subscribe(p: { planKey: Hex; subscriber: Address; subscriptionId: Hex; startAt: number; signatures: Hex[] }) {
  const pv = await getPlan(p.planKey)
  if (!pv) throw new Error("this plan has expired or does not exist")
  if (pv.single && pv.status !== "open") throw new Error("this checkout plan was already used")
  if (Number(pv.plan.expiresAt) < now()) throw new Error("this plan offer has expired")
  // never trust the stored plan blindly: re-check the merchant's signature on-chain registry
  const m = await wc().pub.readContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "get", args: [pv.plan.merchant] })
  const signer = await recoverTypedDataAddress({ ...planTypedData(pv.plan), signature: pv.merchantSig })
  if (!m.active || ![m.signer, pv.plan.merchant].some((x) => x.toLowerCase() === signer.toLowerCase())) throw new Error("plan signature is not valid")
  if (Math.abs(p.startAt - now()) > 120) throw new Error("subscription start time is off; check the device clock")
  if (p.signatures.length !== pv.plan.cycles) throw new Error(`expected ${pv.plan.cycles} signed cycles`)

  const { plan } = pv
  const grace = PERIODS[pv.periodKey].grace
  const subscriber = getAddress(p.subscriber)
  if (subscriber === plan.merchant) throw new Error("a shop can't subscribe to itself")
  // every cycle authorization must be the subscriber's, for exactly this merchant / amount / window
  for (let i = 0; i < plan.cycles; i++) {
    const td = cycleAuthTypedData({ subscriber, merchant: plan.merchant, amount: plan.amount, subscriptionId: p.subscriptionId, cycle: i, startAt: p.startAt, period: plan.period, grace })
    const who = await recoverTypedDataAddress({ ...td, signature: p.signatures[i] }).catch(() => null)
    if (!who || getAddress(who) !== subscriber) throw new Error(`cycle ${i + 1} is not signed by the subscriber`)
  }

  // cycle 1 is charged now (like the first month of any subscription)
  const first = await chargeCycle({ subscriber, merchant: plan.merchant, amount: plan.amount, subscriptionId: p.subscriptionId, startAt: p.startAt, period: plan.period, grace, cycle: 0, signature: p.signatures[0] })
  const receipt = await settleOnArkiv({ merchant: plan.merchant, merchantName: pv.merchantName, payer: subscriber, amount: plan.amount, paymentId: cycleMemo(p.subscriptionId, 0), txHash: first.txHash, block: first.block, kind: "autopay" }).catch(() => null)

  const a = arkiv()
  const last = plan.cycles === 1
  const endsAt = cycleDueAt(p.startAt, plan.period, plan.cycles - 1) + grace
  const nextDue = cycleDueAt(p.startAt, plan.period, 1)
  const [mk] = await a.pub.predictEntityKeys({ owner: a.owner, count: 1 })
  const res = await a.writer.executeBatch({
    creates: [
      { schema: Mandate, salt: mk.salt, expiration: expiry(Math.max(endsAt - now(), 3600) + 7 * 86_400), values: {
        subscriber: addr(subscriber), merchant: addr(plan.merchant), merchantName: pv.merchantName, title: pv.title, planRef: key(p.planKey),
        subscriptionId: p.subscriptionId.toLowerCase(), amount: plan.amount, period: u64(BigInt(plan.period)), grace: u64(BigInt(grace)),
        cycles: plan.cycles, startAt: u64(BigInt(p.startAt)), paidCycles: 1, nextDueAt: u64(BigInt(last ? 0 : nextDue)),
        status: last ? "completed" : "active", auths: hexToBytes(packSigs(p.signatures)), webhook: pv.webhook, lastTx: first.txHash,
        updatedAt: u64(BigInt(now())),
      } as any },
      ...(last ? [] : [{ schema: DueCycle, expiration: expiry(nextDue + grace - now()), values: {
        mandateRef: key(mk.key), subscriber: addr(subscriber), merchant: addr(plan.merchant), cycle: 1, amount: plan.amount,
        dueAt: u64(BigInt(nextDue)), status: "scheduled", attempts: 0,
      } as any }]),
    ],
    patches: pv.single ? [{ schema: SubPlan, entityKey: p.planKey, set: { status: "subscribed", mandateRef: key(mk.key) } }] : [],
  } as any, { gas: 4_000_000n })

  notify(pv.webhook, `${p.subscriptionId}:0`, { event: "subscription.started", mandateKey: mk.key, planKey: p.planKey, subscriptionId: p.subscriptionId,
    merchant: plan.merchant, subscriber, amount: plan.amount.toString(), cycle: 1, cycles: plan.cycles, txHash: first.txHash, explorer: first.explorer, nextDueAt: last ? null : nextDue })
  return { mandateKey: mk.key as Hex, arkivTx: res.txHash, firstTx: first.txHash, explorer: first.explorer, receiptKey: receipt?.receiptKey, nextDueAt: last ? null : nextDue }
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
  paidCycles: Number(val(e.paidCycles)), nextDueAt: Number(val(e.nextDueAt)), status: val(e.status) as string, auths: hex(val(e.auths)),
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
let running = false
let lastRun = 0
/** Pay every cycle whose countdown hit 0. Safe to call often and concurrently (on-chain nonces make double-pay impossible). */
export async function runKeeper(opts: { minIntervalMs?: number } = {}) {
  if (running || Date.now() - lastRun < (opts.minIntervalMs ?? 0)) return { skipped: true, paid: [], failed: [] }
  running = true
  lastRun = Date.now()
  const paid: { mandate: Hex; cycle: number; tx: Hex }[] = []
  const failed: { mandate: Hex; cycle: number; error: string }[] = []
  try {
    const a = arkiv()
    const due = await a.pub.select().from(DueCycle).ownedBy(a.owner)
      .where(lte("dueAt", u64(BigInt(now() + EARLY_SECONDS - 5)))).orderBy(desc("dueAt")).limit(15).fetch()
    for (const e of due.entities as any[]) {
      const dueKey = e.$key as Hex
      const cycle = Number(val(e.cycle))
      const mandateKey = val(e.mandateRef) as Hex
      const m = await getMandate(mandateKey)
      if (!m || m.status !== "active" || cycle < m.paidCycles) {
        await a.writer.deleteEntity({ entityKey: dueKey }).catch(() => {})
        continue
      }
      try {
        const r = await chargeCycle({ subscriber: m.subscriber, merchant: m.merchant, amount: m.amount, subscriptionId: m.subscriptionId, startAt: m.startAt, period: m.period, grace: m.grace, cycle, signature: unpackSig(m.auths, cycle) })
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
    running = false
  }
  return { skipped: false, paid, failed }
}

// ---------------------------------------------------------------------------------- cancel
const CANCEL_ABI = [{ type: "function", name: "cancelAuthorization", stateMutability: "nonpayable", inputs: [
  { name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }, { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" }], outputs: [] }] as const

/** Revoke every unused cycle ON-CHAIN (USDT cancelAuthorization, gasless via the relayer), then close the mandate. */
export async function cancelMandate(p: { mandateKey: Hex; subscriber: Address; cancels: { cycle: number; signature: Hex }[] }) {
  const m = await getMandate(p.mandateKey)
  if (!m) throw new Error("subscription not found")
  if (getAddress(p.subscriber) !== m.subscriber) throw new Error("only the subscriber can cancel")
  if (m.status !== "active") throw new Error(`subscription is already ${m.status}`)
  const remaining = Array.from({ length: m.cycles - m.paidCycles }, (_, i) => m.paidCycles + i)
  const txs: Hex[] = []
  for (const cycle of remaining) {
    const c = p.cancels.find((x) => x.cycle === cycle)
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
