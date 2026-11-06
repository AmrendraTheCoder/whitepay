// Rewards, earned by paying a listed shop. The numbers come from ECON in @whitepay/shared/rewards
// (docs/REWARDS.md explains the math):
//  earn:    a shop payment writes one scratch card to Arkiv (one per payment tx, 30-day life) when its fee covers its
//           gas (>= the break-even, ~$7.79 at 5 gwei), or when it is one of the wallet's first 3 (welcome) cards.
//  scratch: the prize is derived from keccak(secret, cardKey): fixed per card, hidden until scratched, the same on
//           every instance. About 1 card in 9 wins 1-5% WBT cashback; a person's first 3 cards always win (welcome).
//  claim:   WBT cashback is claimed with a fresh World ID proof bound to the wallet + cards. Limits count per
//           HUMAN (World ID nullifier) across all their wallets, so bots or wallet farms can't stack rewards. Payouts
//           can never exceed the pool: 50% of (fee − gas) on rewarded volume + a fixed launch budget, minus what was paid.
import { ExpirationTime, NoEntityFoundError } from "@arkiv-network/sdk"
import { addr, u64, u256, str, i32, defineSchema } from "@arkiv-network/sdk/schema"
import { eq, and, gte, desc } from "@arkiv-network/sdk/query"
import { Receipt } from "@whitepay/shared/arkiv"
import { createWalletClient, getAddress, http, keccak256, toBytes, verifyMessage, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { Reward, ShopOffer } from "@whitepay/shared/arkiv"
import { whitechainSepolia } from "@whitepay/shared"
import {
  REWARD_MIN_PAYMENT, REWARD_TTL_DAYS, OFFER_TEXT_MAX, OFFER_CODE_RE, ECON, offerMessage, rollPrize, rollRate, cashbackMicro, claimSignal,
  shopFeeMicro, rewardBudgetMicro, minCardPaymentMicro, gasMicroFor,
  type RewardCard, type OfferView, type RewardsLedger, type P2PAllowance,
} from "@whitepay/shared/rewards"
import { arkiv, wc } from "./clients"
import { config } from "./config"
import { getMerchantByAddress } from "./merchants"
import { verifyProof, WORLD_ACTIONS } from "./world"
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

/** One row per claim: the per-human ledger (human = hash of the World ID nullifier, never the raw value). */
export const RewardClaim = defineSchema("whitepay.rewardclaim", {
  human: str().indexed(),
  owner: addr().indexed(),
  cards: i32(),
  welcome: i32(),
  usd: u256(), // micro-USD
  wbt: u256(), // wei
  price: u256(), // micro-USD per WBT at claim time
  tx: str().indexed(),
  keysHash: str().indexed(),
  claimedAt: u64().indexed(),
})

// ------------------------------------------------------------------ prices + pool
/** WBT/USD: live from CoinGecko (cached 10 min), else WBT_USD from the environment. null = unknown (claims wait). */
export const wbtPrice = () =>
  cached("rewards:wbt-usd", 600_000, async (): Promise<number | null> => {
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=whitebit&vs_currencies=usd", { signal: AbortSignal.timeout(4000) })
      const p = Number((await r.json())?.whitebit?.usd)
      if (p > 0) return p
    } catch {}
    const env = Number(process.env.WBT_USD)
    return env > 0 ? env : null
  }, (p) => p !== null)

export const rewardPoolWbt = () =>
  cached("rewards:pool-wbt", 15_000, async () => {
    const pool = rewardsPool()
    return pool ? wc().pub.getBalance({ address: pool.address }) : 0n
  })

/** gas of one relayed payment right now, micro-USD (falls back to the ECON estimate) */
export const gasNowMicro = () =>
  cached("rewards:gas-now", 60_000, async () => {
    try {
      const [gp, price] = await Promise.all([wc().pub.getGasPrice(), wbtPrice()])
      if (price) return gasMicroFor(ECON.relayGas, gp, price)
    } catch {}
    return ECON.gasFallbackMicro
  })

/** what relaying this tx actually cost WondrPay, micro-USD */
async function gasOfTx(txHash: Hex) {
  try {
    const [rc, price] = await Promise.all([wc().pub.getTransactionReceipt({ hash: txHash }), wbtPrice()])
    if (price && rc.effectiveGasPrice) return gasMicroFor(rc.gasUsed, rc.effectiveGasPrice, price)
  } catch {}
  return gasNowMicro()
}

// ------------------------------------------------------------------ earn
/** Award one scratch card for a settled shop payment. Never throws (called after the payment response). */
export async function awardScratchCard(p: { payer: Address; merchant: Address; merchantName?: string; amount: bigint; txHash: Hex }) {
  try {
    if (p.amount < REWARD_MIN_PAYMENT) return null
    if (getAddress(p.payer) === getAddress(p.merchant)) return null
    const shop = await getMerchantByAddress(p.merchant)
    if (!shop) return null // only listed shops give rewards (P2P earns no fee, so it earns no reward)
    const a = arkiv()
    const dup = await a.pub.select({ $key: true }).from(Reward).ownedBy(a.owner)
      .where(eq("paymentTx", p.txHash.toLowerCase())).limit(1).fetch()
    if (dup.entities.length) return (dup.entities[0] as any).$key as Hex
    // a card is only given where the fee paid for the gas; below the break-even, only a wallet's welcome cards
    const gasMicro = await gasOfTx(p.txHash)
    if (p.amount < minCardPaymentMicro(gasMicro)) {
      const mine = await a.pub.select({ $key: true }).from(Reward).ownedBy(a.owner)
        .where(eq("owner", addr(getAddress(p.payer)))).limit(ECON.welcomeWins).fetch()
      if (mine.entities.length >= ECON.welcomeWins) return null
    }
    const r = await a.writer.createEntity(Reward, {
      owner: addr(p.payer),
      merchant: addr(p.merchant),
      merchantName: (p.merchantName || shop.ensName).slice(0, 120),
      paymentTx: p.txHash.toLowerCase(),
      paidAmount: p.amount,
      gasMicro,
      earnedAt: u64(BigInt(now())),
      status: "new",
    }, { expiration: ExpirationTime.fromDays(REWARD_TTL_DAYS) }, { gas: 1_500_000n })
    invalidate(`rewards:${getAddress(p.payer)}`)
    invalidate("rewards:ledger")
    return r.entityKey
  } catch (e) {
    console.warn("reward award failed:", (e as Error).message.split("\n")[0])
    return null
  }
}

// ------------------------------------------------------------------ read
/** Deterministic, secret seed per card: same on every instance, unknowable without REWARDS_PK. */
const seedFor = (cardKey: string) => {
  const secret = rewardsKey() ?? (process.env.ARKIV_WRITER_PK ?? "whitepay")
  return BigInt(keccak256(toBytes(`whitepay-reward:${secret}:${cardKey.toLowerCase()}`)))
}
const STATUSES = new Set(["new", "scratched", "won", "claimed", "expired"])
const toCard = (e: any): RewardCard => {
  const status = STATUSES.has(v(e.status)) ? v(e.status) : "new"
  const prize = status === "new" ? undefined : v(e.prize)
  return {
    key: e.$key,
    merchant: getAddress(v(e.merchant)),
    merchantName: v(e.merchantName) || undefined,
    paidAmount: BigInt(v(e.paidAmount) ?? 0).toString(),
    gasMicro: v(e.gasMicro) != null ? BigInt(v(e.gasMicro)).toString() : undefined,
    paymentTx: v(e.paymentTx) || undefined,
    earnedAt: Number(v(e.earnedAt)),
    expiresAt: Number(v(e.earnedAt)) + REWARD_TTL_DAYS * 86400,
    status,
    ...(status !== "new" ? {
      prize,
      amount: e.amount != null && v(e.amount) != null ? BigInt(v(e.amount)).toString() : undefined,
      rateBps: prize === "wbt" || prize === "wbt_welcome" ? rollRate(seedFor(e.$key)) : undefined,
      offerText: v(e.offerText) || undefined,
      offerCode: v(e.offerCode) || undefined,
      payoutTx: v(e.payoutTx) || undefined,
    } : {}),
  }
}
const CARD_FIELDS = { $key: true, owner: true, merchant: true, merchantName: true, paymentTx: true, paidAmount: true, gasMicro: true, earnedAt: true,
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
const inflight = new Map<string, Promise<ScratchResult>>()
export type ScratchResult = { card: RewardCard; persist: () => Promise<void> }

/** Scratch a card: decide (deterministically) and return a `persist` step that writes the result to Arkiv
 *  (call it after responding; repeating a scratch before it lands gives the same answer). Nothing is paid here:
 *  WBT cashback waits for a World ID claim. */
export function scratchCard(key: Hex, owner: Address): Promise<ScratchResult> {
  const k = `${key.toLowerCase()}:${getAddress(owner)}`
  const running = inflight.get(k)
  if (running) return running
  const job = doScratch(key, getAddress(owner))
  job.then(() => setTimeout(() => inflight.delete(k), 30_000), () => inflight.delete(k))
  inflight.set(k, job)
  return job
}

/** welcome wins this WALLET already got (the per-human welcome limit is enforced again at claim) */
async function welcomeCount(owner: Address) {
  const a = arkiv()
  const page = await a.pub.select({ $key: true }).from(Reward).ownedBy(a.owner)
    .where(and(eq("owner", addr(owner)), eq("prize", "wbt_welcome"))).limit(10).fetch()
  return page.entities.length
}

async function doScratch(key: Hex, owner: Address): Promise<ScratchResult> {
  const card = await getCard(key)
  if (!card) throw new RewardError("not_found", "This scratch card has expired or does not exist")
  if (card.owner !== owner) throw new RewardError("not_owner", "This scratch card belongs to another wallet")
  if (card.status !== "new") return { card, persist: async () => {} }

  const [offer, welcomed] = await Promise.all([getOffer(card.merchant as Address), welcomeCount(owner)])
  const paid = BigInt(card.paidAmount)
  const r = rollPrize(seedFor(key), { hasOffer: !!offer?.active, welcome: welcomed < ECON.welcomeWins, paid,
    gasMicro: card.gasMicro != null ? BigInt(card.gasMicro) : ECON.gasFallbackMicro })
  const result: RewardCard =
    r.prize === "wbt" || r.prize === "wbt_welcome"
      ? { ...card, status: "won", prize: r.prize, rateBps: r.rateBps, amount: cashbackMicro(paid, r.rateBps, r.prize === "wbt_welcome").toString() }
      : r.prize === "offer"
        ? { ...card, status: "scratched", prize: "offer", offerText: offer!.text, offerCode: offer!.code }
        : { ...card, status: "scratched", prize: "none" }
  const persist = async () => {
    try {
      await arkiv().writer.patchEntity(Reward, key, {
        set: {
          status: result.status, prize: result.prize!, scratchedAt: u64(BigInt(now())),
          ...(result.amount != null ? { amount: BigInt(result.amount) } : {}),
          ...(result.offerText ? { offerText: result.offerText.slice(0, 120), offerCode: result.offerCode } : {}),
        },
      }, { gas: 1_000_000n })
    } catch (e) {
      console.warn("reward patch failed (re-scratch is idempotent):", (e as Error).message.split("\n")[0])
    }
    invalidate(`rewards:${owner}`)
  }
  return { card: result, persist }
}

// ------------------------------------------------------------------ ledger
/** The pool's books, recomputed from Arkiv: what fees funded, what was paid, what's left. Public on /rewards. */
export const rewardsLedger = (): Promise<RewardsLedger> =>
  cached("rewards:ledger", 20_000, async () => {
    const a = arkiv()
    // the node returns <= 100 rows per query: page through (stable order by $key-equivalent timestamps)
    const all = async (q: () => any, max = 20) => {
      const out: any[] = []
      for (let off = 0, i = 0; i < max; i++) {
        const page = await q().limit(100).offset(off).fetch()
        out.push(...page.entities)
        const step = page.entities.length + Number(page.skipped ?? 0)
        if (page.entities.length < 100 && step < 100) break
        off += step
      }
      return { entities: out }
    }
    const [cards, claims, price, poolWbt, gasNow] = await Promise.all([
      all(() => a.pub.select({ paidAmount: true, gasMicro: true, earnedAt: true }).from(Reward).ownedBy(a.owner).orderBy(desc("earnedAt"))),
      all(() => a.pub.select({ usd: true, human: true, claimedAt: true }).from(RewardClaim).ownedBy(a.owner).orderBy(desc("claimedAt"))),
      wbtPrice().catch(() => null),
      rewardPoolWbt().catch(() => 0n),
      gasNowMicro().catch(() => ECON.gasFallbackMicro),
    ])
    // per card: fee (0.50%, min $0.05), the gas actually paid, and share × (fee − gas) into the pool
    let volume = 0n, fees = 0n, gas = 0n, accrued = 0n
    for (const e of cards.entities as any[]) {
      const paidAmt = BigInt(v(e.paidAmount) ?? 0)
      const g = v(e.gasMicro) != null ? BigInt(v(e.gasMicro)) : ECON.gasFallbackMicro
      volume += paidAmt; fees += shopFeeMicro(paidAmt); gas += g; accrued += rewardBudgetMicro(paidAmt, g)
    }
    const paid = (claims.entities as any[]).reduce((s, e) => s + BigInt(v(e.usd) ?? 0), 0n)
    const available = accrued + ECON.launchBudgetMicro - paid
    return {
      volumeMicro: volume.toString(), feesMicro: fees.toString(), gasMicro: gas.toString(), accruedMicro: accrued.toString(),
      launchBudgetMicro: ECON.launchBudgetMicro.toString(), paidMicro: paid.toString(),
      availableMicro: (available > 0n ? available : 0n).toString(),
      claims: claims.entities.length, humans: new Set((claims.entities as any[]).map((e) => v(e.human))).size,
      wbtUsd: price, poolWbt: poolWbt.toString(),
      gasNowMicro: gasNow.toString(), breakEvenMicro: minCardPaymentMicro(gasNow).toString(),
    }
  })

// ------------------------------------------------------------------ claim (World ID)
export type ClaimResult = {
  txHash: Hex; explorer: string; usdMicro: string; wbtWei: string; wbtUsd: number
  claimed: string[]; expired: { key: string; reason: string }[]
}
const claimLocks = new Set<string>()
const humanHash = (nullifier: string) => keccak256(toBytes(`wondrpay-human:${nullifier}`))

/** Claim WBT cashback for `keys` with a World ID proof (action whitepay-pay, signal = claimSignal(owner, keys)).
 *  `trustedHuman` is for server-side tests only (skips the proof, never reachable from the API). */
export async function claimRewards(p: { owner: Address; keys: Hex[]; proof?: unknown; trustedHuman?: string }): Promise<ClaimResult> {
  const owner = getAddress(p.owner)
  const keys = [...new Set(p.keys.map((k) => k.toLowerCase() as Hex))]
  if (!keys.length || keys.length > 20) throw new RewardError("bad_claim", "Pick 1-20 cards to claim")

  // 1. a live human, bound to this wallet and exactly these cards
  let nullifier = p.trustedHuman
  if (!nullifier) {
    const r = await verifyProof(p.proof as any, WORLD_ACTIONS.stepUp(), claimSignal(owner, keys))
    nullifier = r.nullifier
  }
  const human = humanHash(nullifier)
  if (claimLocks.has(human) || claimLocks.has(owner)) throw new RewardError("busy", "A claim is already in progress")
  claimLocks.add(human); claimLocks.add(owner)
  try {
    // 2. the cards: this wallet's, won, unclaimed
    const cards = (await Promise.all(keys.map(getCard))).filter(Boolean) as (RewardCard & { owner: Address })[]
    if (cards.length !== keys.length || cards.some((c) => c.owner !== owner)) throw new RewardError("not_owner", "Some of these cards aren't yours")
    const open = cards.filter((c) => c.status === "won").sort((x, y) => x.earnedAt - y.earnedAt)
    if (!open.length) throw new RewardError("bad_claim", "Nothing left to claim on these cards")

    // 3. this HUMAN's history, across every wallet they own
    const a = arkiv()
    const since30 = now() - 30 * 86400, since1 = now() - 86400
    const hist = await a.pub.select({ usd: true, welcome: true, claimedAt: true }).from(RewardClaim).ownedBy(a.owner)
      .where(and(eq("human", human), gte("claimedAt", u64(BigInt(since30))))).limit(100).fetch()
    const allTime = await a.pub.select({ welcome: true }).from(RewardClaim).ownedBy(a.owner).where(eq("human", human)).limit(100).fetch()
    const rows = hist.entities as any[]
    if (rows.filter((e) => Number(v(e.claimedAt)) >= since1).length >= ECON.humanClaimsPerDay)
      throw new RewardError("limit", `You can claim ${ECON.humanClaimsPerDay} times a day. Try again tomorrow.`)
    let monthUsd = rows.reduce((s, e) => s + BigInt(v(e.usd) ?? 0), 0n)
    let welcomeUsed = (allTime.entities as any[]).reduce((s, e) => s + Number(v(e.welcome) ?? 0), 0)

    const pay: typeof open = [], expired: ClaimResult["expired"] = []
    let usd = 0n, welcome = 0
    for (const c of open) {
      const amt = BigInt(c.amount ?? 0)
      if (c.prize === "wbt_welcome" && welcomeUsed >= ECON.welcomeWins) { expired.push({ key: c.key, reason: "Welcome bonus already used by this person on another wallet" }); continue }
      if (monthUsd + usd + amt > ECON.humanMonthlyCapMicro) { expired.push({ key: c.key, reason: "Over the monthly cashback limit per person" }); continue }
      pay.push(c); usd += amt
      if (c.prize === "wbt_welcome") { welcome++; welcomeUsed++ }
    }

    // 4. the pool: never pay beyond what fees + launch budget funded, nor beyond the WBT actually held
    const ledger = await rewardsLedger()
    if (usd > BigInt(ledger.availableMicro)) throw new RewardError("pool", "The reward pool is refilling from new payments. Try again later.")
    const price = await wbtPrice()
    if (!price) throw new RewardError("pool", "WBT price unavailable right now. Try again in a minute.")
    const priceMicro = BigInt(Math.round(price * 1e6))
    const wei = pay.length ? (usd * 10n ** 18n) / priceMicro : 0n
    const pool = rewardsPool()
    if (pay.length && (!pool || (await rewardPoolWbt()) < wei + 2n * 10n ** 15n)) throw new RewardError("pool", "The reward pool is being topped up. Try again later.")

    // 5. pay (one transfer for all cards: one gas fee), then write the books
    let txHash = "0x" as Hex
    if (pay.length && wei > 0n) {
      const gasPrice = await wc().pub.getGasPrice()
      if (gasPrice > config.maxGasPrice) throw new RewardError("pool", "Network is busy. Try again in a minute.")
      const w = createWalletClient({ chain: whitechainSepolia, transport: http(config.wcRpc), account: pool! })
      txHash = await w.sendTransaction({ to: owner, value: wei })
      const rc = await wc().pub.waitForTransactionReceipt({ hash: txHash })
      if (rc.status !== "success") throw new Error("WBT payout reverted")
    }
    try {
      await a.writer.executeBatch({
        creates: pay.length ? [{
          schema: RewardClaim,
          values: { human, owner: addr(owner), cards: pay.length, welcome, usd, wbt: wei, price: priceMicro, tx: txHash.toLowerCase(),
            keysHash: keccak256(toBytes(pay.map((c) => c.key).sort().join(","))), claimedAt: u64(BigInt(now())) },
          expiration: ExpirationTime.max(),
        }] : [],
        patches: [
          ...pay.map((c) => ({ schema: Reward, entityKey: c.key as Hex, set: { status: "claimed", payoutTx: txHash.toLowerCase() } })),
          ...expired.map((x) => ({ schema: Reward, entityKey: x.key as Hex, set: { status: "expired" } })),
        ],
      } as any, { gas: 4_000_000n })
    } catch (e) {
      console.error("reward claim paid but Arkiv write failed", txHash, (e as Error).message.split("\n")[0])
    }
    invalidate(`rewards:${owner}`); invalidate("rewards:ledger"); invalidate("rewards:pool-wbt")
    return { txHash, explorer: `${config.explorer}/tx/${txHash}`, usdMicro: usd.toString(), wbtWei: wei.toString(), wbtUsd: price,
      claimed: pay.map((c) => c.key), expired }
  } finally {
    claimLocks.delete(human); claimLocks.delete(owner)
  }
}

export class RewardError extends Error {
  constructor(public code: "not_found" | "not_owner" | "bad_offer" | "bad_claim" | "limit" | "pool" | "busy", msg: string) { super(msg) }
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


// ------------------------------------------------------------------ P2P allowance
/** P2P earns no fee, so each sender gets ECON.p2pFreePerMonth free transfers per calendar month (UTC); after that a
 *  transfer carries ECON.p2pFeeMicro. Payments to listed shops don't count (they pay the shop fee instead).
 *  On testnet the fee is shown but not deducted: the router has no fee hook yet. */
export const p2pAllowance = (payer: Address): Promise<P2PAllowance> =>
  cached(`p2p-allowance:${getAddress(payer)}`, 10_000, async () => {
    const d = new Date()
    const monthStart = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000)
    const a = arkiv()
    const page = await a.pub.select({ merchant: true }).from(Receipt).ownedBy(a.owner)
      .where(and(eq("payer", addr(getAddress(payer))), eq("kind", "p2p"), gte("paidAt", u64(BigInt(monthStart))))).limit(100).fetch()
    const payees = (page.entities as any[]).map((e) => getAddress(v(e.merchant)))
    const shops = await Promise.all([...new Set(payees)].map(async (m) => [m, !!(await getMerchantByAddress(m).catch(() => null))] as const))
    const isShop = new Map(shops)
    const used = payees.filter((m) => !isShop.get(m)).length
    const free = ECON.p2pFreePerMonth
    const charged = Math.max(0, used - free)
    return {
      used, free, left: Math.max(0, free - used),
      feeMicro: (BigInt(charged) * ECON.p2pFeeMicro).toString(),
      nextFeeMicro: (used >= free ? ECON.p2pFeeMicro : 0n).toString(),
    }
  })
