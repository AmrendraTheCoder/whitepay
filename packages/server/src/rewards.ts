// Scratch-card rewards (GPay-style), earned by paying a listed shop.
//  earn:    after a QR payment of >= 0.10 USDT to a registered merchant, one Reward entity is written to Arkiv
//           (one per payment tx; lives 30 days unscratched).
//  scratch: the prize is derived from keccak(secret, rewardKey), so it is fixed per card, hidden until scratched,
//           and the same on every server instance (a double scratch can never re-roll or double-pay).
//  payout:  cashback is a gasless payDirect from the rewards pool wallet (REWARDS_PK) to the card owner.
//           The EIP-3009 nonce is derived from the card key, so the chain itself guarantees one payout per card.
import { ExpirationTime, NoEntityFoundError } from "@arkiv-network/sdk"
import { addr, u64 } from "@arkiv-network/sdk/schema"
import { eq, desc } from "@arkiv-network/sdk/query"
import { erc20Abi, getAddress, keccak256, toBytes, verifyMessage, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { Reward, ShopOffer } from "@whitepay/shared/arkiv"
import { receiveAuthTypedData, directNonce, ROUTER_ADDRESS, USDT_ADDRESS } from "@whitepay/shared"
import {
  REWARD_MIN_PAYMENT, CASHBACK_MIN, CASHBACK_MAX, REWARD_TTL_DAYS, OFFER_TEXT_MAX, OFFER_CODE_RE, offerMessage,
  type RewardCard, type OfferView,
} from "@whitepay/shared/rewards"
import { arkiv, wc } from "./clients"
import { getMerchantByAddress } from "./merchants"
import { relayDirectPayment } from "./relayer"
import { cached, invalidate } from "./cache"

const now = () => Math.floor(Date.now() / 1000)
const v = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x)

const rewardsKey = (): Hex | null => {
  const k = process.env.REWARDS_PK?.trim()
  return k && /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as Hex) : null
}
export const rewardsPool = () => {
  const k = rewardsKey()
  return k ? privateKeyToAccount(k) : null
}

const AUTH_STATE_ABI = [{ type: "function", name: "authorizationState", stateMutability: "view",
  inputs: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }], outputs: [{ type: "bool" }] }] as const

/** USDT left in the rewards pool (0 when no pool is configured). Cached briefly: the Rewards page polls it. */
export const rewardsPoolBalance = () =>
  cached("rewards:pool", 15_000, async () => {
    const pool = rewardsPool()
    if (!pool) return 0n
    return wc().pub.readContract({ address: USDT_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [pool.address] })
  })

// ------------------------------------------------------------------ earn
/** Award one scratch card for a settled shop payment. Never throws (called after the payment response). */
export async function awardScratchCard(p: { payer: Address; merchant: Address; merchantName?: string; amount: bigint; txHash: Hex }) {
  try {
    if (p.amount < REWARD_MIN_PAYMENT) return null
    if (getAddress(p.payer) === getAddress(p.merchant)) return null
    const shop = await getMerchantByAddress(p.merchant)
    if (!shop) return null // only listed shops give rewards
    const a = arkiv()
    const dup = await a.pub.select({ $key: true }).from(Reward).ownedBy(a.owner)
      .where(eq("paymentTx", p.txHash.toLowerCase())).limit(1).fetch()
    if (dup.entities.length) return (dup.entities[0] as any).$key as Hex
    const r = await a.writer.createEntity(Reward, {
      owner: addr(p.payer),
      merchant: addr(p.merchant),
      merchantName: (p.merchantName || shop.ensName).slice(0, 120),
      paymentTx: p.txHash.toLowerCase(),
      paidAmount: p.amount,
      earnedAt: u64(BigInt(now())),
      status: "new",
    }, { expiration: ExpirationTime.fromDays(REWARD_TTL_DAYS) }, { gas: 1_500_000n })
    invalidate(`rewards:${getAddress(p.payer)}`)
    return r.entityKey
  } catch (e) {
    console.warn("reward award failed:", (e as Error).message.split("\n")[0])
    return null
  }
}

// ------------------------------------------------------------------ read
const toCard = (e: any): RewardCard => ({
  key: e.$key,
  merchant: getAddress(v(e.merchant)),
  merchantName: v(e.merchantName) || undefined,
  paidAmount: BigInt(v(e.paidAmount) ?? 0).toString(),
  earnedAt: Number(v(e.earnedAt)),
  expiresAt: Number(v(e.earnedAt)) + REWARD_TTL_DAYS * 86400,
  status: v(e.status) === "scratched" ? "scratched" : "new",
  ...(v(e.status) === "scratched" ? {
    prize: v(e.prize),
    amount: e.amount != null ? BigInt(v(e.amount)).toString() : undefined,
    offerText: v(e.offerText) || undefined,
    offerCode: v(e.offerCode) || undefined,
    payoutTx: v(e.payoutTx) || undefined,
  } : {}),
})
const CARD_FIELDS = { $key: true, owner: true, merchant: true, merchantName: true, paymentTx: true, paidAmount: true, earnedAt: true,
  status: true, prize: true, amount: true, offerText: true, offerCode: true, payoutTx: true } as const

export const listRewards = (owner: Address): Promise<RewardCard[]> =>
  cached(`rewards:${getAddress(owner)}`, 8_000, async () => {
    const a = arkiv()
    const page = await a.pub.select(CARD_FIELDS).from(Reward).ownedBy(a.owner)
      .where(eq("owner", addr(getAddress(owner)))).orderBy(desc("earnedAt")).limit(60).fetch()
    return (page.entities as any[]).map(toCard)
  })

async function getCard(key: Hex) {
  try {
    const e = (await arkiv().pub.getEntity(key, Reward)) as any
    if (getAddress(e.$owner) !== getAddress(arkiv().owner)) return null
    return { ...toCard({ ...e, $key: key }), owner: getAddress(v(e.owner)) }
  } catch (err) {
    if (err instanceof NoEntityFoundError) return null
    throw err
  }
}

// ------------------------------------------------------------------ scratch
type Outcome = { prize: "cashback" | "offer" | "none"; amount?: bigint; offerText?: string; offerCode?: string }

/** Deterministic, secret prize for a card: same answer on every instance, unknowable without REWARDS_PK. */
function roll(cardKey: Hex, paid: bigint, hasOffer: boolean) {
  const secret = rewardsKey() ?? (process.env.ARKIV_WRITER_PK ?? "whitepay")
  const seed = BigInt(keccak256(toBytes(`whitepay-reward:${secret}:${cardKey.toLowerCase()}`)))
  const pct = Number(seed % 100n)
  const span = (CASHBACK_MAX - CASHBACK_MIN) / 1000n + 1n // in 0.001 USDT steps
  let amount = CASHBACK_MIN + ((seed >> 8n) % span) * 1000n
  const cap = paid / 10n
  if (amount > cap) amount = cap < CASHBACK_MIN ? CASHBACK_MIN : cap - (cap % 1000n)
  // with a shop offer: 35% cashback, 40% offer, 25% no luck. Without: 50% cashback, 50% no luck.
  const prize: Outcome["prize"] = hasOffer ? (pct < 35 ? "cashback" : pct < 75 ? "offer" : "none") : pct < 50 ? "cashback" : "none"
  return { prize, amount }
}

const memoFor = (cardKey: Hex) => keccak256(toBytes(`whitepay-reward-payout:${cardKey.toLowerCase()}`))
const inflight = new Map<string, Promise<ScratchResult>>()
export type ScratchResult = { card: RewardCard; payout?: { txHash: Hex; explorer: string }; persist: () => Promise<void> }

/** Scratch a card: decide (deterministically), pay cashback if won, and return a `persist` step that writes
 *  the result to Arkiv (call it after responding; repeating a scratch before it lands is harmless). */
export function scratchCard(key: Hex, owner: Address): Promise<ScratchResult> {
  // de-dupe concurrent scratches of one card by its owner; a failure (e.g. a stranger's attempt) is never cached
  const k = `${key.toLowerCase()}:${getAddress(owner)}`
  const running = inflight.get(k)
  if (running) return running
  const job = doScratch(key, getAddress(owner))
  job.then(() => setTimeout(() => inflight.delete(k), 30_000), () => inflight.delete(k))
  inflight.set(k, job)
  return job
}

async function doScratch(key: Hex, owner: Address): Promise<ScratchResult> {
  const card = await getCard(key)
  if (!card) throw new RewardError("not_found", "This scratch card has expired or does not exist")
  if (card.owner !== owner) throw new RewardError("not_owner", "This scratch card belongs to another wallet")
  if (card.status === "scratched") return { card, persist: async () => {} }

  const offer = await getOffer(card.merchant as Address)
  const r = roll(key, BigInt(card.paidAmount), !!offer?.active)
  let out: Outcome = r.prize === "offer" ? { prize: "offer", offerText: offer!.text, offerCode: offer!.code } : { prize: r.prize }
  let payout: ScratchResult["payout"]

  if (r.prize === "cashback") {
    const pool = rewardsPool()
    const memo = memoFor(key)
    const nonce = directNonce(owner, memo)
    const already = pool
      ? await wc().pub.readContract({ address: USDT_ADDRESS, abi: AUTH_STATE_ABI, functionName: "authorizationState", args: [pool.address, nonce] })
      : false
    if (already) {
      out = { prize: "cashback", amount: r.amount } // paid by an earlier scratch whose Arkiv write had not landed yet
    } else if (pool && (await rewardsPoolBalance()) >= r.amount) {
      const validBefore = BigInt(now() + 600)
      const signature = await pool.signTypedData(receiveAuthTypedData({
        from: pool.address, to: ROUTER_ADDRESS, value: r.amount, validAfter: 0n, validBefore, nonce,
      }))
      const paid = await relayDirectPayment({ to: owner, amount: r.amount, memo, auth: { from: pool.address, validAfter: 0n, validBefore, signature } })
      invalidate("rewards:pool")
      payout = { txHash: paid.txHash, explorer: paid.explorer }
      out = { prize: "cashback", amount: r.amount }
    } else {
      // pool empty or not configured: never promise money we can't pay
      out = offer?.active ? { prize: "offer", offerText: offer.text, offerCode: offer.code } : { prize: "none" }
    }
  }

  const scratchedAt = now()
  const result: RewardCard = {
    ...card, status: "scratched", prize: out.prize,
    amount: out.amount?.toString(), offerText: out.offerText, offerCode: out.offerCode, payoutTx: payout?.txHash,
  }
  const persist = async () => {
    try {
      await arkiv().writer.patchEntity(Reward, key, {
        set: {
          status: "scratched", prize: out.prize, scratchedAt: u64(BigInt(scratchedAt)),
          ...(out.amount != null ? { amount: out.amount } : {}),
          ...(out.offerText ? { offerText: out.offerText.slice(0, 120), offerCode: out.offerCode } : {}),
          ...(payout ? { payoutTx: payout.txHash.toLowerCase() } : {}),
        },
      }, { gas: 1_000_000n })
    } catch (e) {
      console.warn("reward patch failed (re-scratch is idempotent):", (e as Error).message.split("\n")[0])
    }
    invalidate(`rewards:${owner}`)
  }
  return { card: result, payout, persist }
}

export class RewardError extends Error {
  constructor(public code: "not_found" | "not_owner" | "bad_offer", msg: string) { super(msg) }
}

// ------------------------------------------------------------------ shop offers
const toOffer = (e: any): OfferView => ({
  key: e.$key, merchant: getAddress(v(e.merchant)), merchantName: v(e.merchantName) || undefined, displayName: v(e.displayName) || undefined,
  text: v(e.text), code: v(e.code), active: !!v(e.active), updatedAt: Number(v(e.updatedAt)),
})
const OFFER_FIELDS = { $key: true, merchant: true, merchantName: true, displayName: true, text: true, code: true, active: true, updatedAt: true } as const

export const getOffer = (merchant: Address) =>
  cached(`offer:${getAddress(merchant)}`, 30_000, async () => {
    const a = arkiv()
    const page = await a.pub.select(OFFER_FIELDS).from(ShopOffer).ownedBy(a.owner)
      .where(eq("merchant", addr(getAddress(merchant)))).orderBy(desc("updatedAt")).limit(1).fetch()
    return page.entities.length ? toOffer(page.entities[0]) : null
  })

export const listOffers = () =>
  cached("offers:all", 30_000, async () => {
    const a = arkiv()
    const page = await a.pub.select(OFFER_FIELDS).from(ShopOffer).ownedBy(a.owner)
      .where(eq("active", true)).orderBy(desc("updatedAt")).limit(30).fetch()
    const seen = new Set<string>()
    return (page.entities as any[]).map(toOffer).filter((o) => (seen.has(o.merchant) ? false : (seen.add(o.merchant), true)))
  })

/** Publish or update a shop's offer. Authenticated by the merchant wallet's signature over offerMessage(). */
export async function setOffer(p: { merchant: Address; text: string; code: string; active: boolean; issuedAt: number; signature: Hex }) {
  const merchant = getAddress(p.merchant)
  const text = p.text.trim().replace(/\s+/g, " ")
  const code = p.code.trim().toUpperCase()
  if (Math.abs(now() - p.issuedAt) > 600) throw new RewardError("bad_offer", "Request expired, try again")
  if (text.length < 3 || text.length > OFFER_TEXT_MAX) throw new RewardError("bad_offer", `Offer must be 3-${OFFER_TEXT_MAX} characters`)
  if (!OFFER_CODE_RE.test(code)) throw new RewardError("bad_offer", "Code must be 3-16 letters, digits or hyphens")
  const message = offerMessage({ merchant, text, code, active: p.active, issuedAt: p.issuedAt })
  if (!(await verifyMessage({ address: merchant, message, signature: p.signature }))) throw new RewardError("bad_offer", "Signature does not match this shop")
  const shop = await getMerchantByAddress(merchant)
  if (!shop) throw new RewardError("bad_offer", "Only registered shops can publish offers")

  const a = arkiv()
  const ts = now()
  const values = { merchant: addr(merchant), merchantName: shop.ensName, displayName: shop.displayName.slice(0, 60), text, code, active: p.active, updatedAt: u64(BigInt(ts)) }
  const existing = await a.pub.select({ $key: true }).from(ShopOffer).ownedBy(a.owner).where(eq("merchant", addr(merchant))).limit(1).fetch()
  let key: Hex
  if (existing.entities.length) {
    key = (existing.entities[0] as any).$key
    await a.writer.patchEntity(ShopOffer, key, { set: { text, code, active: p.active, updatedAt: values.updatedAt, displayName: values.displayName } }, { gas: 1_000_000n })
  } else {
    key = (await a.writer.createEntity(ShopOffer, values, { expiration: ExpirationTime.max() }, { gas: 1_500_000n })).entityKey
  }
  invalidate(`offer:${merchant}`)
  invalidate("offers:all")
  return { key, merchant, merchantName: shop.ensName, displayName: values.displayName, text, code, active: p.active, updatedAt: ts } satisfies OfferView
}

