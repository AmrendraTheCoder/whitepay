// Demo store security proxy: strict CSP (only this site + the WondrPay SDK origin), hardening headers,
// per-IP rate limits so nobody can spam orders, JSON-only writes, body cap.
import { NextResponse, type NextRequest } from "next/server"
import { buildCsp, hardeningHeaders, rateLimit, clientIp, newNonce } from "@whitepay/shared/security"

const WP = process.env.NEXT_PUBLIC_WHITEPAY_URL ?? "https://wondrpay.vercel.app"
const dev = process.env.NODE_ENV === "development"

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith("/api/")) {
    const m = req.method
    if (!["GET", "POST"].includes(m)) return NextResponse.json({ error: "method not allowed" }, { status: 405 })
    if (m === "POST") {
      const len = Number(req.headers.get("content-length") ?? "NaN")
      if (!Number.isFinite(len) || len > 16_384) return NextResponse.json({ error: "bad or oversized body" }, { status: 413 })
      if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return NextResponse.json({ error: "json only" }, { status: 415 })
      const origin = req.headers.get("origin")
      // the admin route moves the shop's money: it must come from this site's own dashboard
      if (pathname.startsWith("/api/dashboard/refund") && origin !== req.nextUrl.origin)
        return NextResponse.json({ error: "cross-site request blocked" }, { status: 403 })
      if (pathname.startsWith("/api/create-order") && origin && origin !== req.nextUrl.origin)
        return NextResponse.json({ error: "cross-site request blocked" }, { status: 403 })
    }
    const [limit, win] = pathname.startsWith("/api/dashboard/refund") ? [8, 60_000] : pathname.startsWith("/api/create-order") ? [12, 60_000] : pathname.startsWith("/api/webhook") ? [120, 60_000] : [120, 60_000]
    const r = rateLimit(`${clientIp(req.headers)}|${pathname}`, limit, win)
    if (!r.ok) return NextResponse.json({ error: "too many requests" }, { status: 429, headers: { "retry-after": String(r.retryAfter) } })
    const res = NextResponse.next()
    res.headers.set("x-content-type-options", "nosniff")
    res.headers.set("cache-control", "no-store")
    return res
  }
  const nonce = newNonce()
  const csp = buildCsp(nonce, dev, { connect: [WP], img: [WP, "https://images.unsplash.com"] })
  const h = new Headers(req.headers)
  h.set("x-nonce", nonce)
  h.set("content-security-policy", csp)
  const res = NextResponse.next({ request: { headers: h } })
  res.headers.set("content-security-policy", csp)
  for (const [k, v] of Object.entries(hardeningHeaders())) res.headers.set(k, v)
  return res
}

export const config = {
  matcher: ["/api/:path*", { source: "/((?!api|_next/static|_next/image|favicon|plain).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }],
}
