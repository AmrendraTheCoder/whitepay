// Re-issue every merchant and personal name under the current ENS_PARENT (rename: wondrpay.eth -> wondrpay.eth).
// Source of truth: the MerchantProfile / PersonProfile entities on Arkiv. Same owner, same Whitechain
// address, same text records. Idempotent: names already issued under the new parent are skipped.
// Run: npx tsx --env-file=.env scripts/ens-migrate-parent.ts [--dry]
import { getAddress, type Address } from "viem"
import { arkiv } from "../packages/server/src/clients"
import { ensConfig, isLabelAvailable, issueSubname, resolveName, getTexts } from "../packages/server/src/ens"
import { MerchantProfile, PersonProfile } from "../packages/shared/src/arkiv"

const dry = process.argv.includes("--dry")
const v = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x)

async function all(schema: any, fields: Record<string, true>) {
  const a = arkiv()
  const out: any[] = []
  let page = await a.pub.select({ $key: true, ...fields }).from(schema).ownedBy(a.owner).limit(100).fetch()
  out.push(...page.entities)
  while ((page as any).hasNextPage?.()) { page = await (page as any).next(); out.push(...page.entities) }
  return out
}

async function main() {
  const parent = ensConfig().parent
  console.log("new parent:", parent)
  const merchants = (await all(MerchantProfile, { address: true, label: true, displayName: true, verified: true }))
    .map((e) => ({ label: v(e.label) as string, owner: getAddress(v(e.address)) as Address, text: { display: String(v(e.displayName) ?? "").replace(/WondrPay/g, "WondrPay"), kind: "merchant", verified: v(e.verified) ? "true" : "false" } }))
  const people = (await all(PersonProfile, { address: true, label: true }))
    .map((e) => ({ label: v(e.label) as string, owner: getAddress(v(e.address)) as Address, text: { kind: "person", verified: "true" } as Record<string, string> }))
  const seen = new Set<string>()
  for (const n of [...merchants, ...people]) {
    if (!n.label || seen.has(n.label)) continue
    seen.add(n.label)
    const name = `${n.label}.${parent}`
    const avail = await isLabelAvailable(n.label)
    if (!avail.available) { console.log(`skip  ${name}: ${avail.reason ?? "taken"} -> ${await resolveName(name).catch(() => "?")}`); continue }
    if (dry) { console.log(`would issue ${name} -> ${n.owner}`); continue }
    const text = Object.fromEntries(Object.entries(n.text).filter(([, x]) => x))
    try {
      const r = await issueSubname({ label: n.label, owner: n.owner, whitechainAddress: n.owner, text })
      console.log(`issued ${r.name} -> ${n.owner}`)
    } catch (e) { console.log(`FAIL  ${name}: ${(e as Error).message.split("\n")[0]}`) }
  }
  console.log("\ncheck:")
  for (const l of seen) console.log(`  ${l}.${parent} ->`, await resolveName(`${l}.${parent}`).catch(() => null), JSON.stringify(await getTexts(`${l}.${parent}`, ["display", "kind"]).catch(() => ({}))))
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
