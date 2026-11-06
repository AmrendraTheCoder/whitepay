// Person-to-person push (UPI "send money"): payer signs an EIP-3009 authorization whose nonce
// binds recipient + memo; the relayer settles via PaymentRouter.payDirect; receipt goes to Arkiv.
import { isAddress, isHex, type Address, type Hex } from "viem"
import { relayDirectPayment, settleOnArkiv, PolicyError, awardScratchCard, p2pAllowance, getMerchantByAddress } from "@whitepay/server"
import { ECON } from "@whitepay/shared/rewards"
import { after } from "next/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"
export const maxDuration = 60

type Body = {
  to: string
  toName?: string
  amount: string
  memo: string
  auth: { from: string; validAfter: string; validBefore: string; signature: string }
}

/** GET ?from=0x… → this month's free P2P transfers (10 a month, then $0.03 each) */
export async function GET(req: Request) {
  const from = new URL(req.url).searchParams.get("from") ?? ""
  if (!isAddress(from)) return json({ error: "bad address" }, { status: 400 })
  try {
    return json(await p2pAllowance(from as Address))
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  let b: Body
  try {
    b = await req.json()
  } catch {
    return json({ error: "bad json" }, { status: 400 })
  }
  if (!isAddress(b.to) || !isHex(b.memo) || b.memo.length !== 66 || !b.auth || !isAddress(b.auth.from) || !isHex(b.auth.signature))
    return json({ error: "malformed payment" }, { status: 400 })
  if (b.to.toLowerCase() === b.auth.from.toLowerCase()) return json({ error: "You can't pay yourself" }, { status: 400 })
  const amount = BigInt(b.amount)
  if (amount <= 0n) return json({ error: "Amount must be positive" }, { status: 400 })

  try {
    const auth = {
      from: b.auth.from as Address,
      validAfter: BigInt(b.auth.validAfter),
      validBefore: BigInt(b.auth.validBefore),
      signature: b.auth.signature as Hex,
    }
    // P2P allowance: paying a person uses one of the month's free transfers (shops pay the shop fee instead)
    const [before, shop] = await Promise.all([p2pAllowance(auth.from).catch(() => null), getMerchantByAddress(b.to as Address).catch(() => null)])
    const paid = await relayDirectPayment({ to: b.to as Address, amount, memo: b.memo as Hex, auth })
    const used = before && !shop ? before.used + 1 : before?.used ?? 0
    const allowance = before && {
      used, free: before.free, left: Math.max(0, before.free - used),
      fee: !shop && used > before.free ? ECON.p2pFeeMicro.toString() : "0", // shown, not deducted on testnet
    }
    // final on-chain: answer now, write the Arkiv receipt after the response
    after(() => settleOnArkiv({ merchant: b.to as Address, merchantName: b.toName?.slice(0, 100), payer: auth.from, amount,
      paymentId: b.memo as Hex, txHash: paid.txHash, block: paid.block, kind: "p2p" }).then(() => {}, (e) => console.error("arkiv settle failed", errorMessage(e)))
      // paying a listed shop by name/QR also earns a scratch card (awardScratchCard ignores people and small amounts)
      .then(() => awardScratchCard({ payer: auth.from, merchant: b.to as Address, merchantName: b.toName?.slice(0, 100), amount, txHash: paid.txHash })))
    return json({ txHash: paid.txHash, explorer: paid.explorer, amount, allowance })
  } catch (e) {
    if (e instanceof PolicyError) return json({ error: e.message, code: e.code, paymentRef: b.memo }, { status: 403 })
    return json({ error: errorMessage(e) }, { status: 500 })
  }
}
