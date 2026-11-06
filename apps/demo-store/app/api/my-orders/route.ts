// A shopper's own orders at this shop: every paid order whose payer is their wallet (or WondrPay name).
// Payment records are public on Arkiv, so this needs no login; it only filters the shop's order list.
import { listWondrPayOrders } from "@whitepay/checkout/server"
import { privateKeyToAccount } from "viem/accounts"
import { getAddress, isAddress, type Hex } from "viem"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const WP = process.env.WHITEPAY_URL ?? "https://wondrpay.vercel.app"

export async function GET(req: Request) {
  const who = (new URL(req.url).searchParams.get("who") ?? "").trim()
  if (!who || who.length > 80) return Response.json({ error: "Enter your WondrPay name or wallet address" }, { status: 400 })
  try {
    let payer: string | null = isAddress(who) ? getAddress(who) : null
    let name: string | null = null
    const r = await fetch(`${WP}/api/resolve?q=${encodeURIComponent(who)}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null)
    if (r?.address && (!payer || r.address.toLowerCase() === payer.toLowerCase())) { payer = getAddress(r.address); name = r.name ?? null }
    if (!payer) return Response.json({ error: `No WondrPay wallet found for “${who}”` }, { status: 404 })
    const shop = privateKeyToAccount(process.env.STORE_MERCHANT_PK as Hex).address
    const d = await listWondrPayOrders({ merchant: shop, whitepayUrl: WP })
    const orders = d.orders.filter((o) => o.payer.toLowerCase() === payer!.toLowerCase())
    return Response.json({ payer, name, orders }, { headers: { "cache-control": "no-store" } })
  } catch (e) {
    console.error("[my-orders]", (e as Error).message)
    return Response.json({ error: "Could not load orders right now" }, { status: 502 })
  }
}
