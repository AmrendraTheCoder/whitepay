"use client"
// Submitting a signed payment, without ever leaving the user unsure whether money moved.
// 1. POST with a hard timeout (a hung request used to spin forever).
// 2. If the request fails WITHOUT a clear answer from the server (timeout, offline, 5xx), ask the chain:
//    the signature's EIP-3009 nonce is either used (paid) or not (nothing was charged).

export class SettleError extends Error {
  constructor(message: string, public code?: string, public charged: "no" | "unknown" = "no") { super(message) }
}

type Confirm = { from: string; nonce: string }
export type Settled = { explorer?: string; confirmedOnChain?: boolean; [k: string]: unknown }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Poll /api/auth-state until the authorization shows up as used, or give up after `ms`. */
export async function authUsed({ from, nonce }: Confirm, ms = 20_000): Promise<{ used: boolean; explorer?: string } | null> {
  const end = Date.now() + ms
  let last: { used: boolean; explorer?: string } | null = null
  while (Date.now() < end) {
    try {
      const r = await fetch(`/api/auth-state?from=${from}&nonce=${nonce}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) })
      if (r.ok) { last = await r.json(); if (last?.used) return last }
    } catch {}
    await sleep(2_000)
  }
  return last // { used: false } = chain says not charged; null = couldn't even ask
}

/** POST a signed payment; on an unclear outcome, confirm against the chain before reporting. */
export async function settle(url: string, body: unknown, confirm: Confirm, timeoutMs = 45_000): Promise<Settled> {
  let res: Response
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    return fromChain(confirm) // timeout / offline: the relayer may still have settled it
  }
  const out = await res.json().catch(() => ({}))
  if (res.ok) return out
  if (res.status >= 500 || res.status === 0) return fromChain(confirm, out.error)
  throw new SettleError(out.error ?? "Payment failed", out.code)
}

async function fromChain(confirm: Confirm, serverError?: string): Promise<Settled> {
  const s = await authUsed(confirm)
  if (s?.used) return { explorer: s.explorer, confirmedOnChain: true }
  if (s) throw new SettleError(serverError ?? "The payment didn't go through. Nothing was charged.", undefined, "no")
  throw new SettleError("We couldn't reach the network to confirm this payment. Check your history before paying again.", "unconfirmed", "unknown")
}
