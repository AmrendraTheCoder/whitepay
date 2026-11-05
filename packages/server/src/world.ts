// World ID (IDKit 4) — backend only. Proofs are ALWAYS verified here, never trusted from the client.
//  - "ens-claim" (uniqueness): one human -> one verified shop / one name. Nullifier stored on Arkiv.
//  - "step-up": fresh human check before a payment above LIMITS.stepUpThreshold; bound to the payment
//    via the signal, exchanged for a short-lived HMAC token the pay/send routes accept.
import { createHmac, timingSafeEqual } from "node:crypto"
import { ExpirationTime } from "@arkiv-network/sdk"
import { addr, u64 } from "@arkiv-network/sdk/schema"
import { and, eq } from "@arkiv-network/sdk/query"
import { signRequest } from "@worldcoin/idkit/signing"
import { hashSignal } from "@worldcoin/idkit/hashing"
import { getAddress, verifyMessage, type Address, type Hex } from "viem"
import { WorldClaim, MerchantProfile } from "@whitepay/shared/arkiv"
import { REGISTRY_ABI, stepUpSignal, nameClaimMessage } from "@whitepay/shared"
import { arkiv, wc } from "./clients"
import { config } from "./config"

export const WORLD_ACTIONS = { claim: "ens-claim", stepUp: "step-up" } as const
type Action = (typeof WORLD_ACTIONS)[keyof typeof WORLD_ACTIONS]

const env = () => {
  const appId = process.env.WORLD_APP_ID
  const rpId = process.env.WORLD_RP_ID
  const key = process.env.RP_SIGNING_KEY
  if (!appId || !rpId || !key) throw new Error("World ID is not configured (WORLD_APP_ID, WORLD_RP_ID, RP_SIGNING_KEY)")
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("RP_SIGNING_KEY must be 0x + 64 hex chars (a private key, not an address)")
  return { appId, rpId, key, environment: (process.env.WORLD_ENV as "staging" | "production") || "staging" }
}

export const worldConfigured = () => {
  try { env(); return true } catch { return false }
}

/** RP context for the IDKit widget (backend-signed nonce; 5 min TTL). */
export function rpContext(action: Action) {
  const e = env()
  const s = signRequest({ signingKeyHex: e.key, action, ttl: 300 })
  return {
    app_id: e.appId as `app_${string}`,
    environment: e.environment,
    rp_context: { rp_id: e.rpId, nonce: s.nonce, created_at: s.createdAt, expires_at: s.expiresAt, signature: s.sig },
  }
}

type V4Item = { identifier: string; signal_hash?: string; nullifier: string }
type IDKitResultLike = { protocol_version?: string; action?: string; nonce?: string; responses?: V4Item[] }

/** Verify a proof with the Developer Portal and check it is bound to `signal` and `action`. */
export async function verifyProof(result: IDKitResultLike, action: Action, signal: string) {
  const e = env()
  if (!result || result.action !== action) throw new Error("proof is for a different action")
  const res = await fetch(`https://developer.world.org/api/v4/verify/${e.rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result),
  })
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; environment?: string; code?: string; detail?: string }
  if (!res.ok || !body.success) throw new Error(`World ID rejected the proof: ${body.code ?? body.detail ?? res.status}`)
  if (body.environment && body.environment !== e.environment) throw new Error(`proof environment ${body.environment} != ${e.environment}`)

  const item = result.responses?.[0]
  if (!item?.nullifier) throw new Error("proof has no nullifier")
  const expected = hashSignal(signal).toLowerCase()
  if (!item.signal_hash || item.signal_hash.toLowerCase() !== expected) throw new Error("proof is not bound to this wallet/payment")
  return { nullifier: item.nullifier }
}

// ------------------------------------------------------------ uniqueness
async function claimFor(nullifier: string) {
  const a = arkiv()
  const page = await a.pub
    .select({ $key: true, address: true })
    .from(WorldClaim)
    .ownedBy(a.owner)
    .where(and(eq("action", WORLD_ACTIONS.claim), eq("nullifier", nullifier), eq("purpose", "merchant-verify")))
    .limit(1)
    .fetch()
  return page.entities[0] as { $key: Hex; address: { value: string } } | undefined
}

/** Merchant owner proves they are a unique human -> shop gets the verified badge (registry + Arkiv + ENS). */
export async function verifyMerchantHuman(merchant: Address, result: IDKitResultLike) {
  merchant = getAddress(merchant)
  const { nullifier } = await verifyProof(result, WORLD_ACTIONS.claim, merchant)

  const existing = await claimFor(nullifier)
  if (existing && getAddress(existing.address.value) !== merchant)
    throw new Error("This person has already verified another WhitePay shop (one shop per human)")

  const m = await wc().pub.readContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "get", args: [merchant] })
  if (!m.active) throw new Error("Register the shop first")

  const a = arkiv()
  if (!existing) {
    await a.writer.createEntity(
      WorldClaim,
      { action: WORLD_ACTIONS.claim, nullifier, address: addr(merchant), purpose: "merchant-verify", verifiedAt: u64(BigInt(Math.floor(Date.now() / 1000))) },
      { expiration: ExpirationTime.max() },
      { gas: 1_500_000n },
    )
  }

  let registryTx: Hex | undefined
  if (!m.verified) {
    registryTx = await wc().admin().writeContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "setStatus", args: [merchant, true, true] })
    await wc().pub.waitForTransactionReceipt({ hash: registryTx })
  }

  // mirror the badge into the Arkiv directory and ENS text record (best effort)
  const prof = await a.pub.select({ $key: true, ensName: true }).from(MerchantProfile).ownedBy(a.owner).where(eq("address", addr(merchant))).limit(1).fetch()
  const pk = (prof.entities[0] as any)?.$key as Hex | undefined
  if (pk) await a.writer.patchEntity(MerchantProfile, pk, { set: { verified: true } }, { gas: 1_000_000n }).catch(() => {})
  const ensName = (prof.entities[0] as any)?.ensName?.value as string | undefined
  if (ensName && process.env.ENS_RESOLVER) {
    const ens: any = await import("./ens").catch(() => null)
    await ens?.setText?.(ensName, "verified", "true").catch?.(() => {})
  }
  return { verified: true, registryTx }
}

/** Personal ENS name (UPI VPA): one name per human. Requires a wallet signature AND a World ID proof
 *  bound to the same wallet; the nullifier is recorded on Arkiv so the human can't claim twice. */
export async function claimPersonName(p: { label: string; address: Address; issuedAt: number; signature: Hex; result: IDKitResultLike }) {
  const address = getAddress(p.address)
  const label = p.label.trim().toLowerCase()
  if (Math.abs(Date.now() / 1000 - p.issuedAt) > 600) throw new Error("Claim expired, try again")
  if (!(await verifyMessage({ address, message: nameClaimMessage({ label, address, issuedAt: p.issuedAt }), signature: p.signature })))
    throw new Error("Signature does not match the wallet")
  const ens: any = await import("./ens")
  const check = await ens.isLabelAvailable(label)
  if (!check.available) throw new Error(`${check.name}: ${check.reason}`)

  const { nullifier } = await verifyProof(p.result, WORLD_ACTIONS.claim, address)
  const a = arkiv()
  const prior = await a.pub
    .select({ $key: true, address: true, purpose: true })
    .from(WorldClaim)
    .ownedBy(a.owner)
    .where(and(eq("action", WORLD_ACTIONS.claim), eq("nullifier", nullifier), eq("purpose", "name-claim")))
    .limit(1)
    .fetch()
  if (prior.entities.length) throw new Error("This person already claimed a WhitePay name (one name per human)")

  const issued = await ens.issueSubname({ label, owner: address, whitechainAddress: address, text: { kind: "person", verified: "true" } })
  await a.writer.createEntity(
    WorldClaim,
    { action: WORLD_ACTIONS.claim, nullifier, address: addr(address), purpose: "name-claim", verifiedAt: u64(BigInt(Math.floor(Date.now() / 1000))) },
    { expiration: ExpirationTime.max() },
    { gas: 1_500_000n },
  )
  return { name: issued.name as string, txHashes: issued.txHashes as Hex[] }
}

// ---------------------------------------------------------------- step-up
const secret = () => process.env.WEBHOOK_SECRET || process.env.RP_SIGNING_KEY || "dev-only-secret"
const sign = (msg: string) => createHmac("sha256", secret()).update(msg).digest("hex")


export async function verifyStepUp(payer: Address, paymentRef: Hex, result: IDKitResultLike) {
  await verifyProof(result, WORLD_ACTIONS.stepUp, stepUpSignal(payer, paymentRef))
  const exp = Math.floor(Date.now() / 1000) + 300
  const body = `${stepUpSignal(payer, paymentRef)}:${exp}`
  return { token: `${exp}.${sign(body)}`, expiresAt: exp }
}

export function checkStepUpToken(token: string | undefined, payer: Address, paymentRef: Hex): boolean {
  if (!token) return false
  const [expStr, mac] = token.split(".")
  const exp = Number(expStr)
  if (!exp || exp < Date.now() / 1000 || !mac) return false
  const expected = sign(`${stepUpSignal(payer, paymentRef)}:${exp}`)
  const a = Buffer.from(mac, "hex")
  const b = Buffer.from(expected, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}
