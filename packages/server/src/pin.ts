// The WondrPay PIN of an EXTERNAL wallet (MetaMask), remembered across devices.
// A device wallet's PIN only exists on that phone (it encrypts the key there). A MetaMask wallet can be connected on
// any device, so its PIN is saved here once and the person types the SAME PIN everywhere, never a new one.
//
// What is stored (on Arkiv, public): HMAC(server secret, address : digest), where digest = PBKDF2(PIN, address, 310k)
// is computed on the device. The PIN and the digest never leave the device unkeyed in storage, and without the server
// secret a 6-digit PIN can't be brute-forced from the public record. Checking is rate limited per wallet.
import { createHmac, timingSafeEqual } from "node:crypto"
import { ExpirationTime } from "@arkiv-network/sdk"
import { addr, str, u64, defineSchema } from "@arkiv-network/sdk/schema"
import { eq } from "@arkiv-network/sdk/query"
import { getAddress, verifyMessage, type Address, type Hex } from "viem"
import { pinSaveMessage } from "@whitepay/shared"
import { arkiv } from "./clients"

export const PinRecord = defineSchema("whitepay.pin", {
  address: addr().indexed(),
  mac: str(),
  setAt: u64().indexed(),
})

const v = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x)
const now = () => Math.floor(Date.now() / 1000)
const secret = () => {
  const s = process.env.PIN_PEPPER || process.env.WEBHOOK_SECRET || process.env.RP_SIGNING_KEY
  if (!s) throw new Error("PIN storage isn't configured on this server")
  return s
}
const DIGEST_RE = /^[0-9a-f]{64}$/
const macOf = (address: Address, digest: string) => createHmac("sha256", secret()).update(`pin:${address.toLowerCase()}:${digest}`).digest("hex")

async function latest(address: Address) {
  const a = arkiv()
  const page = await a.pub.select({ mac: true, setAt: true }).from(PinRecord).ownedBy(a.owner).where(eq("address", addr(address)) as never).limit(20).fetch()
  const rows = (page.entities as any[]).map((e) => ({ mac: String(v(e.mac)), setAt: Number(v(e.setAt)) })).sort((x, y) => y.setAt - x.setAt)
  return rows[0] ?? null
}

/** Has this wallet saved a WondrPay PIN? */
export async function hasSavedPin(address: Address) {
  return !!(await latest(getAddress(address)))
}

// wrong tries per wallet: 5 per 15 minutes (per server instance; the route also limits per IP)
const tries = new Map<string, { n: number; since: number }>()
const MAX_TRIES = 5, WINDOW_MS = 15 * 60_000

export class PinError extends Error {
  constructor(public code: "none" | "wrong" | "locked" | "bad", msg: string, public left?: number) { super(msg) }
}

/** Is `digest` the PIN this wallet saved? Throws PinError with the tries left. */
export async function checkSavedPin(address: Address, digest: string) {
  address = getAddress(address)
  if (!DIGEST_RE.test(digest)) throw new PinError("bad", "Malformed PIN check")
  const k = address.toLowerCase(), t = tries.get(k)
  if (t && Date.now() - t.since > WINDOW_MS) tries.delete(k)
  const cur = tries.get(k)
  if (cur && cur.n >= MAX_TRIES) throw new PinError("locked", `Too many wrong PINs. Try again in ${Math.ceil((WINDOW_MS - (Date.now() - cur.since)) / 60000)} min, or reset it with your wallet.`, 0)
  const row = await latest(address)
  if (!row) throw new PinError("none", "This wallet has no saved WondrPay PIN yet")
  const a = Buffer.from(row.mac, "hex"), b = Buffer.from(macOf(address, digest), "hex")
  if (a.length === b.length && timingSafeEqual(a, b)) { tries.delete(k); return true }
  const next = { n: (cur?.n ?? 0) + 1, since: cur?.since ?? Date.now() }
  tries.set(k, next)
  const left = MAX_TRIES - next.n
  throw new PinError(left > 0 ? "wrong" : "locked", left > 0 ? `That's not your WondrPay PIN (${left} ${left === 1 ? "try" : "tries"} left)` : "Too many wrong PINs. Try again in 15 min, or reset it with your wallet.", left)
}

/** Save (or reset) this wallet's PIN. Needs the wallet's signature of pinSaveMessage, made in the last 15 minutes
 *  and newer than the PIN it replaces (an old signature can't roll a reset back). */
export async function savePin(p: { address: Address; digest: string; issuedAt: number; signature: Hex }) {
  const address = getAddress(p.address)
  if (!DIGEST_RE.test(p.digest)) throw new PinError("bad", "Malformed PIN")
  if (!Number.isInteger(p.issuedAt) || Math.abs(now() - p.issuedAt) > 15 * 60) throw new PinError("bad", "That approval expired. Approve again in your wallet.")
  if (!(await verifyMessage({ address, message: pinSaveMessage({ address, issuedAt: p.issuedAt }), signature: p.signature })))
    throw new PinError("bad", "The wallet signature doesn't match this wallet")
  const prev = await latest(address)
  if (prev && prev.setAt >= p.issuedAt) throw new PinError("bad", "A newer PIN was already saved. Approve again in your wallet.")
  const a = arkiv()
  await a.writer.createEntity(PinRecord, { address: addr(address), mac: macOf(address, p.digest), setAt: u64(BigInt(p.issuedAt)) },
    { expiration: ExpirationTime.max() }, { gas: 1_000_000n })
  tries.delete(address.toLowerCase())
  return true
}
