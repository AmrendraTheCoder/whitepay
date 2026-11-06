// Rewards: shared constants, the reward economics (one source of truth for server, UI and the pitch),
// and the messages users and merchants sign.
import type { Address } from "viem"

/** smallest shop payment that earns a scratch card (0.10 USDT) */
export const REWARD_MIN_PAYMENT = 100_000n
/** how long an unscratched card stays valid */
export const REWARD_TTL_DAYS = 30
export const OFFER_TEXT_MAX = 80
export const OFFER_CODE_RE = /^[A-Z0-9-]{3,16}$/

// ------------------------------------------------------------------ economics
// Every number the reward engine uses lives here; /rewards and docs/REWARDS.md render the same values.
// Money is in micro-USD (= USDT base units, 6 decimals). Rates are in basis points (1 bp = 0.01%).
export const ECON = {
  /** merchant fee (MDR) WondrPay earns on a shop payment: 0.50%. P2P transfers earn nothing, so they get no rewards. */
  feeBps: 50,
  /** share of that fee paid back to customers as rewards: 50%. The other half is WondrPay's margin. */
  rewardShareBps: 5000,
  /** a winning card pays 1-5% of the payment, skewed toward the low end (weights sum to 100) */
  rates: [
    { bps: 100, weight: 40 },
    { bps: 200, weight: 25 },
    { bps: 300, weight: 15 },
    { bps: 400, weight: 12 },
    { bps: 500, weight: 8 },
  ],
  /** most a single card can pay, whatever the payment size: $2 */
  winCapMicro: 2_000_000n,
  /** welcome: a new human's first 3 cards always win, each capped at $0.50 (customer acquisition, from the launch budget) */
  welcomeWins: 3,
  welcomeCapMicro: 500_000n,
  /** one-time launch budget that funds welcome wins: $25 */
  launchBudgetMicro: 25_000_000n,
  /** per HUMAN (World ID), across all their wallets: claims per day and cashback per 30 days */
  humanClaimsPerDay: 5,
  humanMonthlyCapMicro: 5_000_000n,
  /** if a shop has an offer, this share of the non-cashback cards wins it */
  offerShareBps: 4000,
} as const

/** expected cashback rate of a WINNING card, in bp: Σ rate × weight / Σ weight (= 223 bp = 2.23%) */
export const expectedWinRateBps = () => {
  const w = ECON.rates.reduce((s, r) => s + r.weight, 0)
  return ECON.rates.reduce((s, r) => s + r.bps * r.weight, 0) / w
}

/** Win probability that spends EXACTLY the reward share of fees on average:
 *    p × E[rate] = fee × share   =>   p = fee × share / E[rate]
 *  0.50% × 50% / 2.23% = 11.2%, i.e. about 1 card in 9 wins cashback. Returned in bp. */
export const winProbBps = () => Math.floor((ECON.feeBps * ECON.rewardShareBps) / expectedWinRateBps())

/** The model per $100 of shop payments, for the explainer and the pitch. */
export function economicsPer100() {
  const volume = 100
  const fee = (volume * ECON.feeBps) / 10_000 // $0.50
  const p = winProbBps() / 10_000
  const eRate = expectedWinRateBps() / 10_000
  const expectedRewards = volume * p * eRate // ≤ $0.25 (caps only lower it)
  return {
    volume,
    fee,
    winProbability: p,
    oneIn: Math.round(1 / p),
    expectedWinRate: eRate,
    expectedRewards,
    margin: fee - expectedRewards, // ≥ $0.25
    rewardShare: ECON.rewardShareBps / 10_000,
    // someone paying their own shop to farm rewards pays the fee and gets back only half of it on average
    washTradeLossPer100: fee - expectedRewards,
  }
}

/** Roll a card from a 256-bit seed: returns the outcome and, for cashback, the rate. Pure: the server and the
 *  economics test share it. `welcome` = this human's first cards (always cashback). */
/** the cashback rate a card's seed gives, in bp (only paid if the card wins) */
export function rollRate(seed: bigint): number {
  const rateRoll = Number((seed >> 32n) % 100n) // 0..99, independent of the win roll
  let acc = 0
  for (const r of ECON.rates) { acc += r.weight; if (rateRoll < acc) return r.bps }
  return ECON.rates[0].bps
}

export function rollPrize(seed: bigint, p: { hasOffer: boolean; welcome: boolean }): { prize: "wbt" | "wbt_welcome" | "offer" | "none"; rateBps: number } {
  const pick = Number(seed % 10_000n) // 0..9999
  const rateBps = rollRate(seed)
  if (p.welcome) return { prize: "wbt_welcome", rateBps }
  const win = winProbBps()
  if (pick < win) return { prize: "wbt", rateBps }
  const offerCut = win + Math.floor(((10_000 - win) * ECON.offerShareBps) / 10_000)
  if (p.hasOffer && pick < offerCut) return { prize: "offer", rateBps: 0 }
  return { prize: "none", rateBps: 0 }
}

/** cashback value of a winning card, micro-USD: rate × payment, capped */
export const cashbackMicro = (paid: bigint, rateBps: number, welcome: boolean) => {
  const v = (paid * BigInt(rateBps)) / 10_000n
  const cap = welcome ? ECON.welcomeCapMicro : ECON.winCapMicro
  return v > cap ? cap : v
}

// ------------------------------------------------------------------ signed messages
export const offerMessage = (p: { merchant: Address; text: string; code: string; active: boolean; issuedAt: number }) =>
  `WondrPay shop offer\nmerchant: ${p.merchant}\noffer: ${p.text}\ncode: ${p.code}\nactive: ${p.active}\nissued: ${p.issuedAt}`

/** World ID signal for a claim: binds the human proof to this wallet and this exact set of cards */
export const claimSignal = (owner: string, cardKeys: string[]) =>
  `wondrpay-reward-claim:${owner.toLowerCase()}:${[...cardKeys].map((k) => k.toLowerCase()).sort().join(",")}`

// ------------------------------------------------------------------ views
export type RewardCard = {
  key: string
  merchant: string
  merchantName?: string
  paidAmount: string
  paymentTx?: string
  earnedAt: number
  expiresAt?: number
  /** new = unscratched · scratched = offer/none/legacy USDT cashback · won = WBT cashback waiting for a World ID claim ·
   *  claimed = paid out · expired = over this person's limits */
  status: "new" | "scratched" | "won" | "claimed" | "expired"
  /** cashback = legacy USDT cashback (paid instantly) · wbt / wbt_welcome = WBT cashback (claimed with World ID) */
  prize?: "cashback" | "wbt" | "wbt_welcome" | "offer" | "none"
  /** cashback value in micro-USD (USDT units) */
  amount?: string
  /** WBT cashback: the rate this card won, in bp */
  rateBps?: number
  offerText?: string
  offerCode?: string
  payoutTx?: string
}

export type OfferView = { key: string; merchant: string; merchantName?: string; displayName?: string; text: string; code: string; active: boolean; updatedAt: number }

export type RewardsLedger = {
  /** qualifying shop volume that earned cards, micro-USD */
  volumeMicro: string
  /** fees on that volume and the reward share of them */
  feesMicro: string
  accruedMicro: string
  launchBudgetMicro: string
  /** cashback claimed so far (paid in WBT), micro-USD */
  paidMicro: string
  /** what the pool may still pay: accrued + launch budget − paid */
  availableMicro: string
  claims: number
  humans: number
  wbtUsd: number | null
  poolWbt: string
}
