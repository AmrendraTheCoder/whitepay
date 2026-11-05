// Merchant-side order creation (UPI "Reference ID"): the merchant backend signs an EIP-712 Order.
import { hashTypedData, keccak256, toHex, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { orderTypedData, type Order } from "@whitepay/shared"
import { config } from "./config"

export type SignedOrder = { order: Order; digest: Hex; merchantSig: Hex }

export const newOrderId = (label = "order"): Hex =>
  keccak256(toHex(`${label}/${Date.now()}/${crypto.randomUUID()}`))

/** Digest the router computes in hashOrder(); also the paymentId and the payer's EIP-3009 nonce. */
export const orderDigest = (order: Order) => hashTypedData(orderTypedData(config.router, order))

export async function signOrder(p: { merchant: Address; amount: bigint; ttlSeconds: number; orderId?: Hex }): Promise<SignedOrder> {
  const order: Order = {
    merchant: p.merchant,
    amount: p.amount,
    orderId: p.orderId ?? newOrderId(),
    deadline: BigInt(Math.floor(Date.now() / 1000) + p.ttlSeconds),
  }
  const signer = privateKeyToAccount(config.keys.orderSigner())
  const merchantSig = await signer.signTypedData(orderTypedData(config.router, order))
  return { order, digest: orderDigest(order), merchantSig }
}
