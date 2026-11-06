"use client"
// Payment security preferences, per wallet, kept on this device.
//  - confirm "every":   PIN / fingerprint before EVERY payment (default). The 15-minute unlock still
//                       spares you the PIN for non-money actions (signing a reply, opening a shop).
//  - confirm "session": one PIN / fingerprint unlocks payments for 15 idle minutes (UPI-app style).
//  - worldAboveUsd:     also ask for a World ID scan on payments at or above this amount; null = never.
// External wallets (MetaMask) always approve the signature in the wallet itself, whatever is set here.
export type ConfirmMode = "every" | "session"
export type PaySecurity = { confirm: ConfirmMode; worldAboveUsd: number | null }

export const DEFAULT_SECURITY: PaySecurity = { confirm: "every", worldAboveUsd: 100 }
export const WORLD_THRESHOLDS: (number | null)[] = [null, 20, 100, 500]

const key = (address: string) => `whitepay.security.${address.toLowerCase()}`

export function paySecurity(address?: string): PaySecurity {
  if (!address) return DEFAULT_SECURITY
  try {
    const s = JSON.parse(localStorage.getItem(key(address)) ?? "null") as Partial<PaySecurity> | null
    return {
      confirm: s?.confirm === "session" ? "session" : "every",
      worldAboveUsd: s && "worldAboveUsd" in s ? (typeof s.worldAboveUsd === "number" && s.worldAboveUsd > 0 ? s.worldAboveUsd : null) : DEFAULT_SECURITY.worldAboveUsd,
    }
  } catch { return DEFAULT_SECURITY }
}

export function setPaySecurity(address: string, s: PaySecurity) {
  try { localStorage.setItem(key(address), JSON.stringify(s)) } catch {}
}

/** is `next` less strict than `prev`? (loosening needs the PIN / fingerprint first) */
export function looser(prev: PaySecurity, next: PaySecurity) {
  const w = (x: number | null) => (x === null ? Infinity : x)
  return (prev.confirm === "every" && next.confirm === "session") || w(next.worldAboveUsd) > w(prev.worldAboveUsd)
}
