"use client"
// WalletConnect v2: connect MetaMask mobile (or any WC wallet) while WhitePay stays in Chrome.
// Chrome shows the WalletConnect modal -> the wallet app opens only to approve -> back to Chrome.
// Every later signature request travels over the same session; the page never leaves Chrome.
import { whitechainSepolia } from "@whitepay/shared"

const PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? ""
export const wcConfigured = () => PROJECT_ID.length > 0

type Provider = {
  request: (a: { method: string; params?: unknown[] }) => Promise<any>
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  accounts: string[]
  session?: unknown
  on: (e: string, f: (...a: any[]) => void) => void
}
let provider: Provider | null = null

export async function wcProvider(): Promise<Provider> {
  if (provider) return provider
  if (!wcConfigured()) throw new Error("WalletConnect isn't configured (NEXT_PUBLIC_WC_PROJECT_ID missing)")
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider")
  provider = (await EthereumProvider.init({
    projectId: PROJECT_ID,
    showQrModal: true, // desktop: QR code; phone: list of wallet apps that deep-link and return
    optionalChains: [whitechainSepolia.id],
    rpcMap: { [whitechainSepolia.id]: whitechainSepolia.rpcUrls.default.http[0] },
    optionalMethods: [
      "eth_signTypedData_v4", "personal_sign", "eth_accounts", "eth_requestAccounts", "eth_chainId",
      "wallet_switchEthereumChain", "wallet_addEthereumChain",
    ],
    metadata: {
      name: "WhitePay",
      description: "Scan, verify, pay in USDT on Whitechain. No gas.",
      url: location.origin,
      icons: [`${location.origin}/icon.svg`],
    },
  })) as unknown as Provider
  return provider
}

/** Open the WalletConnect modal and return the connected address. */
export async function wcConnect(): Promise<string> {
  const p = await wcProvider()
  if (!p.session) await p.connect()
  const a = p.accounts?.[0]
  if (!a) throw new Error("No account was shared over WalletConnect")
  return a
}

/** Reuse the stored session (survives reloads); reconnect only if it was dropped. */
export async function wcEnsureSession(): Promise<Provider> {
  const p = await wcProvider()
  const expiry = Number((p.session as any)?.expiry ?? 0) * 1000
  if (p.session && expiry && expiry < Date.now() + 60_000) await p.disconnect().catch(() => {}) // expired: start fresh
  if (!p.session) await p.connect()
  return p
}

export async function wcDisconnect() {
  try { await (await wcProvider()).disconnect() } catch {}
}

/** Deep link that brings the connected wallet app to the front (MetaMask mobile: metamask://).
 *  Must be opened from a tap: browsers block app switches that aren't a direct user gesture,
 *  which is why a signature request alone sometimes never surfaced in MetaMask. */
export function wcWalletLink(): string {
  const peer = (provider?.session as any)?.peer?.metadata as { name?: string; redirect?: { native?: string; universal?: string } } | undefined
  const native = peer?.redirect?.native
  if (native && /^[a-z][a-z0-9+.-]*:/i.test(native)) return native
  const universal = peer?.redirect?.universal
  if (universal?.startsWith("https://")) return universal
  try {
    const choice = JSON.parse(localStorage.getItem("WALLETCONNECT_DEEPLINK_CHOICE") ?? "null") as { href?: string } | null
    if (choice?.href) return choice.href
  } catch {}
  return "metamask://"
}

export const wcWalletName = () => ((provider?.session as any)?.peer?.metadata?.name as string | undefined) ?? "MetaMask"
