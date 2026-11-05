// Merchant sign-up (UPI: merchant onboarding by the acquiring PSP).
//  1. The merchant's device signs a sign-up message (proves it controls the address; non-custodial).
//  2. WhitePay registers it in MerchantRegistry on Whitechain: payout = signer = the merchant's own key.
//  3. A public profile is written to Arkiv (the merchant directory payers see before paying).
//  4. If ENS is configured, the merchant gets <label>.<parent> on ENSv2 Sepolia.
// New merchants start UNVERIFIED; the verified badge is granted after World ID (see world.ts).
import { ExpirationTime } from "@arkiv-network/sdk"
import { addr, u64 } from "@arkiv-network/sdk/schema"
import { eq } from "@arkiv-network/sdk/query"
import { getAddress, namehash, verifyMessage, zeroAddress, type Address, type Hex } from "viem"
import { MerchantProfile } from "@whitepay/shared/arkiv"
import { LABEL_RE, REGISTRY_ABI, merchantSignupMessage } from "@whitepay/shared"
import { arkiv, wc } from "./clients"
import { config } from "./config"

export const RESERVED_LABELS = new Set([
  "admin", "support", "help", "whitepay", "wallet", "pay", "payments", "official", "team", "security",
  "paytm", "gpay", "googlepay", "phonepe", "bhim", "upi", "npci", "rbi", "sbi", "hdfc", "icici", "axis",
  "google", "amazon", "flipkart", "apple", "meta", "binance", "coinbase", "tether", "usdt", "whitechain",
  "government", "gov", "president", "pm", "police", "income-tax", "refund", "customer-care",
])

export type MerchantView = {
  address: Address
  label: string
  ensName: string
  displayName: string
  category?: string
  verified: boolean
  registeredAt: number
  profileKey: Hex
}

const v = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x)
const toView = (e: any): MerchantView => ({
  address: getAddress(v(e.address)),
  label: v(e.label),
  ensName: v(e.ensName),
  displayName: v(e.displayName),
  category: v(e.category),
  verified: !!v(e.verified),
  registeredAt: Number(v(e.registeredAt)),
  profileKey: e.$key,
})

async function findProfile(field: "address" | "label", value: string) {
  const a = arkiv()
  const q = a.pub
    .select({ $key: true, address: true, label: true, ensName: true, displayName: true, category: true, verified: true, registeredAt: true })
    .from(MerchantProfile)
    .ownedBy(a.owner)
  const page = await (field === "address" ? q.where(eq("address", addr(value as Address))) : q.where(eq("label", value)))
    .limit(1)
    .fetch()
  return page.entities.length ? toView(page.entities[0]) : null
}

export const getMerchantByAddress = (address: Address) => findProfile("address", address)
export const getMerchantByLabel = (label: string) => findProfile("label", label.toLowerCase())

export function validateLabel(label: string): string | null {
  if (!LABEL_RE.test(label)) return "Handle must be 3-32 characters: a-z, 0-9 and hyphens"
  if (label.includes("--")) return "Handle can't contain --"
  if (RESERVED_LABELS.has(label)) return "That handle is reserved"
  return null
}

export async function registerMerchant(p: {
  label: string
  displayName: string
  category?: string
  address: Address
  issuedAt: number
  signature: Hex
}): Promise<MerchantView & { registryTx: Hex; ensTx?: Hex[] }> {
  const label = p.label.trim().toLowerCase()
  const displayName = p.displayName.trim().slice(0, 60)
  const bad = validateLabel(label)
  if (bad) throw new Error(bad)
  if (!displayName) throw new Error("Business name is required")
  if (Math.abs(Date.now() / 1000 - p.issuedAt) > 600) throw new Error("Sign-up request expired, try again")

  const address = getAddress(p.address)
  const message = merchantSignupMessage({ label, displayName, address, issuedAt: p.issuedAt })
  if (!(await verifyMessage({ address, message, signature: p.signature }))) throw new Error("Signature does not match the address")

  if (await getMerchantByLabel(label)) throw new Error("That handle is taken")
  const onchain = await wc().pub.readContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "get", args: [address] })
  if (onchain.payout !== zeroAddress) throw new Error("This wallet is already a merchant")

  const ensName = `${label}.${config.ensParent}`
  // optional ENS issuance (module provided by ens.ts once ENS is configured)
  let ensTx: Hex[] | undefined
  if (process.env.ENS_USER_REGISTRY && process.env.ENS_RESOLVER) {
    const ens: any = await import("./ens").catch(() => null)
    if (ens?.issueSubname) {
      const r = await ens.issueSubname({
        label,
        owner: address,
        whitechainAddress: address,
        text: { display: displayName, kind: "merchant", verified: "false", ...(p.category ? { category: p.category } : {}) },
      })
      ensTx = r.txHashes
    }
  }

  // on-chain registration: payout and order signer are the merchant's own key
  const admin = wc().admin()
  const registryTx = await admin.writeContract({
    address: config.registry,
    abi: REGISTRY_ABI,
    functionName: "register",
    args: [address, address, address, namehash(ensName)],
  })
  const rcpt = await wc().pub.waitForTransactionReceipt({ hash: registryTx })
  if (rcpt.status !== "success") throw new Error("MerchantRegistry.register reverted")

  const now = Math.floor(Date.now() / 1000)
  const created = await arkiv().writer.createEntity(
    MerchantProfile,
    {
      address: addr(address),
      label,
      ensName,
      displayName,
      ...(p.category ? { category: p.category.slice(0, 60) } : {}),
      registeredAt: u64(BigInt(now)),
      verified: false,
      registryTx,
    },
    { expiration: ExpirationTime.max() },
    { gas: 1_500_000n },
  )
  return { address, label, ensName, displayName, category: p.category, verified: false, registeredAt: now, profileKey: created.entityKey, registryTx, ensTx }
}
