// Merchant refunds, gasless. The merchant's payout wallet signs an EIP-3009 receiveWithAuthorization
// to the router with nonce = refundNonce(paymentId); the router pulls the USDT and pays it to the
// ORIGINAL payer only, capped at the amount paid (enforced on-chain). The relayer just submits.
import { parseSignature, getAddress, type Address, type Hex } from "viem"
import { eq } from "@arkiv-network/sdk/query"
import { Receipt } from "@whitepay/shared/arkiv"
import { arkiv, wc } from "./clients"
import { config } from "./config"
import type { PayerAuth } from "./relayer"

const AUTH = { name: "a", type: "tuple", components: [
  { name: "from", type: "address" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" },
  { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" } ] } as const

export const REFUND_ABI = [
  { type: "function", name: "payments", stateMutability: "view", inputs: [{ name: "paymentId", type: "bytes32" }], outputs: [
    { name: "payer", type: "address" }, { name: "merchant", type: "address" }, { name: "amount", type: "uint128" },
    { name: "refunded", type: "uint128" }, { name: "paidAt", type: "uint64" }, { name: "refundCount", type: "uint32" } ] },
  { type: "function", name: "refundNonce", stateMutability: "view", inputs: [{ name: "paymentId", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "refund", stateMutability: "nonpayable", inputs: [{ name: "paymentId", type: "bytes32" }, { name: "amount", type: "uint256" }, AUTH], outputs: [] },
  { type: "error", name: "RefundExceedsPaid", inputs: [] },
  { type: "error", name: "NotMerchantPayout", inputs: [] },
  { type: "error", name: "UnknownPayment", inputs: [] },
] as const

export type RefundInfo = { paymentId: Hex; payer: Address; merchant: Address; amount: bigint; refunded: bigint; refundable: bigint; nonce: Hex }

export async function refundInfo(paymentId: Hex): Promise<RefundInfo | null> {
  const [p, nonce] = await Promise.all([
    wc().pub.readContract({ address: config.router, abi: REFUND_ABI, functionName: "payments", args: [paymentId] }),
    wc().pub.readContract({ address: config.router, abi: REFUND_ABI, functionName: "refundNonce", args: [paymentId] }),
  ])
  const [payer, merchant, amount, refunded] = p
  if (payer === "0x0000000000000000000000000000000000000000") return null
  return { paymentId, payer: getAddress(payer), merchant: getAddress(merchant), amount, refunded, refundable: amount - refunded, nonce }
}

/** Submit a merchant-signed refund, then mirror the new state onto the Arkiv receipt. */
export async function relayRefund(p: { paymentId: Hex; amount: bigint; auth: PayerAuth }) {
  const { r, s, v, yParity } = parseSignature(p.auth.signature)
  const { request } = await wc().pub.simulateContract({
    account: wc().relayer.account, address: config.router, abi: REFUND_ABI, functionName: "refund",
    args: [p.paymentId, p.amount, { from: p.auth.from, validAfter: p.auth.validAfter, validBefore: p.auth.validBefore, v: Number(v ?? BigInt(27 + (yParity ?? 0))), r, s }],
  })
  const txHash = await wc().relayer.writeContract(request)
  const rc = await wc().pub.waitForTransactionReceipt({ hash: txHash })
  if (rc.status !== "success") throw new Error("refund reverted")

  const info = await refundInfo(p.paymentId)
  let receiptKey: Hex | null = null
  try {
    const a = arkiv()
    const found = await a.pub.select({ $key: true }).from(Receipt).ownedBy(a.owner).where(eq("paymentId", p.paymentId.toLowerCase())).limit(1).fetch()
    receiptKey = (found.entities[0] as any)?.$key ?? null
    if (receiptKey && info)
      await a.writer.patchEntity(Receipt, receiptKey, {
        set: { refunded: info.refunded, status: info.refunded >= info.amount ? "refunded" : "partially_refunded" },
      }, { gas: 1_000_000n })
  } catch (err) {
    console.warn("refund settled on-chain but Arkiv receipt patch failed:", (err as Error).message.split("\n")[0])
  }
  return { txHash, block: rc.blockNumber, explorer: `${config.explorer}/tx/${txHash}`, receiptKey, info }
}
