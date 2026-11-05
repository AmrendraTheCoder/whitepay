"use client"
// Shared GPay-style building blocks: icons, avatar colors, bottom nav, Scan QR pill, data hook.
import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { getWallet } from "@/lib/wallet"
import { usdt } from "@/lib/format"

const P = { width: 28, height: 28, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const
export const Icon = {
  search: (s = 24) => <svg {...P} width={s} height={s}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  scan: (s = 30) => <svg {...P} width={s} height={s}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><rect x="7.5" y="7.5" width="3.5" height="3.5" rx=".5" /><rect x="13" y="7.5" width="3.5" height="3.5" rx=".5" /><rect x="7.5" y="13" width="3.5" height="3.5" rx=".5" /><path d="M13 13h1.5v1.5M16.5 16.5h-2" /></svg>,
  pay: (s = 30) => <svg {...P} width={s} height={s}><path d="M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M14 4h6v6M20 4l-9 9" /></svg>,
  receive: (s = 30) => <svg {...P} width={s} height={s}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2M18 14h2M14 18v2" /></svg>,
  shop: (s = 30) => <svg {...P} width={s} height={s}><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5.5 12v8h13v-8M10 20v-4.5h4V20" /></svg>,
  balance: (s = 24) => <svg {...P} width={s} height={s}><path d="M3 10h18L12 4zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></svg>,
  history: (s = 24) => <svg {...P} width={s} height={s}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 4v4.5H8M12 8v4.5l3 2" /></svg>,
  id: (s = 24) => <svg {...P} width={s} height={s}><path d="m13 2-9 12h7l-1 8 9-12h-7z" /></svg>,
  home: (s = 24) => <svg {...P} width={s} height={s}><path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z" /></svg>,
  money: (s = 24) => <svg {...P} width={s} height={s}><circle cx="12" cy="12" r="8.5" /><path d="M9 8.5h6M9 11.5h6M12 8.5c2.2 0 2.2 3 0 3H9l4.5 4" /></svg>,
  user: (s = 24) => <svg {...P} width={s} height={s}><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1-3.7 4-5.5 7.5-5.5s6.5 1.8 7.5 5.5" /></svg>,
  chev: (s = 22) => <svg {...P} width={s} height={s}><path d="m9 6 6 6-6 6" /></svg>,
  back: (s = 24) => <svg {...P} width={s} height={s}><path d="m15 5-7 7 7 7" /></svg>,
  close: (s = 26) => <svg {...P} width={s} height={s}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  gallery: (s = 22) => <svg {...P} width={s} height={s}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="m5 17 4.5-5 3.5 3.5 2-2 4 3.5" /><circle cx="15.5" cy="9" r="1.4" /></svg>,
  bolt: (s = 18) => <svg {...P} width={s} height={s}><path d="m13 2-9 12h7l-1 8 9-12h-7z" /></svg>,
  arrow: (s = 20) => <svg {...P} width={s} height={s}><path d="M5 12h14m-6-6 6 6-6 6" /></svg>,
  shield: (s = 22) => <svg {...P} width={s} height={s}><path d="M12 3 5 6v5.5c0 4.5 3 8 7 9.5 4-1.5 7-5 7-9.5V6z" /><path d="m9 12 2 2 4-4" /></svg>,
  eye: (s = 20) => <svg {...P} width={s} height={s}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>,
  eyeOff: (s = 20) => <svg {...P} width={s} height={s}><path d="M3 3l18 18M10.6 5.6A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 3.9M6.4 6.5A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>,
  finger: (s = 22) => <svg {...P} width={s} height={s}><path d="M7.5 18.5c1-1.8 1.5-3.8 1.5-6a3 3 0 0 1 6 0c0 1.2-.1 2.3-.3 3.4M12 12.5c0 3.3-.8 6.2-2.4 8.5M18 16c.3-1.2.5-2.3.5-3.5a6.5 6.5 0 0 0-11.7-3.9M5.6 15.5c.3-1 .4-2 .4-3" /></svg>,
}

// Google-Pay-like avatar colors, drawn from the Whitechain palette
const AV = ["#2448ff", "#c2410c", "#7c3aed", "#0e7490", "#b45309", "#15803d", "#be185d", "#4338ca", "#5b7cfa", "#9a3412"]
export const avatarColor = (seed: string) => {
  let h = 0
  for (const ch of seed.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV[h % AV.length]
}
export const initial = (name?: string, fallback = "?") => {
  const n = (name ?? "").replace(/\.whitepay\.eth$/, "").replace(/^0x/, "")
  return n ? n[0].toUpperCase() : fallback
}
export const prettyName = (name?: string, address?: string) =>
  name ? name.replace(/\.whitepay\.eth$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ""

export function BottomNav() {
  const path = usePathname()
  const items = [
    { href: "/", label: "Home", icon: Icon.home() },
    { href: "/money", label: "Money", icon: Icon.money() },
    { href: "/merchant", label: "Shop", icon: Icon.shop(24) },
    { href: "/you", label: "You", icon: Icon.user() },
  ]
  return (
    <nav className="bottomnav">
      <div className="in">
        {items.map((i) => (
          <a key={i.href} href={i.href} className={`navitem ${path === i.href ? "on" : ""}`}>
            <span className="ic">{i.icon}</span>
            {i.label}
          </a>
        ))}
      </div>
    </nav>
  )
}

export const ScanFab = () => (
  <a className="fab" href="/scan">{Icon.scan(26)} Scan QR</a>
)

export type Activity = {
  key: string
  direction: "in" | "out"
  counterparty: string
  counterpartyName?: string
  amount: string
  at: number
  kind: "p2m" | "p2p" | "transfer" | "whitepay"
  txHash: string
  explorer: string
  source: "arkiv" | "chain"
}

export const activityLabel = (r: Activity) =>
  r.kind === "p2m" ? "Shop QR" : r.kind === "p2p" ? "Person" : r.kind === "whitepay" ? "WhitePay" : "Transfer"

/** Wallet + live data for the ACTIVE wallet (any kind): balance (Whitechain), name, unified activity
 *  (Arkiv receipts + every on-chain USDT transfer). Polls the balance and auto-detects incoming money. */
export function useWalletData() {
  const [wallet, setWallet] = useState<ReturnType<typeof getWallet> | undefined>(undefined)
  const [bal, setBal] = useState<{ usdt: string; wbt: string } | null>(null)
  const [rows, setRows] = useState<Activity[] | null>(null)
  const [name, setName] = useState<string | null | undefined>(undefined)
  /** personal = has a personal WhitePay name; business = registered shop; new = neither yet */
  const [account, setAccount] = useState<"personal" | "business" | "new" | undefined>(undefined)
  const [displayName, setDisplayName] = useState<string | undefined>(undefined)
  const [toast, setToast] = useState<string | null>(null)
  const last = useRef<bigint | null>(null)

  useEffect(() => setWallet(getWallet()), [])

  const loadActivity = useCallback((addr: string) =>
    fetch(`/api/activity?address=${addr}`).then((r) => r.json()).then((d) => setRows(d.rows ?? [])).catch(() => setRows((r) => r ?? [])), [])

  const loadBalance = useCallback(async (addr: string, detect: boolean) => {
    const b = await fetch(`/api/balance?address=${addr}`).then((r) => r.json()).catch(() => null)
    if (!b || b.error) return
    const now = BigInt(b.usdt)
    if (detect && last.current !== null && now !== last.current) {
      const diff = now - last.current
      if (diff > 0n) setToast(`Received ${usdt(diff)} USDT`)
      void loadActivity(addr) // something moved: refresh history
    }
    last.current = now
    setBal(b)
  }, [loadActivity])

  const reload = useCallback(() => {
    const w = getWallet()
    if (!w) return
    void loadBalance(w.address, false)
    void loadActivity(w.address)
    fetch(`/api/resolve?q=${w.address}`).then((r) => r.json()).then((d) => {
      setName(d.name ?? null)
      setDisplayName(d.displayName)
      setAccount(d.kind === "merchant" ? "business" : d.name ? "personal" : "new")
    }).catch(() => { setName(null); setAccount("new") })
  }, [loadBalance, loadActivity])

  useEffect(() => {
    if (!wallet) return
    reload()
    // auto-detect: poll the chain while the app is open and visible
    const t = setInterval(() => { if (document.visibilityState === "visible") void loadBalance(wallet.address, true) }, 8000)
    return () => clearInterval(t)
  }, [wallet, reload, loadBalance])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  return { wallet, setWallet, bal, rows, name, account, displayName, reload, toast }
}

export const Toast = ({ text }: { text: string | null }) =>
  text ? <div className="toast" role="status">{Icon.bolt(18)} {text}</div> : null

export const AccountBadge = ({ account }: { account?: "personal" | "business" | "new" }) =>
  account === undefined ? <span className="skel" style={{ width: 70, height: 20 }} />
  : account === "business" ? <span className="badge badge-lime">Business</span>
  : <span className="badge badge-brand">Personal</span>
