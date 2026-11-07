// The WondrPay PIN of an external wallet (MetaMask), the same on every device.
// GET ?address= → { exists } · POST { action: "check", address, digest } · POST { action: "save", address, digest, issuedAt, signature }
// The device sends a slow PBKDF2 digest of the PIN, never the PIN; see packages/server/src/pin.ts.
import { isAddress, isHex, getAddress, type Address, type Hex } from "viem"
import { hasSavedPin, checkSavedPin, savePin, PinError } from "@whitepay/server"
import { rateLimit, clientIp } from "@whitepay/shared/security"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const a = new URL(req.url).searchParams.get("address") ?? ""
  if (!isAddress(a)) return json({ error: "address required" }, { status: 400 })
  try {
    return json({ exists: await hasSavedPin(getAddress(a)) }, { headers: { "cache-control": "no-store" } })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}

export async function POST(req: Request) {
  const ip = clientIp(req.headers)
  if (!rateLimit(`pin|${ip}`, 20, 15 * 60_000).ok) return json({ error: "Too many tries. Wait a few minutes." }, { status: 429 })
  let b: { action?: string; address?: string; digest?: string; issuedAt?: number; signature?: string }
  try { b = await req.json() } catch { return json({ error: "bad json" }, { status: 400 }) }
  if (!b.address || !isAddress(b.address) || typeof b.digest !== "string") return json({ error: "address and digest required" }, { status: 400 })
  try {
    if (b.action === "check") return json({ ok: await checkSavedPin(b.address as Address, b.digest) })
    if (b.action === "save") {
      if (!b.signature || !isHex(b.signature)) return json({ error: "wallet signature required" }, { status: 400 })
      return json({ ok: await savePin({ address: b.address as Address, digest: b.digest, issuedAt: Number(b.issuedAt), signature: b.signature as Hex }) })
    }
    return json({ error: "unknown action" }, { status: 400 })
  } catch (e) {
    if (e instanceof PinError) return json({ error: e.message, code: e.code, left: e.left }, { status: e.code === "locked" ? 429 : e.code === "none" ? 404 : 403 })
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}
