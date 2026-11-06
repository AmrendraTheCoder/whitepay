// WondrPay for Business: websites, API keys and checkout sessions.
//
//  Site      one website of a shop: allowed domains, a publishable key (public) and a secret key (server-side).
//            Stored on Arkiv as `whitepay.site`; the secret key only as SHA-256 (32 random bytes, so the hash can be
//            public). Every change is approved by the shop wallet (EIP-191 over siteApprovalMessage).
//  Signing   With a site active, the shop's MerchantRegistry signer becomes WondrPay's order key, so the shop's
//            server never holds its wallet key. Payout stays the shop's own wallet: the router only pays there,
//            so a leaked secret key can create orders but can never redirect money. Revoking the last site hands
//            the signer back to the shop wallet.
//  Session   A pending PayRequest created with a secret key: amount, the shop's reference, success/cancel URLs on
//            the site's domains, and the site's webhook. The hosted page is /checkout/<id>.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { ExpirationTime } from "@arkiv-network/sdk"
import { addr, u64 } from "@arkiv-network/sdk/schema"
import { eq } from "@arkiv-network/sdk/query"
import { getAddress, hexToBytes, verifyMessage, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { MerchantSite } from "@whitepay/shared/arkiv"
import { REGISTRY_ABI, REQUEST_TTL, siteApprovalMessage } from "@whitepay/shared"
import { arkiv, wc } from "./clients"
import { config } from "./config"
import { cached, invalidate } from "./cache"
import { registryGet, preparePaymentRequest, publishPaymentRequest, fetchRequest, paidOnChain, resolveRequestRef } from "./requests"
import { orderDigest } from "./orders"
import { getMerchantByAddress } from "./merchants"
import { assertSafeWebhookUrl } from "./webhooks"
import { checkActor } from "./team"

export const MAX_SITES_PER_SHOP = 5
const SITE_ID_RE = /^[0-9a-f]{32}$/
const SECRET_RE = /^wp_sk_test_([0-9a-f]{32})_([A-Za-z0-9_-]{43})$/
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export class SiteError extends Error {
  constructor(public code: "bad_request" | "unauthorized" | "forbidden" | "not_found" | "limit" | "conflict", msg: string) { super(msg) }
  get status() { return { bad_request: 400, unauthorized: 401, forbidden: 403, not_found: 404, limit: 429, conflict: 409 }[this.code] }
}

export type SiteView = {
  siteId: string; merchant: Address; name: string; domains: string[]; webhook?: string; mode: "test"
  publishableKey: string; secretHint: string; status: "active" | "revoked"; createdAt: number; updatedAt: number
}
type SiteRow = SiteView & { key: Hex; secretHash: string }

const now = () => Math.floor(Date.now() / 1000)
/** Arkiv `str` columns hold at most 128 UTF-8 bytes. */
const bytes = (x: string) => Buffer.byteLength(x, "utf8")
/** Trim to at most `max` UTF-8 bytes without splitting a character. */
const trimBytes = (x: string, max: number) => { let out = x; while (bytes(out) > max) out = out.slice(0, -1); return out }
/** One write at a time per shop (create/rotate/revoke): no double creates, no revoke racing a create. Per instance. */
const shopLocks = new Map<string, Promise<unknown>>()
async function serial<T>(merchant: Address, run: () => Promise<T>): Promise<T> {
  const k = merchant.toLowerCase()
  const prev = shopLocks.get(k) ?? Promise.resolve()
  const next = prev.catch(() => {}).then(run)
  shopLocks.set(k, next)
  try { return await next } finally { if (shopLocks.get(k) === next) shopLocks.delete(k) }
}
const v = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x)
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")
export const orderSignerAddress = () => privateKeyToAccount(config.keys.orderSigner()).address

/** Hostnames a site may send customers back to ("shop.example.com"). localhost is allowed in test mode. */
export function normalizeDomains(input: unknown): string[] {
  const list = (Array.isArray(input) ? input : String(input ?? "").split(/[\s,]+/))
    .map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, ""))
    .filter(Boolean)
  const out = [...new Set(list)]
  if (!out.length) throw new SiteError("bad_request", "Add at least one domain, like shop.example.com")
  if (out.length > 5) throw new SiteError("bad_request", "Up to 5 domains per website")
  for (const d of out) if (d !== "localhost" && !HOST_RE.test(d)) throw new SiteError("bad_request", `"${d}" isn't a domain. Use a hostname like shop.example.com`)
  if (bytes(out.join(",")) > 128) throw new SiteError("bad_request", "Domains are too long together (128 characters max). Use fewer or shorter domains")
  return out
}

/** A return URL must be https on one of the site's domains (or http://localhost while testing). */
export function assertReturnUrl(raw: string | undefined, domains: string[], field: string) {
  if (!raw) return undefined
  if (bytes(raw) > 128) throw new SiteError("bad_request", `${field} must be at most 128 characters`)
  let u: URL
  try { u = new URL(raw) } catch { throw new SiteError("bad_request", `${field} is not a valid URL`) }
  const host = u.hostname.toLowerCase()
  const local = host === "localhost" && u.protocol === "http:"
  if (!local && u.protocol !== "https:") throw new SiteError("bad_request", `${field} must use https`)
  if (u.username || u.password) throw new SiteError("bad_request", `${field} must not contain credentials`)
  if (!domains.some((d) => host === d || host.endsWith(`.${d}`))) throw new SiteError("forbidden", `${field} must be on ${domains.join(", ")} (add the domain to this website first)`)
  return u.toString()
}

function rowOf(e: any): SiteRow {
  return {
    key: e.$key, siteId: v(e.siteId), merchant: getAddress(v(e.merchant)), name: v(e.name), domains: String(v(e.domains)).split(",").filter(Boolean),
    webhook: v(e.webhook) || undefined, mode: "test", publishableKey: v(e.publishableKey), secretHint: v(e.secretHint), secretHash: v(e.secretHash),
    status: v(e.status), createdAt: Number(v(e.createdAt)), updatedAt: Number(v(e.updatedAt)),
  }
}
const pub = ({ key: _k, secretHash: _h, ...view }: SiteRow): SiteView => view
const FIELDS = { $key: true, siteId: true, merchant: true, name: true, domains: true, webhook: true, mode: true, publishableKey: true,
  secretHint: true, secretHash: true, status: true, createdAt: true, updatedAt: true } as const

async function siteRow(siteId: string, ttlMs = 5_000): Promise<SiteRow | null> {
  if (!SITE_ID_RE.test(siteId)) return null
  return cached(`site:${siteId}`, ttlMs, async () => {
    const a = arkiv()
    const r = await a.pub.select(FIELDS).from(MerchantSite).ownedBy(a.owner).where(eq("siteId", siteId)).limit(1).fetch()
    const e = (r.entities as any[])[0]
    return e ? rowOf(e) : null
  }, (x) => !!x)
}

export async function listSites(merchant: Address): Promise<SiteView[]> {
  const a = arkiv()
  const r = await a.pub.select(FIELDS).from(MerchantSite).ownedBy(a.owner).where(eq("merchant", addr(getAddress(merchant)))).limit(20).fetch()
  return (r.entities as any[]).map(rowOf).map(pub).sort((x, y) => y.createdAt - x.createdAt)
}

function newSecret(siteId: string) {
  const secret = `wp_sk_test_${siteId}_${randomBytes(32).toString("base64url")}`
  return { secret, secretHash: sha256(secret), secretHint: secret.slice(-4) }
}

async function checkApproval(p: { action: "create" | "rotate" | "revoke"; merchant: Address; siteId: string; name: string; domains: string[]; webhook?: string; issuedAt: number; signature: Hex; actor?: Address }, notBefore = 0) {
  if (!Number.isFinite(p.issuedAt) || Math.abs(now() - p.issuedAt) > 600) throw new SiteError("bad_request", "This approval expired. Try again.")
  // single use: approvals are public on Arkiv, so one for a site must be newer than the site's last change
  if (p.issuedAt <= notBefore) throw new SiteError("conflict", "This approval was already used. Approve again.")
  const message = siteApprovalMessage({ ...p, orderSigner: orderSignerAddress() })
  // websites change the on-chain order signer: owner only. A developer teammate may rotate keys.
  await checkActor(p.merchant, p.actor, message, p.signature, p.action === "rotate" ? ["owner", "developer"] : ["owner"])
}

/** Point the shop's on-chain order signer at WondrPay's order key (on) or back at the shop wallet (off). */
async function setOrderSigner(merchant: Address, on: boolean) {
  invalidate(`registry:${merchant.toLowerCase()}`)
  const m = await registryGet(merchant)
  const want = on ? orderSignerAddress() : merchant
  if (m.signer.toLowerCase() === want.toLowerCase()) return null
  const hash = await wc().admin().writeContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "update", args: [merchant, m.payout, want] })
  const rc = await wc().pub.waitForTransactionReceipt({ hash })
  if (rc.status !== "success") throw new Error("MerchantRegistry.update reverted")
  invalidate(`registry:${merchant.toLowerCase()}`)
  return hash
}

/** Create a website: returns its keys. The secret key is returned ONLY here (and on rotate). */
export { serial as serialShop }

export async function createSite(p: { merchant: Address; siteId: string; name: string; domains: unknown; webhook?: string; issuedAt: number; signature: Hex; actor?: Address }) {
  return serial(getAddress(p.merchant), () => createSiteNow(p))
}
async function createSiteNow(p: { merchant: Address; siteId: string; name: string; domains: unknown; webhook?: string; issuedAt: number; signature: Hex; actor?: Address }) {
  const merchant = getAddress(p.merchant)
  const name = trimBytes(String(p.name ?? "").trim().slice(0, 60), 120)
  if (!name) throw new SiteError("bad_request", "Give the website a name")
  if (!SITE_ID_RE.test(p.siteId)) throw new SiteError("bad_request", "bad site id")
  const domains = normalizeDomains(p.domains)
  const webhook = p.webhook?.trim() || undefined
  if (webhook) {
    if (bytes(webhook) > 128) throw new SiteError("bad_request", "The webhook URL must be at most 128 characters")
    await assertSafeWebhookUrl(webhook).catch((e) => { throw new SiteError("bad_request", (e as Error).message) })
  }
  await checkApproval({ action: "create", merchant, siteId: p.siteId, name, domains, webhook, issuedAt: p.issuedAt, signature: p.signature, actor: p.actor })

  const [m, profile, existing, taken] = await Promise.all([registryGet(merchant), getMerchantByAddress(merchant), listSites(merchant), siteRow(p.siteId, 0)])
  if (!m.active || !profile) throw new SiteError("forbidden", "Set up your shop first (Shop → Create shop), then add a website")
  if (taken) throw new SiteError("conflict", "That site id is already used. Try again.")
  if (existing.filter((s) => s.status === "active").length >= MAX_SITES_PER_SHOP) throw new SiteError("limit", `Up to ${MAX_SITES_PER_SHOP} websites per shop`)

  const { secret, secretHash, secretHint } = newSecret(p.siteId)
  const publishableKey = `wp_pk_test_${p.siteId}`
  const t = now()
  // record first, then switch the on-chain signer; if the switch fails the record is switched off again
  const { entityKey } = await arkiv().writer.createEntity(MerchantSite, {
    siteId: p.siteId, merchant: addr(merchant), name, domains: domains.join(","), ...(webhook ? { webhook } : {}), mode: "test",
    publishableKey, secretHash, secretHint, status: "active", createdAt: u64(BigInt(t)), updatedAt: u64(BigInt(t)), approval: hexToBytes(p.signature),
    approvedBy: addr(getAddress(p.actor ?? merchant)), keyBy: addr(getAddress(p.actor ?? merchant)),
  }, { expiration: ExpirationTime.max() }, { gas: 1_500_000n })
  invalidate(`site:${p.siteId}`)
  let signerTx: Hex | null
  try {
    signerTx = await setOrderSigner(merchant, true)
  } catch (e) {
    await arkiv().writer.patchEntity(MerchantSite, entityKey, { set: { status: "revoked", updatedAt: u64(BigInt(now())) } } as any, { gas: 1_000_000n } as any)
      .catch((err) => console.error("[sites] CRITICAL: site active but signer not switched", p.siteId, (err as Error).message.split("\n")[0]))
    invalidate(`site:${p.siteId}`)
    throw e
  }
  return { site: { siteId: p.siteId, merchant, name, domains, webhook, mode: "test" as const, publishableKey, secretHint, status: "active" as const, createdAt: t, updatedAt: t }, secretKey: secret, signerTx }
}

/** New secret key (the old one stops working at once). Returns the new key once. */
export async function rotateSiteKey(p: { merchant: Address; siteId: string; issuedAt: number; signature: Hex; actor?: Address }) {
  return serial(getAddress(p.merchant), async () => {
    const row = await ownSite(p.merchant, p.siteId)
    if (row.status !== "active") throw new SiteError("conflict", "This website is switched off")
    await checkApproval({ action: "rotate", merchant: row.merchant, siteId: row.siteId, name: row.name, domains: row.domains, webhook: row.webhook, issuedAt: p.issuedAt, signature: p.signature, actor: p.actor }, row.updatedAt)
    const { secret, secretHash, secretHint } = newSecret(row.siteId)
    // updatedAt >= issuedAt, so this approval can never be replayed
    const t = Math.max(now(), p.issuedAt)
    const by = addr(getAddress(p.actor ?? row.merchant))
    await arkiv().writer.patchEntity(MerchantSite, row.key, { set: { secretHash, secretHint, updatedAt: u64(BigInt(t)), approval: hexToBytes(p.signature), approvedBy: by, keyBy: by } } as any, { gas: 1_000_000n } as any)
    invalidate(`site:${row.siteId}`)
    return { site: { ...pub(row), secretHint, updatedAt: t }, secretKey: secret }
  })
}

/** Switch a website off: its keys stop working. The last one hands order signing back to the shop wallet. */
export async function revokeSite(p: { merchant: Address; siteId: string; issuedAt: number; signature: Hex; actor?: Address }) {
  return serial(getAddress(p.merchant), async () => {
    const row = await ownSite(p.merchant, p.siteId)
    if (row.status === "revoked") return { site: pub(row), signerTx: null }
    await checkApproval({ action: "revoke", merchant: row.merchant, siteId: row.siteId, name: row.name, domains: row.domains, webhook: row.webhook, issuedAt: p.issuedAt, signature: p.signature, actor: p.actor }, row.updatedAt)
    const t = Math.max(now(), p.issuedAt)
    await arkiv().writer.patchEntity(MerchantSite, row.key, { set: { status: "revoked", updatedAt: u64(BigInt(t)), approval: hexToBytes(p.signature), approvedBy: addr(getAddress(p.actor ?? row.merchant)) } } as any, { gas: 1_000_000n } as any)
    invalidate(`site:${row.siteId}`)
    const stillActive = async () => (await listSites(row.merchant)).some((s) => s.status === "active" && s.siteId !== row.siteId)
    let signerTx: Hex | null = null
    if (!(await stillActive())) {
      signerTx = await setOrderSigner(row.merchant, false)
      // a website created meanwhile (another instance) needs WondrPay's order key again
      if (await stillActive()) signerTx = await setOrderSigner(row.merchant, true)
    }
    return { site: { ...pub(row), status: "revoked" as const, updatedAt: t }, signerTx }
  })
}

/** A teammate left: switch off every secret key they made for this shop (the owner makes a new one when needed).
 *  Returns the websites whose key was switched off. Called by team.ts inside the shop's write lock. */
export async function revokeKeysMadeBy(merchant: Address, member: Address): Promise<string[]> {
  const a = arkiv()
  const r = await a.pub.select({ $key: true, siteId: true, status: true, keyBy: true }).from(MerchantSite).ownedBy(a.owner).where(eq("merchant", addr(getAddress(merchant)))).limit(20).fetch()
  const theirs = (r.entities as any[]).filter((e) => v(e.status) === "active" && v(e.keyBy) && getAddress(v(e.keyBy)) === getAddress(member))
  for (const e of theirs) {
    // a random hash nobody holds a key for: the teammate's key stops working at once
    await a.writer.patchEntity(MerchantSite, e.$key, { set: { secretHash: randomBytes(32).toString("hex"), secretHint: "off", updatedAt: u64(BigInt(now())), keyBy: addr(getAddress(merchant)) } } as any, { gas: 1_000_000n } as any)
    invalidate(`site:${v(e.siteId)}`)
  }
  return theirs.map((e) => v(e.siteId))
}

/** Internal: the full site row (with its webhook), for business.ts. Never return it from an API. */
export const siteRowFor = (siteId: string) => siteRow(siteId)
export type { SiteRow }

async function ownSite(merchant: Address, siteId: string) {
  const row = await siteRow(siteId)
  if (!row || row.merchant !== getAddress(merchant)) throw new SiteError("not_found", "No such website for this shop")
  return row
}

/** `Authorization: Bearer wp_sk_test_…` -> the active site. Constant-time compare on the hash. */
export async function authenticateSecretKey(header: string | null): Promise<SiteRow> {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "")
  const key = m?.[1] ?? ""
  const parts = SECRET_RE.exec(key)
  if (!parts) throw new SiteError("unauthorized", "Missing or malformed secret key. Send Authorization: Bearer wp_sk_test_…")
  const found = await siteRow(parts[1])
  // the attribute index can trail a rotate/revoke by a few seconds: compare against the entity itself
  const e: any = found ? await arkiv().pub.getEntity(found.key, MerchantSite).catch(() => null) : null
  const row = e ? { ...found!, secretHash: v(e.secretHash), secretHint: v(e.secretHint), status: v(e.status), updatedAt: Number(v(e.updatedAt)) } as SiteRow : null
  const want = Buffer.from(row?.secretHash ?? "0".repeat(64), "hex"), got = Buffer.from(sha256(key), "hex")
  if (!row || want.length !== got.length || !timingSafeEqual(want, got)) throw new SiteError("unauthorized", "Invalid secret key")
  if (row.status !== "active") throw new SiteError("forbidden", "This website was switched off in WondrPay for Business")
  return row
}

// ------------------------------------------------------------------ checkout sessions
export type SessionInput = { amount?: unknown; reference?: unknown; description?: unknown; successUrl?: unknown; cancelUrl?: unknown; expiresIn?: unknown }
export type SessionView = {
  id: Hex; object: "checkout.session"; status: "open" | "paid" | "expired"; amount: string; currency: "USDT"; reference?: string; description?: string
  url: string; payUrl: string; expiresAt: number; successUrl?: string; cancelUrl?: string; merchant: Address; merchantName?: string
  payment?: { txHash: Hex; payer: Address; explorer: string }
  /** Return this from your <wondrpay-button order-endpoint> route to use the Pay button with API keys. */
  button?: { entityKey: Hex; payUrl: string; amount: string; deadline: string; orderId: Hex }
}

/** "12.40" -> 12_400_000 (USDT has 6 decimals). Strings only, so no float rounding. */
export function parseUsdt(raw: unknown): bigint {
  const s = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : ""
  if (!/^\d{1,4}(\.\d{1,6})?$/.test(s)) throw new SiteError("bad_request", 'amount must be a decimal string in USDT, like "12.40"')
  const [i, f = ""] = s.split(".")
  const micro = BigInt(i) * 1_000_000n + BigInt(f.padEnd(6, "0"))
  if (micro < 10_000n || micro > 1_000_000_000n) throw new SiteError("bad_request", "amount must be between 0.01 and 1000 USDT")
  return micro
}
const fmt = (micro: bigint) => { const s = micro.toString().padStart(7, "0"); return `${s.slice(0, -6)}.${s.slice(-6).replace(/0{1,4}$/, "")}` }

export async function createCheckoutSession(site: SiteRow, input: SessionInput, origin: string, opts: { link?: string } = {}): Promise<{ session: SessionView; publish: () => Promise<void> }> {
  const amount = parseUsdt(input.amount)
  const reference = input.reference == null ? undefined : String(input.reference).trim()
  if (reference && !/^[\w.:#/-]{1,64}$/.test(reference)) throw new SiteError("bad_request", "reference must be 1-64 letters, digits or . _ - : # /")
  const description = input.description == null ? undefined : trimBytes(String(input.description).trim().slice(0, 120), 120) || undefined
  const successUrl = assertReturnUrl(input.successUrl == null ? undefined : String(input.successUrl), site.domains, "successUrl")
  const cancelUrl = assertReturnUrl(input.cancelUrl == null ? undefined : String(input.cancelUrl), site.domains, "cancelUrl")
  const ttl = input.expiresIn == null ? 15 * 60 : Number(input.expiresIn)
  if (!Number.isInteger(ttl) || ttl < 5 * 60 || ttl > REQUEST_TTL.invoiceMax) throw new SiteError("bad_request", "expiresIn must be 300-1800 seconds")

  const profile = await getMerchantByAddress(site.merchant)
  if (!profile) throw new SiteError("forbidden", "This shop isn't set up on WondrPay")
  const prepared = await preparePaymentRequest({
    merchant: site.merchant, amount, kind: "invoice", ttlSeconds: ttl, note: description, webhook: site.webhook,
    session: { site: site.siteId, reference, successUrl, cancelUrl, link: opts.link },
  })
  ;(prepared.values as Record<string, unknown>).merchantName = profile.ensName
  const id = prepared.digest
  return {
    session: {
      id, object: "checkout.session", status: "open", amount: fmt(amount), currency: "USDT", reference, description,
      url: `${origin}/checkout/${id}`, payUrl: `${origin}/pay?req=${id}`, expiresAt: Number(prepared.order.deadline),
      successUrl, cancelUrl, merchant: site.merchant, merchantName: profile.ensName,
      button: { entityKey: id, payUrl: `${origin}/pay?req=${id}`, amount: amount.toString(), deadline: prepared.order.deadline.toString(), orderId: prepared.order.orderId },
    },
    publish: async () => { await publishPaymentRequest(prepared) },
  }
}

/** A session's status, for the shop's server. Only the site that created it can read it. */
export async function getCheckoutSession(site: SiteRow, id: Hex, origin: string): Promise<SessionView> {
  // look up by digest only (that query is filtered to WondrPay's own entities), never by a raw entity key
  const key = await resolveRequestRef(id).catch(() => null)
  const view = key ? await fetchRequest(key) : null
  const a = arkiv()
  if (!view || view.owner.toLowerCase() !== a.owner.toLowerCase() || view.site !== site.siteId || view.digest.toLowerCase() !== id.toLowerCase()
      || orderDigest({ merchant: view.merchant, amount: view.amount, orderId: view.orderId, deadline: view.deadline }).toLowerCase() !== id.toLowerCase())
    throw new SiteError("not_found", "No such checkout session (or it expired more than a few minutes ago)")
  const chain = await paidOnChain(id).catch(() => null)
  const paid = !!chain || view.status === "paid"
  return {
    id, object: "checkout.session", status: paid ? "paid" : now() > Number(view.deadline) ? "expired" : "open",
    amount: fmt(view.amount), currency: "USDT", reference: view.reference, description: view.note,
    url: `${origin}/checkout/${id}`, payUrl: `${origin}/pay?req=${id}`, expiresAt: Number(view.deadline),
    successUrl: view.successUrl, cancelUrl: view.cancelUrl, merchant: view.merchant, merchantName: view.merchantName,
    ...(chain ? { payment: { txHash: chain.txHash, payer: chain.payer, explorer: `${config.explorer}/tx/${chain.txHash}` } } : {}),
  }
}

/** Sites for the hosted checkout page: shop name + where to send the customer (public data only). */
export const publicSite = async (siteId: string) => {
  const r = await siteRow(siteId)
  return r ? { siteId: r.siteId, name: r.name, domains: r.domains, status: r.status } : null
}

