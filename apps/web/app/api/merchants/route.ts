// Merchant sign-up (POST) and lookup (GET ?address= | ?label=).
import { isAddress, isHex, type Address, type Hex } from "viem"
import { registerMerchant, getMerchantByAddress, getMerchantByLabel, validateLabel, wc, config } from "@whitepay/server"
import { REGISTRY_ABI } from "@whitepay/shared"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: Request) {
  const u = new URL(req.url)
  const address = u.searchParams.get("address")
  const label = u.searchParams.get("label")
  try {
    if (label) {
      const bad = validateLabel(label.toLowerCase())
      const existing = bad ? null : await getMerchantByLabel(label)
      return json({ available: !bad && !existing, reason: bad ?? (existing ? "taken" : null), merchant: existing })
    }
    if (!address || !isAddress(address)) return json({ error: "pass ?address= or ?label=" }, { status: 400 })
    const [profile, onchain] = await Promise.all([
      getMerchantByAddress(address as Address),
      wc().pub.readContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "get", args: [address as Address] }),
    ])
    // the on-chain registry is the source of truth for active/verified
    return json({ merchant: profile && { ...profile, active: onchain.active, verified: onchain.active && onchain.verified } })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { label: string; displayName: string; category?: string; address: string; issuedAt: number; signature: string }
    if (!isAddress(b.address) || !isHex(b.signature)) return json({ error: "malformed sign-up" }, { status: 400 })
    const m = await registerMerchant({
      label: String(b.label ?? ""),
      displayName: String(b.displayName ?? ""),
      category: b.category ? String(b.category) : undefined,
      address: b.address as Address,
      issuedAt: Number(b.issuedAt),
      signature: b.signature as Hex,
    })
    return json({ merchant: m })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 400 })
  }
}
