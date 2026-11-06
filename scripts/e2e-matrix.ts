// End-to-end transfer matrix on live Whitechain Sepolia + Arkiv + ENS:
//   personal -> merchant (QR order), personal -> personal (P2P), personal -> merchant (by ENS name),
//   merchant -> personal (P2P), merchant -> merchant (B2B by ENS name), merchant refund -> customer.
// Every payer has 0 WBT; the relayer pays gas. Verifies balance deltas and that each side's
// activity (/api/activity on the live site) shows the payment in the right direction.
// Run: npx tsx --env-file=.env scripts/e2e-matrix.ts [baseUrl=https://wondrpay.vercel.app]
import { formatUnits, getAddress, keccak256, parseSignature, parseUnits, toHex, type Address, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts"
import { receiveAuthTypedData, directNonce, ERC20_ABI } from "@whitepay/shared"
import {
  config, wc, createPaymentRequest, fetchRequest, verifyRequest, relayOrderPayment, relayDirectPayment, settleOnArkiv, resolveName,
} from "@whitepay/server"

const BASE = process.argv[2] ?? "https://wondrpay.vercel.app"
const P1 = privateKeyToAccount(process.env.CUSTOMER_PK as Hex) // personal customer
const P2 = privateKeyToAccount(generatePrivateKey()) // fresh personal wallet (created for this run)
const M1 = privateKeyToAccount(process.env.MERCHANT_PK as Hex) // business: chai-shop.wondrpay.eth payout + refund key
const M1_NAME = "chai-shop.wondrpay.eth"
const M2_NAME = "masala-corner.wondrpay.eth" // business, receive-only here
const u = (x: string) => parseUnits(x, 6)
const fmt = (x: bigint) => formatUnits(x, 6)

const REFUND_ABI = [
  { type: "function", name: "refundNonce", stateMutability: "view", inputs: [{ name: "paymentId", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "refund", stateMutability: "nonpayable", inputs: [
    { name: "paymentId", type: "bytes32" }, { name: "amount", type: "uint256" },
    { name: "a", type: "tuple", components: [
      { name: "from", type: "address" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" },
      { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" } ] } ], outputs: [] },
] as const

const bal = async (a: Address) => wc().pub.readContract({ address: config.usdt, abi: ERC20_ABI, functionName: "balanceOf", args: [a] })
const auth = async (signer: PrivateKeyAccount, value: bigint, nonce: Hex) => {
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 900)
  const signature = await signer.signTypedData(receiveAuthTypedData({ from: signer.address, to: config.router, value, validAfter: 0n, validBefore, nonce }))
  return { from: signer.address, validAfter: 0n, validBefore, signature }
}

type Result = { name: string; from: string; to: string; amount: string; tx: string; ok: boolean; note?: string }
const results: Result[] = []

async function p2p(name: string, from: PrivateKeyAccount, fromLabel: string, to: Address, toLabel: string, amt: string) {
  const memo = keccak256(toHex(`${name}/${Date.now()}/${Math.random()}`))
  const a = await auth(from, u(amt), directNonce(to, memo))
  const r = await relayDirectPayment({ to, amount: u(amt), memo, auth: a })
  await settleOnArkiv({ merchant: to, merchantName: toLabel.endsWith(".eth") ? toLabel : undefined, payer: from.address, amount: u(amt), paymentId: memo, txHash: r.txHash, block: r.block, kind: "p2p" })
  results.push({ name, from: fromLabel, to: toLabel, amount: amt, tx: r.explorer, ok: true })
}

async function main() {
  const M1a = getAddress(M1.address)
  const M2a = (await resolveName(M2_NAME))!
  const M1resolved = await resolveName(M1_NAME)
  console.log(`P1 personal ${P1.address}\nP2 personal ${P2.address} (new)\nM1 ${M1_NAME} ${M1a} (ENS -> ${M1resolved})\nM2 ${M2_NAME} ${M2a}\n`)
  const parties = { P1: P1.address, P2: P2.address, M1: M1a, M2: M2a } as Record<string, Address>
  const before: Record<string, bigint> = {}
  for (const [k, a] of Object.entries(parties)) before[k] = await bal(a)

  // 1. personal -> merchant: dynamic QR order (Arkiv request, 4-step verify, payOrder)
  const req = await createPaymentRequest({ merchant: M1a, merchantName: M1_NAME, amount: u("0.30") })
  const v = await verifyRequest(await fetchRequest(req.entityKey))
  if (!v.ok) throw new Error(v.reason)
  const a1 = await auth(P1, v.order.amount, v.digest)
  const r1 = await relayOrderPayment({ order: v.order, merchantSig: v.merchantSig, auth: a1 })
  await settleOnArkiv({ request: (await fetchRequest(req.entityKey))!, merchant: M1a, merchantName: M1_NAME, payer: P1.address, amount: v.order.amount, paymentId: r1.paymentId, txHash: r1.txHash, block: r1.block })
  results.push({ name: "1 personal → merchant (QR order)", from: "P1", to: M1_NAME, amount: "0.30", tx: r1.explorer, ok: true })

  // 2. personal -> personal (P2P push)
  await p2p("2 personal → personal (P2P)", P1, "P1", P2.address, "P2", "0.40")
  // 3. personal -> merchant by ENS name (scan a shop's Receive QR / type its name)
  await p2p("3 personal → merchant (by ENS name)", P2, "P2", M2a, M2_NAME, "0.10")
  // 4. merchant -> personal (cashback / supplier payout)
  await p2p("4 merchant → personal", M1, M1_NAME, P2.address, "P2", "0.20")
  // 5. merchant -> merchant (B2B by ENS name)
  await p2p("5 merchant → merchant (B2B)", M1, M1_NAME, M2a, M2_NAME, "0.15")

  // 6. merchant refunds part of payment 1 to the ORIGINAL payer (gasless, capped on-chain)
  const nonce = await wc().pub.readContract({ address: config.router, abi: REFUND_ABI, functionName: "refundNonce", args: [r1.paymentId] })
  const ra = await auth(M1, u("0.10"), nonce)
  const { r, s, v: vv, yParity } = parseSignature(ra.signature)
  const { request } = await wc().pub.simulateContract({
    account: wc().relayer.account, address: config.router, abi: REFUND_ABI, functionName: "refund",
    args: [r1.paymentId, u("0.10"), { from: ra.from, validAfter: 0n, validBefore: ra.validBefore, v: Number(vv ?? BigInt(27 + (yParity ?? 0))), r, s }],
  })
  const rtx = await wc().relayer.writeContract(request)
  await wc().pub.waitForTransactionReceipt({ hash: rtx })
  results.push({ name: "6 merchant refund → customer (partial)", from: M1_NAME, to: "P1", amount: "0.10", tx: `${config.explorer}/tx/${rtx}`, ok: true })

  // 7. P2 returns its balance to P1 so no funds are stranded in the throwaway wallet
  const p2now = await bal(P2.address)
  if (p2now > 0n) await p2p("7 personal → personal (cleanup)", P2, "P2", P1.address, "P1", fmt(p2now))

  // balances
  const expected: Record<string, bigint> = {
    P1: -u("0.30") - u("0.40") + u("0.10") + (p2now),
    P2: 0n,
    M1: u("0.30") - u("0.20") - u("0.15") - u("0.10"),
    M2: u("0.10") + u("0.15"),
  }
  console.log("\nTRANSFERS")
  for (const x of results) console.log(`  ✔ ${x.name.padEnd(40)} ${x.from} → ${x.to}  ${x.amount} USDT  ${x.tx}`)
  console.log("\nBALANCE DELTAS (expected vs actual)")
  for (const [k, a] of Object.entries(parties)) {
    const d = (await bal(a)) - before[k]
    console.log(`  ${d === expected[k] ? "✔" : "✘"} ${k.padEnd(3)} expected ${fmt(expected[k]).padStart(6)}  actual ${fmt(d).padStart(6)}`)
  }

  // each side sees it in its activity (live site, merges Arkiv receipts + on-chain transfers)
  await new Promise((res) => setTimeout(res, 6000))
  console.log(`\nACTIVITY on ${BASE} (newest first)`)
  for (const [k, a] of Object.entries(parties)) {
    const d = await fetch(`${BASE}/api/activity?address=${a}`).then((x) => x.json())
    const recent = (d.rows ?? []).filter((x: any) => x.at > Math.floor(Date.now() / 1000) - 900)
    console.log(`  ${k}: ${recent.length} new → ` + recent.map((x: any) => `${x.direction === "in" ? "+" : "−"}${fmt(BigInt(x.amount))} ${x.kind}`).join(", "))
  }
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message.split("\n").slice(0, 3).join(" ") : e); process.exit(1) })
