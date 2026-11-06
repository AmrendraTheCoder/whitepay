// WondrPay for Business phase 2 on testnet, in-process: payment link → session → gasless payment → receipt tagged
// with site + link → link stats + integration check → test webhook + resend (delivery log) → link switched off.
// Run: npx tsx --env-file=.env scripts/business-phase2-test.ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import type { Hex } from "viem"
import { merchantSignupMessage, siteApprovalMessage, paymentLinkMessage, webhookActionMessage, receiveAuthTypedData, ROUTER_ADDRESS } from "@whitepay/shared"
import {
  registerMerchant, createSite, orderSignerAddress, fetchRequest, verifyRequest, relayOrderPayment, settleOnArkiv,
  createLink, disableLink, listLinks, publicLink, sessionFromLink, siteHealth, pingWebhook, resendWebhook, listDeliveries, SiteError,
} from "@whitepay/server"

const ORIGIN = "https://wondrpay.vercel.app"
const HOOK = "https://httpbin.org/post" // any public https endpoint that answers 200
const shop = privateKeyToAccount(generatePrivateKey())
const payer = privateKeyToAccount(process.env.CUSTOMER_PK as Hex)
const now = () => Math.floor(Date.now() / 1000)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
let fails = 0
const ok = (c: unknown, what: string) => { console.log(`${c ? "PASS" : "FAIL"}  ${what}`); if (!c) fails++ }
const code = async (f: () => Promise<unknown>) => { try { await f(); return "ok" } catch (e) { return e instanceof SiteError ? `${e.status} ${e.code}` : `error: ${(e as Error).message.split("\n")[0]}` } }
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("")

async function main() {
  const label = `biz2-${hex(3)}`, t = now()
  await registerMerchant({ label, displayName: "Phase 2 Shop", address: shop.address, issuedAt: t, signature: await shop.signMessage({ message: merchantSignupMessage({ label, displayName: "Phase 2 Shop", address: shop.address, issuedAt: t }) }) })
  const site = { siteId: hex(16), name: "P2 site", domains: ["shop.example.com"], webhook: HOOK }
  const i = now()
  await createSite({ merchant: shop.address, ...site, issuedAt: i, signature: await shop.signMessage({ message: siteApprovalMessage({ action: "create", merchant: shop.address, ...site, orderSigner: orderSignerAddress(), issuedAt: i }) }) })
  ok(true, `shop ${label} with a website`)

  // payment link
  const linkId = `pl_${hex(10)}`, title = "Silk dupatta", amount = "0.15"
  const li = now()
  const forged = await payer.signMessage({ message: paymentLinkMessage({ action: "create", merchant: shop.address, site: site.siteId, linkId, title, amount, issuedAt: li }) })
  ok(await code(() => createLink({ merchant: shop.address, siteId: site.siteId, linkId, title, amount, issuedAt: li, signature: forged }, ORIGIN)) === "401 unauthorized", "someone else can't make links for this shop")
  const link = await createLink({ merchant: shop.address, siteId: site.siteId, linkId, title, amount, issuedAt: li,
    signature: await shop.signMessage({ message: paymentLinkMessage({ action: "create", merchant: shop.address, site: site.siteId, linkId, title, amount, issuedAt: li }) }) }, ORIGIN)
  ok(link.url === `${ORIGIN}/l/${linkId}` && link.amount === "150000", `link created: ${link.url}`)
  const pub = await publicLink(linkId, ORIGIN)
  ok(pub?.active && pub.title === title && !JSON.stringify(pub).includes("approval"), "public link view: title, price, shop, nothing secret")

  const session = await sessionFromLink(linkId, ORIGIN)
  ok(session.amount === "0.15" && session.reference === `link:${linkId}` && session.button?.amount === "150000", `session from link: ${session.amount} USDT, button payload ready`)
  const view = await fetchRequest(session.id)
  ok(view?.link === linkId && view.site === site.siteId, "session carries its link and website")
  const v = await verifyRequest(view)
  if (!v.ok) throw new Error(v.reason)
  const sig = await payer.signTypedData(receiveAuthTypedData({ from: payer.address, to: ROUTER_ADDRESS, value: v.order.amount, validAfter: 0n, validBefore: v.order.deadline, nonce: v.digest }))
  const paid = await relayOrderPayment({ order: v.order, merchantSig: v.merchantSig, auth: { from: payer.address, validAfter: 0n, validBefore: v.order.deadline, signature: sig } })
  ok(!!paid.txHash, `paid: ${paid.explorer}`)
  await settleOnArkiv({ request: view!, merchant: v.order.merchant, merchantName: view!.merchantName, payer: payer.address, amount: v.order.amount, paymentId: paid.paymentId, txHash: paid.txHash, block: paid.block })

  await wait(6000) // health/links read through short caches
  const links = await listLinks(shop.address, ORIGIN)
  ok(links[0]?.paid === 1 && links[0]?.volume === "150000", `link stats: ${links[0]?.paid} paid, ${Number(links[0]?.volume) / 1e6} USDT`)
  const h1 = await siteHealth(shop.address, site.siteId)
  ok(h1.checks.find((c) => c.id === "paid")?.ok && h1.payments.count === 1, `integration check sees the payment (${h1.checks.find((c) => c.id === "paid")?.detail})`)

  // webhooks: test ping, log, resend
  const pi = now()
  const ping = await pingWebhook({ merchant: shop.address, siteId: site.siteId, issuedAt: pi, signature: await shop.signMessage({ message: webhookActionMessage({ action: "ping", merchant: shop.address, site: site.siteId, target: HOOK, issuedAt: pi }) }) })
  ok(ping.status === "delivered", `test webhook delivered (HTTP ${ping.httpStatus}${ping.error ? `, ${ping.error}` : ""})`)
  ok(await code(() => pingWebhook({ merchant: shop.address, siteId: site.siteId, issuedAt: pi, signature: "0x00" as Hex })) !== "ok", "bad signature refused")
  await wait(6000)
  const log = await listDeliveries(site.siteId)
  ok(log[0]?.event === "test.ping" && log[0].status === "delivered", `delivery logged: ${log[0]?.event} ${log[0]?.status} HTTP ${log[0]?.httpStatus}`)
  const ri = now()
  const re = await resendWebhook({ merchant: shop.address, siteId: site.siteId, deliveryKey: log[0].key, issuedAt: ri,
    signature: await shop.signMessage({ message: webhookActionMessage({ action: "resend", merchant: shop.address, site: site.siteId, target: log[0].key, issuedAt: ri }) }) })
  ok(re.eventId === log[0].eventId && re.status === "delivered", "resend uses the same event id and is delivered")
  await wait(6000)
  const h2 = await siteHealth(shop.address, site.siteId)
  ok(h2.checks.every((c) => c.ok), `integration check all green: ${h2.checks.map((c) => `${c.label} ${c.ok ? "✓" : "✗"}`).join(", ")}`)

  // switch the link off
  await wait(1100)
  const di = now()
  await disableLink({ merchant: shop.address, linkId, issuedAt: di, signature: await shop.signMessage({ message: paymentLinkMessage({ action: "disable", merchant: shop.address, site: site.siteId, linkId, title, amount: "0.15", issuedAt: di }) }) }, ORIGIN)
  await wait(11000) // link cache
  ok(await code(() => sessionFromLink(linkId, ORIGIN)) === "403 forbidden", "a switched-off link makes no new sessions")
  console.log(fails ? `\n${fails} FAILED` : "\nall passed")
}
main().then(() => process.exit(fails ? 1 : 0), (e) => { console.error(e); process.exit(1) })
