"use client"
// Wallets on this device, UPI-style. Two kinds:
//  - "device": the private key never leaves the phone and is stored ENCRYPTED.
//      Fingerprint / Face ID: a passkey with the WebAuthn PRF extension yields a 32-byte secret that only
//      this authenticator can produce -> AES-GCM key. PIN (always set): PBKDF2(310k) -> AES-GCM, 5 wrong
//      tries => 5 min lockout. No seed phrase is shown.
//  - "injected": an existing browser wallet (MetaMask, Rabby, ...). We store only its address; it signs
//      the same gasless EIP-712 messages, so it still needs no WBT.
// Several wallets can live on one device; one is active.
import { rememberSession, endSession } from "./session"
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts"
import { createWalletClient, custom, getAddress, isHex, numberToHex, recoverTypedDataAddress, type Hex } from "viem"
import { whitechainSepolia } from "@whitepay/shared"

const STORE = "whitepay.wallets.v2"
const LEGACY = "whitepay.wallet.v1"
const LOCK = (a: string) => `whitepay.pinlock.${a.toLowerCase()}`
const PBKDF2_ITERS = 310_000
const MAX_TRIES = 5
const LOCKOUT_MS = 5 * 60_000

type Blob = { salt: string; iv: string; ct: string }
type DeviceWallet = {
  kind: "device"
  address: `0x${string}`
  label?: string
  pin: Blob
  passkey?: { credId: string; prfSalt: string; iv: string; ct: string }
  createdAt: number
}
/** A wallet whose keys live elsewhere (MetaMask extension or a WalletConnect app).
 *  WondrPay still guards every payment with its OWN PIN / fingerprint before asking it to sign. */
type InjectedWallet = {
  kind: "injected" | "walletconnect"
  address: `0x${string}`
  label?: string
  createdAt: number
  pinCheck?: { salt: string; hash: string } // PBKDF2 verifier of the WondrPay PIN (never the PIN)
  passkeyId?: string // WebAuthn credential used as a user-verification gate
}
type Stored = DeviceWallet | InjectedWallet
type Store = { active: `0x${string}` | null; list: Stored[] }

/** Anything that can sign our gasless messages: an unlocked device key or a browser wallet. */
export type Signer = Pick<PrivateKeyAccount, "address" | "signTypedData" | "signMessage">

const enc = new TextEncoder()
const dec = new TextDecoder()
const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u as ArrayBuffer)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

function load(): Store {
  try {
    const raw = localStorage.getItem(STORE)
    if (raw) return JSON.parse(raw) as Store
    const legacy = localStorage.getItem(LEGACY) // migrate the single-wallet format
    if (legacy) {
      const w = { kind: "device", ...JSON.parse(legacy) } as DeviceWallet
      const s: Store = { active: w.address, list: [w] }
      localStorage.setItem(STORE, JSON.stringify(s))
      localStorage.removeItem(LEGACY)
      return s
    }
  } catch {}
  return { active: null, list: [] }
}
const save = (s: Store) => localStorage.setItem(STORE, JSON.stringify(s))
const activeEntry = (s = load()) => s.list.find((w) => same(w.address, s.active)) ?? s.list[0] ?? null
const replace = (w: Stored) => {
  const s = load()
  s.list = s.list.map((x) => (same(x.address, w.address) ? w : x))
  save(s)
}

export type WalletInfo = {
  address: `0x${string}`
  kind: "device" | "injected" | "walletconnect"
  hasPasskey: boolean
  /** every wallet must have a WondrPay PIN before it can pay */
  hasPin: boolean
  label: string
}
const info = (w: Stored, i: number): WalletInfo => ({
  address: w.address,
  kind: w.kind,
  hasPasskey: w.kind === "device" ? !!w.passkey : !!w.passkeyId,
  hasPin: w.kind === "device" ? true : !!w.pinCheck,
  label: w.label ?? (w.kind === "walletconnect" ? "MetaMask (WalletConnect)" : w.kind === "injected" ? "Browser wallet" : `Wallet ${i + 1}`),
})
export const isExternal = (w?: WalletInfo | null) => !!w && w.kind !== "device"

export const getWallet = (): WalletInfo | null => {
  const s = load()
  const w = activeEntry(s)
  return w ? info(w, s.list.indexOf(w)) : null
}
export const listWallets = (): WalletInfo[] => load().list.map(info)
export function setActiveWallet(address: string) {
  const s = load()
  const w = s.list.find((x) => same(x.address, address))
  if (w) save({ ...s, active: w.address })
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

/** Create (or import) a device wallet protected by a 6-digit PIN, and make it active. */
export async function createWallet(pin: string, importPk?: Hex) {
  if (!validPin(pin)) throw new Error("PIN must be 6 digits")
  const pk = importPk ?? generatePrivateKey()
  const account = privateKeyToAccount(pk)
  const s = load()
  if (s.list.some((w) => same(w.address, account.address))) throw new Error("That wallet is already on this device")
  const salt = rand(16)
  const sealed = await seal(await pinKey(pin, salt), pk)
  s.list.push({ kind: "device", address: account.address, pin: { salt: b64(salt), ...sealed }, createdAt: Date.now() })
  s.active = account.address
  save(s)
  rememberSession(account.address, pk) // just set the PIN: don't ask for it again this session
  return account.address
}

export function pinLockout(address = getWallet()?.address ?? ""): number {
  try {
    const l = JSON.parse(localStorage.getItem(LOCK(address)) ?? "{}") as { until?: number }
    return l.until && l.until > Date.now() ? l.until - Date.now() : 0
  } catch {
    return 0
  }
}

function activeDevice(address?: string): DeviceWallet {
  const w = address ? load().list.find((x) => same(x.address, address)) ?? null : activeEntry()
  if (!w) throw new Error("No wallet on this device")
  if (w.kind !== "device") throw new Error("This wallet is a browser wallet; confirm in your wallet app")
  return w
}

/** `address`: unlock a specific (non-active) wallet once, e.g. to co-sign; it doesn't replace the session. */
export async function unlockWithPin(pin: string, address?: string): Promise<PrivateKeyAccount> {
  const w = activeDevice(address)
  const keep = !address || same(address, load().active)
  const wait = pinLockout(w.address)
  if (wait) throw new Error(`Too many wrong PINs. Try again in ${Math.ceil(wait / 60000)} min`)
  try {
    const pk = await open(await pinKey(pin, unb64(w.pin.salt)), w.pin.iv, w.pin.ct)
    localStorage.removeItem(LOCK(w.address))
    if (keep) rememberSession(w.address, pk)
    return privateKeyToAccount(pk)
  } catch {
    const l = JSON.parse(localStorage.getItem(LOCK(w.address)) ?? "{}") as { tries?: number }
    const tries = (l.tries ?? 0) + 1
    localStorage.setItem(LOCK(w.address), JSON.stringify(tries >= MAX_TRIES ? { tries: 0, until: Date.now() + LOCKOUT_MS } : { tries }))
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

/** Add fingerprint/Face ID unlock to the active device wallet. Needs the PIN once. */
export async function enablePasskey(pin: string) {
  const w = activeDevice()
  const account = await unlockWithPin(pin)
  const pk = await open(await pinKey(pin, unb64(w.pin.salt)), w.pin.iv, w.pin.ct)
  const prfSalt = rand(32)
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: rand(32) as BufferSource,
      rp: { name: "WondrPay" },
      user: { id: rand(16) as BufferSource, name: `whitepay-${account.address.slice(2, 8)}`, displayName: "WondrPay wallet" },
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
  replace({ ...w, passkey: { credId: b64(credId), prfSalt: b64(prfSalt), ...sealed } })
}

export async function unlockWithPasskey(address?: string): Promise<PrivateKeyAccount> {
  const w = activeDevice(address)
  if (!w.passkey) throw new Error("Fingerprint not set up")
  const secret = await prfSecret(unb64(w.passkey.credId), unb64(w.passkey.prfSalt))
  const pk = await open(await prfKey(secret), w.passkey.iv, w.passkey.ct)
  if (!address || same(address, load().active)) rememberSession(w.address, pk)
  return privateKeyToAccount(pk)
}

// --------------------------------------------------- browser wallet (EIP-1193)
type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<any> }
const provider = (): Eip1193 => {
  const eth = (globalThis as any).ethereum as Eip1193 | undefined
  if (!eth) throw new Error("No browser wallet found. Open this page in MetaMask's browser or install a wallet extension.")
  return eth
}
export const hasInjectedWallet = () => typeof window !== "undefined" && !!(window as any).ethereum

export const isMobile = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

/** Connect MetaMask/Rabby/... and add it as a wallet (address only; keys stay in that wallet). */
export async function connectInjectedWallet() {
  const accounts = (await provider().request({ method: "eth_requestAccounts" })) as string[]
  if (!accounts?.length) throw new Error("No account was shared")
  const address = getAddress(accounts[0])
  const s = load()
  if (!s.list.some((w) => same(w.address, address))) s.list.push({ kind: "injected", address, createdAt: Date.now() })
  s.active = address
  save(s)
  return address
}

/** EIP-712 domains carry chainId 1874, so the wallet must be on Whitechain Sepolia to sign. */
async function ensureWhitechain(eth: Eip1193) {
  const chainId = numberToHex(whitechainSepolia.id)
  // eth_chainId is answered locally (extension) or from the WalletConnect session: no wallet pop-up.
  // Only ask to switch when it's actually on another chain; over WalletConnect every switch request
  // opens MetaMask, which used to cost an extra redirect before EVERY signature.
  const current = await eth.request({ method: "eth_chainId" }).catch(() => null)
  if (typeof current === "string" && BigInt(current) === BigInt(whitechainSepolia.id)) return
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] })
  } catch (e: any) {
    if (e?.code !== 4902 && !/unrecognized|not added|unknown chain/i.test(String(e?.message))) throw e
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId,
        chainName: whitechainSepolia.name,
        nativeCurrency: whitechainSepolia.nativeCurrency,
        rpcUrls: whitechainSepolia.rpcUrls.default.http,
        blockExplorerUrls: [whitechainSepolia.blockExplorers!.default.url],
      }],
    })
  }
}

/** Ask the browser wallet for an account WITHOUT adding it to WondrPay (hosted checkout: one-off payments by
 *  people who may never open the app; a wallet only joins WondrPay through onboarding, with a PIN). */
export async function requestInjectedAccount(): Promise<`0x${string}`> {
  const accounts = (await provider().request({ method: "eth_requestAccounts" })) as string[]
  if (!accounts?.length) throw new Error("No account was shared")
  return getAddress(accounts[0])
}

/** Signer backed by the browser wallet. It only signs messages: the payer still pays no gas. */
export async function injectedSigner(address: `0x${string}`): Promise<Signer> {
  const eth = provider()
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[]
  if (!accounts.some((a) => same(a, address))) throw new Error(`Switch your wallet to ${address.slice(0, 6)}…${address.slice(-4)} and try again`)
  await ensureWhitechain(eth)
  const client = createWalletClient({ chain: whitechainSepolia, transport: custom(eth), account: address })
  return guardedSigner(address, client, "injected", () => ensureWhitechain(eth))
}

// ------------------------------------------------ pending wallet request (timeout + cancel + UI signal)
// An external wallet can sit on a request forever (app closed, deep link blocked, dead WalletConnect
// session). Every external signature therefore: has a 2-minute deadline, can be cancelled from the
// processing screen, and announces itself so that screen can offer "Open MetaMask".
export type PendingWallet = { kind: "injected" | "walletconnect"; since: number } | null
let pendingReq: { info: NonNullable<PendingWallet>; reject: (e: Error) => void } | null = null
const listeners = new Set<(p: PendingWallet) => void>()
const emit = () => listeners.forEach((f) => f(pendingReq?.info ?? null))
export function onWalletPending(f: (p: PendingWallet) => void) { listeners.add(f); f(pendingReq?.info ?? null); return () => { listeners.delete(f) } }
export function cancelWalletRequest() { pendingReq?.reject(Object.assign(new Error("Cancelled. Nothing was charged."), { code: 4001 })) }
const WALLET_TIMEOUT_MS = 120_000

function guarded<T>(kind: "injected" | "walletconnect", run: () => Promise<T>): Promise<T> {
  cancelWalletRequest() // never two at once
  return new Promise<T>((resolve, reject) => {
    const me = { info: { kind, since: Date.now() }, reject: (e: Error) => finish(() => reject(e)) }
    let settled = false
    const finish = (f: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(t)
      if (pendingReq === me) { pendingReq = null; emit() }
      f()
    }
    const name = kind === "walletconnect" ? "MetaMask" : "Your wallet"
    const t = setTimeout(() => me.reject(new Error(kind === "walletconnect"
      ? `${name} didn't respond. Open MetaMask and try again; if it keeps happening, reconnect it under You.`
      : `${name} didn't respond. Open the extension and try again.`)), WALLET_TIMEOUT_MS)
    pendingReq = me
    emit()
    run().then((v) => finish(() => resolve(v)), (e) => finish(() => reject(e)))
  })
}

// The usual "fails the first time, works the second" with MetaMask: it just switched to Whitechain and refuses the very
// first signature with a chain mismatch. Re-check the chain and ask once more instead of failing the payment.
const CHAIN_MISMATCH = /chain ?id|does not match the (current|active) chain|active chain|wrong network|switch (to|network)/i
function guardedSigner(address: `0x${string}`, client: { signTypedData: (a: any) => Promise<Hex>; signMessage: (a: any) => Promise<Hex> }, kind: "injected" | "walletconnect", reSwitch?: () => Promise<void>): Signer {
  const signTyped = async (td: any): Promise<Hex> => {
    let sig: Hex
    try { sig = await guarded(kind, () => client.signTypedData(td)) } catch (e) {
      if (!reSwitch || !CHAIN_MISMATCH.test(String((e as Error)?.message ?? e))) throw e
      await guarded(kind, reSwitch)
      await new Promise((r) => setTimeout(r, 600))
      sig = await guarded(kind, () => client.signTypedData(td))
    }
    // check the signature here, so a wrong account / broken signature is caught with a clear message instead of an
    // "invalid authorization" from the chain after the request was sent
    const signer = await recoverTypedDataAddress({ ...td, signature: sig }).catch(() => null)
    if (!signer || !same(signer, address)) throw new Error(`Your wallet signed with ${signer ? `${signer.slice(0, 6)}…${signer.slice(-4)}` : "an unexpected key"}, not ${address.slice(0, 6)}…${address.slice(-4)}. Switch to that account in your wallet and try again; nothing was charged.`)
    return sig
  }
  return {
    address,
    signTypedData: signTyped as Signer["signTypedData"],
    signMessage: ((m: any) => guarded(kind, () => client.signMessage(m))) as Signer["signMessage"],
  }
}

// ------------------------------------------------ WalletConnect (stays in Chrome)
export async function connectWalletConnect() {
  const { wcConnect } = await import("./walletconnect")
  const address = getAddress(await wcConnect())
  const s = load()
  if (!s.list.some((w) => same(w.address, address))) s.list.push({ kind: "walletconnect", address, createdAt: Date.now() })
  s.active = address
  save(s)
  return address
}

/** Signer for an external wallet: asks the wallet (extension or WalletConnect app) to sign. */
export async function externalSigner(w: WalletInfo): Promise<Signer> {
  if (w.kind === "injected") return injectedSigner(w.address)
  const { wcEnsureSession, wcReset, isBrokenSessionError } = await import("./walletconnect")
  const setup = async () => {
    const p = await wcEnsureSession()
    const accounts = ((await p.request({ method: "eth_accounts" }).catch(() => null)) as string[] | null) ?? p.accounts ?? []
    if (!accounts.some((a) => same(a, w.address))) throw new Error(`Connected wallet is not ${w.address.slice(0, 6)}…${w.address.slice(-4)}; reconnect it under You`)
    // a chain switch over WalletConnect opens MetaMask; bound it so a dead session can't hang the sheet
    await guarded("walletconnect", () => ensureWhitechain(p as unknown as Eip1193))
    const client = createWalletClient({ chain: whitechainSepolia, transport: custom(p as any), account: w.address })
    return guardedSigner(w.address, client, "walletconnect", () => ensureWhitechain(p as unknown as Eip1193))
  }
  // a broken WalletConnect session (restored without its namespaces, deleted on the wallet's side, ...) is not the
  // user's problem: drop it, reconnect once, and carry on, instead of showing an RPC error
  const heal = async <T,>(run: () => Promise<T>): Promise<T> => {
    try { return await run() } catch (e) {
      if (!isBrokenSessionError(e)) throw e
      console.warn("[walletconnect] broken session, reconnecting", e)
      await wcReset()
      return run()
    }
  }
  let signer = await heal(setup)
  const again = async () => { await wcReset(); signer = await setup(); return signer }
  const retry = async <T,>(f: (s: Signer) => Promise<T>): Promise<T> => {
    try { return await f(signer) } catch (e) {
      if (!isBrokenSessionError(e)) throw e
      console.warn("[walletconnect] broken session while signing, reconnecting", e)
      return f(await again())
    }
  }
  return {
    address: w.address,
    signTypedData: ((td: any) => retry((s) => s.signTypedData(td))) as Signer["signTypedData"],
    signMessage: ((m: any) => retry((s) => s.signMessage(m))) as Signer["signMessage"],
  }
}

// ------------------------------------------ WondrPay PIN / fingerprint for external wallets
function extEntry(address: string): InjectedWallet {
  const w = load().list.find((x) => same(x.address, address))
  if (!w || w.kind === "device") throw new Error("Not an external wallet")
  return w
}
async function pinHash(pin: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERS, hash: "SHA-256" }, base, 256)
  return b64(bits)
}
/** Set the WondrPay PIN that guards payments from an external wallet. */
export async function setExternalPin(address: string, pin: string) {
  if (!validPin(pin)) throw new Error("PIN must be 6 digits")
  const w = extEntry(address)
  const salt = rand(16)
  replace({ ...w, pinCheck: { salt: b64(salt), hash: await pinHash(pin, salt) } })
  if (same(w.address, load().active)) rememberSession(w.address)
}
/** Check the WondrPay PIN (same 5-tries lockout as device wallets). */
export async function verifyExternalPin(address: string, pin: string) {
  const w = extEntry(address)
  if (!w.pinCheck) throw new Error("Set a WondrPay PIN for this wallet first")
  const wait = pinLockout(w.address)
  if (wait) throw new Error(`Too many wrong PINs. Try again in ${Math.ceil(wait / 60000)} min`)
  if ((await pinHash(pin, unb64(w.pinCheck.salt))) === w.pinCheck.hash) { localStorage.removeItem(LOCK(w.address)); if (same(w.address, load().active)) rememberSession(w.address); return }
  const l = JSON.parse(localStorage.getItem(LOCK(w.address)) ?? "{}") as { tries?: number }
  const tries = (l.tries ?? 0) + 1
  localStorage.setItem(LOCK(w.address), JSON.stringify(tries >= MAX_TRIES ? { tries: 0, until: Date.now() + LOCKOUT_MS } : { tries }))
  throw new Error(tries >= MAX_TRIES ? "Too many wrong PINs. Locked for 5 minutes" : `Wrong PIN (${MAX_TRIES - tries} tries left)`)
}
/** Add fingerprint / Face ID as the payment check for an external wallet (needs the PIN once). */
export async function enableExternalPasskey(address: string, pin: string) {
  await verifyExternalPin(address, pin)
  const w = extEntry(address)
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: rand(32) as BufferSource,
      rp: { name: "WondrPay" },
      user: { id: rand(16) as BufferSource, name: `whitepay-${w.address.slice(2, 8)}`, displayName: "WondrPay payments" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error("Fingerprint setup was cancelled")
  replace({ ...w, passkeyId: b64(cred.rawId) })
}
/** Fingerprint / Face ID check (user verification required) before an external wallet signs. */
export async function verifyExternalPasskey(address: string) {
  const w = extEntry(address)
  if (!w.passkeyId) throw new Error("Fingerprint not set up")
  const a = await navigator.credentials.get({
    publicKey: {
      challenge: rand(32) as BufferSource,
      allowCredentials: [{ type: "public-key", id: unb64(w.passkeyId) as BufferSource }],
      userVerification: "required",
      timeout: 60_000,
    },
  })
  if (!a) throw new Error("Fingerprint cancelled")
  if (same(w.address, load().active)) rememberSession(w.address)
}

/** Remove the active wallet from this device (device keys are deleted). */
export function removeWallet(address = getWallet()?.address) {
  const s = load()
  const w = s.list.find((x) => same(x.address, address))
  if (w?.kind === "walletconnect") import("./walletconnect").then((m) => m.wcDisconnect()).catch(() => {})
  s.list = s.list.filter((w) => !same(w.address, address))
  if (same(s.active, address)) s.active = s.list[0]?.address ?? null
  save(s)
  endSession()
  if (address) localStorage.removeItem(LOCK(address))
}
