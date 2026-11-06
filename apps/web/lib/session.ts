"use client"
// Unlock once (like an unlocked UPI app): after one PIN / fingerprint the wallet stays unlocked for
// 15 idle minutes, ACROSS TABS. On phones that matters: coming back from MetaMask, or opening a
// scanned QR from the camera, lands in a NEW tab, and a tab-scoped session asked for the PIN again.
//
// How the key survives without being stored in the clear:
//  - a random AES-GCM key is generated NON-EXTRACTABLE and kept in IndexedDB (its bytes can't be read)
//  - the unlocked private key is stored only encrypted under it (localStorage), with a sliding expiry
//  - the current tab also keeps a plain copy in sessionStorage (cleared when the tab closes)
// External wallets store no secret at all: only "the WondrPay PIN passed at time T".
// "Lock" (endSession) wipes all of it.
import type { Hex } from "viem"

const K = "whitepay.session"
const LK = "whitepay.session.v2"
const IDLE_MS = 15 * 60_000
type S = { address: string; pk?: Hex; at: number }
type L = { address: string; at: number; iv?: string; ct?: string }

const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u as ArrayBuffer)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

function idb<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    const o = indexedDB.open("whitepay-session", 1)
    o.onupgradeneeded = () => o.result.createObjectStore("k")
    o.onerror = () => rej(o.error)
    o.onsuccess = () => {
      const r = f(o.result.transaction("k", mode).objectStore("k"))
      r.onsuccess = () => { res(r.result); o.result.close() }
      r.onerror = () => { rej(r.error); o.result.close() }
    }
  })
}
async function sessionKey(create: boolean): Promise<CryptoKey | null> {
  const k = await idb<CryptoKey | undefined>("readonly", (s) => s.get("aes")).catch(() => undefined)
  if (k || !create) return k ?? null
  const fresh = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
  await idb("readwrite", (s) => s.put(fresh, "aes"))
  return fresh
}

const readL = (): L | null => { try { return JSON.parse(localStorage.getItem(LK) ?? "null") } catch { return null } }
const writeL = (l: L) => { try { localStorage.setItem(LK, JSON.stringify(l)) } catch {} }

export function rememberSession(address: string, pk?: Hex) {
  try { sessionStorage.setItem(K, JSON.stringify({ address, pk, at: Date.now() } satisfies S)) } catch {}
  writeL({ address, at: Date.now() })
  if (pk) void (async () => {
    try {
      const key = await sessionKey(true)
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key!, new TextEncoder().encode(pk))
      writeL({ address, at: Date.now(), iv: b64(iv), ct: b64(ct) })
    } catch {}
  })()
}

/** This tab's session (sync). For a device wallet in a NEW tab, call restoreSession() first. */
export function sessionFor(address: string): S | null {
  const l = readL()
  if (!l || !same(l.address, address) || Date.now() - l.at > IDLE_MS) { if (l) endSession(); return null }
  writeL({ ...l, at: Date.now() }) // sliding idle timeout, shared by every tab
  try {
    const s = JSON.parse(sessionStorage.getItem(K) ?? "null") as S | null
    if (s && same(s.address, address)) return { ...s, at: Date.now() }
  } catch {}
  // another tab unlocked: external wallets need no secret; device wallets need restoreSession()
  return l.ct ? null : { address: l.address, at: l.at }
}

/** sessionFor, plus: decrypt a device wallet's key unlocked in another tab. */
export async function restoreSession(address: string): Promise<S | null> {
  const s = sessionFor(address)
  if (s) return s
  const l = readL()
  if (!l?.ct || !l.iv || !same(l.address, address)) return null
  try {
    const key = await sessionKey(false)
    if (!key) return null
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(l.iv) as BufferSource }, key, unb64(l.ct) as BufferSource)
    const pk = new TextDecoder().decode(pt) as Hex
    try { sessionStorage.setItem(K, JSON.stringify({ address: l.address, pk, at: Date.now() } satisfies S)) } catch {}
    return { address: l.address, pk, at: Date.now() }
  } catch { return null }
}

export function endSession() {
  try { sessionStorage.removeItem(K) } catch {}
  try { localStorage.removeItem(LK) } catch {}
}
