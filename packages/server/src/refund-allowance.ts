// WondrPay for Business: refund allowance. Refunds by API key, with no wallet prompt for each one.
//
//  Setup   the shop's PAYOUT wallet signs one EIP-2612 permit for Whitechain USDT: "WondrPay's refund agent may move
//          up to N USDT from me". WondrPay submits it (pays the gas). Changing N or switching off = a new permit.
//  Refund  POST /api/v1/refunds with the secret key: WondrPay checks the payment is this shop's, the amount is at most
//          paid - refunded (router refunds + allowance refunds), then the agent calls transferFrom(payout -> ORIGINAL
//          payer). The money can only ever go back to who paid, and never more than they paid.
//  Ledger  every allowance refund is a `whitepay.refundx` record on Arkiv; refundInfo() adds them to the router's own
//          refunded counter, so every refund path (refund requests, dashboard, API) sees one total.
// The PaymentRouter is unchanged: it isn't involved in allowance refunds (its own `refunded` counter doesn't move).
import { ExpirationTime } from "@arkiv-network/sdk"
import { addr, u64, u256, defineSchema, str } from "@arkiv-network/sdk/schema"
import { eq } from "@arkiv-network/sdk/query"
import { createWalletClient, getAddress, http, parseAbi, parseSignature, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { Receipt } from "@whitepay/shared/arkiv"
import { WHITECHAIN_CHAIN_ID, whitechainSepolia } from "@whitepay/shared"
import { arkiv, wc } from "./clients"
import { config } from "./config"
import { cached, invalidate } from "./cache"
import { SiteError, serialShop, type SiteRow } from "./sites"
import { registryGet } from "./requests"
import { refundInfo, refundInfoRouterFresh } from "./refunds"

const now = () => Math.floor(Date.now() / 1000)
const trimBytes = (x: string, max: number) => { let out = x; while (Buffer.byteLength(out, "utf8") > max) out = out.slice(0, -1); return out }
const v = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x)

/** One refund paid from a shop's allowance (the router's own refunds are on-chain in Refunded events). */
export const RefundRecord = defineSchema("whitepay.refundx", {
  paymentId: str().indexed(),
  merchant: addr().indexed(),
  payer: addr(),
  amount: u256(),
  tx: str().indexed(),
  at: u64().indexed(),
  site: str().indexed().optional(),
  reason: str().optional(),
  idem: str().indexed().optional(), // sha256(site:Idempotency-Key)
  // claim protocol (see claimRefund): pending → paid | failed | cancelled; router refunds end as router_settled
  status: str().indexed().optional(), // missing = paid (records written before the claim protocol)
  source: str().optional(), // "allowance" | "router"
})

const USDT_ABI = parseAbi([
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function nonces(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
])

/** The wallet that holds refund allowances and sends allowance refunds. A dedicated key (REFUND_AGENT_PK) that does
 *  nothing else, so a leak of any other WondrPay key can't touch allowances; falls back to the admin key in dev. */
const agentKey = () => {
  const k = process.env.REFUND_AGENT_PK?.trim()
  return k && /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as Hex) : config.keys.admin()
}
const agentWallet = () => createWalletClient({ chain: whitechainSepolia, transport: http(config.wcRpc), account: privateKeyToAccount(agentKey()) })
export const refundAgent = () => privateKeyToAccount(agentKey()).address

/** EIP-2612 typed data the payout wallet signs (Whitechain USDT: name "Tether USD", version "1"). */
export function permitTypedData(p: { owner: Address; spender: Address; value: bigint; nonce: bigint; deadline: bigint }) {
  return {
    domain: { name: "Tether USD", version: "1", chainId: WHITECHAIN_CHAIN_ID, verifyingContract: config.usdt },
    types: { Permit: [
      { name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
    ] },
    primaryType: "Permit" as const,
    message: { owner: p.owner, spender: p.spender, value: p.value, nonce: p.nonce, deadline: p.deadline },
  }
}

/** What the portal shows and needs to sign: the shop's payout, the agent, the current on-chain allowance and nonce. */
export async function allowanceState(merchant: Address) {
  const m = await registryGet(getAddress(merchant))
  if (!m.active) throw new SiteError("forbidden", "Set up your shop first")
  const agent = refundAgent()
  const [allowance, nonce, balance] = await Promise.all([
    wc().pub.readContract({ address: config.usdt, abi: USDT_ABI, functionName: "allowance", args: [m.payout, agent] }),
    wc().pub.readContract({ address: config.usdt, abi: USDT_ABI, functionName: "nonces", args: [m.payout] }),
    wc().pub.readContract({ address: config.usdt, abi: USDT_ABI, functionName: "balanceOf", args: [m.payout] }),
  ])
  return { merchant: getAddress(merchant), payout: getAddress(m.payout), agent, allowance: allowance.toString(), nonce: nonce.toString(), payoutBalance: balance.toString() }
}

/** Submit the payout wallet's permit (set or change the cap; value 0 switches refunds-by-API off). */
export async function setRefundAllowance(p: { merchant: Address; value: string; deadline: string; signature: Hex }) {
  const merchant = getAddress(p.merchant)
  return serialShop(merchant, async () => {
    const m = await registryGet(merchant)
    if (!m.active) throw new SiteError("forbidden", "Set up your shop first")
    if (!/^\d{1,13}$/.test(p.value) || BigInt(p.value) > 10_000_000_000n) throw new SiteError("bad_request", "The allowance must be 0 to 10,000 USDT")
    if (!/^\d{1,12}$/.test(p.deadline) || Number(p.deadline) < now()) throw new SiteError("bad_request", "This approval expired. Try again.")
    const { r, s, v: vv, yParity } = parseSignature(p.signature)
    const hash = await agentWallet().writeContract({
      address: config.usdt, abi: USDT_ABI, functionName: "permit",
      args: [m.payout, refundAgent(), BigInt(p.value), BigInt(p.deadline), Number(vv ?? BigInt(27 + (yParity ?? 0))), r, s],
    }).catch((e) => { throw new SiteError("bad_request", `USDT refused the approval (${(e as Error).message.split("\n")[0].slice(0, 120)}). Sign it again from the payout wallet.`) })
    const rc = await wc().pub.waitForTransactionReceipt({ hash })
    if (rc.status !== "success") throw new SiteError("bad_request", "USDT refused the approval. Sign it again from the payout wallet.")
    return { txHash: hash, explorer: `${config.explorer}/tx/${hash}`, ...(await allowanceState(merchant)) }
  })
}

// Which ledger rows count against a payment's refundable amount:
//  pending (any source: money may be moving), paid (allowance refunds; the router never saw them), and old rows
//  without a status. Router refunds stop counting once settled (the router's own counter has them).
const COUNTED = (status?: string) => !status || status === "pending" || status === "paid"
type LedgerRow = { key: Hex; amount: bigint; status?: string; source?: string; idem?: string; tx: string; site?: string; payer: string; reason?: string }
async function ledgerRows(paymentId: Hex): Promise<LedgerRow[]> {
  const a = arkiv()
  const r = await a.pub.select({ $key: true, amount: true, status: true, source: true, idem: true, tx: true, site: true, payer: true, reason: true })
    .from(RefundRecord).ownedBy(a.owner).where(eq("paymentId", paymentId.toLowerCase())).limit(100).fetch()
  return (r.entities as any[]).map((e) => ({ key: e.$key, amount: BigInt(v(e.amount)), status: v(e.status) || undefined, source: v(e.source) || undefined,
    idem: v(e.idem) || undefined, tx: v(e.tx), site: v(e.site) || undefined, payer: v(e.payer), reason: v(e.reason) || undefined }))
}

/** Refunds counted from the ledger for a payment (allowance refunds + any refund still in flight). Fails closed:
 *  if Arkiv can't be read, this throws and no refund is paid. */
export async function allowanceRefunded(paymentId: Hex, fresh = false): Promise<bigint> {
  const load = async () => (await ledgerRows(paymentId)).filter((r) => COUNTED(r.status)).reduce((sum, r) => sum + r.amount, 0n)
  return fresh ? load() : cached(`refundx:${paymentId.toLowerCase()}`, 3_000, load)
}

/**
 * Pay a refund under a ledger CLAIM, so no combination of refund paths, server instances or failures can pay more
 * than was paid:
 *  1. write a `pending` row for the amount (counted from now on) — if this fails, nothing is paid
 *  2. wait until the row is visible in the index, then re-sum every counted row for the payment. All rows come from
 *     WondrPay's one Arkiv writer, so they land in order: of two racing claims the LATER one always sees the earlier
 *     and backs off (cancelled); the earlier one may proceed.
 *  3. pay (`run`); then mark the row paid / router_settled, or failed. A row that can't be updated stays pending and
 *     keeps counting (errs on the safe side).
 */
export async function claimRefund<T extends { txHash: Hex }>(
  p: { paymentId: Hex; merchant: Address; payer: Address; amount: bigint; paid: bigint; source: "allowance" | "router"; site?: string; reason?: string; idem?: string },
  run: () => Promise<T>,
): Promise<T> {
  const a = arkiv()
  const paymentId = p.paymentId.toLowerCase() as Hex
  const values = {
    paymentId, merchant: addr(p.merchant), payer: addr(p.payer), amount: p.amount, tx: "pending", at: u64(BigInt(now())),
    status: "pending", source: p.source, ...(p.site ? { site: p.site } : {}), ...(p.reason ? { reason: p.reason } : {}), ...(p.idem ? { idem: p.idem } : {}),
  }
  // the claim is written before any money moves, so retrying a flaky Arkiv write is safe
  let entityKey: Hex | undefined
  for (let i = 0; i < 3 && !entityKey; i++) {
    try { entityKey = (await a.writer.createEntity(RefundRecord, values as any, { expiration: ExpirationTime.max() }, { gas: 1_500_000n })).entityKey }
    catch (e) { if (i === 2) throw new SiteError("conflict", "Couldn't record the refund safely, so nothing was paid. Try again."); await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1500)) }
  }
  if (!entityKey) throw new SiteError("conflict", "Couldn't record the refund safely, so nothing was paid. Try again.")
  invalidate(`refundx:${paymentId}`)
  const key = entityKey
  const mark = (set: Record<string, unknown>) => a.writer.patchEntity(RefundRecord, key, { set } as any, { gas: 1_000_000n } as any)
    .catch((e) => console.error("[refundx] status update failed (row keeps counting)", entityKey, (e as Error).message.split("\n")[0]))

  // 2. see our own row in the index, then check the total including every claim before ours
  let rows: LedgerRow[] = []
  for (let i = 0; i < 15; i++) {
    rows = await ledgerRows(paymentId)
    if (rows.some((r) => r.key.toLowerCase() === entityKey.toLowerCase())) break
    rows = []
    await new Promise((r) => setTimeout(r, 800))
  }
  if (!rows.length) { await mark({ status: "cancelled" }); throw new SiteError("conflict", "Refunds are busy right now. Try again in a moment; nothing was paid.") }
  const router = await refundInfoRouterFresh(paymentId)
  const counted = rows.filter((r) => COUNTED(r.status)).reduce((sum, r) => sum + r.amount, 0n)
  if (!router || router.refunded + counted > p.paid) {
    await mark({ status: "cancelled" })
    invalidate(`refundx:${paymentId}`)
    throw new SiteError("conflict", "Another refund for this payment just went through. Check what's still refundable and try again; nothing was paid.")
  }

  // 3. pay
  try {
    const out = await run()
    await mark({ status: p.source === "router" ? "router_settled" : "paid", tx: out.txHash.toLowerCase(), at: u64(BigInt(now())) })
    invalidate(`refundx:${paymentId}`)
    return out
  } catch (e) {
    // only mark failed when the money certainly didn't move (no tx hash came back); otherwise keep it counted
    if (!(e as any)?.txHash) await mark({ status: "failed" })
    invalidate(`refundx:${paymentId}`)
    throw e
  }
}

const inFlight = new Set<string>()
const parseAmount = (raw: unknown): bigint | null => {
  if (raw == null) return null
  const s = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : ""
  if (!/^\d{1,4}(\.\d{1,6})?$/.test(s)) throw new SiteError("bad_request", 'amount must be a decimal string in USDT, like "2.50" (or leave it out for a full refund)')
  const [i, f = ""] = s.split(".")
  return BigInt(i) * 1_000_000n + BigInt(f.padEnd(6, "0"))
}

/** API refund (secret key): pay `amount` (default: everything still refundable) back to the original payer. */
export async function refundByApi(site: SiteRow, input: { paymentId?: unknown; amount?: unknown; reason?: unknown }, idem?: string) {
  const paymentId = typeof input.paymentId === "string" && /^0x[0-9a-fA-F]{64}$/.test(input.paymentId) ? (input.paymentId.toLowerCase() as Hex) : null
  if (!paymentId) throw new SiteError("bad_request", "paymentId must be the session id / payment id (0x + 64 hex)")
  const reason = typeof input.reason === "string" ? trimBytes(input.reason.trim(), 120) || undefined : undefined
  const key = paymentId
  if (inFlight.has(key)) throw new SiteError("conflict", "A refund for this payment is already in progress")
  inFlight.add(key)
  try {
    // same Idempotency-Key from this website: answer with the refund already made (on any server instance)
    if (idem) {
      const a0 = arkiv()
      const prev = await a0.pub.select({ paymentId: true, payer: true, amount: true, tx: true, site: true, reason: true, status: true }).from(RefundRecord).ownedBy(a0.owner).where(eq("idem", idem)).limit(5).fetch()
      const e = (prev.entities as any[]).find((x) => v(x.site) === site.siteId && COUNTED(v(x.status) || undefined))
      if (e) {
        const asked = parseAmount(input.amount)
        if (v(e.paymentId) !== paymentId || (asked != null && asked !== BigInt(v(e.amount))))
          throw new SiteError("conflict", "This Idempotency-Key was already used for a different refund")
        if (v(e.status) === "pending") throw new SiteError("conflict", "This refund is still being processed. Try again in a moment.")
        const now2 = await refundInfo(paymentId)
        return { object: "refund", paymentId, payer: getAddress(v(e.payer)), amount: String(v(e.amount)), refunded: (now2?.refunded ?? 0n).toString(),
          refundable: (now2?.refundable ?? 0n).toString(), txHash: v(e.tx) as Hex, explorer: `${config.explorer}/tx/${v(e.tx)}`, allowanceLeft: undefined as string | undefined, reason: v(e.reason) || undefined, replayed: true }
      }
    }
    const info = await refundInfo(paymentId)
    if (!info || info.merchant !== site.merchant) throw new SiteError("not_found", "No such payment for this shop")
    const amount = parseAmount(input.amount) ?? info.refundable
    if (amount <= 0n) throw new SiteError("conflict", info.refundable === 0n ? "This payment is already fully refunded" : "amount must be more than 0")
    if (amount > info.refundable) throw new SiteError("bad_request", `At most ${(Number(info.refundable) / 1e6).toFixed(2)} USDT can still be refunded on this payment`)
    const m = await registryGet(site.merchant)
    const [allowance, balance] = await Promise.all([
      wc().pub.readContract({ address: config.usdt, abi: USDT_ABI, functionName: "allowance", args: [m.payout, refundAgent()] }),
      wc().pub.readContract({ address: config.usdt, abi: USDT_ABI, functionName: "balanceOf", args: [m.payout] }),
    ])
    if (allowance < amount) throw new SiteError("forbidden", `Your refund allowance has ${(Number(allowance) / 1e6).toFixed(2)} USDT left. Top it up in WondrPay Business (Refunds).`)
    if (balance < amount) throw new SiteError("forbidden", "Your payout wallet doesn't have enough USDT for this refund")
    const out = await claimRefund({ paymentId, merchant: site.merchant, payer: info.payer, amount, paid: info.amount, source: "allowance", site: site.siteId, reason, idem }, async () => {
      const txHash = await agentWallet().writeContract({ address: config.usdt, abi: USDT_ABI, functionName: "transferFrom", args: [m.payout, info.payer, amount] })
      const rc = await wc().pub.waitForTransactionReceipt({ hash: txHash }).catch((e) => { throw Object.assign(e as Error, { txHash }) })
      if (rc.status !== "success") throw new Error("refund transfer reverted") // reverted: no money moved
      return { txHash }
    })
    const hash = out.txHash
    const a = arkiv()
    const total = info.refunded + amount
    try {
      const found = await a.pub.select({ $key: true }).from(Receipt).ownedBy(a.owner).where(eq("paymentId", paymentId)).limit(1).fetch()
      const rk = (found.entities[0] as any)?.$key
      if (rk) await a.writer.patchEntity(Receipt, rk, { set: { refunded: total, status: total >= info.amount ? "refunded" : "partially_refunded" } }, { gas: 1_000_000n })
    } catch (e) { console.warn("[refundx] receipt patch failed", (e as Error).message.split("\n")[0]) }
    return {
      object: "refund", paymentId, payer: info.payer, amount: amount.toString(), refunded: total.toString(), refundable: (info.amount - total).toString(),
      txHash: hash, explorer: `${config.explorer}/tx/${hash}`, allowanceLeft: (allowance - amount).toString() as string | undefined, reason, replayed: false,
    }
  } finally {
    inFlight.delete(key)
  }
}
