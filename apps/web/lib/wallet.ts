"use client"
// Device wallet, UPI-style: the private key never leaves the phone and is stored ENCRYPTED.
//  - Fingerprint / Face ID: a passkey with the WebAuthn PRF extension yields a 32-byte secret
//    that only this authenticator can produce -> AES-GCM key. (UPI: device binding + biometric.)
//  - PIN (fallback, always set): PBKDF2(310k, SHA-256) -> AES-GCM. 5 wrong tries => 5 min lockout.
// No seed phrase is shown; the user never sees the key.
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts"
import { isHex, type Hex } from "viem"

const STORE = "whitepay.wallet.v1"
const LOCK = "whitepay.pinlock.v1"
const PBKDF2_ITERS = 310_000
const MAX_TRIES = 5
const LOCKOUT_MS = 5 * 60_000

type Blob = { salt: string; iv: string; ct: string }
type Stored = {
  address: `0x${string}`
  pin: Blob
  passkey?: { credId: string; prfSalt: string; iv: string; ct: string }
  createdAt: number
}

const enc = new TextEncoder()
const dec = new TextDecoder()
const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u as ArrayBuffer)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))

const read = (): Stored | null => {
  try {
    const raw = localStorage.getItem(STORE)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}
const write = (s: Stored) => localStorage.setItem(STORE, JSON.stringify(s))

export const getWallet = () => {
  const s = read()
  return s ? { address: s.address, hasPasskey: !!s.passkey } : null
}

// ------------------------------------------------------------------ PIN
async function pinKey(pin: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

async function seal(key: CryptoKey, pk: Hex) {
  const iv = rand(12)
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, enc.encode(pk))
  return { iv: b64(iv), ct: b64(ct) }
}
async function open(key: CryptoKey, iv: string, ct: string): Promise<Hex> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) as BufferSource }, key, unb64(ct) as BufferSource)
  const pk = dec.decode(pt)
  if (!isHex(pk) || pk.length !== 66) throw new Error("corrupt key")
  return pk as Hex
}

export const validPin = (pin: string) => /^\d{6}$/.test(pin)

/** Create a fresh device wallet protected by a 6-digit PIN. */
export async function createWallet(pin: string, importPk?: Hex) {
  if (!validPin(pin)) throw new Error("PIN must be 6 digits")
  const pk = importPk ?? generatePrivateKey()
  const account = privateKeyToAccount(pk)
  const salt = rand(16)
  const sealed = await seal(await pinKey(pin, salt), pk)
  write({ address: account.address, pin: { salt: b64(salt), ...sealed }, createdAt: Date.now() })
  return account.address
}

export function pinLockout(): number {
  try {
    const l = JSON.parse(localStorage.getItem(LOCK) ?? "{}") as { tries?: number; until?: number }
    return l.until && l.until > Date.now() ? l.until - Date.now() : 0
  } catch {
    return 0
  }
}

export async function unlockWithPin(pin: string): Promise<PrivateKeyAccount> {
  const s = read()
  if (!s) throw new Error("No wallet on this device")
  const wait = pinLockout()
  if (wait) throw new Error(`Too many wrong PINs. Try again in ${Math.ceil(wait / 60000)} min`)
  try {
    const pk = await open(await pinKey(pin, unb64(s.pin.salt)), s.pin.iv, s.pin.ct)
    localStorage.removeItem(LOCK)
    return privateKeyToAccount(pk)
  } catch {
    const l = JSON.parse(localStorage.getItem(LOCK) ?? "{}") as { tries?: number }
    const tries = (l.tries ?? 0) + 1
    localStorage.setItem(LOCK, JSON.stringify(tries >= MAX_TRIES ? { tries: 0, until: Date.now() + LOCKOUT_MS } : { tries }))
    throw new Error(tries >= MAX_TRIES ? "Too many wrong PINs. Locked for 5 minutes" : `Wrong PIN (${MAX_TRIES - tries} tries left)`)
  }
}

// --------------------------------------------------------- passkey (PRF)
export async function passkeySupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false
  try {
    const caps = await (PublicKeyCredential as any).getClientCapabilities?.()
    if (caps && "extension:prf" in caps) return !!caps["extension:prf"]
  } catch {}
  return typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function"
    ? PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    : false
}

async function prfSecret(credId: Uint8Array, prfSalt: Uint8Array): Promise<Uint8Array> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: rand(32) as BufferSource,
      allowCredentials: [{ type: "public-key", id: credId as BufferSource }],
      userVerification: "required",
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt as BufferSource } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  const out = (assertion?.getClientExtensionResults() as any)?.prf?.results?.first as ArrayBuffer | undefined
  if (!out) throw new Error("This device's fingerprint/Face ID can't protect keys (no PRF). Use your PIN.")
  return new Uint8Array(out)
}

const prfKey = (secret: Uint8Array) =>
  crypto.subtle.importKey("raw", secret as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])

/** Add fingerprint/Face ID unlock. Needs the PIN once to decrypt the key. */
export async function enablePasskey(pin: string) {
  const s = read()
  if (!s) throw new Error("No wallet on this device")
  const account = await unlockWithPin(pin)
  const pk = await openPinPk(pin, s)
  const prfSalt = rand(32)
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: rand(32) as BufferSource,
      rp: { name: "WhitePay" },
      user: { id: rand(16) as BufferSource, name: `whitepay-${account.address.slice(2, 8)}`, displayName: "WhitePay wallet" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60_000,
      extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error("Fingerprint setup was cancelled")
  const credId = new Uint8Array(cred.rawId)
  const secret = await prfSecret(credId, prfSalt) // second prompt: derive the encryption secret
  const sealed = await seal(await prfKey(secret), pk)
  write({ ...s, passkey: { credId: b64(credId), prfSalt: b64(prfSalt), ...sealed } })
}

async function openPinPk(pin: string, s: Stored) {
  return open(await pinKey(pin, unb64(s.pin.salt)), s.pin.iv, s.pin.ct)
}

export async function unlockWithPasskey(): Promise<PrivateKeyAccount> {
  const s = read()
  if (!s?.passkey) throw new Error("Fingerprint not set up")
  const secret = await prfSecret(unb64(s.passkey.credId), unb64(s.passkey.prfSalt))
  return privateKeyToAccount(await open(await prfKey(secret), s.passkey.iv, s.passkey.ct))
}

export function removeWallet() {
  localStorage.removeItem(STORE)
  localStorage.removeItem(LOCK)
}
