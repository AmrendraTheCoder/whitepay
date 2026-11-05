// Pay a demo-store order end to end: store creates order -> customer pays gaslessly via WhitePay
// -> WhitePay fires the store's webhook -> store verifies on-chain.
// Run: npx tsx --env-file=.env scripts/store-checkout-test.ts [store=https://whitepay-demo-store.vercel.app] [sku=sticker-pack]
import { privateKeyToAccount } from "viem/accounts"
import type { Hex } from "viem"
import { receiveAuthTypedData } from "@whitepay/shared"
import { config, fetchRequest, verifyRequest } from "@whitepay/server"

const STORE = process.argv[2] ?? "https://whitepay-demo-store.vercel.app"
const SKU = process.argv[3] ?? "sticker-pack"
const WP = "https://whitepay.vercel.app"
const payer = privateKeyToAccount(process.env.CUSTOMER_PK as Hex)

async function main() {
const order = await fetch(`${STORE}/api/create-order`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: { sku: SKU } }) }).then((r) => r.json())
console.log("1. store created order", order.orderId, "amount", order.amount, "->", order.payUrl)

const v = await verifyRequest(await fetchRequest(order.entityKey))
if (!v.ok) throw new Error(v.reason)
const validBefore = BigInt(Math.floor(Date.now() / 1000) + 900)
const signature = await payer.signTypedData(receiveAuthTypedData({ from: payer.address, to: config.router, value: v.order.amount, validAfter: 0n, validBefore, nonce: v.digest }))
const paid = await fetch(`${WP}/api/pay`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ entityKey: order.entityKey, auth: { from: payer.address, validAfter: "0", validBefore: validBefore.toString(), signature } }) }).then((r) => r.json())
if (paid.error) throw new Error(paid.error)
console.log("2. paid gaslessly", paid.explorer ?? paid.txHash)

const s = await fetch(`${WP}/api/requests/${order.entityKey}`).then((r) => r.json())
console.log("3. button poll sees state =", s.state)
const ver = await fetch(`${STORE}/api/verify?tx=${s.receipt?.txHash ?? paid.txHash}&orderId=${order.orderId}`).then((r) => r.json())
console.log("4. store verified on-chain:", ver)
}
main().catch((e) => { console.error(e); process.exit(1) })
