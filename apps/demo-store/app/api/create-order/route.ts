// ── WONDRPAY INTEGRATION ③ (server) ── create the checkout: with the store's API key (WondrPay for Business), or by
// signing the order with the shop's own key (the original SDK flow).
import { createWondrPayOrder, createWondrPayCheckoutSession } from "@whitepay/checkout/server"
import { formatUnits, parseUnits, type Hex } from "viem"
import { recordEvent } from "@/lib/events"
import { PRICE, MAX_QTY, PRODUCTS } from "@/lib/catalog"

type Line = { sku?: unknown; qty?: unknown }

/** Total from the SERVER catalog. The browser only says which products and how many: prices can't be tampered with. */
function total(payload: { sku?: unknown; items?: unknown } | undefined) {
  const lines: Line[] = Array.isArray(payload?.items) ? (payload!.items as Line[]) : [{ sku: payload?.sku, qty: 1 }]
  if (lines.length < 1 || lines.length > 8) return null
  let sum = 0n
  const desc: string[] = []
  for (const l of lines) {
    const sku = typeof l.sku === "string" ? l.sku : ""
    const qty = Number(l.qty ?? 1)
    if (!Object.hasOwn(PRICE, sku) || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return null
    sum += parseUnits(PRICE[sku], 6) * BigInt(qty)
    desc.push(`${PRODUCTS.find((x) => x.sku === sku)?.name ?? sku} ×${qty}`) // shown on receipts and in the orders dashboard
  }
  return { amount: formatUnits(sum, 6), note: desc.join(",").slice(0, 120) }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { payload?: { sku?: unknown; items?: unknown } } | null
  const t = total(body?.payload)
  if (!t) return Response.json({ error: "unknown product or quantity" }, { status: 400 })
  try {
    const whitepayUrl = process.env.WHITEPAY_URL ?? "https://wondrpay.vercel.app"
    // WondrPay for Business: an API key creates the checkout; selling needs no wallet key (set STORE_MERCHANT_ADDRESS
    // for the webhook; refunds from the dashboard still use the shop wallet)
    if (process.env.WONDRPAY_SECRET_KEY) {
      const reference = `amaron_${crypto.randomUUID().slice(0, 18)}`
      const session = await createWondrPayCheckoutSession({ secretKey: process.env.WONDRPAY_SECRET_KEY, whitepayUrl, amount: t.amount, reference, description: t.note })
      if (!session.button) throw new Error("WondrPay returned no button payload")
      recordEvent(session.button.orderId, `checkout session ${session.id.slice(0, 10)}… created with the store's API key (${t.amount} USDT · ${t.note})`)
      return Response.json({ ...session.button, sessionId: session.id, checkoutUrl: session.url })
    }
    // older integration (still supported): the shop's own key signs the order
    const order = await createWondrPayOrder({
      merchantKey: process.env.STORE_MERCHANT_PK as Hex,
      amount: t.amount,
      whitepayUrl,
      webhook: process.env.STORE_URL?.startsWith("https://") ? `${process.env.STORE_URL}/api/webhook` : undefined,
      note: t.note,
    })
    recordEvent(order.orderId, `order signed by shop key, published to WondrPay (${t.amount} USDT · ${t.note})`)
    return Response.json(order)
  } catch (e) {
    console.error("[create-order]", (e as Error).message)
    return Response.json({ error: "could not create the order" }, { status: 502 })
  }
}
