// Refund allowance + shared idempotency on testnet, in-process:
//  shop gets paid 0.20 → approves a 0.10 USDT refund allowance (one EIP-2612 permit) → refunds 0.05 by API (no wallet)
//  → payer got it back, totals include it → over-refund / over-allowance refused → Idempotency-Key replays (Arkiv)
//  → switch the allowance off.
// Run: npx tsx --env-file=.env scripts/business-refunds-test.ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { parseAbi, type Hex } from "viem"
import { merchantSignupMessage, siteApprovalMessage, receiveAuthTypedData, ROUTER_ADDRESS } from "@whitepay/shared"
import {
  config, wc, registerMerchant, createSite, orderSignerAddress, authenticateSecretKey, createCheckoutSession, fetchRequest, verifyRequest,
  relayOrderPayment, settleOnArkiv, allowanceState, permitTypedData, setRefundAllowance, refundByApi, refundInfo, idemHash, sessionByIdem, claimRefund, refundAgent, relayRefund, SiteError,
} from "@whitepay/server"

const ORIGIN = "https://wondrpay.vercel.app"
const shop = privateKeyToAccount(generatePrivateKey())
const payer = privateKeyToAccount(process.env.CUSTOMER_PK as Hex)
const now = () => Math.floor(Date.now() / 1000)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
let fails = 0
const ok = (c: unknown, what: string) => { console.log(`${c ? "PASS" : "FAIL"}  ${what}`); if (!c) fails++ }
const code = async (f: () => Promise<unknown>) => { try { await f(); return "ok" } catch (e) { return e instanceof SiteError ? `${e.status} ${e.code}` : `error: ${(e as Error).message.split("\n")[0]}` } }
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("")
const bal = (a: Hex) => wc().pub.readContract({ address: config.usdt, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [a] })

async function permit(micro: bigint) {
  const st = await allowanceState(shop.address)
  const deadline = BigInt(now() + 1200)
  const td = permitTypedData({ owner: shop.address, spender: st.agent, value: micro, nonce: BigInt(st.nonce), deadline })
  return setRefundAllowance({ merchant: shop.address, value: micro.toString(), deadline: deadline.toString(), signature: await shop.signTypedData(td) })
}

async function main() {
  const label = `bizr-${hex(3)}`, t = now()
  await registerMerchant({ label, displayName: "Refund Shop", address: shop.address, issuedAt: t, signature: await shop.signMessage({ message: merchantSignupMessage({ label, displayName: "Refund Shop", address: shop.address, issuedAt: t }) }) })
  const site = { siteId: hex(16), name: "R site", domains: ["shop.example.com"] }
  const i = now()
  const c = await createSite({ merchant: shop.address, ...site, issuedAt: i, signature: await shop.signMessage({ message: siteApprovalMessage({ action: "create", merchant: shop.address, ...site, orderSigner: orderSignerAddress(), issuedAt: i }) }) })
  const s = await authenticateSecretKey(`Bearer ${c.secretKey}`)

  // a session with an Idempotency-Key, found again through Arkiv (any server instance)
  const ih = idemHash(s.siteId, `order_${hex(4)}`)
  const { session, publish } = await createCheckoutSession(s, { amount: "0.20", reference: "order_r1" }, ORIGIN, { idem: ih })
  await publish()
  let again = null
  for (let k = 0; k < 10 && !again; k++) { again = await sessionByIdem(s, ih, ORIGIN); if (!again) await wait(1500) }
  ok(again?.id === session.id, "the same Idempotency-Key finds the session through Arkiv (no shared cache needed)")

  // customer pays
  const view = await fetchRequest(session.id)
  const v = await verifyRequest(view)
  if (!v.ok) throw new Error(v.reason)
  const sig = await payer.signTypedData(receiveAuthTypedData({ from: payer.address, to: ROUTER_ADDRESS, value: v.order.amount, validAfter: 0n, validBefore: v.order.deadline, nonce: v.digest }))
  const paid = await relayOrderPayment({ order: v.order, merchantSig: v.merchantSig, auth: { from: payer.address, validAfter: 0n, validBefore: v.order.deadline, signature: sig } })
  await settleOnArkiv({ request: view!, merchant: v.order.merchant, merchantName: view!.merchantName, payer: payer.address, amount: v.order.amount, paymentId: paid.paymentId, txHash: paid.txHash, block: paid.block })
  ok(!!paid.txHash, `customer paid 0.20: ${paid.explorer}`)

  // no allowance yet → refusing is right
  ok(await code(() => refundByApi(s, { paymentId: session.id, amount: "0.05" })) === "403 forbidden", "no allowance yet: refund by API refused")

  // approve a 0.10 cap with one permit
  const set = await permit(100_000n)
  ok(set.allowance === "100000", `allowance approved: 0.10 USDT (${set.explorer})`)

  const before = await bal(payer.address)
  const r1 = await refundByApi(s, { paymentId: session.id, amount: "0.05", reason: "damaged" }, idemHash(`refund:${s.siteId}`, "refund_1"))
  ok(r1.amount === "50000" && r1.allowanceLeft === "50000", `refunded 0.05 by API, no wallet prompt (${r1.explorer})`)
  ok((await bal(payer.address)) - before === 50_000n, "the original payer received exactly 0.05 USDT")
  await wait(4000)
  const info = await refundInfo(session.id)
  ok(info?.refunded === 50_000n && info.refundable === 150_000n && info.routerRefunded === 0n, "every refund path now sees 0.05 refunded, 0.15 refundable")

  const replay = await refundByApi(s, { paymentId: session.id, amount: "0.05" }, idemHash(`refund:${s.siteId}`, "refund_1"))
  ok(replay.replayed && replay.txHash === r1.txHash, "same Idempotency-Key returns the first refund, no second transfer")
  ok(await code(() => refundByApi(s, { paymentId: session.id, amount: "0.06" })) === "403 forbidden", "a refund above the allowance left (0.05) is refused")
  ok(await code(() => refundByApi(s, { paymentId: session.id, amount: "0.16" })) === "400 bad_request", "a refund above what's refundable (0.15) is refused")
  ok(await code(() => refundByApi(s, { paymentId: `0x${"ab".repeat(32)}` })) === "404 not_found", "a payment that isn't this shop's is refused")

  // switch off
  const off = await permit(0n)
  ok(off.allowance === "0", "allowance switched off")
  ok(await code(() => refundByApi(s, { paymentId: session.id, amount: "0.01" })) === "403 forbidden", "after switching off, refunds by API are refused")
  ok(refundAgent() !== (await import("viem/accounts")).privateKeyToAccount(process.env.DEPLOYER_PK as Hex).address, `refunds use a dedicated agent key (${refundAgent()})`)

  // two refunds racing from two "servers" (no shared lock): the ledger claim lets only one through
  await wait(4000)
  const left = (await refundInfo(session.id))!.refundable // 0.15
  const fake = async () => ({ txHash: (`0x${"0".repeat(63)}1`) as Hex }) // no money moves in this check
  const race = await Promise.allSettled([0, 1].map(() => claimRefund({ paymentId: session.id, merchant: shop.address, payer: payer.address, amount: 100_000n, paid: 200_000n, source: "allowance" }, fake)))
  const won = race.filter((x) => x.status === "fulfilled").length
  ok(left === 150_000n && won === 1, `two concurrent 0.10 claims on 0.15 refundable: ${won} paid, ${2 - won} backed off`)
  // a payout that fails before any tx leaves nothing counted
  await wait(4000)
  const beforeFail = (await refundInfo(session.id))!.refundable
  await claimRefund({ paymentId: session.id, merchant: shop.address, payer: payer.address, amount: 10_000n, paid: 200_000n, source: "allowance" }, async () => { throw new Error("rpc down") }).catch(() => {})
  await wait(4000)
  ok((await refundInfo(session.id))!.refundable === beforeFail, "a failed payout doesn't keep counting against the payment")
  // the router refund path (refund requests / dashboard) runs under the same claim and shares the total
  const ri = (await refundInfo(session.id))!
  const vb = BigInt(now() + 600)
  const rsig = await shop.signTypedData(receiveAuthTypedData({ from: shop.address, to: ROUTER_ADDRESS, value: 10_000n, validAfter: 0n, validBefore: vb, nonce: ri.nonce }))
  const rr = await relayRefund({ paymentId: session.id, amount: 10_000n, auth: { from: shop.address, validAfter: 0n, validBefore: vb, signature: rsig } })
  await wait(4000)
  const after = (await refundInfo(session.id))!
  ok(!!rr.txHash && after.routerRefunded === 10_000n && after.refundable === ri.refundable - 10_000n, `router refund 0.01 under the claim; refundable ${Number(ri.refundable) / 1e6} → ${Number(after.refundable) / 1e6}`)
  console.log(fails ? `\n${fails} FAILED` : "\nall passed")
}
main().then(() => process.exit(fails ? 1 : 0), (e) => { console.error(e); process.exit(1) })
