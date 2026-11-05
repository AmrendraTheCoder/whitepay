// Gasless person-to-person push: the demo customer sends USDT to any address via PaymentRouter.payDirect.
// The sender signs an EIP-3009 authorization whose nonce binds recipient + memo; the relayer pays gas.
// Run: npx tsx --env-file=.env scripts/p2p-send.ts <toAddress> [amountUSDT=1] [memo]
import { getAddress, keccak256, parseUnits, toHex, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { receiveAuthTypedData, ROUTER_ABI } from "@whitepay/shared"
import { config, wc, relayDirectPayment } from "@whitepay/server"

const [to, amt = "1", memoText = `p2p/${Date.now()}`] = process.argv.slice(2)
if (!to) throw new Error("usage: p2p-send.ts <to> [amount] [memo]")
const sender = privateKeyToAccount(process.env.CUSTOMER_PK as Hex)
const amount = parseUnits(amt, 6)
const memo = keccak256(toHex(memoText))
const recipient = getAddress(to)

async function main() {
  const nonce = await wc().pub.readContract({ address: config.router, abi: ROUTER_ABI, functionName: "directNonce", args: [recipient, memo] })
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600)
  const signature = await sender.signTypedData(
    receiveAuthTypedData({ from: sender.address, to: config.router, value: amount, validAfter: 0n, validBefore, nonce }),
  )
  const r = await relayDirectPayment({ to: recipient, amount, memo, auth: { from: sender.address, validAfter: 0n, validBefore, signature } })
  console.log(`sent ${amt} USDT ${sender.address} -> ${recipient} (gas paid by relayer)\n${r.explorer}`)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
