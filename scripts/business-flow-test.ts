// WondrPay for Business end to end on testnet, in-process (no dev server needed; same code the API routes call):
//  new shop wallet → shop sign-up → website + API keys (wallet-approved) → checkout session with the secret key →
//  customer pays it gaslessly → session reads "paid" → the shop's own wallet-signed QR still works →
//  bad keys / foreign return URLs / float amounts refused → rotate (old key dies) → switch off (signer handed back).
// Run: npx tsx --env-file=.env scripts/business-flow-test.ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import type { Hex } from "viem"
import { merchantSignupMessage, siteApprovalMessage, receiveAuthTypedData, orderTypedData, REGISTRY_ABI, ROUTER_ADDRESS } from "@whitepay/shared"
import {
  config, wc, registerMerchant, createSite, rotateSiteKey, revokeSite, listSites, authenticateSecretKey, createCheckoutSession,
  getCheckoutSession, orderSignerAddress, fetchRequest, verifyRequest, relayOrderPayment, preparePaymentRequest, SiteError,
} from "@whitepay/server"

const shop = privateKeyToAccount(generatePrivateKey())
const payer = privateKeyToAccount(process.env.CUSTOMER_PK as Hex)
const ORIGIN = "https://wondrpay.vercel.app"
const now = () => Math.floor(Date.now() / 1000)
let fails = 0
const ok = (cond: unknown, what: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${what}`); if (!cond) fails++ }
const code = async (f: () => Promise<unknown>) => { try { await f(); return "ok" } catch (e) { return e instanceof SiteError ? `${e.status} ${e.code}` : `error: ${(e as Error).message.split("\n")[0]}` } }
const signer = async () => (await wc().pub.readContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "get", args: [shop.address] })).signer
const bearer = (k: string) => `Bearer ${k}`

async function approve(action: "create" | "rotate" | "revoke", s: { siteId: string; name: string; domains: string[] }) {
  if (action !== "create") await new Promise((r) => setTimeout(r, 1100)) // approvals must be newer than the last change
  const issuedAt = now()
  const signature = await shop.signMessage({ message: siteApprovalMessage({ action, merchant: shop.address, ...s, orderSigner: orderSignerAddress(), issuedAt }) })
  return { merchant: shop.address, siteId: s.siteId, issuedAt, signature }
}

async function main() {
  // 1. shop sign-up
  const label = `biz-${Math.random().toString(36).slice(2, 8)}`
  const issuedAt = now()
  await registerMerchant({ label, displayName: "Test Biz", address: shop.address, issuedAt,
    signature: await shop.signMessage({ message: merchantSignupMessage({ label, displayName: "Test Biz", address: shop.address, issuedAt }) }) })
  ok((await signer()).toLowerCase() === shop.address.toLowerCase(), `shop ${label} registered; order signer is the shop wallet`)

  // 2. website + keys
  const site = { siteId: [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join(""), name: "Test site", domains: ["shop.example.com", "localhost"] }
  const forgedSig = await payer.signMessage({ message: siteApprovalMessage({ action: "create", merchant: shop.address, ...site, orderSigner: orderSignerAddress(), issuedAt: now() }) })
  ok(await code(() => createSite({ merchant: shop.address, ...site, issuedAt: now(), signature: forgedSig })) === "401 unauthorized", "someone else's signature can't add a website")
  ok(await code(() => createSite({ ...site, merchant: shop.address, domains: ["not a domain!"], issuedAt: now(), signature: forgedSig })) === "400 bad_request", "bad domains refused")
  const created = await createSite({ ...(await approve("create", site)), name: site.name, domains: site.domains })
  ok(/^wp_sk_test_[0-9a-f]{32}_/.test(created.secretKey), `website created; secret key returned once (…${created.site.secretHint})`)
  ok((await signer()).toLowerCase() === orderSignerAddress().toLowerCase(), `order signer switched to WondrPay's order key (tx ${created.signerTx})`)
  const listed = JSON.stringify(await listSites(shop.address))
  ok(!listed.includes(created.secretKey) && !listed.includes("secretHash"), "the website list never contains the secret or its hash")

  // 3. sessions with the secret key
  ok(await code(() => authenticateSecretKey("Bearer wp_sk_test_nope")) === "401 unauthorized", "malformed key refused")
  ok(await code(() => authenticateSecretKey(bearer(created.secretKey.slice(0, -1) + (created.secretKey.endsWith("A") ? "B" : "A")))) === "401 unauthorized", "a key one character off is refused")
  const s = await authenticateSecretKey(bearer(created.secretKey))
  ok(await code(() => createCheckoutSession(s, { amount: "0.20", successUrl: "https://evil.example.net/x" }, ORIGIN)) === "403 forbidden", "successUrl off the site's domains refused")
  ok(await code(() => createCheckoutSession(s, { amount: 0.1 + 0.2 }, ORIGIN)) === "400 bad_request", "float amount 0.30000000000000004 refused")
  ok(await code(() => createCheckoutSession(s, { amount: "5000" }, ORIGIN)) === "400 bad_request", "amount above 1000 USDT refused")
  const ref = `order_${Date.now()}`
  const { session, publish } = await createCheckoutSession(s, { amount: "0.20", reference: ref, description: "Test item ×1",
    successUrl: "https://shop.example.com/thanks", cancelUrl: "http://localhost:3100/cart" }, ORIGIN)
  ok(session.status === "open" && session.amount === "0.20" && session.url.endsWith(session.id), `session ${session.id.slice(0, 10)}… open, ${session.amount} USDT`)
  await publish()
  const view = await fetchRequest(session.id)
  ok(view?.successUrl === "https://shop.example.com/thanks" && view.reference === ref && view.site === site.siteId, "session stored with its reference, site and return URLs")
  const v = await verifyRequest(view)
  ok(v.ok, `hosted checkout verifies it against the registry (${v.ok ? "ok" : v.reason})`)

  // 4. customer pays (gasless)
  if (!v.ok) throw new Error("can't pay an invalid session")
  const validBefore = v.order.deadline
  const sig = await payer.signTypedData(receiveAuthTypedData({ from: payer.address, to: ROUTER_ADDRESS, value: v.order.amount, validAfter: 0n, validBefore, nonce: v.digest }))
  const paid = await relayOrderPayment({ order: v.order, merchantSig: v.merchantSig, auth: { from: payer.address, validAfter: 0n, validBefore, signature: sig } })
  ok(!!paid.txHash, `paid on Whitechain: ${paid.explorer}`)
  const st = await getCheckoutSession(s, session.id, ORIGIN)
  ok(st.status === "paid" && st.payment?.payer === payer.address, `session reads paid by ${st.payment?.payer.slice(0, 8)}…`)

  // 5. the shop's own wallet-signed QR still works: WondrPay countersigns with the order key
  const order = { merchant: shop.address, amount: 50_000n, orderId: `0x${"ab".repeat(32)}` as Hex, deadline: BigInt(now() + 300) }
  const merchantSig = await shop.signTypedData(orderTypedData(ROUTER_ADDRESS, order))
  const prep = await preparePaymentRequest({ merchant: shop.address, amount: order.amount, signed: { order, merchantSig } })
  ok(prep.digest && (prep.values as any).merchantSig, "shop's own signed QR accepted after switching to API keys")
  const stranger = privateKeyToAccount(generatePrivateKey())
  const strangerSig = await stranger.signTypedData(orderTypedData(ROUTER_ADDRESS, order))
  ok(await code(() => preparePaymentRequest({ merchant: shop.address, amount: order.amount, signed: { order, merchantSig: strangerSig } })) !== "ok", "a stranger's order signature is still refused")

  // 6. rotate, then switch off
  const rotApproval = await approve("rotate", site)
  const rot = await rotateSiteKey(rotApproval)
  ok(rot.secretKey !== created.secretKey, "new secret key issued")
  ok(await code(() => rotateSiteKey(rotApproval)) === "409 conflict", "replaying the same rotate approval is refused")
  ok(await code(() => getCheckoutSession(s, `0x${"12".repeat(32)}`, ORIGIN)) !== "ok", "an unknown or foreign session id isn't reported")
  ok(await code(() => authenticateSecretKey(bearer(created.secretKey))) === "401 unauthorized", "old key refused after rotating")
  const s2 = await authenticateSecretKey(bearer(rot.secretKey))
  ok(await code(() => getCheckoutSession(s2, prep.digest, ORIGIN)) === "404 not_found", "a key can only read its own site's sessions")
  const rev = await revokeSite(await approve("revoke", site))
  ok(rev.site.status === "revoked", "website switched off")
  ok(await code(() => authenticateSecretKey(bearer(rot.secretKey))) === "403 forbidden", "keys of a switched-off website refused")
  ok((await signer()).toLowerCase() === shop.address.toLowerCase(), `order signing handed back to the shop wallet (tx ${rev.signerTx})`)
  console.log(fails ? `\n${fails} FAILED` : "\nall passed")
}
main().then(() => process.exit(fails ? 1 : 0), (e) => { console.error(e); process.exit(1) })
