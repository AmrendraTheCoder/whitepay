// WondrPay for Business, phase 2: webhook delivery log (+ resend and test ping), integration health per website,
// and fixed-price payment links. Builds on sites.ts (websites, keys, sessions).
//
//  Webhook log   every webhook to a website is recorded (event, URL, HTTP status, attempts, exact body) for 30 days.
//                "Resend" re-sends the stored body byte for byte with the same event id, so shops de-duplicate it.
//  Health        what's working for a website: keys, first paid checkout, last webhook, from receipts + the log.
//  Payment links "pl_…": a fixed title + price on a website. Each visit creates a fresh session (anyone may open a
//                link, like a UPI QR), rate limited per IP, signed by WondrPay's order key for that website.
import { randomBytes } from "node:crypto"
import { ExpirationTime } from "@arkiv-network/sdk"
import { addr, i32, u64 } from "@arkiv-network/sdk/schema"
import { and, desc, eq } from "@arkiv-network/sdk/query"
import { bytesToString, getAddress, hexToBytes, stringToBytes, verifyMessage, type Address, type Hex } from "viem"
import { PayLink, Receipt, WebhookDelivery } from "@whitepay/shared/arkiv"
import { paymentLinkMessage, webhookActionMessage, EXPLORER_URL } from "@whitepay/shared"
import { arkiv } from "./clients"
import { cached, invalidate } from "./cache"
import { deliverWebhookDetailed } from "./webhooks"
import { SiteError, siteRowFor, serialShop, parseUsdt, createCheckoutSession, type SiteRow, type SessionView } from "./sites"
import { getMerchantByAddress } from "./merchants"

const now = () => Math.floor(Date.now() / 1000)
const v = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x)
const LINK_RE = /^pl_[0-9a-f]{20}$/
const LOG_DAYS = 30

// ------------------------------------------------------------------ webhook log
export type DeliveryView = { key: Hex; eventId: string; event: string; sessionId?: string; url: string; status: "delivered" | "failed"; httpStatus: number; attempts: number; at: number }

/** Send a webhook to a website and record the outcome. `body` is sent exactly as given. */
export async function sendSiteWebhook(p: { site: SiteRow; eventId: string; event: string; sessionId?: string; body: string; url?: string }) {
  const url = p.url ?? p.site.webhook
  if (!url) return null
  const r = await deliverWebhookDetailed(url, p.eventId, p.body)
  const status = r.httpStatus >= 200 && r.httpStatus < 300 ? "delivered" : "failed"
  await arkiv().writer.createEntity(WebhookDelivery, {
    site: p.site.siteId, merchant: addr(p.site.merchant), eventId: p.eventId.slice(0, 120), event: p.event, ...(p.sessionId ? { sessionId: p.sessionId.toLowerCase() } : {}),
    url, status, httpStatus: i32(r.httpStatus), attempts: i32(r.attempts), at: u64(BigInt(now())), payload: stringToBytes(p.body),
  } as any, { expiration: ExpirationTime.fromDays(LOG_DAYS) }, { gas: 1_500_000n }).catch((e) => console.error("[business] delivery log write failed", (e as Error).message.split("\n")[0]))
  invalidate(`deliveries:${p.site.siteId}`)
  return { ...r, status }
}

export async function listDeliveries(siteId: string, limit = 20): Promise<DeliveryView[]> {
  return (await recentDeliveries(siteId)).slice(0, Math.min(limit, 50))
}
const recentDeliveries = (siteId: string) =>
  cached(`deliveries:${siteId}`, 5_000, async (): Promise<DeliveryView[]> => {
    const a = arkiv()
    const r = await a.pub.select({ $key: true, eventId: true, event: true, sessionId: true, url: true, status: true, httpStatus: true, attempts: true, at: true })
      .from(WebhookDelivery).ownedBy(a.owner).where(eq("site", siteId)).orderBy(desc("at")).limit(50).fetch()
    return (r.entities as any[]).map((e) => ({ key: e.$key, eventId: v(e.eventId), event: v(e.event), sessionId: v(e.sessionId) || undefined, url: v(e.url),
      status: v(e.status), httpStatus: Number(v(e.httpStatus)), attempts: Number(v(e.attempts)), at: Number(v(e.at)) }))
  })

async function ownActiveSite(merchant: Address, siteId: string) {
  const site = await siteRowFor(siteId)
  if (!site || site.merchant !== getAddress(merchant)) throw new SiteError("not_found", "No such website for this shop")
  if (site.status !== "active") throw new SiteError("conflict", "This website is switched off")
  return site
}

async function checkWalletAction(merchant: Address, message: string, signature: Hex, issuedAt: number) {
  if (!Number.isFinite(issuedAt) || Math.abs(now() - issuedAt) > 600) throw new SiteError("bad_request", "This approval expired. Try again.")
  if (!(await verifyMessage({ address: getAddress(merchant), message, signature }))) throw new SiteError("unauthorized", "The approval wasn't signed by this shop's wallet")
}
// resend / ping approvals are single use within their 10-minute window (per instance; worst case one extra test event)
const usedActions = new Map<string, number>()
function once(signature: Hex) {
  const sig = signature.toLowerCase()
  const t = now()
  for (const [k, at] of usedActions) if (t - at > 700) usedActions.delete(k)
  if (usedActions.has(sig)) throw new SiteError("conflict", "This approval was already used. Approve again.")
  usedActions.set(sig, t)
}

/** Send a signed `test.ping` event to the website's webhook URL (portal: "Send test webhook"). */
export async function pingWebhook(p: { merchant: Address; siteId: string; issuedAt: number; signature: Hex }) {
  return serialShop(getAddress(p.merchant), async () => {
    const site = await ownActiveSite(p.merchant, p.siteId)
    if (!site.webhook) throw new SiteError("bad_request", "This website has no webhook URL")
    await checkWalletAction(p.merchant, webhookActionMessage({ action: "ping", merchant: site.merchant, site: site.siteId, target: site.webhook, issuedAt: p.issuedAt }), p.signature, p.issuedAt)
    once(p.signature)
    const eventId = `ping_${randomBytes(8).toString("hex")}`
    const body = JSON.stringify({ event: "test.ping", site: site.siteId, merchant: site.merchant, sentAt: now() })
    const r = await sendSiteWebhook({ site, eventId, event: "test.ping", body })
    return { eventId, ...r }
  })
}

/** Re-send a logged delivery: the same bytes and event id, to the website's CURRENT webhook URL. */
export async function resendWebhook(p: { merchant: Address; siteId: string; deliveryKey: Hex; issuedAt: number; signature: Hex }) {
  return serialShop(getAddress(p.merchant), async () => {
    const site = await ownActiveSite(p.merchant, p.siteId)
    if (!site.webhook) throw new SiteError("bad_request", "This website has no webhook URL")
    await checkWalletAction(p.merchant, webhookActionMessage({ action: "resend", merchant: site.merchant, site: site.siteId, target: p.deliveryKey, issuedAt: p.issuedAt }), p.signature, p.issuedAt)
    once(p.signature)
    const a = arkiv()
    const e: any = await a.pub.getEntity(p.deliveryKey, WebhookDelivery).catch(() => null)
    if (!e || getAddress(e.$owner) !== getAddress(a.owner) || v(e.site) !== site.siteId) throw new SiteError("not_found", "No such delivery for this website")
    const raw = v(e.payload)
    const body = typeof raw === "string" ? bytesToString(hexToBytes(raw as Hex)) : bytesToString(raw)
    const r = await sendSiteWebhook({ site, eventId: v(e.eventId), event: v(e.event), sessionId: v(e.sessionId) || undefined, body })
    return { eventId: v(e.eventId), ...r }
  })
}

// ------------------------------------------------------------------ health
export type SiteHealth = {
  siteId: string
  checks: { id: "keys" | "paid" | "webhook_set" | "webhook_ok"; label: string; ok: boolean; detail: string }[]
  payments: { count: number; volume: string; last?: { at: number; amount: string; explorer: string } }
  lastDelivery?: DeliveryView
}

/** Integration checker: keys exist, a checkout was paid, the webhook is set and answered 2xx last time. */
export async function siteHealth(merchant: Address, siteId: string): Promise<SiteHealth> {
  const site = await siteRowFor(siteId)
  if (!site || site.merchant !== getAddress(merchant)) throw new SiteError("not_found", "No such website for this shop")
  return cached(`health:${siteId}`, 5_000, async () => {
    const a = arkiv()
    const [rc, deliveries] = await Promise.all([
      a.pub.select({ amount: true, paidAt: true, wcTxHash: true }).from(Receipt).ownedBy(a.owner)
        .where(and(eq("merchant", addr(site.merchant)), eq("site", siteId))).orderBy(desc("paidAt")).limit(100).fetch(),
      listDeliveries(siteId, 10),
    ])
    const paid = rc.entities as any[]
    const volume = paid.reduce((s, e) => s + BigInt(v(e.amount)), 0n)
    const last = paid[0]
    const lastDelivery = deliveries[0]
    const usdt = (micro: bigint) => (Number(micro) / 1e6).toFixed(2)
    return {
      siteId,
      checks: [
        { id: "keys", label: "API keys created", ok: site.status === "active", detail: site.status === "active" ? `Secret key ends in …${site.secretHint}` : "Website switched off" },
        { id: "paid", label: "First checkout paid", ok: paid.length > 0, detail: paid.length ? (paid.length >= 100 ? `100+ paid · ${usdt(volume)} USDT in the last 100` : `${paid.length} paid · ${usdt(volume)} USDT`) : "Create a session and pay it (Create test checkout below)" },
        { id: "webhook_set", label: "Webhook URL set", ok: !!site.webhook, detail: site.webhook ?? "Optional, but how your server learns about payments" },
        { id: "webhook_ok", label: "Webhook answered", ok: lastDelivery?.status === "delivered",
          detail: !site.webhook ? "No webhook URL" : !lastDelivery ? "Nothing sent yet. Send a test webhook" : lastDelivery.status === "delivered"
            ? `HTTP ${lastDelivery.httpStatus} for ${lastDelivery.event}` : `Last attempt failed (${lastDelivery.httpStatus ? `HTTP ${lastDelivery.httpStatus}` : "no answer"})` },
      ],
      // public read (site ids and shop addresses are public, as are receipts on Arkiv): counts and the last tx only
      payments: { count: paid.length, volume: volume.toString(), ...(last ? { last: { at: Number(v(last.paidAt)), amount: String(v(last.amount)), explorer: `${EXPLORER_URL}/tx/${v(last.wcTxHash)}` } } : {}) },
      lastDelivery,
    }
  })
}

// ------------------------------------------------------------------ payment links
export type LinkView = { linkId: string; site: string; merchant: Address; title: string; amount: string; status: "active" | "disabled"; createdAt: number; updatedAt: number; url: string }
type LinkRow = LinkView & { key: Hex }

const linkRowOf = (e: any, origin: string): LinkRow => ({
  key: e.$key, linkId: v(e.linkId), site: v(e.site), merchant: getAddress(v(e.merchant)), title: v(e.title), amount: String(v(e.amount)),
  status: v(e.status), createdAt: Number(v(e.createdAt)), updatedAt: Number(v(e.updatedAt)), url: `${origin}/l/${v(e.linkId)}`,
})
const LINK_FIELDS = { $key: true, linkId: true, site: true, merchant: true, title: true, amount: true, status: true, createdAt: true, updatedAt: true } as const
const bytes = (x: string) => Buffer.byteLength(x, "utf8")

async function linkRow(linkId: string, origin: string, ttl = 10_000): Promise<LinkRow | null> {
  if (!LINK_RE.test(linkId)) return null
  return cached(`link:${linkId}`, ttl, async () => {
    const a = arkiv()
    const r = await a.pub.select(LINK_FIELDS).from(PayLink).ownedBy(a.owner).where(eq("linkId", linkId)).limit(1).fetch()
    const e = (r.entities as any[])[0]
    return e ? linkRowOf(e, origin) : null
  }, (x) => !!x)
}

export async function listLinks(merchant: Address, origin: string) {
  const a = arkiv()
  const m = addr(getAddress(merchant))
  const r = await a.pub.select(LINK_FIELDS).from(PayLink).ownedBy(a.owner).where(eq("merchant", m)).orderBy(desc("createdAt")).limit(50).fetch()
  const rows = (r.entities as any[]).map((e) => linkRowOf(e, origin))
  // stats per link (receipts tagged with the link), only for the links we show
  const [stats, siteStatus] = await Promise.all([
    Promise.all(rows.map(async (l) => {
      const rc = await a.pub.select({ amount: true }).from(Receipt).ownedBy(a.owner).where(and(eq("merchant", m), eq("link", l.linkId))).limit(100).fetch()
      const list = rc.entities as any[]
      return { count: list.length, volume: list.reduce((sum, e) => sum + BigInt(v(e.amount)), 0n) }
    })),
    Promise.all([...new Set(rows.map((l) => l.site))].map(async (id) => [id, (await siteRowFor(id))?.status === "active"] as const)).then((x) => new Map(x)),
  ])
  return rows.map(({ key: _k, ...l }, i) => ({ ...l, siteActive: siteStatus.get(l.site) ?? false, paid: stats[i].count, volume: stats[i].volume.toString() }))
}

async function activeLinkCount(merchant: Address) {
  const a = arkiv()
  const r = await a.pub.select({ linkId: true }).from(PayLink).ownedBy(a.owner).where(and(eq("merchant", addr(merchant)), eq("status", "active"))).limit(25).fetch()
  return (r.entities as any[]).length
}

export async function createLink(p: { merchant: Address; siteId: string; linkId: string; title: string; amount: string; issuedAt: number; signature: Hex }, origin: string) {
  const merchant = getAddress(p.merchant)
  return serialShop(merchant, async () => {
    if (!LINK_RE.test(p.linkId)) throw new SiteError("bad_request", "bad link id")
    const title = String(p.title ?? "").trim()
    if (!title || title.length > 60 || bytes(title) > 120) throw new SiteError("bad_request", "Give the link a title (up to 60 characters)")
    const micro = parseUsdt(p.amount)
    const site = await ownActiveSite(merchant, p.siteId)
    await checkWalletAction(merchant, paymentLinkMessage({ action: "create", merchant, site: site.siteId, linkId: p.linkId, title, amount: p.amount, issuedAt: p.issuedAt }), p.signature, p.issuedAt)
    if (await linkRow(p.linkId, origin, 0)) throw new SiteError("conflict", "That link id is already used. Try again.")
    if ((await activeLinkCount(merchant)) >= 20) throw new SiteError("limit", "Up to 20 active payment links per shop")
    const t = now()
    await arkiv().writer.createEntity(PayLink, {
      linkId: p.linkId, merchant: addr(merchant), site: site.siteId, title, amount: micro, status: "active", createdAt: u64(BigInt(t)), updatedAt: u64(BigInt(t)), approval: hexToBytes(p.signature),
    } as any, { expiration: ExpirationTime.max() }, { gas: 1_500_000n })
    invalidate(`link:${p.linkId}`)
    return { linkId: p.linkId, site: site.siteId, merchant, title, amount: micro.toString(), status: "active" as const, createdAt: t, updatedAt: t, url: `${origin}/l/${p.linkId}`, siteActive: true, paid: 0, volume: "0" }
  })
}

export async function disableLink(p: { merchant: Address; linkId: string; issuedAt: number; signature: Hex }, origin: string) {
  const merchant = getAddress(p.merchant)
  return serialShop(merchant, async () => {
    const row = await linkRow(p.linkId, origin, 0)
    if (!row || row.merchant !== merchant) throw new SiteError("not_found", "No such payment link for this shop")
    if (row.status === "disabled") return { linkId: row.linkId, status: "disabled" as const }
    const amount = (Number(row.amount) / 1e6).toString()
    await checkWalletAction(merchant, paymentLinkMessage({ action: "disable", merchant, site: row.site, linkId: row.linkId, title: row.title, amount, issuedAt: p.issuedAt }), p.signature, p.issuedAt)
    if (p.issuedAt <= row.updatedAt) throw new SiteError("conflict", "This approval was already used. Approve again.")
    await arkiv().writer.patchEntity(PayLink, row.key, { set: { status: "disabled", updatedAt: u64(BigInt(Math.max(now(), p.issuedAt))), approval: hexToBytes(p.signature) } } as any, { gas: 1_000_000n } as any)
    invalidate(`link:${row.linkId}`)
    return { linkId: row.linkId, status: "disabled" as const }
  })
}

/** Public view of a link for its page /l/:id (title, price, shop): nothing secret. */
export async function publicLink(linkId: string, origin: string) {
  const row = await linkRow(linkId, origin)
  if (!row) return null
  const [site, shop] = await Promise.all([siteRowFor(row.site), getMerchantByAddress(row.merchant)])
  const active = row.status === "active" && site?.status === "active"
  return { linkId: row.linkId, title: row.title, amount: row.amount, active, merchant: row.merchant, merchantName: shop?.ensName, displayName: shop?.displayName, verified: !!shop?.verified }
}

/** A customer opens a link: a fresh 15-minute checkout session for its website and price. */
// Opening a link writes an Arkiv entity (WondrPay pays for it), and anyone may open a link: cap new sessions per link
// and per instance (on top of the 10/min per-IP limit at the edge). A real shop's link rarely sees 30 opens in 10 min.
const LINK_BUDGET = { perLink: 30, perInstance: 300, windowMs: 10 * 60_000 }
const linkOpens = new Map<string, number[]>()
function spendLinkBudget(linkId: string) {
  const t = Date.now()
  const recent = (k: string) => (linkOpens.get(k) ?? []).filter((x) => t - x < LINK_BUDGET.windowMs)
  const mine = recent(linkId), all = recent("*")
  if (mine.length >= LINK_BUDGET.perLink || all.length >= LINK_BUDGET.perInstance)
    throw new SiteError("limit", "This link is busy right now. Try again in a few minutes.")
  linkOpens.set(linkId, [...mine, t]); linkOpens.set("*", [...all, t])
  if (linkOpens.size > 5000) for (const k of linkOpens.keys()) { if (k !== "*") { linkOpens.delete(k); break } }
}

export async function sessionFromLink(linkId: string, origin: string): Promise<SessionView> {
  const row = await linkRow(linkId, origin)
  if (!row) throw new SiteError("not_found", "This payment link doesn't exist")
  // the attribute index can trail a fresh change by a few seconds: re-read the entity itself (authoritative)
  const fresh: any = await arkiv().pub.getEntity(row.key, PayLink).catch(() => null)
  if (row.status !== "active" || !fresh || v(fresh.status) !== "active") throw new SiteError("forbidden", "This payment link was switched off by the shop")
  const site = await siteRowFor(row.site)
  if (!site || site.status !== "active") throw new SiteError("forbidden", "This shop isn't taking payments through this link right now")
  spendLinkBudget(row.linkId)
  const amount = (Number(row.amount) / 1e6).toFixed(6).replace(/0{1,4}$/, "")
  const { session, publish } = await createCheckoutSession(site, { amount, description: row.title, reference: `link:${row.linkId}` }, origin, { link: row.linkId })
  await publish() // links are opened by people, not servers: publish before answering so the page never waits
  return session
}
