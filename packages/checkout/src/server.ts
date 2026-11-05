// @whitepay/checkout/server: what a merchant's backend needs (2 functions).
//  createWhitePayOrder: sign an EIP-712 order with the shop's key and publish it as a WhitePay request.
//  verifyWhitePayPayment: trustlessly confirm a payment on Whitechain from its tx hash (use in webhooks).
import { createPublicClient, decodeEventLog, getAddress, http, parseUnits, toHex, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { orderTypedData, ROUTER_ADDRESS, ROUTER_ABI, whitechainSepolia, type Order } from "@whitepay/shared"

export type CreatedOrder = { entityKey: Hex; payUrl: string; amount: string; deadline: string; orderId: Hex }

export async function createWhitePayOrder(p: {
  /** the shop's private key (registered as a WhitePay merchant; payout + order signer) */
  merchantKey: Hex
  /** USDT, e.g. "2.50" */
  amount: string
  whitepayUrl?: string
  /** seconds the QR stays payable (60-1800, default 300) */
  ttlSeconds?: number
  /** https URL WhitePay POSTs to when paid */
  webhook?: string
  note?: string
}): Promise<CreatedOrder> {
  if (!/^\d+(\.\d{1,6})?$/.test(p.amount) || Number(p.amount) <= 0) throw new Error("invalid amount")
  const shop = privateKeyToAccount(p.merchantKey)
  const order: Order = {
    merchant: shop.address,
    amount: parseUnits(p.amount, 6),
    orderId: toHex(crypto.getRandomValues(new Uint8Array(32))),
    deadline: BigInt(Math.floor(Date.now() / 1000) + Math.min(Math.max(p.ttlSeconds ?? 300, 60), 1800)),
  }
  const merchantSig = await shop.signTypedData(orderTypedData(ROUTER_ADDRESS, order))
  const r = await fetch(`${p.whitepayUrl ?? "https://whitepay.vercel.app"}/api/requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      order: { merchant: order.merchant, amount: order.amount.toString(), orderId: order.orderId, deadline: order.deadline.toString() },
      merchantSig, webhook: p.webhook, note: p.note,
    }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error ?? `WhitePay ${r.status}`)
  return d as CreatedOrder
}

/** Don't trust a webhook body: read the PaymentSettled event from Whitechain yourself. */
export async function verifyWhitePayPayment(p: { txHash: Hex; merchant: Address; orderId?: Hex; minAmount?: bigint; rpcUrl?: string }) {
  const client = createPublicClient({ chain: whitechainSepolia, transport: http(p.rpcUrl) })
  const receipt = await client.getTransactionReceipt({ hash: p.txHash })
  if (receipt.status !== "success") return { ok: false as const, reason: "transaction failed" }
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(ROUTER_ADDRESS)) continue
    try {
      const ev = decodeEventLog({ abi: ROUTER_ABI, data: log.data, topics: log.topics })
      if (ev.eventName !== "PaymentSettled") continue
      const a = ev.args as { paymentId: Hex; orderId: Hex; merchant: Address; payer: Address; amount: bigint }
      if (getAddress(a.merchant) !== getAddress(p.merchant)) continue
      if (p.orderId && a.orderId.toLowerCase() !== p.orderId.toLowerCase()) continue
      if (p.minAmount && a.amount < p.minAmount) return { ok: false as const, reason: "amount too low" }
      return { ok: true as const, orderId: a.orderId, payer: a.payer, amount: a.amount, block: receipt.blockNumber }
    } catch {}
  }
  return { ok: false as const, reason: "no matching WhitePay payment in this transaction" }
}
