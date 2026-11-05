"use client"
// Wallets on this device, UPI-style. Two kinds:
//  - "device": the private key never leaves the phone and is stored ENCRYPTED.
//      Fingerprint / Face ID: a passkey with the WebAuthn PRF extension yields a 32-byte secret that only
//      this authenticator can produce -> AES-GCM key. PIN (always set): PBKDF2(310k) -> AES-GCM, 5 wrong
//      tries => 5 min lockout. No seed phrase is shown.
//  - "injected": an existing browser wallet (MetaMask, Rabby, ...). We store only its address; it signs
//      the same gasless EIP-712 messages, so it still needs no WBT.
// Several wallets can live on one device; one is active.
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts"
import { createWalletClient, custom, getAddress, isHex, numberToHex, type Hex } from "viem"
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
type InjectedWallet = { kind: "injected"; address: `0x${string}`; label?: string; createdAt: number }
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

export type WalletInfo = { address: `0x${string}`; kind: "device" | "injected"; hasPasskey: boolean; label: string }
const info = (w: Stored, i: number): WalletInfo => ({
  address: w.address,
  kind: w.kind,
  hasPasskey: w.kind === "device" && !!w.passkey,
  label: w.label ?? (w.kind === "injected" ? "Browser wallet" : `Wallet ${i + 1}`),
})

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

function activeDevice(): DeviceWallet {
  const w = activeEntry()
  if (!w) throw new Error("No wallet on this device")
  if (w.kind !== "device") throw new Error("This wallet is a browser wallet; confirm in your wallet app")
  return w
}

export async function unlockWithPin(pin: string): Promise<PrivateKeyAccount> {
  const w = activeDevice()
  const wait = pinLockout(w.address)
  if (wait) throw new Error(`Too many wrong PINs. Try again in ${Math.ceil(wait / 60000)} min`)
  try {
    const pk = await open(await pinKey(pin, unb64(w.pin.salt)), w.pin.iv, w.pin.ct)
    localStorage.removeItem(LOCK(w.address))
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
  replace({ ...w, passkey: { credId: b64(credId), prfSalt: b64(prfSalt), ...sealed } })
}

export async function unlockWithPasskey(): Promise<PrivateKeyAccount> {
  const w = activeDevice()
  if (!w.passkey) throw new Error("Fingerprint not set up")
  const secret = await prfSecret(unb64(w.passkey.credId), unb64(w.passkey.prfSalt))
  return privateKeyToAccount(await open(await prfKey(secret), w.passkey.iv, w.passkey.ct))
}

// --------------------------------------------------- browser wallet (EIP-1193)
type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<any> }
const provider = (): Eip1193 => {
  const eth = (globalThis as any).ethereum as Eip1193 | undefined
  if (!eth) throw new Error("No browser wallet found. Open this page in MetaMask's browser or install a wallet extension.")
  return eth
}
export const hasInjectedWallet = () => typeof window !== "undefined" && !!(window as any).ethereum

/** Phone browsers (Safari/Chrome) can't see MetaMask. This link reopens the same page INSIDE the
 *  MetaMask app's browser, where window.ethereum exists and connecting works. */
export const metamaskDeepLink = (path = "/add") =>
  `https://metamask.app.link/dapp/${location.host}${path}`
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

/** Signer backed by the browser wallet. It only signs messages: the payer still pays no gas. */
export async function injectedSigner(address: `0x${string}`): Promise<Signer> {
  const eth = provider()
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[]
  if (!accounts.some((a) => same(a, address))) throw new Error(`Switch your wallet to ${address.slice(0, 6)}…${address.slice(-4)} and try again`)
  await ensureWhitechain(eth)
  const client = createWalletClient({ chain: whitechainSepolia, transport: custom(eth), account: address })
  return {
    address,
    signTypedData: ((td: any) => client.signTypedData(td)) as Signer["signTypedData"],
    signMessage: ((m: any) => client.signMessage(m)) as Signer["signMessage"],
  }
}

/** Remove the active wallet from this device (device keys are deleted). */
export function removeWallet(address = getWallet()?.address) {
  const s = load()
  s.list = s.list.filter((w) => !same(w.address, address))
  if (same(s.active, address)) s.active = s.list[0]?.address ?? null
  save(s)
  if (address) localStorage.removeItem(LOCK(address))
}
