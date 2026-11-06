// Fire N gasless P2P payments at the same moment from one wallet (and one from another) and check every one lands.
// This is the "fails on the first try" case: parallel relays used to share a relayer nonce.
// Run: npx tsx --env-file=.env scripts/concurrency-test.ts [n=4]
import { privateKeyToAccount } from "viem/accounts"
import { keccak256, toHex, type Hex } from "viem"
import { receiveAuthTypedData, directNonce, ROUTER_ADDRESS } from "@whitepay/shared"
import { relayDirectPayment, wc } from "@whitepay/server"

const payer = privateKeyToAccount(process.env.CUSTOMER_PK as Hex)
const to = privateKeyToAccount(process.env.MERCHANT_PK as Hex).address
async function one(i: number) {
  const memo = keccak256(toHex(`concurrency-${Date.now()}-${i}-${Math.random()}`))
  const nonce = directNonce(to, memo)
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600)
  const signature = await payer.signTypedData(receiveAuthTypedData({ from: payer.address, to: ROUTER_ADDRESS, value: 10_000n, validAfter: 0n, validBefore, nonce }))
  const t = Date.now()
  const r = await relayDirectPayment({ to, amount: 10_000n, memo, auth: { from: payer.address, validAfter: 0n, validBefore, signature } })
  return { i, ms: Date.now() - t, tx: r.txHash }
}
async function main() {
  const n = Number(process.argv[2] ?? 4)
  console.log("relayers:", wc().relayers.length, "| payer's relayer:", wc().relayerFor(payer.address).account.address)
  const res = await Promise.allSettled(Array.from({ length: n }, (_, i) => one(i)))
  res.forEach((r, i) => console.log(r.status === "fulfilled" ? `PASS  payment ${i} in ${r.value.ms} ms  ${r.value.tx.slice(0, 14)}…` : `FAIL  payment ${i}: ${(r.reason as Error).message.split("\n")[0]}`))
  const ok = res.filter((r) => r.status === "fulfilled").length
  console.log(ok === n ? "\nall passed" : `\n${n - ok} FAILED`)
  process.exit(ok === n ? 0 : 1)
}
main()
