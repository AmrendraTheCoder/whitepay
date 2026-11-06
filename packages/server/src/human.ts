// The person behind a wallet that has ALREADY passed World ID, so later checks don't ask World App for a one-time
// proof it refuses ("already used this check"). World lets each person use a one-time action only once (or a few
// times), so repeat checks must use what that person already proved:
//  - a WondrPay name (whitepay-name) or a verified shop (whitepay-shop): a WorldClaim on Arkiv, shared by every
//    wallet of the same person (they carry the same nullifier)
//  - a rewards World ID session (RewardSession): re-provable any number of times with a session proof
// Kept apart from world.ts / rewards.ts so neither imports the other.
import { ExpirationTime } from "@arkiv-network/sdk"
import { addr, u64 } from "@arkiv-network/sdk/schema"
import { eq } from "@arkiv-network/sdk/query"
import { getAddress, type Address } from "viem"
import { WorldClaim } from "@whitepay/shared/arkiv"
import { arkiv } from "./clients"
import { RewardSession } from "./rewards"

const v = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x)
const NAME = "whitepay-name", SHOP = "whitepay-shop", STEP = "whitepay-pay"

async function claimsOf(where: any) {
  const a = arkiv()
  const page = await a.pub.select({ action: true, nullifier: true, purpose: true, address: true }).from(WorldClaim).ownedBy(a.owner).where(where as never).limit(20).fetch()
  return (page.entities as any[]).map((e) => ({ action: String(v(e.action)), nullifier: String(v(e.nullifier)), purpose: String(v(e.purpose)), address: getAddress(v(e.address)) }))
}
async function sessionsOf(owner: Address) {
  const a = arkiv()
  const page = await a.pub.select({ sessionId: true, human: true }).from(RewardSession).ownedBy(a.owner).where(eq("owner", addr(owner))).limit(5).fetch()
  return (page.entities as any[]).map((e) => ({ sessionId: String(v(e.sessionId)), human: String(v(e.human)) }))
}

/** A stable per-person key for a wallet that already passed World ID, or null if it never did. */
export async function verifiedHuman(address: Address): Promise<{ key: string; via: "name" | "shop" | "check" | "rewards" } | null> {
  address = getAddress(address)
  const [claims, sessions] = await Promise.all([claimsOf(eq("address", addr(address))), sessionsOf(address)])
  const name = claims.find((c) => c.purpose === "name-claim")
  if (name) return { key: `${NAME}:${name.nullifier}`, via: "name" }
  const shop = claims.find((c) => c.purpose === "merchant-verify")
  // a shop added by a verified wallet stores "<action>:<nullifier>" already; a scanned shop the raw nullifier
  if (shop) return { key: shop.nullifier.includes(":") ? shop.nullifier : `${SHOP}:${shop.nullifier}`, via: "shop" }
  // a one-time check this wallet passed before (a refund request or a large payment): see rememberHuman.
  // The step-up action's raw nullifier is the key refund requests have always been counted by.
  const check = claims.find((c) => c.purpose === "human-check")
  if (check) return { key: check.action === STEP ? check.nullifier : `${check.action}:${check.nullifier}`, via: "check" }
  if (sessions[0]) return { key: `rewards:${sessions[0].human}`, via: "rewards" }
  return null
}

/** Remember that this wallet passed a one-time World ID check (verified proof, `nullifier` from it), so the next
 *  check from this wallet passes even though World refuses a second proof on the same action. Idempotent. */
export async function rememberHuman(address: Address, action: string, nullifier: string) {
  address = getAddress(address)
  const mine = await claimsOf(eq("address", addr(address)))
  if (mine.some((c) => c.purpose === "human-check" && c.action === action && c.nullifier === nullifier)) return
  const a = arkiv()
  await a.writer.createEntity(WorldClaim,
    { action, nullifier, address: addr(address), purpose: "human-check", verifiedAt: u64(BigInt(Math.floor(Date.now() / 1000))) },
    { expiration: ExpirationTime.max() }, { gas: 1_500_000n })
}

/** World ID sessions this person can re-prove from this wallet: the wallet's own, then those of the person's other
 *  wallets (same World ID nullifier on a name or shop claim). Empty = none set up yet. */
export async function humanSessions(address: Address): Promise<string[]> {
  address = getAddress(address)
  const [own, claims] = await Promise.all([sessionsOf(address), claimsOf(eq("address", addr(address)))])
  const ids = own.map((s) => s.sessionId)
  if (!claims.length) return ids
  // the same nullifier, raw or prefixed with its action, on any of this person's wallets
  const keys = new Set<string>()
  for (const c of claims) {
    const raw = c.nullifier.includes(":") ? c.nullifier.split(":").pop()! : c.nullifier
    keys.add(raw); keys.add(`${NAME}:${raw}`); keys.add(`${SHOP}:${raw}`)
  }
  const siblings = new Set<Address>()
  for (const list of await Promise.all([...keys].map((k) => claimsOf(eq("nullifier", k)).catch(() => []))))
    for (const c of list) if (c.address !== address) siblings.add(c.address)
  for (const list of await Promise.all([...siblings].slice(0, 10).map((s) => sessionsOf(s).catch(() => []))))
    for (const s of list) if (!ids.includes(s.sessionId)) ids.push(s.sessionId)
  return ids
}
