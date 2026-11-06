// A wallet's scratch cards, the shop offers directory, and the reward pool's public books (Rewards page).
import { getAddress, isAddress, type Address } from "viem"
import { listRewards, listOffers, rewardsLedger } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner")
  if (!owner || !isAddress(owner)) return json({ error: "pass ?owner=" }, { status: 400 })
  try {
    const [cards, offers, ledger] = await Promise.all([
      listRewards(getAddress(owner as Address)),
      listOffers().catch(() => []),
      rewardsLedger().catch(() => null),
    ])
    // cashback value won (claimed or waiting), micro-USD; legacy USDT cashback counts too
    const total = cards.reduce((s, c) => s + (c.prize && c.prize !== "offer" && c.prize !== "none" && c.status !== "expired" && c.amount ? BigInt(c.amount) : 0n), 0n)
    const pending = cards.filter((c) => c.status === "won").reduce((s, c) => s + BigInt(c.amount ?? 0), 0n)
    return json({ cards, offers, ledger, totalCashback: total, pendingMicro: pending })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 500 })
  }
}
