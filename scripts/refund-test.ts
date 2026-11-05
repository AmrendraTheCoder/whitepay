// Refund the latest demo-store QR payment partially through the /api/refund route (shop signs, relayer pays gas).
// Run: npx tsx --env-file=.env scripts/refund-test.ts [base=http://localhost:3000] [amount=0.10]
import { parseUnits, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { receiveAuthTypedData, ROUTER_ADDRESS } from "@whitepay/shared"

const BASE = process.argv[2] ?? "http://localhost:3000"
const AMT = parseUnits(process.argv[3] ?? "0.10", 6)
const shop = privateKeyToAccount(process.env.STORE_MERCHANT_PK as Hex)

async function main() {
  const d = await fetch(`${BASE}/api/receipts?merchant=${shop.address}&limit=5`).then((r) => r.json())
  const row = d.rows.find((r: any) => r.kind !== "p2p" && r.paymentId && BigInt(r.refunded) < BigInt(r.amount))
  if (!row) throw new Error("no refundable receipt")
  console.log("receipt", row.key, "paid", row.amount, "refunded", row.refunded, "payer", row.payer)
  const info = await fetch(`${BASE}/api/refund?paymentId=${row.paymentId}`).then((r) => r.json())
  console.log("on-chain refundable", info.refundable)

  // negative test: a stranger (the customer) can't authorize a refund
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600)
  const stranger = privateKeyToAccount(process.env.CUSTOMER_PK as Hex)
  const bad = await fetch(`${BASE}/api/refund`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    paymentId: row.paymentId, amount: AMT.toString(),
    auth: { from: stranger.address, validAfter: "0", validBefore: validBefore.toString(), signature: await stranger.signTypedData(receiveAuthTypedData({ from: stranger.address, to: ROUTER_ADDRESS, value: AMT, validAfter: 0n, validBefore, nonce: info.nonce })) } }) }).then((r) => r.json())
  console.log("stranger refund ->", bad.error)

  const signature = await shop.signTypedData(receiveAuthTypedData({ from: shop.address, to: ROUTER_ADDRESS, value: AMT, validAfter: 0n, validBefore, nonce: info.nonce }))
  const ok = await fetch(`${BASE}/api/refund`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    paymentId: row.paymentId, amount: AMT.toString(), auth: { from: shop.address, validAfter: "0", validBefore: validBefore.toString(), signature } }) }).then((r) => r.json())
  console.log("shop refund ->", ok)
  await new Promise((r) => setTimeout(r, 3000))
  const after = await fetch(`${BASE}/api/receipts?merchant=${shop.address}&limit=5`).then((r) => r.json())
  const a = after.rows.find((r: any) => r.key === row.key)
  console.log("Arkiv receipt now: status", a.status, "refunded", a.refunded)
}
main().catch((e) => { console.error(e); process.exit(1) })
