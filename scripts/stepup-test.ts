// Step-up policy: with STEP_UP_USDT lowered, a payment above it is refused without a World ID check
// and goes through once the (server-verified) step-up flag is present.
// Run: STEP_UP_USDT=0.3 npx tsx --env-file=.env scripts/stepup-test.ts
import { privateKeyToAccount } from "viem/accounts"
import type { Hex } from "viem"
import { receiveAuthTypedData } from "@whitepay/shared"
import { config, fetchRequest, verifyRequest, relayOrderPayment, stepUpThreshold, PolicyError } from "@whitepay/server"

const payer = privateKeyToAccount(process.env.CUSTOMER_PK as Hex)
async function main() {
  console.log("threshold", Number(stepUpThreshold()) / 1e6, "USDT")
  const order = await fetch("https://whitepay-demo-store.vercel.app/api/create-order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: { sku: "sticker-pack" } }) }).then((r) => r.json())
  const v = await verifyRequest(await fetchRequest(order.entityKey))
  if (!v.ok) throw new Error(v.reason)
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 900)
  const signature = await payer.signTypedData(receiveAuthTypedData({ from: payer.address, to: config.router, value: v.order.amount, validAfter: 0n, validBefore, nonce: v.digest }))
  const auth = { from: payer.address, validAfter: 0n, validBefore, signature }
  try {
    await relayOrderPayment({ order: v.order, merchantSig: v.merchantSig, auth, stepUpVerified: false })
    console.log("UNEXPECTED: paid without step-up")
  } catch (e) {
    console.log("without World ID ->", e instanceof PolicyError ? `${e.code}: ${e.message}` : (e as Error).message)
  }
  const r = await relayOrderPayment({ order: v.order, merchantSig: v.merchantSig, auth, stepUpVerified: true })
  console.log("with World ID step-up -> paid", r.explorer)
}
main().catch((e) => { console.error(e); process.exit(1) })
