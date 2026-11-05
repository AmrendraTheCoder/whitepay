// ENSv2 (Ethereum Sepolia) names for WhitePay users and merchants, e.g. chai-shop.whitepay.eth.
//
// Layout (all owned by ENS_ADMIN):
//   .eth ETHRegistry ── "whitepay" ──> UserRegistry proxy (ENS_USER_REGISTRY, via VerifiableFactory)
//                                         └─ "chai-shop" (non-transferable, 1y expiry) ──> PermissionedResolver (ENS_RESOLVER)
//   Resolver records per subname: addr(coinType 2147485522 = Whitechain 1874), addr(60), text records.
//
// ABIs below were checked against the Sourcify-verified sources of the Sepolia deployments
// (ETHRegistrar 0xf633…, ETHRegistry/PermissionedRegistry 0xd4eb…, UserRegistry impl 0x9bd8…,
// PermissionedResolver impl 0x115e…, VerifiableFactory 0xda70…, MockERC20 0x240b…) and docs.ens.domains/ensv2/*.
// Never log ENS_ADMIN_PK.
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
  keccak256,
  labelhash,
  namehash,
  parseAbi,
  stringToHex,
  toHex,
  type Address,
  type Hash,
  type Hex,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { normalize, packetToBytes } from "viem/ens"
import { ENS_SEPOLIA, WHITECHAIN_COIN_TYPE } from "@whitepay/shared"

// ------------------------------------------------------------------ ABIs (verified, see header)
export const ethRegistrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function commitmentAt(bytes32 commitment) view returns (uint64 commitTime)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256 tokenId)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function MIN_REGISTER_DURATION() view returns (uint64)",
])

/** Shared by the .eth PermissionedRegistry and our UserRegistry proxy. */
export const permissionedRegistryAbi = parseAbi([
  "function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource) state)",
  "function getStatus(uint256 anyId) view returns (uint8)",
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function getParent() view returns (address parent, string label)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function unregister(uint256 anyId)",
  "function renew(uint256 anyId, uint64 newExpiry)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setResolver(uint256 anyId, address resolver)",
  "function setParent(address parent, string label)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function initialize((address account, uint256 roleBitmap)[] grants)",
])

export const permissionedResolverAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
  "function setText(bytes name, string key, string value)",
  "function multicall(bytes[] calls) returns (bytes[] results)",
  "function grantSetterRoles(bytes setter, address account) returns (bool)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
  "function getRecordId(bytes32 node) view returns (uint256)",
])

export const verifiableFactoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address proxy)",
  "function predictProxyAddress(address deployer, uint256 salt) view returns (address proxy)",
  "function verifyContract(address proxy) view returns (address implementation)",
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
])

export const mockErc20Abi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
])

// ------------------------------------------------------------------ roles (docs: permissioned-registry, permissioned-resolver)
/** Every role + admin role (one bit per nybble), as in the VerifiableFactory docs. */
export const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n
export const REGISTRY_ROLES = {
  REGISTRAR: 1n << 0n,
  UNREGISTER: 1n << 12n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
  /** admin-only; holding it on a name is what makes the name transferable */
  CAN_TRANSFER_ADMIN: (1n << 28n) << 128n,
} as const
/**
 * Roles a subname owner receives: may repoint their own resolver (self-custody exit), nothing else.
 * ROLE_CAN_TRANSFER_ADMIN is deliberately absent => transfers revert with TransferDisallowed (non-transferable).
 * ENS_ADMIN keeps ROLE_UNREGISTER/RENEW at the registry root => revocable + renewable by WhitePay.
 */
export const SUBNAME_OWNER_ROLES = REGISTRY_ROLES.SET_RESOLVER

export const STATUS = ["AVAILABLE", "RESERVED", "REGISTERED"] as const
export const ONE_YEAR = 365n * 24n * 60n * 60n
export const ETH_COIN_TYPE = 60n

// ------------------------------------------------------------------ salts (docs: verifiable-factory)
export const userRegistrySalt = (parentName: string, version = 0n) =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
        [keccak256(stringToHex("UserRegistry")), namehash(parentName), version],
      ),
    ),
  )
export const ownedResolverSalt = (owner: Address, version = 0n) =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [keccak256(stringToHex("OwnedResolver")), owner, version],
      ),
    ),
  )

// ------------------------------------------------------------------ config + clients
export const ensConfig = () => {
  const parent = normalize(process.env.ENS_PARENT || "whitepay.eth")
  const optAddr = (name: string): Address | undefined => {
    const v = process.env[name]?.trim()
    if (!v) return undefined
    if (!isAddress(v)) throw new Error(`${name} is not an address`)
    return getAddress(v)
  }
  return {
    rpc: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    parent,
    parentLabel: parent.split(".")[0],
    userRegistry: optAddr("ENS_USER_REGISTRY"),
    resolver: optAddr("ENS_RESOLVER"),
    contracts: ENS_SEPOLIA,
  }
}

let _pub: ReturnType<typeof makePub> | undefined
const makePub = () => createPublicClient({ chain: sepolia, transport: http(ensConfig().rpc) })
/** Read-only Sepolia client (no keys needed). */
export const ensPublic = () => (_pub ??= makePub())

let _admin: ReturnType<typeof makeAdmin> | undefined
const makeAdmin = () => {
  const pk = process.env.ENS_ADMIN_PK?.trim()
  if (!pk) throw new Error("Missing env var ENS_ADMIN_PK (see .env.example)")
  const account = privateKeyToAccount(pk as Hex)
  return {
    wallet: createWalletClient({ chain: sepolia, transport: http(ensConfig().rpc), account }),
    address: account.address,
  }
}
/** ENS_ADMIN wallet on Sepolia (lazy; only needed for writes). */
export const ensAdmin = () => (_admin ??= makeAdmin())

const requireDeployed = () => {
  const c = ensConfig()
  if (!c.userRegistry || !c.resolver)
    throw new Error("ENS_USER_REGISTRY / ENS_RESOLVER not set; run scripts/ens-setup.ts first")
  return { ...c, userRegistry: c.userRegistry, resolver: c.resolver }
}

// ------------------------------------------------------------------ labels
/** Brands, officials and confusables nobody may claim under our parent. */
export const ENS_RESERVED_LABELS = new Set([
  // WhitePay / platform
  "whitepay", "white-pay", "wpay", "admin", "administrator", "root", "support", "help", "helpdesk", "official",
  "team", "staff", "security", "verify", "verified", "kyc", "billing", "payments", "pay", "wallet", "merchant",
  "merchants", "refund", "refunds", "api", "www", "mail", "app", "dev", "test", "null", "undefined", "system",
  "ens", "eth", "whitechain", "tether", "usdt", "usdc",
  // Indian payments + regulators
  "upi", "bhim", "npci", "rbi", "sebi", "paytm", "gpay", "googlepay", "phonepe", "amazonpay", "mobikwik",
  "freecharge", "cred", "razorpay", "cashfree", "payu", "billdesk", "sbi", "hdfc", "icici", "axis", "kotak",
  "yesbank", "pnb", "bankofbaroda",
  // big brands
  "google", "amazon", "flipkart", "apple", "microsoft", "meta", "facebook", "whatsapp", "instagram", "x",
  "twitter", "visa", "mastercard", "rupay", "paypal", "stripe", "jio", "reliance", "airtel", "tata", "infosys",
  "zomato", "swiggy", "uber", "ola", "binance", "coinbase", "wazirx", "coindcx",
  // officials
  "president", "primeminister", "pm", "pmo", "government", "gov", "govt", "india", "police", "court",
  "incometax", "gst", "tax", "uidai", "aadhaar",
])

export type LabelCheck = { label: string; name: string; available: boolean; reason?: string }

/** Pure syntactic + policy check (no RPC). Throws nothing; returns a reason when invalid. */
export function validateEnsLabel(input: string): { label: string; reason?: string } {
  let label: string
  try {
    label = normalize(input.trim())
  } catch {
    return { label: input, reason: "not a valid ENS label" }
  }
  if (label.includes(".")) return { label, reason: "single label only (no dots)" }
  if (label.length < 3 || label.length > 32) return { label, reason: "must be 3-32 characters" }
  if (!/^[a-z0-9-]+$/.test(label)) return { label, reason: "only a-z, 0-9 and '-' allowed" }
  if (label.startsWith("-") || label.endsWith("-")) return { label, reason: "cannot start or end with '-'" }
  if (label.includes("--")) return { label, reason: "no consecutive hyphens" }
  if (ENS_RESERVED_LABELS.has(label) || ENS_RESERVED_LABELS.has(label.replace(/-/g, "")))
    return { label, reason: "reserved name" }
  return { label }
}

/** Is `label` free under our parent's UserRegistry (validates format + reserved list first)? */
export async function isLabelAvailable(input: string): Promise<LabelCheck> {
  const c = ensConfig()
  const { label, reason } = validateEnsLabel(input)
  const name = `${label}.${c.parent}`
  if (reason) return { label, name, available: false, reason }
  if (!c.userRegistry) throw new Error("ENS_USER_REGISTRY not set; run scripts/ens-setup.ts first")
  const status = await ensPublic().readContract({
    address: c.userRegistry,
    abi: permissionedRegistryAbi,
    functionName: "getStatus",
    args: [BigInt(labelhash(label))],
  })
  return status === 0
    ? { label, name, available: true }
    : { label, name, available: false, reason: `already ${STATUS[status]?.toLowerCase() ?? "taken"}` }
}

// ------------------------------------------------------------------ writes
export const dnsEncode = (name: string): Hex => toHex(packetToBytes(name))

/** Encoded resolver calls: addr(1874), addr(60) and text records for one name. */
export function recordCalls(name: string, whitechainAddress: Address, text: Record<string, string> = {}): Hex[] {
  const dns = dnsEncode(name)
  const addr = getAddress(whitechainAddress)
  return [
    encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setAddress", args: [dns, WHITECHAIN_COIN_TYPE, addr] }),
    encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setAddress", args: [dns, ETH_COIN_TYPE, addr] }),
    ...Object.entries(text).map(([k, v]) =>
      encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setText", args: [dns, k, v] }),
    ),
  ]
}

export type IssuedSubname = { name: string; label: string; expiry: bigint; txHashes: Hash[] }

/**
 * Register `label.<parent>` in our UserRegistry (owner = `owner`, non-transferable, 1y expiry),
 * then write addr(1874) + addr(60) + text records to our PermissionedResolver in one multicall.
 */
export async function issueSubname(args: {
  label: string
  owner: Address
  whitechainAddress: Address
  text?: Record<string, string>
  /** seconds; default 1 year */
  duration?: bigint
}): Promise<IssuedSubname> {
  const c = requireDeployed()
  const check = await isLabelAvailable(args.label)
  if (!check.available) throw new Error(`${check.name}: ${check.reason}`)
  if (!isAddress(args.owner) || !isAddress(args.whitechainAddress)) throw new Error("invalid owner/whitechainAddress")

  const pub = ensPublic()
  const { wallet } = ensAdmin()
  const block = await pub.getBlock()
  const expiry = block.timestamp + (args.duration ?? ONE_YEAR)

  const regHash = await wallet.writeContract({
    address: c.userRegistry,
    abi: permissionedRegistryAbi,
    functionName: "register",
    args: [check.label, getAddress(args.owner), "0x0000000000000000000000000000000000000000", c.resolver, SUBNAME_OWNER_ROLES, expiry],
  })
  const reg = await pub.waitForTransactionReceipt({ hash: regHash })
  if (reg.status !== "success") throw new Error(`register reverted: ${regHash}`)

  const recHash = await wallet.writeContract({
    address: c.resolver,
    abi: permissionedResolverAbi,
    functionName: "multicall",
    args: [recordCalls(check.name, args.whitechainAddress, args.text)],
  })
  const rec = await pub.waitForTransactionReceipt({ hash: recHash })
  if (rec.status !== "success") throw new Error(`setRecords reverted: ${recHash}`)

  return { name: check.name, label: check.label, expiry, txHashes: [regHash, recHash] }
}

/** Revoke a subname (ENS_ADMIN holds ROLE_UNREGISTER at the registry root). Burns the token. */
export async function revokeSubname(input: string): Promise<Hash> {
  const c = requireDeployed()
  const label = normalize(input.trim()).split(".")[0]
  const hash = await ensAdmin().wallet.writeContract({
    address: c.userRegistry,
    abi: permissionedRegistryAbi,
    functionName: "unregister",
    args: [BigInt(labelhash(label))],
  })
  const r = await ensPublic().waitForTransactionReceipt({ hash })
  if (r.status !== "success") throw new Error(`unregister reverted: ${hash}`)
  return hash
}

// ------------------------------------------------------------------ reads (Universal Resolver via viem)
/** Live ENS lookup: Whitechain (chain 1874) address of `name`, or null. */
export async function resolveName(name: string): Promise<Address | null> {
  const addr = await ensPublic().getEnsAddress({ name: normalize(name), coinType: WHITECHAIN_COIN_TYPE })
  return addr && isAddress(addr) ? getAddress(addr) : null
}

export const DEFAULT_TEXT_KEYS = ["display", "kind", "verified", "avatar", "url", "description"] as const

export async function getTexts(name: string, keys: readonly string[] = DEFAULT_TEXT_KEYS): Promise<Record<string, string | null>> {
  const n = normalize(name)
  const pub = ensPublic()
  const vals = await Promise.all(keys.map((key) => pub.getEnsText({ name: n, key }).catch(() => null)))
  return Object.fromEntries(keys.map((k, i) => [k, vals[i]]))
}

/** Update one text record on a WhitePay name (e.g. verified=true after World ID). Admin-only. */
export async function setText(name: string, key: string, value: string): Promise<Hash> {
  const c = requireDeployed()
  const { wallet } = ensAdmin()
  const hash = await wallet.writeContract({
    address: c.resolver,
    abi: permissionedResolverAbi,
    functionName: "setText",
    args: [dnsEncode(normalize(name)), key, value],
  })
  const r = await ensPublic().waitForTransactionReceipt({ hash })
  if (r.status !== "success") throw new Error(`setText reverted: ${hash}`)
  return hash
}

/** Point an existing WhitePay name at a different wallet (Whitechain coinType + ETH). Admin-only.
 *  Used when one World ID moves its single personal name to another wallet it owns. */
export async function setWalletAddress(name: string, address: Address): Promise<Hash> {
  const c = requireDeployed()
  const { wallet } = ensAdmin()
  const hash = await wallet.writeContract({
    address: c.resolver,
    abi: permissionedResolverAbi,
    functionName: "multicall",
    args: [recordCalls(normalize(name), getAddress(address))],
  })
  const r = await ensPublic().waitForTransactionReceipt({ hash })
  if (r.status !== "success") throw new Error(`setAddress reverted: ${hash}`)
  return hash
}
