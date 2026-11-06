// A wallet's scratch cards + the shop offers directory (Rewards page).
import { getAddress, isAddress, type Address } from "viem"
import { listRewards, listOffers, rewardsPool, rewardsPoolBalance } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner")
  if (!owner || !isAddress(owner)) return json({ error: "pass ?owner=" }, { status: 400 })
  try {
    const [cards, offers, pool] = await Promise.all([
      listRewards(getAddress(owner as Address)),
      listOffers().catch(() => []),
      rewardsPoolBalance().catch(() => 0n),
    ])
    const total = cards.reduce((s, c) => s + (c.prize === "cashback" && c.amount ? BigInt(c.amount) : 0n), 0n)
    return json({ cards, offers, totalCashback: total, cashbackLive: !!rewardsPool() && pool >= 10_000n })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 500 })
  }
}
