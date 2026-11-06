// Gasless relayer with anti-drain policy. The relayer holds only WBT, never USDT.
import { decodeEventLog, encodeFunctionData, keccak256, parseSignature, type Address, type Hex } from "viem"
import { LIMITS, ROUTER_ABI, type Order } from "@whitepay/shared"
import { wc } from "./clients"
import { config } from "./config"

export type PayerAuth = { from: Address; validAfter: bigint; validBefore: bigint; signature: Hex }

export class PolicyError extends Error {
  constructor(public code: "rate_limited" | "daily_limit" | "gas_price_too_high" | "simulation_failed", msg: string) {
    super(msg)
  }
}

// --- in-memory policy state (swap for Redis/DB in production) ---
const recent = new Map<string, number[]>() // payer -> timestamps (ms)
const daily = new Map<string, { day: number; total: bigint }>()
const RATE = { windowMs: 60_000, max: 5 }

function checkPolicy(payer: Address, amount: bigint) {
  const k = payer.toLowerCase()
  const t = Date.now()
  const hits = (recent.get(k) ?? []).filter((x) => t - x < RATE.windowMs)
  if (hits.length >= RATE.max) throw new PolicyError("rate_limited", `max ${RATE.max} payments per minute per payer`)

  const day = Math.floor(t / 86_400_000)
  const d = daily.get(k)
  const spent = d && d.day === day ? d.total : 0n
  if (spent + amount > LIMITS.dailyPerPayer) throw new PolicyError("daily_limit", "daily limit reached")
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

/** Send a relayer tx robustly. The tx is signed ONCE and its hash is known before sending, so:
 *  - an ambiguous error (timeout, dropped connection, "already known") never creates a second tx: the same signed
 *    bytes are re-broadcast and the hash is returned for the caller to wait on;
 *  - only a clear "not accepted" (nonce too low / underpriced: another instance took this relayer's nonce) re-signs
 *    with a fresh nonce. The EIP-3009 authorization can execute at most once either way. */
// Whitechain's RPC answers a reused nonce with "Missing or invalid parameters." (that was the "fails on the first
// try" error); other nodes say "nonce too low" / "underpriced"
const NONCE_CLASH = /nonce too low|nonce has already been used|replacement transaction underpriced|transaction underpriced|missing or invalid parameters|invalid nonce/i

// Nonces are handed out here, one at a time per relayer: parallel payments on this instance get N, N+1, N+2...
// The chain's pending count is the floor, so another instance's txs are respected; a clash re-reads it.
const nextNonceAt = new Map<string, number>()
const nonceLocks = new Map<string, Promise<unknown>>()
async function takeNonce(address: Address): Promise<number> {
  const k = address.toLowerCase()
  const prev = nonceLocks.get(k) ?? Promise.resolve()
  const run = prev.catch(() => {}).then(async () => {
    const pending = await wc().pub.getTransactionCount({ address, blockTag: "pending" })
    const n = Math.max(pending, nextNonceAt.get(k) ?? 0)
    nextNonceAt.set(k, n + 1)
    return n
  })
  nonceLocks.set(k, run)
  return run
}
const forgetNonce = (address: Address) => nextNonceAt.delete(address.toLowerCase())
const AMBIGUOUS = /already known|timeout|timed out|fetch failed|ECONNRESET|socket hang up|HTTP request failed|network/i
export async function sendRobust(relayer: ReturnType<ReturnType<typeof wc>["relayerFor"]>, request: { address: Address; abi: any; functionName: string; args: readonly unknown[]; gas?: bigint }): Promise<Hex> {
  const data = encodeFunctionData({ abi: request.abi, functionName: request.functionName, args: request.args as any })
  for (let attempt = 0; attempt < 4; attempt++) {
    const nonce = await takeNonce(relayer.account.address)
    const prepared = await relayer.prepareTransactionRequest({ to: request.address, data, nonce, ...(request.gas ? { gas: request.gas } : {}) } as any)
    const raw = await relayer.signTransaction(prepared as any)
    const hash = keccak256(raw)
    for (let tries = 0; tries < 3; tries++) {
      try {
        await wc().pub.sendRawTransaction({ serializedTransaction: raw })
        return hash
      } catch (e) {
        const msg = `${(e as any)?.shortMessage ?? ""} ${(e as Error)?.message ?? ""}`
        if (/already known/i.test(msg)) return hash // the node has it: same bytes, same hash
        if (NONCE_CLASH.test(msg)) break // not accepted: re-sign with a fresh nonce
        if (!AMBIGUOUS.test(msg)) throw e
        await new Promise((r) => setTimeout(r, 400 * (tries + 1)))
        if (tries === 2) return hash // may well be in the mempool: let the caller wait for the receipt of THIS hash
      }
    }
    forgetNonce(relayer.account.address)
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300))
  }
  throw new Error("Couldn't get the payment onto Whitechain (busy relayer). Try again; nothing was charged.")
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
}): Promise<RelayResult> {
  checkPolicy(p.auth.from, p.order.amount)
  await guardGas()
  const { pub } = wc()
  const relayer = wc().relayerFor(p.auth.from)
  const args = [p.order, p.merchantSig, toAuthTuple(p.auth)] as const
  let request
  try {
    ;({ request } = await pub.simulateContract({
      account: relayer.account, address: config.router, abi: ROUTER_ABI, functionName: "payOrder", args,
    }))
  } catch (err) {
    throw new PolicyError("simulation_failed", shortErr(err))
  }
  const txHash = await sendRobust(relayer, request as any)
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 })
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
export async function relayDirectPayment(p: { to: Address; amount: bigint; memo: Hex; auth: PayerAuth}) {
  checkPolicy(p.auth.from, p.amount)
  await guardGas()
  const { pub } = wc()
  const relayer = wc().relayerFor(p.auth.from)
  let request
  try {
    ;({ request } = await pub.simulateContract({
      account: relayer.account, address: config.router, abi: ROUTER_ABI, functionName: "payDirect",
      args: [p.to, p.amount, p.memo, toAuthTuple(p.auth)],
    }))
  } catch (err) {
    throw new PolicyError("simulation_failed", shortErr(err))
  }
  const txHash = await sendRobust(relayer, request as any)
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 })
  if (receipt.status !== "success") throw new Error(`payDirect reverted: ${txHash}`)
  recordSpend(p.auth.from, p.amount)
  return { txHash, block: receipt.blockNumber, gasUsed: receipt.gasUsed, explorer: `${config.explorer}/tx/${txHash}` }
}

export const shortErr = (err: unknown) => {
  const e = err as { shortMessage?: string; message?: string; cause?: { data?: { errorName?: string; args?: unknown[] }; reason?: string } }
  const name = e?.cause?.data?.errorName
  // require("…") reverts surface as errorName "Error": report the reason string instead (e.g. "transfer amount exceeds balance")
  if (name === "Error" || !name) {
    const reason = (e?.cause?.data?.args?.[0] as string | undefined) ?? e?.cause?.reason
    if (reason) return reason
  }
  return name ?? e?.shortMessage ?? e?.message?.split("\n")[0] ?? String(err)
}
