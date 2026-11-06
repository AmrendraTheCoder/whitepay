// Refund requests end to end (everything real except the World ID scan, which can't be scripted):
//  buy a store product -> payer opens a refund request (signed) -> shop approves 50% (signed + on-chain
//  refund) -> payer replies -> case + orders dashboard show it all.
// Run: npx tsx --env-file=.env scripts/refund-request-test.ts [wondrpay=http://localhost:3000]
import { privateKeyToAccount } from "viem/accounts"
import type { Hex } from "viem"
import { receiveAuthTypedData, refundRequestMessage, refundResponseMessage, refundReplyMessage } from "@whitepay/shared"
import { config, fetchRequest, verifyRequest, refundInfo } from "@whitepay/server"
import { recordOpen, caseIdOf } from "../packages/server/src/refund-cases"

const WP = process.argv[2] ?? "http://localhost:3000"
const STORE = "https://wondrpay-demo-store.vercel.app"
const payer = privateKeyToAccount(process.env.CUSTOMER_PK as Hex)
const shop = privateKeyToAccount(process.env.STORE_MERCHANT_PK as Hex)
const post = (path: string, body: unknown) => fetch(WP + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(`${path}: ${d.error}`); return d })
const now = () => Math.floor(Date.now() / 1000)

async function main() {
  // 1. buy
  const order = await fetch(`${STORE}/api/create-order`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: { sku: "sticker-pack" } }) }).then((r) => r.json())
  let view = await fetchRequest(order.entityKey)
  for (let i = 0; !view && i < 20; i++) { await new Promise((r) => setTimeout(r, 1000)); view = await fetchRequest(order.entityKey) }
  const v = await verifyRequest(view)
  if (!v.ok) throw new Error(v.reason)
  const validBefore = BigInt(now() + 900)
  const signature = await payer.signTypedData(receiveAuthTypedData({ from: payer.address, to: config.router, value: v.order.amount, validAfter: 0n, validBefore, nonce: v.digest }))
  const paid = await post("/api/pay", { entityKey: order.entityKey, auth: { from: payer.address, validAfter: "0", validBefore: validBefore.toString(), signature } })
  const paymentId = v.digest
  console.log("1. bought", view?.note, "for", Number(v.order.amount) / 1e6, "USDT", paid.explorer)

  // 2. payer opens a request (the route would first check World ID; here we record with a test nullifier)
  const issuedAt = now()
  const req = { paymentId, payer: payer.address, reason: "damaged", message: "Two of the six stickers arrived torn along the edge.", evidence: "https://example.com/photo.jpg", issuedAt }
  const sig = await payer.signMessage({ message: refundRequestMessage(req) })
  const info = (await refundInfo(paymentId))!
  const opened = await recordOpen({ ...req, signature: sig }, caseIdOf(paymentId, payer.address, issuedAt), info, `test-human-${payer.address.toLowerCase()}`)
  console.log("2. opened:", opened?.status, "round", opened?.round, "| until", new Date((opened?.until ?? 0) * 1000).toISOString(), "| item", opened?.item)
  const caseId = opened!.caseId

  // 3. shop sees it in the orders dashboard
  const dash = await fetch(`${WP}/api/orders?merchant=${shop.address}`).then((r) => r.json())
  const row = dash.orders.find((o: any) => o.paymentId === paymentId.toLowerCase())
  console.log("3. dashboard row:", row?.item, "| paid", Number(row?.amount) / 1e6, "| refund case", row?.refund?.status, "| this person's requests in 30d:", row?.refund?.humanRequests30d)

  // 4. shop approves 50%: signs the decision AND the on-chain refund authorization for exactly that amount
  const ri = await fetch(`${WP}/api/refund?paymentId=${paymentId}`).then((r) => r.json())
  const value = (BigInt(ri.amount) * 50n) / 100n
  const rb = BigInt(now() + 600)
  const refundSig = await shop.signTypedData(receiveAuthTypedData({ from: shop.address, to: config.router, value, validAfter: 0n, validBefore: rb, nonce: ri.nonce }))
  const rIssued = now()
  const resp = { caseId, merchant: shop.address, decision: "approve" as const, percent: 50, message: "Sorry about that, refunding half for the torn stickers.", issuedAt: rIssued }
  const r1 = await post("/api/refunds", { action: "respond", ...resp, signature: await shop.signMessage({ message: refundResponseMessage(resp) }),
    refundAuth: { from: shop.address, validAfter: "0", validBefore: rb.toString(), signature: refundSig, value: value.toString() } })
  const tx = r1.case.events.find((e: any) => e.kind === "response")?.refundTx
  console.log("4. approved 50%:", r1.case.status, "| refunded", Number(r1.case.refunded) / 1e6, "USDT | tx", tx)

  // 5. payer replies (keeps it active for another 12 h)
  const rep = { caseId, payer: payer.address, message: "Thanks, received the half refund.", issuedAt: now() }
  const r2 = await post("/api/refunds", { action: "reply", ...rep, signature: await payer.signMessage({ message: refundReplyMessage(rep) }) })
  console.log("5. replied:", r2.case.status, "| resolves at", new Date(r2.case.until * 1000).toISOString(), "| events", r2.case.events.map((e: any) => e.kind).join(" → "))

  // 6. tamper checks
  const forged = await post("/api/refunds", { action: "respond", ...resp, issuedAt: now(), percent: 100, signature: await payer.signMessage({ message: refundResponseMessage({ ...resp, percent: 100, issuedAt: now() }) }) }).catch((e) => (e as Error).message)
  console.log("6. payer pretending to be the shop:", forged)
  const onchain = await refundInfo(paymentId)
  console.log("7. on-chain: paid", Number(onchain!.amount) / 1e6, "refunded", Number(onchain!.refunded) / 1e6, "→ only to", onchain!.payer)
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
