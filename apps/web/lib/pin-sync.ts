"use client"
// The WondrPay PIN of a MetaMask wallet, the same on every device (see packages/server/src/pin.ts).
// The PIN never leaves this device: we send a slow PBKDF2 digest bound to the wallet address.
import { getAddress, stringToHex, type Hex } from "viem"
import { pinSaveMessage } from "@whitepay/shared"
import { setExternalPin, listWallets } from "./wallet"

const enc = new TextEncoder()
/** PBKDF2-SHA256(PIN, "wondrpay-pin:" + address, 310k) as hex: the same on every device for the same PIN */
export async function pinDigest(address: string, pin: string): Promise<string> {
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(`wondrpay-pin:${address.toLowerCase()}`), iterations: 310_000, hash: "SHA-256" }, base, 256)
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** Does this wallet already have a WondrPay PIN (set on another device)? null = couldn't tell (offline) */
export async function hasSavedPin(address: string): Promise<boolean | null> {
  try {
    const r = await fetch(`/api/pin?address=${address}`, { cache: "no-store" })
    if (!r.ok) return null
    return !!(await r.json()).exists
  } catch { return null }
}

/** Check the PIN the person remembers against the saved one; on success it becomes this device's PIN too. */
export async function adoptSavedPin(address: string, pin: string) {
  const r = await fetch("/api/pin", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "check", address, digest: await pinDigest(address, pin) }) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error ?? "Couldn't check your PIN. Try again.")
  await setExternalPin(address, pin)
}

/** Ask the wallet (MetaMask) to approve saving a PIN. Plain message signature: no gas, no chain switch. */
export async function approvePinSave(address: string): Promise<{ issuedAt: number; signature: Hex }> {
  const a = getAddress(address)
  const issuedAt = Math.floor(Date.now() / 1000)
  const message = pinSaveMessage({ address: a, issuedAt })
  const w = listWallets().find((x) => x.address.toLowerCase() === a.toLowerCase())
  let eth: { request: (x: { method: string; params?: unknown[] }) => Promise<any> }
  if (w?.kind === "walletconnect") {
    const { wcProvider } = await import("./walletconnect")
    eth = await wcProvider()
  } else {
    eth = (globalThis as any).ethereum
    if (!eth) throw new Error("No browser wallet found")
  }
  const signature = (await eth.request({ method: "personal_sign", params: [stringToHex(message), a] })) as Hex
  return { issuedAt, signature }
}

/** Save the PIN for every device (needs approvePinSave's signature), and set it on this device. */
export async function savePinEverywhere(address: string, pin: string, auth: { issuedAt: number; signature: Hex }) {
  await setExternalPin(address, pin)
  const r = await fetch("/api/pin", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "save", address, digest: await pinDigest(address, pin), ...auth }) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error ?? "Couldn't save your PIN for other devices")
}
