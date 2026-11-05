// Backfill a personal name into the Arkiv person directory (for names issued before the directory existed).
// Run: npx tsx --env-file=.env scripts/backfill-person.ts <label> <address>
import { ExpirationTime } from "@arkiv-network/sdk"
import { addr, u64 } from "@arkiv-network/sdk/schema"
import { getAddress } from "viem"
import { PersonProfile } from "@whitepay/shared/arkiv"
import { arkiv, getPersonByAddress, resolveName } from "@whitepay/server"

async function main() {
  const [label, address] = process.argv.slice(2)
  const owner = getAddress(address)
  if (await getPersonByAddress(owner)) return console.log("already in directory")
  const ensName = `${label}.${process.env.ENS_PARENT || "whitepay.eth"}`
  const onEns = await resolveName(ensName)
  if (onEns?.toLowerCase() !== owner.toLowerCase()) throw new Error(`${ensName} resolves to ${onEns}, not ${owner}`)
  const r = await arkiv().writer.createEntity(PersonProfile,
    { address: addr(owner), label, ensName, registeredAt: u64(BigInt(Math.floor(Date.now() / 1000))), ensIssued: true },
    { expiration: ExpirationTime.max() }, { gas: 1_500_000n })
  console.log("backfilled", ensName, "->", owner, "entity", r.entityKey)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
