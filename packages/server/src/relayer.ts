// Gasless relayer with anti-drain policy. The relayer holds only WBT, never USDT.
import { decodeEventLog, parseSignature, type Address, type Hex } from "viem"
import { LIMITS, ROUTER_ABI, type Order } from "@whitepay/shared"
import { wc } from "./clients"
import { config } from "./config"

export type PayerAuth = { from: Address; validAfter: bigint; validBefore: bigint; signature: Hex }

export class PolicyError extends Error {
  constructor(public code: "rate_limited" | "daily_limit" | "step_up_required" | "gas_price_too_high" | "simulation_failed", msg: string) {
    super(msg)
  }
}

// --- in-memory policy state (swap for Redis/DB in production) ---
const recent = new Map<string, number[]>() // payer -> timestamps (ms)
const daily = new Map<string, { day: number; total: bigint }>()
const RATE = { windowMs: 60_000, max: 5 }

function checkPolicy(payer: Address, amount: bigint, stepUpVerified: boolean) {
  const k = payer.toLowerCase()
  const t = Date.now()
  const hits = (recent.get(k) ?? []).filter((x) => t - x < RATE.windowMs)
  if (hits.length >= RATE.max) throw new PolicyError("rate_limited", `max ${RATE.max} payments per minute per payer`)

  const day = Math.floor(t / 86_400_000)
  const d = daily.get(k)
  const spent = d && d.day === day ? d.total : 0n
  if (spent + amount > LIMITS.dailyPerPayer) throw new PolicyError("daily_limit", "daily limit reached")

  if (amount > LIMITS.stepUpThreshold && !stepUpVerified)
    throw new PolicyError("step_up_required", "amount above limit: World ID verification required")
}

function recordSpend(payer: Address, amount: bigint) {
  const k = payer.toLowerCase()
  const t = Date.now()
  recent.set(k, [...(recent.get(k) ?? []).filter((x) => t - x < RATE.windowMs), t])
  const day = Math.floor(t / 86_400_000)
  const d = daily.get(k)
  daily.set(k, { day, total: (d && d.day === day ? d.total : 0n) + amount })
}

const toAuthTuple = (a: PayerAuth) => {
  const { r, s, v, yParity } = parseSignature(a.signature)
  return { from: a.from, validAfter: a.validAfter, validBefore: a.validBefore, v: Number(v ?? BigInt(27 + (yParity ?? 0))), r, s }
}

async function guardGas() {
  const gasPrice = await wc().pub.getGasPrice()
  if (gasPrice > config.maxGasPrice) throw new PolicyError("gas_price_too_high", `gas price ${gasPrice} above cap`)
}

export type RelayResult = { txHash: Hex; block: bigint; gasUsed: bigint; paymentId: Hex; explorer: string }

/** P2M: settle a merchant order with the payer's signed authorization. */
export async function relayOrderPayment(p: {
  order: Order
  merchantSig: Hex
  auth: PayerAuth
  stepUpVerified?: boolean
}): Promise<RelayResult> {
  checkPolicy(p.auth.from, p.order.amount, !!p.stepUpVerified)
  await guardGas()
  const { pub, relayer } = wc()
  const args = [p.order, p.merchantSig, toAuthTuple(p.auth)] as const
  let request
  try {
    ;({ request } = await pub.simulateContract({
      account: relayer.account, address: config.router, abi: ROUTER_ABI, functionName: "payOrder", args,
    }))
  } catch (err) {
    throw new PolicyError("simulation_failed", shortErr(err))
  }
  const txHash = await relayer.writeContract(request)
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash })
  if (receipt.status !== "success") throw new Error(`payOrder reverted: ${txHash}`)
  recordSpend(p.auth.from, p.order.amount)

  let paymentId = "0x" as Hex
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: ROUTER_ABI, data: log.data, topics: log.topics })
      if (ev.eventName === "PaymentSettled") paymentId = ev.args.paymentId
    } catch {}
  }
  return { txHash, block: receipt.blockNumber, gasUsed: receipt.gasUsed, paymentId, explorer: `${config.explorer}/tx/${txHash}` }
}

/** P2P: gasless push to a person (recipient resolved from their ENS name by the caller). */
export async function relayDirectPayment(p: { to: Address; amount: bigint; memo: Hex; auth: PayerAuth; stepUpVerified?: boolean }) {
  checkPolicy(p.auth.from, p.amount, !!p.stepUpVerified)
  await guardGas()
  const { pub, relayer } = wc()
  let request
  try {
    ;({ request } = await pub.simulateContract({
      account: relayer.account, address: config.router, abi: ROUTER_ABI, functionName: "payDirect",
      args: [p.to, p.amount, p.memo, toAuthTuple(p.auth)],
    }))
  } catch (err) {
    throw new PolicyError("simulation_failed", shortErr(err))
  }
  const txHash = await relayer.writeContract(request)
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash })
  if (receipt.status !== "success") throw new Error(`payDirect reverted: ${txHash}`)
  recordSpend(p.auth.from, p.amount)
  return { txHash, block: receipt.blockNumber, gasUsed: receipt.gasUsed, explorer: `${config.explorer}/tx/${txHash}` }
}

export const shortErr = (err: unknown) => {
  const e = err as { shortMessage?: string; message?: string; cause?: { data?: { errorName?: string } } }
  const name = e?.cause?.data?.errorName
  return name ?? e?.shortMessage ?? e?.message?.split("\n")[0] ?? String(err)
}
