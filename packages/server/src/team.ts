// WondrPay for Business, phase 3: teammates. The shop owner adds a teammate's wallet as a "developer"; that wallet
// may then sign the day-to-day actions (new secret key, payment links, test/resend webhooks). Owner only: adding or
// switching off websites (they change the on-chain order signer) and changing the team.
import { ExpirationTime } from "@arkiv-network/sdk"
import { addr, u64 } from "@arkiv-network/sdk/schema"
import { and, eq } from "@arkiv-network/sdk/query"
import { getAddress, hexToBytes, verifyMessage, type Address, type Hex } from "viem"
import { ShopMember } from "@whitepay/shared/arkiv"
import { teamMessage } from "@whitepay/shared"
import { arkiv } from "./clients"
import { cached, invalidate } from "./cache"
import { SiteError, serialShop, revokeKeysMadeBy } from "./sites"
import { getMerchantByAddress } from "./merchants"

const now = () => Math.floor(Date.now() / 1000)
const v = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x)
export const MAX_TEAM = 10
export type Role = "owner" | "developer"
export type MemberView = { merchant: Address; member: Address; role: "developer"; status: "active" | "removed"; label?: string; createdAt: number; updatedAt: number }
type MemberRow = MemberView & { key: Hex }

const FIELDS = { $key: true, merchant: true, member: true, role: true, status: true, label: true, createdAt: true, updatedAt: true } as const
const rowOf = (e: any): MemberRow => ({ key: e.$key, merchant: getAddress(v(e.merchant)), member: getAddress(v(e.member)), role: "developer", status: v(e.status),
  label: v(e.label) || undefined, createdAt: Number(v(e.createdAt)), updatedAt: Number(v(e.updatedAt)) })

/** Newest row per teammate (two concurrent adds can leave a duplicate; the newest one is the truth). */
const newestPerMember = (rows: MemberRow[]) => {
  const best = new Map<string, MemberRow>()
  for (const r of rows) { const b = best.get(r.member); if (!b || r.updatedAt > b.updatedAt) best.set(r.member, r) }
  return [...best.values()]
}

export async function listTeam(merchant: Address): Promise<MemberView[]> {
  const a = arkiv()
  const r = await a.pub.select(FIELDS).from(ShopMember).ownedBy(a.owner).where(eq("merchant", addr(getAddress(merchant)))).limit(50).fetch()
  return newestPerMember((r.entities as any[]).map(rowOf)).map(({ key: _k, ...m }) => m).sort((x, y) => y.createdAt - x.createdAt)
}

/** Shops where this wallet is an active developer (portal: "You're a developer at …"). */
export async function membershipsOf(member: Address) {
  const a = arkiv()
  const r = await a.pub.select(FIELDS).from(ShopMember).ownedBy(a.owner).where(eq("member", addr(getAddress(member)))).limit(40).fetch()
  const rows = newestPerMember((r.entities as any[]).map(rowOf)).filter((m) => m.status === "active")
  const live = (await Promise.all(rows.map(async (m) => ((await roleOf(m.merchant, m.member)) === "developer" ? m : null)))).filter(Boolean) as MemberRow[]
  return Promise.all(live.map(async (m) => {
    const shop = await getMerchantByAddress(m.merchant).catch(() => null)
    return { merchant: m.merchant, role: m.role, shopName: shop?.displayName, ensName: shop?.ensName }
  }))
}

async function memberRow(merchant: Address, member: Address): Promise<MemberRow | null> {
  const a = arkiv()
  const r = await a.pub.select(FIELDS).from(ShopMember).ownedBy(a.owner).where(and(eq("merchant", addr(merchant)), eq("member", addr(member)))).limit(5).fetch()
  const rows = (r.entities as any[]).map(rowOf).sort((x, y) => y.updatedAt - x.updatedAt)
  return rows[0] ?? null
}

/** Who may sign for this shop: the owner, or an active developer. Re-reads by key (the index can trail a removal). */
export async function roleOf(merchant: Address, actor: Address): Promise<Role | null> {
  merchant = getAddress(merchant); actor = getAddress(actor)
  if (merchant === actor) return "owner"
  return cached(`role:${merchant}:${actor}`, 3_000, async () => {
    const row = await memberRow(merchant, actor)
    if (!row) return null
    const fresh: any = await arkiv().pub.getEntity(row.key, ShopMember).catch(() => null)
    return fresh && v(fresh.status) === "active" ? ("developer" as const) : null
  })
}

/** Verify a wallet approval signed by `actor` (owner or developer) for an action on `merchant`'s shop. */
export async function checkActor(merchant: Address, actor: Address | undefined, message: string, signature: Hex, allow: Role[]) {
  const who = getAddress(actor ?? merchant)
  if (!(await verifyMessage({ address: who, message, signature }))) throw new SiteError("unauthorized", "The approval wasn't signed by this wallet")
  const role = await roleOf(merchant, who)
  if (!role) throw new SiteError("forbidden", "This wallet isn't on this shop's team")
  if (!allow.includes(role)) throw new SiteError("forbidden", role === "developer" ? "Only the shop owner can do this" : "Not allowed")
  return role
}

function checkTime(issuedAt: number, notBefore = 0) {
  if (!Number.isFinite(issuedAt) || Math.abs(now() - issuedAt) > 600) throw new SiteError("bad_request", "This approval expired. Try again.")
  if (issuedAt <= notBefore) throw new SiteError("conflict", "This approval was already used. Approve again.")
}

export async function addTeammate(p: { merchant: Address; member: Address; label?: string; issuedAt: number; signature: Hex }) {
  const merchant = getAddress(p.merchant), member = getAddress(p.member)
  return serialShop(merchant, async () => {
    if (merchant === member) throw new SiteError("bad_request", "That's the owner's own wallet")
    const label = p.label?.trim().slice(0, 40) || undefined
    if (label && Buffer.byteLength(label, "utf8") > 120) throw new SiteError("bad_request", "Note is too long")
    const existing = await memberRow(merchant, member)
    checkTime(p.issuedAt, existing?.updatedAt ?? 0)
    const message = teamMessage({ action: "add", merchant, member, role: "developer", label, issuedAt: p.issuedAt })
    if (!(await verifyMessage({ address: merchant, message, signature: p.signature }))) throw new SiteError("unauthorized", "Only the shop owner's wallet can add teammates")
    if (!(await getMerchantByAddress(merchant))) throw new SiteError("forbidden", "Set up your shop first")
    const active = (await listTeam(merchant)).filter((m) => m.status === "active")
    if (existing?.status === "active") throw new SiteError("conflict", "Already on the team")
    if (active.length >= MAX_TEAM) throw new SiteError("limit", `Up to ${MAX_TEAM} teammates per shop`)
    const t = Math.max(now(), p.issuedAt)
    const values = { merchant: addr(merchant), member: addr(member), role: "developer", status: "active", ...(label ? { label } : {}), createdAt: u64(BigInt(existing?.createdAt ?? t)), updatedAt: u64(BigInt(t)), approval: hexToBytes(p.signature) }
    if (existing) await arkiv().writer.patchEntity(ShopMember, existing.key, { set: { status: "active", updatedAt: u64(BigInt(t)), approval: hexToBytes(p.signature), ...(label ? { label } : {}) } } as any, { gas: 1_000_000n } as any)
    else await arkiv().writer.createEntity(ShopMember, values as any, { expiration: ExpirationTime.max() }, { gas: 1_500_000n })
    invalidate(`role:${merchant}:${member}`)
    return { merchant, member, role: "developer" as const, status: "active" as const, label, createdAt: existing?.createdAt ?? t, updatedAt: t }
  })
}

export async function removeTeammate(p: { merchant: Address; member: Address; issuedAt: number; signature: Hex }) {
  const merchant = getAddress(p.merchant), member = getAddress(p.member)
  return serialShop(merchant, async () => {
    const row = await memberRow(merchant, member)
    if (!row || row.status !== "active") throw new SiteError("not_found", "Not on the team")
    checkTime(p.issuedAt, row.updatedAt)
    const message = teamMessage({ action: "remove", merchant, member, role: "developer", label: row.label, issuedAt: p.issuedAt })
    if (!(await verifyMessage({ address: merchant, message, signature: p.signature }))) throw new SiteError("unauthorized", "Only the shop owner's wallet can remove teammates")
    const t = Math.max(now(), p.issuedAt)
    await arkiv().writer.patchEntity(ShopMember, row.key, { set: { status: "removed", updatedAt: u64(BigInt(t)), approval: hexToBytes(p.signature) } } as any, { gas: 1_000_000n } as any)
    invalidate(`role:${merchant}:${member}`)
    // any secret key they made stops working too
    const keysOff = await revokeKeysMadeBy(merchant, member)
    return { merchant, member, status: "removed" as const, keysOff }
  })
}
