import type { RewardCard } from "@whitepay/shared/rewards"

/** USDT with up to 3 decimals: cashback is often 0.012 */
export const usdt3 = (v?: string) => {
  if (!v) return "0"
  const n = Number(BigInt(v)) / 1e6
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 3 })
}

/** micro-USD as dollars, with enough decimals for tiny cashback ($0.003) */
export const usd = (v?: string | bigint) => {
  const n = Number(BigInt(v ?? 0)) / 1e6
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 0.1 ? 4 : 2 })}`
}

const STATE: Record<string, string> = { won: "Claim with World ID", claimed: "Claimed in WBT", expired: "Over the per-person limit" }

/** What a scratched card shows (grid tile and the big revealed card). */
export function PrizeFace({ card, big = false }: { card: RewardCard; big?: boolean }) {
  if (card.prize === "wbt" || card.prize === "wbt_welcome")
    return (
      <div className={`rw-prize ${big ? "big" : ""} ${card.status === "expired" ? "rw-dim" : ""}`}>
        <span className="rw-coin rw-coin-wbt" aria-hidden>W</span>
        <div className="rw-p1">{card.prize === "wbt_welcome" ? "Welcome · " : ""}{(card.rateBps ?? 0) / 100}% back</div>
        <div className="rw-amt">{usd(card.amount)}</div>
        <div className={`rw-state rw-state-${card.status}`}>{STATE[card.status] ?? "in WBT"}</div>
      </div>
    )
  if (card.prize === "cashback")
    return (
      <div className={`rw-prize ${big ? "big" : ""}`}>
        <span className="rw-coin" aria-hidden>₮</span>
        <div className="rw-p1">You won</div>
        <div className="rw-amt">{usdt3(card.amount)} <small>USDT</small></div>
        <div className="rw-p2">Cashback</div>
      </div>
    )
  if (card.prize === "offer")
    return (
      <div className={`rw-prize ${big ? "big" : ""}`}>
        <span className="rw-coin rw-coin-tag" aria-hidden>%</span>
        <div className="rw-p1">Shop offer</div>
        <div className="rw-offer">{card.offerText}</div>
        <div className="rw-code">{card.offerCode}</div>
      </div>
    )
  return (
    <div className={`rw-prize ${big ? "big" : ""} rw-none`}>
      <span className="rw-coin rw-coin-none" aria-hidden>☺</span>
      <div className="rw-p1">Better luck</div>
      <div className="rw-p2">next time</div>
    </div>
  )
}
