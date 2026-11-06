// Outgoing merchant webhooks, hardened:
//  - SSRF guard: https only, port 443, no credentials, hostname must resolve ONLY to public IPs
//    (blocks localhost, RFC1918, link-local / cloud metadata 169.254.169.254, CGNAT, ULA, multicast).
//    Checked when the order is created AND again right before each delivery (DNS rebinding).
//  - Signed: EIP-191 signature over "whitepay-webhook:v1:<timestamp>:<keccak256(body)>" by a
//    dedicated key; merchants verify with verifyWondrPayWebhook() and a 5-minute replay window.
//  - No redirects followed, 5 s timeout, 3 attempts with backoff, response body never read.
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { keccak256, toBytes, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const PRIVATE_V4: [number, number][] = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12],
  [0xc0000000, 24], [0xc0000200, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24],
  [0xe0000000, 4], [0xf0000000, 4],
]
const v4num = (ip: string) => ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const n = v4num(ip)
    return PRIVATE_V4.some(([base, bits]) => (n & (bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0)) >>> 0 === base)
  }
  const v = ip.toLowerCase()
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7))
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff") || v.startsWith("64:ff9b") || v.startsWith("2001:db8")
}

export async function assertSafeWebhookUrl(raw: string): Promise<URL> {
  let u: URL
  try { u = new URL(raw) } catch { throw new Error("webhook is not a valid URL") }
  if (u.protocol !== "https:") throw new Error("webhook must use https")
  if (u.username || u.password) throw new Error("webhook must not contain credentials")
  if (u.port && u.port !== "443") throw new Error("webhook must use port 443")
  const host = u.hostname.replace(/^\[|\]$/g, "")
  if (isIP(host)) throw new Error("webhook must use a hostname, not an IP address")
  if (/(^|\.)(localhost|local|internal|localdomain)$/i.test(host)) throw new Error("webhook host is not public")
  const addrs = await lookup(host, { all: true, verbatim: true }).catch(() => [])
  if (!addrs.length) throw new Error("webhook host does not resolve")
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error("webhook host resolves to a private address")
  return u
}

export const webhookMessage = (timestamp: number, body: string) => `whitepay-webhook:v1:${timestamp}:${keccak256(toBytes(body))}`

const signer = () => {
  const pk = process.env.WEBHOOK_SIGNER_PK as Hex | undefined
  if (!pk) throw new Error("WEBHOOK_SIGNER_PK not set")
  return privateKeyToAccount(pk)
}
export const webhookSignerAddress = () => signer().address

export async function deliverWebhook(url: string, eventId: string, payload: Record<string, unknown>) {
  const body = JSON.stringify(payload)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await assertSafeWebhookUrl(url) // re-check right before sending (DNS rebinding)
      const ts = Math.floor(Date.now() / 1000)
      const s = signer()
      const r = await fetch(url, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        headers: {
          "content-type": "application/json",
          "user-agent": "WondrPay-Webhook/1",
          "x-whitepay-event-id": eventId,
          "x-whitepay-timestamp": String(ts),
          "x-whitepay-signer": s.address,
          "x-whitepay-signature": await s.signMessage({ message: webhookMessage(ts, body) }),
        },
        body,
      })
      await r.body?.cancel().catch(() => {})
      console.log("[webhook]", new URL(url).host, r.status, "attempt", attempt)
      if (r.status < 500 && r.status !== 429) return r.status
    } catch (e) {
      console.warn("[webhook] attempt", attempt, (e as Error).message.split("\n")[0])
      if ((e as Error).message.startsWith("webhook")) return 0 // unsafe URL: never retry
    }
    await new Promise((res) => setTimeout(res, attempt * 1500))
  }
  return 0
}
