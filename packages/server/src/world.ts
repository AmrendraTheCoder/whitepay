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
import { WorldClaim, MerchantProfile, PersonProfile } from "@whitepay/shared/arkiv"
import { REGISTRY_ABI, stepUpSignal, nameClaimMessage, linkAccountMessage, linkShopMessage } from "@whitepay/shared"
import { arkiv, wc } from "./clients"
import { currentEnsName } from "./merchants"
import { config } from "./config"

// Actions must exist in the World Developer Portal (World App rejects unknown ones).
//  - whitepay-name: personal names, up to MAX_ACCOUNTS_PER_HUMAN wallets per human (extra wallets via co-sign)
//  - whitepay-shop: verified shops, same limit (extra shops via co-sign)
//  - whitepay-pay:  step-up for large payments     (max verifications: unlimited)
//    Each step-up proof is bound to ONE payment through its signal (payer + payment ref),
//    so a proof can't be reused for a different payment even though the action is shared.
export const WORLD_ACTIONS = {
  claim: "whitepay-name",
  shop: "whitepay-shop",
  stepUp: (_paymentRef?: string) => "whitepay-pay",
  /** Refund requests. Needs "unlimited" max verifications in the Developer Portal (one proof per request).
   *  Set WORLD_REFUND_ACTION=whitepay-refund once that action exists; until then the unlimited step-up
   *  action is reused (each proof is still bound to one refund case through its signal). */
  refund: process.env.WORLD_REFUND_ACTION || "whitepay-pay",
} as const
type Action = string
export const ACTION_DESCRIPTIONS: Record<string, string> = {
  "whitepay-name": "Claim your WondrPay name (one per person)",
  "whitepay-shop": "Verify that a real person runs this WondrPay shop",
  "whitepay-pay": "Confirm a large WondrPay payment",
  "whitepay-refund": "Request a refund on WondrPay (one human, verified)",
}
export const describeAction = (a: string) => ACTION_DESCRIPTIONS[a] ?? "Confirm this WondrPay payment"

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
export function rpContext(action: Action, description?: string) {
  const e = env()
  const s = signRequest({ signingKeyHex: e.key, action, ttl: 300 })
  return {
    action,
    action_description: description ?? describeAction(action),
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
  if (!res.ok || !body.success) {
    console.error("[world] portal verify failed", res.status, JSON.stringify(body).slice(0, 500))
    throw new Error(`World ID rejected the proof: ${body.code ?? body.detail ?? res.status}`)
  }
  if (body.environment && body.environment !== e.environment)
    throw new Error(`World ID ${body.environment} proof, but server expects ${e.environment} (set WORLD_ENV)`)

  const item = result.responses?.[0]
  if (!item?.nullifier) throw new Error("proof has no nullifier")
  const expected = hashSignal(signal).toLowerCase()
  if (!item.signal_hash || item.signal_hash.toLowerCase() !== expected) throw new Error("proof is not bound to this wallet/payment")
  return { nullifier: item.nullifier }
}

// ------------------------------------------------------------ uniqueness
/** One verified human may run several wallets (personal accounts and shops), like having more than
 *  one bank account, but not unlimited ones: still Sybil-resistant, every account traces to the
 *  same World ID nullifier. */
export const MAX_ACCOUNTS_PER_HUMAN = 5

/** Wallets this human (nullifier) has already verified for a purpose. */
async function claimsFor(nullifier: string, action: string, purpose: "merchant-verify" | "name-claim") {
  const a = arkiv()
  const page = await a.pub
    .select({ $key: true, address: true })
    .from(WorldClaim)
    .ownedBy(a.owner)
    .where(and(eq("action", action), eq("nullifier", nullifier), eq("purpose", purpose)))
    .limit(100)
    .fetch()
  return (page.entities as any[]).map((e) => ({ key: e.$key as Hex, address: getAddress(e.address.value as string) }))
}

/** Merchant owner proves they are a unique human -> shop gets the verified badge (registry + Arkiv + ENS). */
export async function verifyMerchantHuman(merchant: Address, result: IDKitResultLike, defer: Defer = runNow) {
  merchant = getAddress(merchant)
  const { nullifier } = await verifyProof(result, WORLD_ACTIONS.shop, merchant)
  return markMerchantVerified(merchant, nullifier, defer)
}

/** Verify another shop of an already-verified human: a World-verified wallet (shop or personal) and
 *  the shop wallet both sign; the shop is counted against that human's limit. No second World ID scan. */
export async function verifyMerchantByLink(
  p: { merchant: Address; from: Address; issuedAt: number; signature: Hex; fromSignature: Hex },
  defer: Defer = runNow,
) {
  const merchant = getAddress(p.merchant), from = getAddress(p.from)
  if (merchant === from) throw new Error("Pick a different wallet")
  if (Math.abs(Date.now() / 1000 - p.issuedAt) > 600) throw new Error("Request expired, try again")
  const msg = linkShopMessage({ from, shop: merchant, issuedAt: p.issuedAt })
  if (!(await verifyMessage({ address: merchant, message: msg, signature: p.signature }))) throw new Error("Signature does not match the shop wallet")
  if (!(await verifyMessage({ address: from, message: msg, signature: p.fromSignature }))) throw new Error("The verified wallet didn't approve this")
  const a = arkiv()
  const src = await a.pub.select({ $key: true, nullifier: true, action: true }).from(WorldClaim).ownedBy(a.owner).where(eq("address", addr(from))).limit(10).fetch()
  const c = (src.entities as any[]).find((e) => e.action?.value === WORLD_ACTIONS.shop) ?? src.entities[0] as any
  if (!c?.nullifier?.value) throw new Error("That wallet isn't World ID verified yet. Verify it first.")
  // nullifiers are per World action: keep the human key stable across the two actions
  const key = c.action.value === WORLD_ACTIONS.shop ? c.nullifier.value : `${c.action.value}:${c.nullifier.value}`
  return markMerchantVerified(merchant, key, defer)
}

async function markMerchantVerified(merchant: Address, nullifier: string, defer: Defer) {

  const claims = await claimsFor(nullifier, WORLD_ACTIONS.shop, "merchant-verify")
  const existing = claims.find((c) => c.address === merchant)
  if (!existing && claims.length >= MAX_ACCOUNTS_PER_HUMAN)
    throw new Error(`This World ID already verified ${claims.length} shops, the limit per person`)

  const m = await wc().pub.readContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "get", args: [merchant] })
  if (!m.active) throw new Error("Register the shop first")

  const a = arkiv()
  if (!existing) {
    await a.writer.createEntity(
      WorldClaim,
      { action: WORLD_ACTIONS.shop, nullifier, address: addr(merchant), purpose: "merchant-verify", verifiedAt: u64(BigInt(Math.floor(Date.now() / 1000))) },
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
  const ensName = currentEnsName((prof.entities[0] as any)?.ensName?.value as string | undefined) || undefined
  if (ensName && process.env.ENS_RESOLVER) {
    defer(async () => {
      const ens: any = await import("./ens").catch(() => null)
      await ens?.setText?.(ensName, "verified", "true").catch?.(() => {})
    })
  }
  return { verified: true, registryTx }
}

/** Personal ENS name (UPI VPA): ONE username per human, shared by up to MAX_ACCOUNTS_PER_HUMAN wallets;
 *  a wallet never has more than one username. Requires a wallet signature AND a World ID proof
 *  bound to the same wallet; the nullifier is recorded on Arkiv so the human can't claim twice. */
/** Schedules slow work (ENS txs ~25 s) after the HTTP response; Next passes `after`. */
export type Defer = (task: () => Promise<unknown>) => void
const runNow: Defer = (t) => { void t() }

export async function getPersonByAddress(address: Address) {
  const a = arkiv()
  const page = await a.pub
    .select({ $key: true, label: true, ensName: true, ensIssued: true })
    .from(PersonProfile).ownedBy(a.owner).where(eq("address", addr(getAddress(address)))).limit(1).fetch()
  const e = page.entities[0] as any
  return e ? { key: e.$key as Hex, label: e.label.value as string, ensName: currentEnsName(e.ensName.value as string), ensIssued: !!e.ensIssued?.value } : null
}

/** Personal ENS name (UPI VPA): ONE username per human, shared by up to MAX_ACCOUNTS_PER_HUMAN wallets;
 *  a wallet never has more than one username. Requires a wallet signature AND a World ID proof
 *  bound to the same wallet. Responds as soon as the proof is verified and recorded on Arkiv
 *  (a few seconds, so World's widget doesn't time out); the ENSv2 subname is issued right after. */
export async function claimPersonName(
  p: { label: string; address: Address; issuedAt: number; signature: Hex; result: IDKitResultLike },
  defer: Defer = runNow,
) {
  const address = getAddress(p.address)
  const label = p.label.trim().toLowerCase()
  if (Math.abs(Date.now() / 1000 - p.issuedAt) > 600) throw new Error("Claim expired, try again")
  if (!(await verifyMessage({ address, message: nameClaimMessage({ label, address, issuedAt: p.issuedAt }), signature: p.signature })))
    throw new Error("Signature does not match the wallet")

  const existing = await getPersonByAddress(address)
  if (existing) return { name: existing.ensName, pending: !existing.ensIssued, already: true }

  const ens: any = await import("./ens")
  const { nullifier } = await verifyProof(p.result, WORLD_ACTIONS.claim, address)
  const a = arkiv()
  // One username per human, many wallets per username: if this World ID already has a name,
  // this wallet JOINS it (the requested label is ignored) instead of getting a second name.
  const claims = await claimsFor(nullifier, WORLD_ACTIONS.claim, "name-claim")
  const alreadyClaimed = claims.some((c) => c.address === address)
  for (const c of claims) {
    if (c.address === address) continue
    const named = await getPersonByAddress(c.address)
    if (named) {
      if (claims.length >= MAX_ACCOUNTS_PER_HUMAN) throw new Error(`${named.ensName} already has ${claims.length} wallets, the limit per person`)
      return attachWallet({ address, nullifier, profile: named, recordClaim: !alreadyClaimed })
    }
  }

  return issuePersonName({ label, address, nullifier, recordClaim: !alreadyClaimed }, defer)
}

/** Add another wallet for an already-verified human: the verified wallet co-signs, no new World ID scan.
 *  Both wallets prove control (signatures); the new wallet inherits the SAME nullifier, so the
 *  per-human limit still counts it. */
export async function linkPersonName(
  p: { label: string; address: Address; issuedAt: number; signature: Hex; from: Address; fromSignature: Hex },
  defer: Defer = runNow,
) {
  const address = getAddress(p.address)
  const from = getAddress(p.from)
  const label = p.label.trim().toLowerCase()
  if (address === from) throw new Error("Pick a different wallet to add")
  if (Math.abs(Date.now() / 1000 - p.issuedAt) > 600) throw new Error("Request expired, try again")
  if (!(await verifyMessage({ address, message: nameClaimMessage({ label, address, issuedAt: p.issuedAt }), signature: p.signature })))
    throw new Error("Signature does not match the new wallet")
  if (!(await verifyMessage({ address: from, message: linkAccountMessage({ from, to: address, label, issuedAt: p.issuedAt }), signature: p.fromSignature })))
    throw new Error("The verified wallet didn't approve this")

  const existing = await getPersonByAddress(address)
  if (existing) return { name: existing.ensName, pending: !existing.ensIssued, already: true }

  const a = arkiv()
  const src = await a.pub.select({ $key: true, nullifier: true }).from(WorldClaim).ownedBy(a.owner)
    .where(and(eq("action", WORLD_ACTIONS.claim), eq("address", addr(from)), eq("purpose", "name-claim"))).limit(1).fetch()
  const nullifier = (src.entities[0] as any)?.nullifier?.value as string | undefined
  if (!nullifier) throw new Error("That wallet isn't World ID verified yet. Verify it first.")
  const profile = await getPersonByAddress(from)
  if (!profile) throw new Error("That wallet has no WondrPay name yet. Claim one first.")
  // both wallets signed THIS username: the new wallet joins it, it never gets a different one
  if (label !== profile.label) throw new Error(`This wallet would join ${profile.ensName}; refresh and try again`)
  const claims = await claimsFor(nullifier, WORLD_ACTIONS.claim, "name-claim")
  if (claims.length >= MAX_ACCOUNTS_PER_HUMAN) throw new Error(`${profile.ensName} already has ${claims.length} wallets, the limit per person`)
  return attachWallet({ address, nullifier, profile, recordClaim: true })
}

/** Add a wallet to an existing username (one name -> many wallets). The ENS name keeps resolving to the
 *  wallet that first claimed it; every attached wallet shows the name and counts toward the human's limit. */
async function attachWallet(p: { address: Address; nullifier: string; profile: { label: string; ensName: string; ensIssued: boolean }; recordClaim: boolean }) {
  const a = arkiv()
  const now = u64(BigInt(Math.floor(Date.now() / 1000)))
  await a.writer.executeBatch(
    {
      creates: [
        ...(!p.recordClaim ? [] : [{ schema: WorldClaim, values: { action: WORLD_ACTIONS.claim, nullifier: p.nullifier, address: addr(p.address), purpose: "name-claim", verifiedAt: now }, expiration: ExpirationTime.max() }]),
        { schema: PersonProfile, values: { address: addr(p.address), label: p.profile.label, ensName: p.profile.ensName, registeredAt: now, ensIssued: p.profile.ensIssued }, expiration: ExpirationTime.max() },
      ],
    } as any,
    { gas: 2_500_000n },
  )
  return { name: p.profile.ensName, pending: false, attached: true }
}

/** Record the verified wallet on Arkiv, then issue <label>.<parent> on ENSv2 after the response. */
async function issuePersonName(p: { label: string; address: Address; nullifier: string; recordClaim: boolean }, defer: Defer) {
  const { label, address, nullifier } = p
  const ens: any = await import("./ens")
  const a = arkiv()
  const check = await ens.isLabelAvailable(label)
  if (!check.available) throw new Error(`${check.name}: ${check.reason}`)

  // record the claim + directory entry in ONE Arkiv batch (fast, ~2 s)
  const now = u64(BigInt(Math.floor(Date.now() / 1000)))
  const ensName = check.name as string
  const res = await a.writer.executeBatch(
    {
      creates: [
        ...(!p.recordClaim ? [] : [{ schema: WorldClaim, values: { action: WORLD_ACTIONS.claim, nullifier, address: addr(address), purpose: "name-claim", verifiedAt: now }, expiration: ExpirationTime.max() }]),
        { schema: PersonProfile, values: { address: addr(address), label, ensName, registeredAt: now, ensIssued: false }, expiration: ExpirationTime.max() },
      ],
    } as any,
    { gas: 2_500_000n },
  )
  const profileKey = res.createdEntities[res.createdEntities.length - 1] as Hex

  // slow part after the response: ENSv2 subname (2 Sepolia txs), then mark issued
  defer(async () => {
    try {
      await ens.issueSubname({ label, owner: address, whitechainAddress: address, text: { kind: "person", verified: "true" } })
      await a.writer.patchEntity(PersonProfile, profileKey, { set: { ensIssued: true } }, { gas: 1_000_000n })
    } catch (e) {
      console.error("[world] ENS issue failed for", ensName, (e as Error).message)
    }
  })
  return { name: ensName, pending: true }
}

// ---------------------------------------------------------------- step-up
const secret = () => process.env.WEBHOOK_SECRET || process.env.RP_SIGNING_KEY || "dev-only-secret"
const sign = (msg: string) => createHmac("sha256", secret()).update(msg).digest("hex")


export async function verifyStepUp(payer: Address, paymentRef: Hex, result: IDKitResultLike) {
  await verifyProof(result, WORLD_ACTIONS.stepUp(paymentRef), stepUpSignal(payer, paymentRef))
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

/** What this wallet has already proven with World ID (read from Arkiv + the on-chain registry). */
export async function worldStatus(address: Address) {
  address = getAddress(address)
  const a = arkiv()
  const [claims, m] = await Promise.all([
    a.pub.select({ $key: true, purpose: true, verifiedAt: true }).from(WorldClaim).ownedBy(a.owner).where(eq("address", addr(address))).limit(10).fetch(),
    wc().pub.readContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "get", args: [address] }),
  ])
  const purposes = (claims.entities as any[]).map((e) => e.purpose?.value as string)
  return {
    nameVerified: purposes.includes("name-claim"),
    shopRegistered: m.active,
    shopVerified: m.active && m.verified,
  }
}
