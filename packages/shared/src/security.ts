// Shared HTTP security layer for WondrPay apps (runs in Next.js proxy.ts, edge- and node-safe).
//  - strict nonce-based Content-Security-Policy (XSS, injected scripts, clickjacking via frame-ancestors)
//  - transport + browser hardening headers (HSTS, nosniff, referrer, permissions, COOP)
//  - sliding-window rate limiter keyed by client IP + route bucket (abuse, brute force, relayer drain)
// The limiter is in-memory per server instance: it stops bursts from one client; for global limits put
// a shared store (Upstash Redis / Vercel KV) or the Vercel Firewall in front.

export type CspSources = { script?: string[]; connect?: string[]; img?: string[]; frame?: string[]; font?: string[] }

export function buildCsp(nonce: string, dev: boolean, s: CspSources = {}) {
  const d = (name: string, ...v: (string | undefined | false)[]) => `${name} ${v.filter(Boolean).join(" ")}`
  return [
    d("default-src", "'self'"),
    // 'strict-dynamic': only scripts carrying this response's nonce (and what they load) may run
    d("script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", dev && "'unsafe-eval'", ...(s.script ?? [])),
    d("style-src", "'self'", "'unsafe-inline'"), // React style={} attributes; styles cannot execute code
    d("img-src", "'self'", "data:", "blob:", ...(s.img ?? [])),
    d("font-src", "'self'", "data:", ...(s.font ?? [])),
    d("connect-src", "'self'", dev && "ws:", ...(s.connect ?? [])),
    d("frame-src", "'self'", ...(s.frame ?? [])),
    d("worker-src", "'self'", "blob:"),
    d("media-src", "'self'", "blob:"),
    d("manifest-src", "'self'"),
    d("object-src", "'none'"),
    d("base-uri", "'none'"),
    d("form-action", "'self'"),
    d("frame-ancestors", "'none'"),
    !dev && "upgrade-insecure-requests",
  ].filter(Boolean).join("; ")
}

export function hardeningHeaders(opts: { camera?: boolean } = {}): Record<string, string> {
  return {
    "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": `camera=(${opts.camera ? "self" : ""}), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`,
    "cross-origin-opener-policy": "same-origin-allow-popups", // WalletConnect / World App popups
    "x-dns-prefetch-control": "off",
    "x-permitted-cross-domain-policies": "none",
  }
}

const buckets = new Map<string, number[]>()
let sweep = 0
/** true = allowed. Sliding window of `limit` hits per `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  if (now - sweep > 60_000) { // keep memory bounded
    sweep = now
    for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > 10 * 60_000) buckets.delete(k)
  }
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (hits.length >= limit) { buckets.set(key, hits); return { ok: false, retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000) } }
  hits.push(now)
  buckets.set(key, hits)
  return { ok: true, retryAfter: 0 }
}

export const clientIp = (h: Headers) =>
  h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"

export const newNonce = () => {
  const b = new Uint8Array(18)
  crypto.getRandomValues(b)
  return btoa(String.fromCharCode(...b))
}
