// Refund requests: a trustless, append-only case log on Arkiv.
//
//  - Every action is ONE immutable RefundEvent: opened (payer) -> response (shop) -> reply (payer) -> ...
//    The WondrPay writer creates it, then moves ownership to the burn address 0x…dEaD: nobody, WondrPay
//    included, can edit or delete it afterwards. It only expires.
//  - Every event carries the acting party's own signature (payer, or the shop's payout wallet), so a
//    reader trusts an event only if it was created by the writer ($creator) AND the signature checks out.
//  - Money never depends on WondrPay's word: an approved refund is paid by the PaymentRouter on-chain
//    from the shop's signed authorization, only to the original payer, capped at what was paid.
//  - Lifecycle: a request lives 7 days. Unanswered => the keeper re-opens it for another 7 days (next
//    round). After the shop's first response, 12 h without activity => resolved. Data expires on its own.
//  - World ID: opening a request needs a proof of human. Its nullifier is the same for one person across
//    all their wallets, so one person can't flood shops with refund claims from fresh wallets, and the
//    shop sees how many requests that PERSON has filed recently (serial-refunder signal).
import { ExpirationTime } from "@arkiv-network/sdk"
import { addr, u64 } from "@arkiv-network/sdk/schema"
import { and, eq, gte } from "@arkiv-network/sdk/query"
import { encodeAbiParameters, getAddress, isAddress, keccak256, verifyMessage, bytesToHex, hexToBytes, type Address, type Hex } from "viem"
import { RefundEvent, Receipt } from "@whitepay/shared/arkiv"
import {
  REFUND_WINDOW_S, REFUND_QUIET_S, REFUND_REASONS,
  refundRequestMessage, refundResponseMessage, refundReplyMessage, refundCaseId,
} from "@whitepay/shared"
import { arkiv } from "./clients"
import { refundInfo, relayRefund } from "./refunds"
import { verifyProof, WORLD_ACTIONS } from "./world"
import type { PayerAuth } from "./relayer"

// Arkiv refuses the literal zero address as an owner, so ownership goes to the standard burn address:
// nobody holds its key, so after the transfer no one can update or delete the event (verified on Rabdi).
const BURN: Address = "0x000000000000000000000000000000000000dEaD"
const MAX_ROUNDS = 8 // an ignored request keeps re-opening for up to 8 weeks
const MAX_OPEN_PER_HUMAN = 3 // open requests one person may have at once, across all wallets
const now = () => Math.floor(Date.now() / 1000)
const expiry = (seconds: number) => ExpirationTime.fromSeconds(Math.max(2, Math.ceil(seconds / 2) * 2))
const v = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x)

export const caseIdOf = refundCaseId

export type CaseEvent = {
  key: Hex; kind: "opened" | "renewed" | "response" | "reply"; round: number; at: number; deadline: number
  actor: Address; reason?: string; message?: string; evidence?: string
  decision?: "approve" | "reject"; percent?: number; refundAmount?: string; refundTx?: string
}
export type RefundCase = {
  caseId: Hex; paymentId: Hex; merchant: Address; payer: Address; amount: string; item?: string
  status: "open" | "responded" | "resolved" | "lapsed"
  decision?: "approve" | "reject" // latest shop decision
  round: number; openedAt: number
  /** open: when this 7-day window ends (then it re-opens); responded: when it resolves if quiet */
  until: number
  refunded: string
  /** how many refund requests this same PERSON (World ID) filed in the last 30 days, any wallet, any shop */
  humanRequests30d: number
  events: CaseEvent[]
}

// ------------------------------------------------------------------- write (immutable events)
async function writeEvent(values: Record<string, unknown>, deadline: number) {
  const a = arkiv()
  // keep it readable until the case can no longer change, plus an hour of slack
  const ttl = Math.max(deadline - now(), 60) + 3_600
  const { entityKey } = await (a.writer as any).createEntity(RefundEvent, values, { expiration: expiry(ttl) }, { gas: 2_500_000n })
  // hand it to nobody: from here on it can't be updated or deleted by anyone, only expire
  await (a.writer as any).changeOwnership({ entityKey, newOwner: BURN }, { gas: 1_000_000n })
  return entityKey as Hex
}

const sigOf = (sig: string | Uint8Array) => (typeof sig === "string" ? (sig as Hex) : bytesToHex(sig))

// ------------------------------------------------------------------- read + verify
async function readEvents(where: any) {
  const a = arkiv()
  const page = await a.pub
    .select({ $key: true, $creator: true, caseId: true, paymentId: true, merchant: true, payer: true, kind: true, round: true, at: true, deadline: true,
      amount: true, item: true, reason: true, message: true, evidence: true, decision: true, percent: true, refundAmount: true, refundTx: true, human: true, signedAt: true, sig: true })
    .from(RefundEvent)
    .createdBy(a.owner) // only events our writer created (the owner is now 0x0, the creator never changes)
    .where(where as never)
    .limit(100)
    .fetch()
  return (page.entities as any[]).filter((e) => !e.$creator || getAddress(e.$creator) === getAddress(a.owner))
}

/** Re-derive the signed message and check the actor really signed it. Unverifiable events are dropped. */
async function verifyEvent(e: any): Promise<boolean> {
  try {
    const kind = v(e.kind), sig = sigOf(v(e.sig)), signedAt = Number(v(e.signedAt))
    const payer = getAddress(v(e.payer)), merchant = getAddress(v(e.merchant))
    if (kind === "opened" || kind === "renewed")
      return verifyMessage({ address: payer, signature: sig, message: refundRequestMessage({ paymentId: v(e.paymentId), payer, reason: v(e.reason) ?? "", message: v(e.message) ?? "", evidence: v(e.evidence) || undefined, issuedAt: signedAt }) })
    if (kind === "response")
      return verifyMessage({ address: merchant, signature: sig, message: refundResponseMessage({ caseId: v(e.caseId), merchant, decision: v(e.decision), percent: Number(v(e.percent) ?? 0), message: v(e.message) ?? "", issuedAt: signedAt }) })
    if (kind === "reply")
      return verifyMessage({ address: payer, signature: sig, message: refundReplyMessage({ caseId: v(e.caseId), payer, message: v(e.message) ?? "", evidence: v(e.evidence) || undefined, issuedAt: signedAt }) })
  } catch {}
  return false
}

async function humanRequests30d(human?: string) {
  if (!human) return 0
  const evs = await readEvents(and(eq("human", human), eq("kind", "opened"), gte("at", u64(BigInt(now() - 30 * 86_400)))))
  return new Set(evs.map((e) => v(e.caseId))).size
}

function derive(caseId: Hex, evs: any[], humanCount: number): RefundCase | null {
  if (!evs.length) return null
  const sorted = [...evs].sort((x, y) => Number(v(x.at)) - Number(v(y.at)))
  const first = sorted.find((e) => v(e.kind) === "opened") ?? sorted[0]
  const rounds = sorted.filter((e) => v(e.kind) === "opened" || v(e.kind) === "renewed")
  const last = rounds[rounds.length - 1] ?? first
  const responses = sorted.filter((e) => v(e.kind) === "response")
  const activity = sorted.filter((e) => v(e.kind) === "response" || v(e.kind) === "reply")
  const t = now()
  let status: RefundCase["status"], until: number
  if (!responses.length) {
    until = Number(v(last.deadline))
    status = t < until ? "open" : "lapsed"
  } else {
    until = Math.max(...activity.map((e) => Number(v(e.at)))) + REFUND_QUIET_S
    status = t < until ? "responded" : "resolved"
  }
  const refunded = responses.reduce((s, e) => s + (v(e.decision) === "approve" ? BigInt(v(e.refundAmount) ?? 0) : 0n), 0n)
  const latest = responses[responses.length - 1]
  return {
    caseId, paymentId: v(first.paymentId), merchant: getAddress(v(first.merchant)), payer: getAddress(v(first.payer)),
    amount: String(v(first.amount)), item: v(first.item) || undefined,
    status, decision: latest ? v(latest.decision) : undefined, round: Number(v(last.round)), openedAt: Number(v(first.at)), until,
    refunded: refunded.toString(), humanRequests30d: humanCount,
    events: sorted.map((e) => ({
      key: e.$key, kind: v(e.kind), round: Number(v(e.round)), at: Number(v(e.at)), deadline: Number(v(e.deadline)),
      actor: getAddress(v(e.kind) === "response" ? v(e.merchant) : v(e.payer)),
      reason: v(e.reason) || undefined, message: v(e.message) || undefined, evidence: v(e.evidence) || undefined,
      decision: v(e.decision) || undefined, percent: v(e.percent) != null ? Number(v(e.percent)) : undefined,
      refundAmount: v(e.refundAmount) != null ? String(v(e.refundAmount)) : undefined, refundTx: v(e.refundTx) || undefined,
    })),
  }
}

/** All cases matching a filter, each re-verified from its signed events. */
export async function listRefundCases(f: { merchant?: Address; payer?: Address; caseId?: Hex; paymentId?: Hex }): Promise<RefundCase[]> {
  const where = f.caseId ? eq("caseId", f.caseId.toLowerCase())
    : f.paymentId ? eq("paymentId", f.paymentId.toLowerCase())
    : f.merchant ? eq("merchant", addr(getAddress(f.merchant)))
    : f.payer ? eq("payer", addr(getAddress(f.payer)))
    : null
  if (!where) throw new Error("filter required")
  const raw = await readEvents(where)
  const ok = (await Promise.all(raw.map(async (e) => ((await verifyEvent(e)) ? e : null)))).filter(Boolean) as any[]
  const byCase = new Map<string, any[]>()
  for (const e of ok) byCase.set(v(e.caseId), [...(byCase.get(v(e.caseId)) ?? []), e])
  const out: RefundCase[] = []
  for (const [id, evs] of byCase) {
    const human = v(evs.find((e) => v(e.kind) === "opened")?.human)
    const c = derive(id as Hex, evs, await humanRequests30d(human))
    if (c) out.push(c)
  }
  return out.sort((x, y) => y.openedAt - x.openedAt)
}
export const getRefundCase = async (caseId: Hex) => (await listRefundCases({ caseId }))[0] ?? null

// ------------------------------------------------------------------- open (payer + World ID)
export async function openRefundRequest(p: {
  paymentId: Hex; payer: Address; reason: string; message: string; evidence?: string; issuedAt: number; signature: Hex; result: any
}) {
  const payer = getAddress(p.payer)
  const reason = String(p.reason)
  const message = String(p.message ?? "").trim()
  const evidence = p.evidence?.trim() || undefined
  if (!(REFUND_REASONS as readonly string[]).includes(reason)) throw new Error("Pick a reason")
  if (message.length < 10 || message.length > 500) throw new Error("Describe the problem in 10 to 500 characters")
  if (evidence && (!/^https:\/\/[^\s]{4,200}$/.test(evidence))) throw new Error("Proof link must be an https:// link")
  if (Math.abs(now() - p.issuedAt) > 600) throw new Error("Request expired, sign again")
  if (!(await verifyMessage({ address: payer, signature: p.signature, message: refundRequestMessage({ paymentId: p.paymentId, payer, reason, message, evidence, issuedAt: p.issuedAt }) })))
    throw new Error("Signature does not match your wallet")

  // the payment must exist on-chain, be THIS wallet's, and still have something refundable
  const info = await refundInfo(p.paymentId)
  if (!info) throw new Error("No such payment on Whitechain")
  if (info.payer !== payer) throw new Error("Only the wallet that paid can ask for a refund")
  if (info.refundable <= 0n) throw new Error("This payment was already fully refunded")

  const caseId = caseIdOf(p.paymentId, payer, p.issuedAt)
  const live = (await listRefundCases({ paymentId: p.paymentId })).find((c) => c.payer === payer && c.status !== "resolved" && c.status !== "lapsed")
  if (live) throw new Error("You already have an open refund request for this order")

  // proof of human, bound to THIS case (a proof can't be replayed for another order)
  const { nullifier } = await verifyProof(p.result, WORLD_ACTIONS.refund, caseId)
  return recordOpen({ ...p, payer, reason, message, evidence }, caseId, info, nullifier)
}

/** After the World ID proof: per-human limit, then write the immutable "opened" event.
 *  Exported for scripts/tests only (not reachable from any route without a proof). */
export async function recordOpen(
  p: { paymentId: Hex; payer: Address; reason: string; message: string; evidence?: string; issuedAt: number; signature: Hex },
  caseId: Hex, info: { merchant: Address; amount: bigint }, nullifier: string,
) {
  const { payer, reason, message, evidence } = p
  const open = await readEvents(and(eq("human", nullifier), eq("kind", "opened"), gte("at", u64(BigInt(now() - REFUND_WINDOW_S)))))
  const openCases = new Set(open.map((e) => v(e.caseId)).filter((id) => id !== caseId))
  if (openCases.size >= MAX_OPEN_PER_HUMAN) throw new Error(`You already have ${openCases.size} open refund requests. Wait for those to finish.`)

  const a = arkiv()
  const rc = await a.pub.select({ item: true }).from(Receipt).ownedBy(a.owner).where(eq("paymentId", p.paymentId.toLowerCase())).limit(1).fetch()
  const item = v((rc.entities[0] as any)?.item) as string | undefined
  const at = now()
  const deadline = at + REFUND_WINDOW_S
  await writeEvent({
    caseId, paymentId: p.paymentId.toLowerCase(), merchant: addr(info.merchant), payer: addr(payer), kind: "opened", round: 1,
    at: u64(BigInt(at)), deadline: u64(BigInt(deadline)), amount: info.amount, ...(item ? { item } : {}),
    reason, message, ...(evidence ? { evidence } : {}), human: nullifier, signedAt: u64(BigInt(p.issuedAt)), sig: hexToBytes(p.signature),
  }, deadline)
  return getRefundCase(caseId)
}

// ------------------------------------------------------------------- respond (shop)
export async function respondToRefund(p: {
  caseId: Hex; merchant: Address; decision: "approve" | "reject"; percent: number; message: string; issuedAt: number; signature: Hex
  /** approve: the shop's signed EIP-3009 refund authorization for exactly the approved amount */
  refundAuth?: PayerAuth & { value: string }
}) {
  const merchant = getAddress(p.merchant)
  const c = await getRefundCase(p.caseId)
  if (!c) throw new Error("No such refund request")
  if (c.merchant !== merchant) throw new Error("Only the shop that was paid can answer")
  if (c.status === "resolved" || c.status === "lapsed") throw new Error("This request is already closed")
  const message = String(p.message ?? "").trim().slice(0, 500)
  const percent = p.decision === "approve" ? Math.round(Number(p.percent)) : 0
  if (p.decision === "approve" && !(percent >= 1 && percent <= 100)) throw new Error("Pick 1 to 100 percent")
  if (p.decision === "reject" && message.length < 5) throw new Error("Tell the customer why (at least 5 characters)")
  if (Math.abs(now() - p.issuedAt) > 600) throw new Error("Response expired, sign again")
  if (!(await verifyMessage({ address: merchant, signature: p.signature, message: refundResponseMessage({ caseId: p.caseId, merchant, decision: p.decision, percent, message, issuedAt: p.issuedAt }) })))
    throw new Error("Signature does not match the shop wallet")

  let refundAmount: bigint | undefined, refundTx: string | undefined
  if (p.decision === "approve") {
    const info = await refundInfo(c.paymentId)
    if (!info) throw new Error("Payment not found on-chain")
    refundAmount = (info.amount * BigInt(percent)) / 100n
    if (refundAmount > info.refundable) refundAmount = info.refundable
    if (refundAmount <= 0n) throw new Error("Nothing left to refund on this payment")
    if (!p.refundAuth || BigInt(p.refundAuth.value) !== refundAmount) throw new Error(`Sign a refund of exactly ${refundAmount} (6-decimals USDT)`)
    const r = await relayRefund({ paymentId: c.paymentId, amount: refundAmount, auth: p.refundAuth })
    refundTx = r.txHash
  }
  const at = now()
  const lastRound = c.events.filter((e) => e.kind === "opened" || e.kind === "renewed").pop()
  await writeEvent({
    caseId: p.caseId, paymentId: c.paymentId, merchant: addr(merchant), payer: addr(c.payer), kind: "response", round: c.round,
    at: u64(BigInt(at)), deadline: u64(BigInt(at + REFUND_QUIET_S)), amount: BigInt(c.amount), ...(c.item ? { item: c.item } : {}),
    decision: p.decision, percent, message, ...(refundAmount != null ? { refundAmount } : {}), ...(refundTx ? { refundTx } : {}),
    signedAt: u64(BigInt(p.issuedAt)), sig: hexToBytes(p.signature),
  }, Math.max(at + REFUND_QUIET_S, lastRound?.deadline ?? 0))
  return getRefundCase(p.caseId)
}

// ------------------------------------------------------------------- reply (payer, after a response)
export async function replyToRefund(p: { caseId: Hex; payer: Address; message: string; evidence?: string; issuedAt: number; signature: Hex }) {
  const payer = getAddress(p.payer)
  const c = await getRefundCase(p.caseId)
  if (!c) throw new Error("No such refund request")
  if (c.payer !== payer) throw new Error("Only the customer who asked can reply")
  if (c.status !== "responded") throw new Error(c.status === "open" ? "Wait for the shop to respond first" : "This request is already closed")
  const message = String(p.message ?? "").trim()
  const evidence = p.evidence?.trim() || undefined
  if (message.length < 5 || message.length > 500) throw new Error("Reply in 5 to 500 characters")
  if (evidence && !/^https:\/\/[^\s]{4,200}$/.test(evidence)) throw new Error("Proof link must be an https:// link")
  if (Math.abs(now() - p.issuedAt) > 600) throw new Error("Reply expired, sign again")
  if (!(await verifyMessage({ address: payer, signature: p.signature, message: refundReplyMessage({ caseId: p.caseId, payer, message, evidence, issuedAt: p.issuedAt }) })))
    throw new Error("Signature does not match your wallet")
  const at = now()
  await writeEvent({
    caseId: p.caseId, paymentId: c.paymentId, merchant: addr(c.merchant), payer: addr(payer), kind: "reply", round: c.round,
    at: u64(BigInt(at)), deadline: u64(BigInt(at + REFUND_QUIET_S)), amount: BigInt(c.amount), ...(c.item ? { item: c.item } : {}),
    message, ...(evidence ? { evidence } : {}), signedAt: u64(BigInt(p.issuedAt)), sig: hexToBytes(p.signature),
  }, at + REFUND_QUIET_S)
  return getRefundCase(p.caseId)
}

// ------------------------------------------------------------------- keeper: re-open unanswered requests
/** An unanswered request whose 7-day window ends within a day is re-opened for another 7 days (next round),
 *  carrying the payer's ORIGINAL signed request, so nothing new is claimed on their behalf. */
export async function refundKeeper() {
  const evs = await readEvents(and(eq("kind", "opened"), gte("at", u64(BigInt(now() - MAX_ROUNDS * REFUND_WINDOW_S)))))
  const ids = [...new Set(evs.map((e) => v(e.caseId) as Hex))]
  let renewed = 0
  for (const id of ids) {
    const c = await getRefundCase(id)
    if (!c || c.status !== "open" || c.round >= MAX_ROUNDS || c.until - now() > 86_400) continue
    const src = (await readEvents(eq("caseId", id))).find((e) => v(e.kind) === "opened")
    if (!src) continue
    const deadline = c.until + REFUND_WINDOW_S
    await writeEvent({
      caseId: id, paymentId: c.paymentId, merchant: addr(c.merchant), payer: addr(c.payer), kind: "renewed", round: c.round + 1,
      at: u64(BigInt(now())), deadline: u64(BigInt(deadline)), amount: BigInt(c.amount), ...(c.item ? { item: c.item } : {}),
      reason: v(src.reason), message: v(src.message), ...(v(src.evidence) ? { evidence: v(src.evidence) } : {}),
      signedAt: u64(BigInt(v(src.signedAt))), sig: hexToBytes(sigOf(v(src.sig))),
    }, deadline)
    renewed++
  }
  return { checked: ids.length, renewed }
}

export const isAddr = (x: unknown): x is Address => typeof x === "string" && isAddress(x)
