// WondrPay payment-request lifecycle, end to end on live networks:
//   merchant creates request (Arkiv, TTL) -> payer scans + verifies -> fingerprint/PIN signs -> relayer settles
//   on Whitechain -> receipt + request=paid on Arkiv -> merchant dashboard reads Arkiv.
// Failure paths: tampered amount, forged signature, double pay, (--expiry) depleted request.
//
// Run:  npx tsx --env-file=.env scripts/lifecycle-demo.ts [amountUSDT=1] [--expiry]
import { parseUnits, formatUnits, type Hex } from "viem"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import {
  receiveAuthTypedData,
  parseRequestUri,
  formatUsdt,
  orderTypedData,
  ERC20_ABI,
} from "@whitepay/shared"
import {
  config,
  wc,
  arkiv,
  createPaymentRequest,
  fetchRequest,
  verifyRequest,
  relayOrderPayment,
  settleOnArkiv,
  listReceipts,
  PolicyError,
} from "@whitepay/server"

const MERCHANT = "0xCF69aAdd6357Afd3C1b5EcFE3eecA134f49b6e10" as const
const MERCHANT_NAME = "chai-shop.wondrpay.eth"
const amount = parseUnits(process.argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? "1", 6)
const expiryTest = process.argv.includes("--expiry")

const payer = privateKeyToAccount(process.env.CUSTOMER_PK as Hex) // in the app: unlocked by fingerprint/PIN
const step = (n: string, s: string) => console.log(`\n\x1b[1m[${n}] ${s}\x1b[0m`)
const ok = (s: string) => console.log(`  \x1b[32m✔\x1b[0m ${s}`)
const bad = (s: string) => console.log(`  \x1b[31m✘\x1b[0m ${s}`)
const usdtBal = async (a: `0x${string}`) =>
  formatUnits(await wc().pub.readContract({ address: config.usdt, abi: ERC20_ABI, functionName: "balanceOf", args: [a] }), 6)

async function payerSigns(digest: Hex, value: bigint, deadline: bigint) {
  const signature = await payer.signTypedData(
    receiveAuthTypedData({ from: payer.address, to: config.router, value, validAfter: 0n, validBefore: deadline, nonce: digest }),
  )
  return { from: payer.address, validAfter: 0n, validBefore: deadline, signature }
}

async function main() {
  console.log(`Arkiv writer (entity owner): ${arkiv().owner}`)
  console.log(`payer ${payer.address}: ${await usdtBal(payer.address)} USDT, ${formatUnits(await wc().pub.getBalance({ address: payer.address }), 18)} WBT`)
  console.log(`merchant ${MERCHANT_NAME}: ${await usdtBal(MERCHANT)} USDT`)

  // 1. merchant creates a dynamic QR request
  step("1", `merchant creates a ${formatUsdt(amount)} USDT request (TTL 5 min) on Arkiv`)
  const req = await createPaymentRequest({ merchant: MERCHANT, merchantName: MERCHANT_NAME, amount, kind: "p2m_qr" })
  ok(`entity ${req.entityKey}`)
  ok(`QR payload: ${req.uri}`)
  ok(`arkiv tx ${config.arkivExplorer}/tx/${req.arkivTx}`)

  // 2. payer scans and verifies
  step("2", "payer scans QR -> fetch from Arkiv -> verify owner, digest, on-chain signer, state")
  const key = parseRequestUri(req.uri)!
  const view = await fetchRequest(key)
  const v = await verifyRequest(view)
  if (!v.ok) throw new Error(`verification failed: ${v.reason}`)
  ok(`verified: pay ${formatUsdt(v.order.amount)} USDT to ${view!.merchantName} ${v.verifiedMerchant ? "(✔ verified merchant)" : ""}`)

  // 3. failure paths a malicious entity would hit
  step("3", "attack checks")
  const tampered = await verifyRequest({ ...view!, amount: view!.amount * 100n })
  tampered.ok ? bad("tampered amount accepted!") : ok(`tampered amount rejected: ${tampered.reason}`)
  const rogue = privateKeyToAccount(generatePrivateKey())
  const forgedSig = await rogue.signTypedData(orderTypedData(config.router, v.order))
  const forged = await verifyRequest({ ...view!, merchantSig: forgedSig })
  forged.ok ? bad("forged signature accepted!") : ok(`forged signature rejected: ${forged.reason}`)
  const foreign = await verifyRequest({ ...view!, owner: rogue.address })
  foreign.ok ? bad("foreign-owned entity accepted!") : ok(`entity not owned by WondrPay rejected: ${foreign.reason}`)

  // 4. payer authorises (fingerprint/PIN unlocks key) -> relayer settles on Whitechain
  step("4", "payer signs EIP-3009 authorization (0 WBT) -> relayer submits payOrder")
  const auth = await payerSigns(v.digest, v.order.amount, v.order.deadline)
  const paid = await relayOrderPayment({ order: v.order, merchantSig: v.merchantSig, auth })
  ok(`settled on Whitechain: ${paid.explorer} (gas ${paid.gasUsed} paid by relayer)`)

  // 5. receipt + request=paid on Arkiv (atomic)
  step("5", "settle on Arkiv: create receipt + mark request paid (one batch)")
  const s = await settleOnArkiv({
    request: view!, merchant: MERCHANT, merchantName: MERCHANT_NAME, payer: payer.address,
    amount: v.order.amount, paymentId: paid.paymentId, txHash: paid.txHash, block: paid.block,
  })
  ok(`receipt entity ${s.receiptKey}`)

  // 6. double-pay protection
  step("6", "rescanning the same QR")
  const again = await verifyRequest(await fetchRequest(key))
  again.ok ? bad("paid request still payable!") : ok(`rejected: ${again.reason}`)
  try {
    await relayOrderPayment({ order: v.order, merchantSig: v.merchantSig, auth })
    bad("replay settled!")
  } catch (e) {
    ok(`on-chain replay rejected: ${e instanceof PolicyError ? e.message : (e as Error).message}`)
  }

  // 7. merchant dashboard reads from Arkiv
  step("7", "merchant dashboard: receipts from Arkiv (last 24h)")
  const page = await listReceipts({ merchant: MERCHANT, sinceSeconds: 86_400, limit: 5 })
  for (const r of page.entities as any[])
    console.log(`  ${new Date(Number(r.paidAt.value) * 1000).toISOString()}  ${formatUsdt(BigInt(r.amount.value))} USDT  from ${r.payer.value.slice(0, 10)}…  ${r.status.value}  tx ${String(r.wcTxHash.value).slice(0, 12)}…`)
  ok(`${page.count} receipt(s) total for ${MERCHANT_NAME}`)

  console.log(`\npayer now ${await usdtBal(payer.address)} USDT | merchant now ${await usdtBal(MERCHANT)} USDT`)

  // 8. optional: a request nobody pays is "depleted"
  if (expiryTest) {
    step("8", "expiry: create a 60 s request and let it lapse")
    const short = await createPaymentRequest({ merchant: MERCHANT, merchantName: MERCHANT_NAME, amount, ttlSeconds: 60 })
    const cached = await verifyRequest(await fetchRequest(short.entityKey))
    if (!cached.ok) throw new Error(cached.reason)
    ok(`created ${short.entityKey}, waiting 75 s…`)
    await new Promise((r) => setTimeout(r, 75_000))
    const gone = await fetchRequest(short.entityKey)
    gone ? bad("still on Arkiv after TTL") : ok("entity is gone from Arkiv (depleted)")
    try {
      const a2 = await payerSigns(cached.digest, cached.order.amount, cached.order.deadline + 3600n)
      await relayOrderPayment({ order: cached.order, merchantSig: cached.merchantSig, auth: a2 })
      bad("expired order settled!")
    } catch (e) {
      ok(`paying the cached copy is rejected on-chain: ${(e as Error).message}`)
    }
  }
}

main().catch((e) => {
  console.error("\n\x1b[31mFAILED:\x1b[0m", e instanceof Error ? e.message.split("\n").slice(0, 3).join("\n") : e)
  process.exit(1)
})
