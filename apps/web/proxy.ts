// WondrPay security proxy: runs before every page and API request.
//  Pages: fresh CSP nonce per request + hardening headers.
//  API:   method allow-list, JSON-only writes (blocks form-based CSRF), 32 KB body cap,
//         cross-site Origin rejected on wallet-signed writes, per-IP rate limits per route.
import { NextResponse, type NextRequest } from "next/server"
import { buildCsp, hardeningHeaders, rateLimit, clientIp, newNonce } from "@whitepay/shared/security"

const dev = process.env.NODE_ENV === "development"

const CSP_SOURCES = {
  connect: [
    "https://rpc.testnet.whitechain.io", "https://explorer.testnet.whitechain.io",
    "https://*.walletconnect.org", "wss://*.walletconnect.org", "https://*.walletconnect.com", "wss://*.walletconnect.com",
    "https://*.reown.com", "wss://*.reown.com", "https://*.web3modal.org", "https://*.web3modal.com",
    "https://*.worldcoin.org", "https://*.world.org",
  ],
  img: ["https:"], // wallet icons in the WalletConnect modal
  font: ["https://fonts.gstatic.com", "https://fonts.reown.com"],
  frame: ["https://verify.walletconnect.org", "https://verify.walletconnect.com", "https://*.reown.com", "https://*.world.org", "https://*.worldcoin.org"],
}

// [prefix, method, limit, window ms]; first match wins
const LIMITS: [string, string, number, number][] = [
  ["/api/pay", "POST", 20, 60_000],
  ["/api/send", "POST", 20, 60_000],
  ["/api/refund", "POST", 10, 60_000],
  ["/api/world", "*", 15, 60_000],
  ["/api/names", "POST", 6, 60_000],
  ["/api/merchants", "POST", 6, 60_000],
  ["/api/requests", "POST", 30, 60_000],
  ["/api/plans", "POST", 20, 60_000],
  ["/api/subscriptions/pay", "POST", 20, 60_000],
  ["/api/refunds", "POST", 10, 60_000],
  ["/api/subscriptions", "POST", 10, 60_000],
  ["/api/autopay/tick", "*", 20, 60_000],
  ["/api/rewards/scratch", "POST", 20, 60_000],
  ["/api/offers", "POST", 6, 60_000],
  ["/api/qr", "GET", 60, 60_000],
  ["/api/v1/checkout/sessions", "POST", 60, 60_000],
  ["/api/v1/links", "POST", 10, 60_000],
  ["/api/business/webhooks", "POST", 6, 60_000],
  ["/api/business/links", "POST", 10, 60_000],
  ["/api/business/sites", "POST", 6, 60_000],
  ["/api/", "*", 240, 60_000],
]
// writes that anyone's server may call (authenticated by the merchant's order signature)
const CROSS_ORIGIN_WRITES = ["/api/requests", "/api/plans", "/api/autopay/tick", "/api/v1/"]

function apiGuard(req: NextRequest): NextResponse | null {
  const { pathname } = req.nextUrl
  const method = req.method
  if (!["GET", "POST", "OPTIONS", "HEAD"].includes(method)) return NextResponse.json({ error: "method not allowed" }, { status: 405 })

  if (method === "POST") {
    const len = Number(req.headers.get("content-length") ?? "NaN")
    if (!Number.isFinite(len)) return NextResponse.json({ error: "content-length required" }, { status: 411 })
    if (len > 32_768) return NextResponse.json({ error: "payload too large" }, { status: 413 })
    if (!(req.headers.get("content-type") ?? "").startsWith("application/json"))
      return NextResponse.json({ error: "content-type must be application/json" }, { status: 415 })
    const origin = req.headers.get("origin")
    if (origin && origin !== req.nextUrl.origin && !CROSS_ORIGIN_WRITES.some((p) => pathname.startsWith(p)))
      return NextResponse.json({ error: "cross-site request blocked" }, { status: 403 })
  }

  const rule = LIMITS.find(([p, m]) => pathname.startsWith(p) && (m === "*" || m === method))
  if (rule && method !== "OPTIONS") {
    const [prefix, , limit, win] = rule
    const r = rateLimit(`${clientIp(req.headers)}|${prefix}|${method}`, limit, win)
    if (!r.ok) return NextResponse.json({ error: "too many requests, slow down" }, { status: 429, headers: { "retry-after": String(r.retryAfter) } })
  }
  return null
}

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const blocked = apiGuard(req)
    const res = blocked ?? NextResponse.next()
    res.headers.set("x-content-type-options", "nosniff")
    res.headers.set("cache-control", res.headers.get("cache-control") ?? "no-store")
    return res
  }
  const nonce = newNonce()
  const csp = buildCsp(nonce, dev, CSP_SOURCES)
  const reqHeaders = new Headers(req.headers)
  reqHeaders.set("x-nonce", nonce)
  reqHeaders.set("content-security-policy", csp)
  const res = NextResponse.next({ request: { headers: reqHeaders } })
  res.headers.set("content-security-policy", csp)
  for (const [k, v] of Object.entries(hardeningHeaders({ camera: true }))) res.headers.set(k, v)
  return res
}

export const config = {
  matcher: [
    "/api/:path*",
    { source: "/((?!api|_next/static|_next/image|sdk/|icon|manifest|favicon|brand/).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
  ],
}
