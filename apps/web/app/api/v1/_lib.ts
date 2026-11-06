// Shared bits of the public v1 API: errors in one shape, the request origin, idempotency.
import { SiteError } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const origin = (req: Request) =>
  process.env.NEXT_PUBLIC_APP_URL?.startsWith("https") ? process.env.NEXT_PUBLIC_APP_URL : new URL(req.url).origin

/** { error: { type, message } } with the right status. Never leaks stack traces. */
export function apiError(e: unknown) {
  if (e instanceof SiteError) return json({ error: { type: e.code, message: e.message } }, { status: e.status })
  console.error("[v1]", errorMessage(e))
  return json({ error: { type: "api_error", message: "Something went wrong on WondrPay's side. Try again; nothing was charged." } }, { status: 500 })
}

// Idempotency-Key: the same key from the same site within 24 h returns the first response (per server instance;
// sessions are cheap and expire on their own, so a rare duplicate on another instance is harmless).
const seen = new Map<string, { at: number; body: unknown }>()
export function idempotent(siteId: string, key: string | null) {
  if (!key) return { hit: null as unknown, save: (_b: unknown) => {} }
  if (key.length > 255) throw new SiteError("bad_request", "Idempotency-Key must be at most 255 characters")
  const k = `${siteId}:${key}`
  const now = Date.now()
  for (const [x, v] of seen) if (now - v.at > 86_400_000) seen.delete(x)
  return { hit: seen.get(k)?.body ?? null, save: (body: unknown) => { seen.set(k, { at: now, body }) } }
}
