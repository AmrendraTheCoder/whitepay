"use client"
// Unlock once per session (like an unlocked UPI app): after one PIN / fingerprint the wallet stays
// unlocked in THIS tab for 15 idle minutes. sessionStorage is tab-scoped and cleared when the tab
// closes; "Lock" ends it early. External wallets only remember that the PIN passed: MetaMask still
// approves every signature itself.
import type { Hex } from "viem"

const K = "whitepay.session"
const IDLE_MS = 15 * 60_000
type S = { address: string; pk?: Hex; at: number }

export function rememberSession(address: string, pk?: Hex) {
  try { sessionStorage.setItem(K, JSON.stringify({ address, pk, at: Date.now() } satisfies S)) } catch {}
}

export function sessionFor(address: string): S | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(K) ?? "null") as S | null
    if (!s || s.address.toLowerCase() !== address.toLowerCase()) return null
    if (Date.now() - s.at > IDLE_MS) { sessionStorage.removeItem(K); return null }
    sessionStorage.setItem(K, JSON.stringify({ ...s, at: Date.now() })) // sliding idle timeout
    return s
  } catch { return null }
}

export function endSession() {
  try { sessionStorage.removeItem(K) } catch {}
}
