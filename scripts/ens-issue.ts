// Issue a <label>.wondrpay.eth name to an existing wallet (e.g. merchants registered before ENS was live).
// Run: npx tsx --env-file=.env scripts/ens-issue.ts <label> <address> [displayName] [kind=merchant|person]
import { getAddress } from "viem"
import { issueSubname, resolveName, getTexts } from "@whitepay/server"

async function main() {
  const [label, address, display, kind = "merchant"] = process.argv.slice(2)
  if (!label || !address) throw new Error("usage: ens-issue.ts <label> <address> [displayName] [kind]")
  const owner = getAddress(address)
  const r = await issueSubname({ label, owner, whitechainAddress: owner, text: { ...(display ? { display } : {}), kind, verified: "false" } })
  console.log(`issued ${r.name}`)
  for (const h of r.txHashes) console.log(`  https://sepolia.etherscan.io/tx/${h}`)
  console.log("resolves to", await resolveName(r.name), await getTexts(r.name, ["display", "kind", "verified"]))
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
