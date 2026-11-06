// One-time, idempotent ENSv2 setup on Ethereum Sepolia for WondrPay (safe to re-run; skips finished steps).
//   1. check ENS_ADMIN has Sepolia ETH
//   2. pick the parent .eth name (ENS_PARENT, else wondrpay.eth, else fallbacks)
//   3. deploy ENS_ADMIN's PermissionedResolver + the parent's UserRegistry via VerifiableFactory
//   4. register the parent via ETHRegistrar (MockUSDC, commit -> wait -> register), subregistry + resolver set at registration
//   5. make sure ETHRegistry points at the UserRegistry and the UserRegistry knows its canonical parent
//   6. write ENS_PARENT / ENS_USER_REGISTRY / ENS_RESOLVER to .env
//   7. issue chai-shop.<parent> for the demo merchant and resolve it back live
//
// Run:  npx tsx --env-file=.env scripts/ens-setup.ts
import fs from "node:fs"
import path from "node:path"
import {
  encodeFunctionData,
  formatEther,
  formatUnits,
  getAddress,
  keccak256,
  labelhash,
  parseEventLogs,
  toHex,
  zeroHash,
  type Address,
} from "viem"
import {
  ALL_ROLES,
  ONE_YEAR,
  STATUS,
  ensAdmin,
  ensConfig,
  ensPublic,
  ethRegistrarAbi,
  getTexts,
  isLabelAvailable,
  issueSubname,
  mockErc20Abi,
  ownedResolverSalt,
  permissionedRegistryAbi,
  permissionedResolverAbi,
  resolveName,
  userRegistrySalt,
  verifiableFactoryAbi,
} from "../packages/server/src/ens"

const DEMO_MERCHANT: Address = "0xCF69aAdd6357Afd3C1b5EcFE3eecA134f49b6e10"
const DEMO_LABEL = "chai-shop"
const FALLBACK_LABELS = ["wondrpay", "wondrpay-app", "wondrpayupi", "wondr-pay"]
const ENV_PATH = path.resolve(import.meta.dirname, "../.env")

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const log = (...a: unknown[]) => console.log(...a)

async function main() {
  const C = ensConfig().contracts
  const pub = ensPublic()
  const { wallet, address: admin } = ensAdmin()
  const send = async (label: string, hash: `0x${string}`) => {
    log(`  tx ${label}: https://sepolia.etherscan.io/tx/${hash}`)
    const r = await pub.waitForTransactionReceipt({ hash })
    if (r.status !== "success") throw new Error(`${label} reverted (${hash})`)
    return r
  }

  // ---- 1. gas
  const bal = await pub.getBalance({ address: admin })
  log(`ENS_ADMIN ${admin}: ${formatEther(bal)} Sepolia ETH`)
  if (bal === 0n) {
    log(`\nENS_ADMIN has no Sepolia ETH. Fund ${admin} from a Sepolia faucet (~0.05 ETH is plenty), then re-run.`)
    process.exit(1)
  }

  // ---- 2. parent name
  const now = (await pub.getBlock()).timestamp
  const wanted = ensConfig().parentLabel
  const candidates = [...new Set([wanted, ...FALLBACK_LABELS])]
  let parentLabel: string | undefined
  let needsRegistration = false
  for (const label of candidates) {
    const s = await pub.readContract({ address: C.ethRegistry, abi: permissionedRegistryAbi, functionName: "getState", args: [BigInt(labelhash(label))] })
    if (STATUS[s.status] === "REGISTERED" && getAddress(s.latestOwner) === admin && s.expiry > now) {
      parentLabel = label
      log(`${label}.eth already owned by ENS_ADMIN (expires ${new Date(Number(s.expiry) * 1000).toISOString()})`)
      break
    }
    const available = await pub.readContract({ address: C.ethRegistrar, abi: ethRegistrarAbi, functionName: "isAvailable", args: [label] })
    if (available) {
      parentLabel = label
      needsRegistration = true
      log(`${label}.eth is available, will register it`)
      break
    }
    log(`${label}.eth is taken by ${s.latestOwner}, trying next`)
  }
  if (!parentLabel) throw new Error(`none of ${candidates.map((l) => l + ".eth").join(", ")} is available; set ENS_PARENT to another 5+ char name`)
  const parent = `${parentLabel}.eth`
  if (parentLabel !== wanted) log(`\n>>> Using fallback parent ${parent}. ENS_PARENT will be set to ${parent} in .env <<<\n`)

  // ---- 3. resolver + registry proxies (deterministic: predict, deploy only if missing)
  const deployProxy = async (what: string, impl: Address, salt: bigint, data: `0x${string}`) => {
    const predicted = await pub.readContract({ address: C.verifiableFactory, abi: verifiableFactoryAbi, functionName: "predictProxyAddress", args: [admin, salt] })
    const code = await pub.getCode({ address: predicted })
    if (code && code !== "0x") {
      log(`${what} already deployed at ${predicted}`)
      return getAddress(predicted)
    }
    const r = await send(`deploy ${what}`, await wallet.writeContract({ address: C.verifiableFactory, abi: verifiableFactoryAbi, functionName: "deployProxy", args: [impl, salt, data] }))
    const [ev] = parseEventLogs({ abi: verifiableFactoryAbi, eventName: "ProxyDeployed", logs: r.logs })
    if (!ev) throw new Error(`no ProxyDeployed event for ${what}`)
    log(`${what} deployed at ${ev.args.proxyAddress}`)
    return getAddress(ev.args.proxyAddress)
  }

  const resolver = await deployProxy(
    "PermissionedResolver",
    C.permissionedResolverImpl,
    ownedResolverSalt(admin),
    encodeFunctionData({ abi: permissionedResolverAbi, functionName: "initialize", args: [[{ account: admin, roleBitmap: ALL_ROLES }], []] }),
  )
  const userRegistry = await deployProxy(
    `UserRegistry(${parent})`,
    C.userRegistryImpl,
    userRegistrySalt(parent),
    encodeFunctionData({ abi: permissionedRegistryAbi, functionName: "initialize", args: [[{ account: admin, roleBitmap: ALL_ROLES }]] }),
  )

  // ---- 4. register the parent (.eth, paid in MockUSDC)
  if (needsRegistration) {
    const duration = ONE_YEAR
    const [base, premium] = await pub.readContract({ address: C.ethRegistrar, abi: ethRegistrarAbi, functionName: "getRegisterPrice", args: [parentLabel, duration, C.mockUsdc] })
    const cost = ((base + premium) * 11n) / 10n // 10% buffer for oracle drift
    const decimals = await pub.readContract({ address: C.mockUsdc, abi: mockErc20Abi, functionName: "decimals" })
    log(`price for ${parent}, 1y: ${formatUnits(base + premium, decimals)} MockUSDC`)

    const usdcBal = await pub.readContract({ address: C.mockUsdc, abi: mockErc20Abi, functionName: "balanceOf", args: [admin] })
    if (usdcBal < cost) await send("MockUSDC.mint", await wallet.writeContract({ address: C.mockUsdc, abi: mockErc20Abi, functionName: "mint", args: [admin, cost - usdcBal] }))
    const allowance = await pub.readContract({ address: C.mockUsdc, abi: mockErc20Abi, functionName: "allowance", args: [admin, C.ethRegistrar] })
    if (allowance < cost) await send("MockUSDC.approve", await wallet.writeContract({ address: C.mockUsdc, abi: mockErc20Abi, functionName: "approve", args: [C.ethRegistrar, cost] }))

    const secret = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))))
    const commitment = await pub.readContract({
      address: C.ethRegistrar, abi: ethRegistrarAbi, functionName: "makeCommitment",
      args: [parentLabel, admin, secret, userRegistry, resolver, duration, zeroHash],
    })
    await send("ETHRegistrar.commit", await wallet.writeContract({ address: C.ethRegistrar, abi: ethRegistrarAbi, functionName: "commit", args: [commitment] }))
    const committedAt = await pub.readContract({ address: C.ethRegistrar, abi: ethRegistrarAbi, functionName: "commitmentAt", args: [commitment] })
    const minAge = await pub.readContract({ address: C.ethRegistrar, abi: ethRegistrarAbi, functionName: "MIN_COMMITMENT_AGE" })
    log(`waiting >= ${minAge}s for the commitment to mature...`)
    while ((await pub.getBlock()).timestamp <= committedAt + minAge) await sleep(6_000)
    await sleep(15_000) // margin: register is simulated against a block that can lag the one we checked

    await send(
      `ETHRegistrar.register(${parent})`,
      await wallet.writeContract({
        address: C.ethRegistrar, abi: ethRegistrarAbi, functionName: "register",
        args: [parentLabel, admin, secret, userRegistry, resolver, duration, C.mockUsdc, zeroHash],
      }),
    )
    log(`registered ${parent}`)
  }

  // ---- 5. link registry hierarchy (both directions)
  const parentId = BigInt(labelhash(parentLabel))
  const sub = await pub.readContract({ address: C.ethRegistry, abi: permissionedRegistryAbi, functionName: "getSubregistry", args: [parentLabel] })
  if (getAddress(sub) !== userRegistry)
    await send("ETHRegistry.setSubregistry", await wallet.writeContract({ address: C.ethRegistry, abi: permissionedRegistryAbi, functionName: "setSubregistry", args: [parentId, userRegistry] }))
  const parentResolver = await pub.readContract({ address: C.ethRegistry, abi: permissionedRegistryAbi, functionName: "getResolver", args: [parentLabel] })
  if (getAddress(parentResolver) !== resolver)
    await send("ETHRegistry.setResolver", await wallet.writeContract({ address: C.ethRegistry, abi: permissionedRegistryAbi, functionName: "setResolver", args: [parentId, resolver] }))
  const [canonParent, canonLabel] = await pub.readContract({ address: userRegistry, abi: permissionedRegistryAbi, functionName: "getParent" })
  if (getAddress(canonParent) !== getAddress(C.ethRegistry) || canonLabel !== parentLabel)
    await send("UserRegistry.setParent", await wallet.writeContract({ address: userRegistry, abi: permissionedRegistryAbi, functionName: "setParent", args: [C.ethRegistry, parentLabel] }))
  log(`${parent} -> subregistry ${userRegistry}, resolver ${resolver}`)

  // ---- 6. .env
  process.env.ENS_PARENT = parent
  process.env.ENS_USER_REGISTRY = userRegistry
  process.env.ENS_RESOLVER = resolver
  updateEnv({ ENS_PARENT: parent, ENS_USER_REGISTRY: userRegistry, ENS_RESOLVER: resolver })
  log(`\n.env values:\n  ENS_PARENT=${parent}\n  ENS_USER_REGISTRY=${userRegistry}\n  ENS_RESOLVER=${resolver}\n`)

  // ---- 7. demo merchant subname
  const check = await isLabelAvailable(DEMO_LABEL)
  if (check.available) {
    const issued = await issueSubname({
      label: DEMO_LABEL,
      owner: DEMO_MERCHANT,
      whitechainAddress: DEMO_MERCHANT,
      text: { display: "Chai Shop", kind: "merchant", verified: "true" },
    })
    log(`issued ${issued.name} (expires ${new Date(Number(issued.expiry) * 1000).toISOString()})`)
    for (const h of issued.txHashes) log(`  tx https://sepolia.etherscan.io/tx/${h}`)
  } else {
    log(`${check.name}: ${check.reason}, skipping issuance`)
  }

  const name = `${DEMO_LABEL}.${parent}`
  const wcAddr = await resolveName(name)
  const texts = await getTexts(name, ["display", "kind", "verified"])
  log(`\nresolve ${name} (coinType 2147485522 / Whitechain 1874) => ${wcAddr ?? "null"}`)
  log("texts:", texts)
  if (wcAddr !== getAddress(DEMO_MERCHANT)) {
    log("WARNING: resolution does not match the demo merchant yet (Universal Resolver may lag a block; re-run scripts/ens-check.ts)")
    process.exitCode = 1
  } else log("OK: ENSv2 name resolves live to the merchant's Whitechain address")
}

/** Set KEY=value in .env: fill empty values, replace ENS_PARENT, never touch other non-empty keys. */
function updateEnv(vals: Record<string, string>) {
  if (!fs.existsSync(ENV_PATH)) return log(`(no .env at ${ENV_PATH}; set the values below by hand)`)
  const lines = fs.readFileSync(ENV_PATH, "utf8").replace(/\n*$/, "").split("\n")
  for (const [k, v] of Object.entries(vals)) {
    const i = lines.findIndex((l) => l.startsWith(`${k}=`))
    if (i === -1) {
      lines.push(`${k}=${v}`)
      continue
    }
    const cur = lines[i].slice(k.length + 1).trim()
    if (cur === v) continue
    if (cur === "" || k === "ENS_PARENT") lines[i] = `${k}=${v}`
    else log(`WARNING: .env ${k}=${cur} differs from on-chain ${v}; left unchanged, fix it by hand`)
  }
  fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n")
}

main().catch((e) => {
  console.error(e?.shortMessage ?? e?.message ?? e)
  process.exit(1)
})
