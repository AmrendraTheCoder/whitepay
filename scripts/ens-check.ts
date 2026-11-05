// Read-only ENSv2 (Sepolia) health check: parent ownership, registry/resolver wiring, and a live lookup.
// No private key needed.
//
// Run:  npx tsx --env-file=.env scripts/ens-check.ts [name=chai-shop.<ENS_PARENT>]
import { getAddress, labelhash, zeroAddress } from "viem"
import { normalize } from "viem/ens"
import {
  STATUS,
  ensConfig,
  ensPublic,
  getTexts,
  permissionedRegistryAbi,
  resolveName,
  verifiableFactoryAbi,
} from "../packages/server/src/ens"

const iso = (s: bigint) => (s === 0n ? "-" : new Date(Number(s) * 1000).toISOString())

async function main() {
  const cfg = ensConfig()
  const C = cfg.contracts
  const pub = ensPublic()
  const name = normalize(process.argv[2] || `chai-shop.${cfg.parent}`)

  // parent in the .eth registry
  const p = await pub.readContract({ address: C.ethRegistry, abi: permissionedRegistryAbi, functionName: "getState", args: [BigInt(labelhash(cfg.parentLabel))] })
  const sub = await pub.readContract({ address: C.ethRegistry, abi: permissionedRegistryAbi, functionName: "getSubregistry", args: [cfg.parentLabel] })
  const res = await pub.readContract({ address: C.ethRegistry, abi: permissionedRegistryAbi, functionName: "getResolver", args: [cfg.parentLabel] })
  console.log(`parent ${cfg.parent}: ${STATUS[p.status]}  owner ${p.latestOwner}  expires ${iso(p.expiry)}`)
  console.log(`  on-chain subregistry ${sub}${cfg.userRegistry ? (getAddress(sub) === cfg.userRegistry ? "  (= ENS_USER_REGISTRY)" : `  (!= ENS_USER_REGISTRY ${cfg.userRegistry})`) : "  (ENS_USER_REGISTRY unset)"}`)
  console.log(`  on-chain resolver    ${res}${cfg.resolver ? (getAddress(res) === cfg.resolver ? "  (= ENS_RESOLVER)" : `  (!= ENS_RESOLVER ${cfg.resolver})`) : "  (ENS_RESOLVER unset)"}`)

  // provenance of the proxies (VerifiableFactory.verifyContract reverts if not factory-deployed)
  for (const [label, addr] of [["UserRegistry", cfg.userRegistry ?? sub], ["PermissionedResolver", cfg.resolver ?? res]] as const) {
    if (!addr || addr === zeroAddress) continue
    const impl = await pub
      .readContract({ address: C.verifiableFactory, abi: verifiableFactoryAbi, functionName: "verifyContract", args: [addr] })
      .catch(() => null)
    console.log(`  ${label} ${addr}: ${impl ? `verified factory proxy -> impl ${impl}` : "NOT a VerifiableFactory proxy"}`)
  }

  // the subname's own entry, if it lives in our registry
  const registry = cfg.userRegistry ?? (sub !== zeroAddress ? getAddress(sub) : undefined)
  if (registry && name.endsWith(`.${cfg.parent}`) && name.split(".").length === cfg.parent.split(".").length + 1) {
    const label = name.split(".")[0]
    const s = await pub.readContract({ address: registry, abi: permissionedRegistryAbi, functionName: "getState", args: [BigInt(labelhash(label))] })
    const r = await pub.readContract({ address: registry, abi: permissionedRegistryAbi, functionName: "getResolver", args: [label] })
    console.log(`\n${name}: ${STATUS[s.status]}  owner ${s.latestOwner}  expires ${iso(s.expiry)}  resolver ${r}`)
  }

  // live resolution through the ENSv2 Universal Resolver
  const wcAddr = await resolveName(name)
  const ethAddr = await pub.getEnsAddress({ name }).catch(() => null)
  const texts = await getTexts(name)
  console.log(`\nresolve ${name}`)
  console.log(`  Whitechain (coinType 2147485522): ${wcAddr ?? "null"}`)
  console.log(`  ETH (coinType 60):                ${ethAddr ?? "null"}`)
  console.log("  texts:", Object.fromEntries(Object.entries(texts).filter(([, v]) => v)))
}

main().catch((e) => {
  console.error(e?.shortMessage ?? e?.message ?? e)
  process.exit(1)
})
