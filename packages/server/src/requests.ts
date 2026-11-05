// Payment-request lifecycle on Arkiv: create (pending, TTL) -> verify (payer side) -> settle (paid) | expire (depleted).
import { ExpirationTime, NoEntityFoundError } from "@arkiv-network/sdk"
import { addr, u64, key } from "@arkiv-network/sdk/schema"
import { and, eq, desc, gte } from "@arkiv-network/sdk/query"
import { getAddress, hexToBytes, bytesToHex, recoverTypedDataAddress, type Address, type Hex } from "viem"
import { PayRequest, Receipt } from "@whitepay/shared/arkiv"
import {
  orderTypedData,
  requestUri,
  REGISTRY_ABI,
  REQUEST_TTL,
  type Order,
} from "@whitepay/shared"
import { arkiv, wc } from "./clients"
import { config } from "./config"
import { orderDigest, signOrder } from "./orders"

const now = () => Math.floor(Date.now() / 1000)
/** Arkiv expirations must be a multiple of the 2 s block time. */
const ttlToExpiration = (ttl: number) => ExpirationTime.fromSeconds(Math.max(2, Math.ceil(ttl / 2) * 2))

export type CreatedRequest = {
  entityKey: Hex
  uri: string
  digest: Hex
  order: Order
  expiresAtBlock: bigint
  arkivTx: Hex
}

/** Merchant backend: sign the order and publish it as a pending request that lives for `ttlSeconds`. */
export async function createPaymentRequest(p: {
  merchant: Address
  amount: bigint
  merchantName?: string
  kind?: "p2m_qr" | "invoice"
  ttlSeconds?: number
  payer?: Address
  note?: string
}): Promise<CreatedRequest> {
  const kind = p.kind ?? "p2m_qr"
  const ttl = Math.min(Math.max(p.ttlSeconds ?? REQUEST_TTL.p2mQr, REQUEST_TTL.min), REQUEST_TTL.invoiceMax)
  const { order, digest, merchantSig } = await signOrder({ merchant: p.merchant, amount: p.amount, ttlSeconds: ttl })

  const { entityKey, txHash, expiresAt } = await arkiv().writer.createEntity(
    PayRequest,
    {
      kind,
      merchant: addr(order.merchant),
      amount: order.amount,
      token: addr(config.usdt),
      status: "pending",
      requestedAt: u64(BigInt(now())),
      deadline: u64(order.deadline),
      orderId: order.orderId,
      digest,
      merchantSig: hexToBytes(merchantSig),
      ...(p.merchantName ? { merchantName: p.merchantName } : {}),
      ...(p.payer ? { payer: addr(p.payer) } : {}),
      ...(p.note ? { note: p.note.slice(0, 120) } : {}),
    },
    { expiration: ttlToExpiration(ttl) },
    { gas: 1_500_000n },
  )
  return { entityKey, uri: requestUri(entityKey), digest, order, expiresAtBlock: expiresAt, arkivTx: txHash }
}

export type RequestView = {
  entityKey: Hex
  owner: Address
  kind: string
  status: string
  merchant: Address
  merchantName?: string
  amount: bigint
  orderId: Hex
  deadline: bigint
  digest: Hex
  merchantSig: Hex
  payer?: Address
  expiresAtBlock: bigint
}

export type Verified = { ok: true; order: Order; digest: Hex; merchantSig: Hex; view: RequestView; verifiedMerchant: boolean }
export type Rejected = { ok: false; reason: string; view?: RequestView }

/** Fetch a request by entity key (what the payer's app does after scanning the QR). */
export async function fetchRequest(entityKey: Hex): Promise<RequestView | null> {
  try {
    const e = (await arkiv().pub.getEntity(entityKey, PayRequest)) as any
    const v = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x)
    const sig = v(e.merchantSig)
    return {
      entityKey,
      owner: getAddress(e.$owner),
      kind: v(e.kind),
      status: v(e.status),
      merchant: getAddress(v(e.merchant)),
      merchantName: v(e.merchantName),
      amount: BigInt(v(e.amount)),
      orderId: v(e.orderId),
      deadline: BigInt(v(e.deadline)),
      digest: v(e.digest),
      merchantSig: typeof sig === "string" ? (sig as Hex) : bytesToHex(sig),
      payer: v(e.payer) ? getAddress(v(e.payer)) : undefined,
      expiresAtBlock: BigInt(e.$expiresAt),
    }
  } catch (err) {
    if (err instanceof NoEntityFoundError) return null // expired / deleted => "depleted"
    throw err
  }
}

/** The four checks that make an Arkiv entity trustworthy. Arkiv stores; the contract proves. */
export async function verifyRequest(view: RequestView | null): Promise<Verified | Rejected> {
  if (!view) return { ok: false, reason: "request not found: expired (depleted) or never existed" }

  // 1. ownership: anyone can write `whitepay.request`, only our backend's entities count
  if (view.owner.toLowerCase() !== arkiv().owner.toLowerCase())
    return { ok: false, reason: `untrusted owner ${view.owner}`, view }

  // 2. integrity: recompute the order digest from the visible fields
  const order: Order = { merchant: view.merchant, amount: view.amount, orderId: view.orderId, deadline: view.deadline }
  const digest = orderDigest(order)
  if (digest.toLowerCase() !== view.digest.toLowerCase())
    return { ok: false, reason: "tampered request: fields do not match the signed digest", view }

  // 3. authenticity: signature must come from the merchant's registered signer ON-CHAIN
  const m = await wc().pub.readContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "get", args: [view.merchant] })
  if (!m.active) return { ok: false, reason: "merchant not active in MerchantRegistry", view }
  let signer: Address
  try {
    signer = await recoverTypedDataAddress({ ...orderTypedData(config.router, order), signature: view.merchantSig })
  } catch {
    return { ok: false, reason: "malformed merchant signature", view }
  }
  if (signer.toLowerCase() !== m.signer.toLowerCase())
    return { ok: false, reason: `signature by ${signer}, registry signer is ${m.signer}`, view }

  // 4. state: still pending and before its deadline
  if (view.status !== "pending") return { ok: false, reason: `request is ${view.status}`, view }
  if (BigInt(now()) > view.deadline) return { ok: false, reason: "request deadline passed", view }

  return { ok: true, order, digest, merchantSig: view.merchantSig, view, verifiedMerchant: m.verified }
}

/** After the payment settles on Whitechain: write the receipt and mark the request paid, atomically. */
export async function settleOnArkiv(p: {
  request?: RequestView
  merchant: Address
  merchantName?: string
  payer: Address
  amount: bigint
  paymentId: Hex
  txHash: Hex
  block: bigint
}): Promise<{ receiptKey: Hex; arkivTx: Hex }> {
  const a = arkiv()
  // idempotency: never write two receipts for the same chain tx
  const existing = await a.pub
    .select({ $key: true })
    .from(Receipt)
    .ownedBy(a.owner)
    .where(eq("wcTxHash", p.txHash.toLowerCase()))
    .limit(1)
    .fetch()
  if (existing.entities.length) return { receiptKey: (existing.entities[0] as any).$key, arkivTx: "0x" as Hex }

  const receiptValues = {
    merchant: addr(p.merchant),
    payer: addr(p.payer),
    amount: p.amount,
    token: addr(config.usdt),
    status: "paid",
    paidAt: u64(BigInt(now())),
    paymentId: p.paymentId.toLowerCase(),
    wcTxHash: p.txHash.toLowerCase(),
    wcBlock: u64(p.block),
    ...(p.request ? { requestRef: key(p.request.entityKey) } : {}),
    ...(p.merchantName ? { merchantName: p.merchantName } : {}),
  }

  if (p.request) {
    try {
      const [predicted] = await a.pub.predictEntityKeys({ owner: a.owner, count: 1 })
      const res = await a.writer.executeBatch(
        {
          creates: [{ schema: Receipt, values: receiptValues, expiration: ExpirationTime.max(), salt: predicted.salt }],
          patches: [
            {
              schema: PayRequest,
              entityKey: p.request.entityKey,
              set: { status: "paid", receiptRef: key(predicted.key), payer: addr(p.payer) },
            },
          ],
        },
        { gas: 2_500_000n },
      )
      return { receiptKey: res.createdEntities[0], arkivTx: res.txHash }
    } catch (err) {
      // the request may have expired between payment and settlement: still record the receipt
      console.warn("batch settle failed, writing receipt alone:", (err as Error).message.split("\n")[0])
    }
  }
  const r = await a.writer.createEntity(Receipt, receiptValues, { expiration: ExpirationTime.max() }, { gas: 1_500_000n })
  return { receiptKey: r.entityKey, arkivTx: r.txHash }
}

/** Merchant dashboard / customer history reads (user-visible Arkiv reads). */
export async function listReceipts(p: { merchant?: Address; payer?: Address; sinceSeconds?: number; limit?: number }) {
  const a = arkiv()
  const conds = [
    ...(p.merchant ? [eq("merchant", addr(p.merchant))] : []),
    ...(p.payer ? [eq("payer", addr(p.payer))] : []),
    ...(p.sinceSeconds ? [gte("paidAt", u64(BigInt(now() - p.sinceSeconds)))] : []),
  ]
  const q = a.pub
    .select({ $key: true, merchant: true, payer: true, amount: true, status: true, paidAt: true, wcTxHash: true, merchantName: true })
    .from(Receipt)
    .ownedBy(a.owner)
  return (conds.length ? q.where(and(...conds)) : q).orderBy(desc("paidAt")).limit(p.limit ?? 20).withCount().fetch()
}

export async function listPendingRequests(merchant: Address) {
  const a = arkiv()
  return a.pub
    .select({ $key: true, $expiresAt: true, amount: true, status: true, requestedAt: true, merchantName: true })
    .from(PayRequest)
    .ownedBy(a.owner)
    .where(and(eq("merchant", addr(merchant)), eq("status", "pending")))
    .orderBy(desc("requestedAt"))
    .limit(50)
    .fetch()
}
