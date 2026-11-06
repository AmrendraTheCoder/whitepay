// Scratch-card rewards: shared constants and the message a merchant signs to publish an offer.
import type { Address } from "viem"

/** smallest shop payment that earns a scratch card (0.10 USDT) */
export const REWARD_MIN_PAYMENT = 100_000n
/** cashback range per winning card, USDT base units (0.01 - 0.05 USDT), never above 10% of the payment */
export const CASHBACK_MIN = 10_000n
export const CASHBACK_MAX = 50_000n
/** how long an unscratched card stays valid */
export const REWARD_TTL_DAYS = 30
export const OFFER_TEXT_MAX = 80
export const OFFER_CODE_RE = /^[A-Z0-9-]{3,16}$/

export const offerMessage = (p: { merchant: Address; text: string; code: string; active: boolean; issuedAt: number }) =>
  `WondrPay shop offer\nmerchant: ${p.merchant}\noffer: ${p.text}\ncode: ${p.code}\nactive: ${p.active}\nissued: ${p.issuedAt}`

export type RewardCard = {
  key: string
  merchant: string
  merchantName?: string
  paidAmount: string
  earnedAt: number
  expiresAt?: number
  status: "new" | "scratched"
  prize?: "cashback" | "offer" | "none"
  amount?: string
  offerText?: string
  offerCode?: string
  payoutTx?: string
}

export type OfferView = { key: string; merchant: string; merchantName?: string; displayName?: string; text: string; code: string; active: boolean; updatedAt: number }
