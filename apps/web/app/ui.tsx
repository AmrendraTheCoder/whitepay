"use client"
// Shared GPay-style building blocks: icons, avatar colors, bottom nav, Scan QR pill, data hook.
import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { getWallet } from "@/lib/wallet"
import { watchChain } from "@/lib/live"
import { usdt, mmss } from "@/lib/format"
import { keccak256, toBytes } from "viem"

const P = { width: 28, height: 28, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const
export const Icon = {
  check: (s = 18) => <svg {...P} width={s} height={s}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  bell: (s = 22) => <svg {...P} width={s} height={s}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>,
  repeat: (s = 26) => <svg {...P} width={s} height={s}><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></svg>,
  search: (s = 24) => <svg {...P} width={s} height={s}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  scan: (s = 30) => <svg {...P} width={s} height={s}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><rect x="7.5" y="7.5" width="3.5" height="3.5" rx=".5" /><rect x="13" y="7.5" width="3.5" height="3.5" rx=".5" /><rect x="7.5" y="13" width="3.5" height="3.5" rx=".5" /><path d="M13 13h1.5v1.5M16.5 16.5h-2" /></svg>,
  pay: (s = 30) => <svg {...P} width={s} height={s}><path d="M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M14 4h6v6M20 4l-9 9" /></svg>,
  receive: (s = 30) => <svg {...P} width={s} height={s}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2M18 14h2M14 18v2" /></svg>,
  shop: (s = 30) => <svg {...P} width={s} height={s}><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5.5 12v8h13v-8M10 20v-4.5h4V20" /></svg>,
  balance: (s = 24) => <svg {...P} width={s} height={s}><path d="M3 10h18L12 4zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></svg>,
  history: (s = 24) => <svg {...P} width={s} height={s}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 4v4.5H8M12 8v4.5l3 2" /></svg>,
  id: (s = 24) => <svg {...P} width={s} height={s}><path d="m13 2-9 12h7l-1 8 9-12h-7z" /></svg>,
  home: (s = 24) => <svg {...P} width={s} height={s}><path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z" /></svg>,
  money: (s = 24) => <svg {...P} width={s} height={s}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3.5" /><path d="M4 7.5v10A2.5 2.5 0 0 0 6.5 20H20v-11.5H6.5A2.5 2.5 0 0 1 4 7.5z" /><circle cx="16" cy="14.25" r="1.25" /></svg>,
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
  name ? name.replace(/\.(whitepay|wondrpay)\.eth$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ""

// Tabs and the routes that belong to each (sub-pages keep their tab lit).
export const TABS = [
  { href: "/app", label: "Home", match: ["/app"] },
  { href: "/money", label: "Money", match: ["/money", "/transactions"] },
  { href: "/merchant", label: "Shop", match: ["/merchant"] },
  { href: "/you", label: "You", match: ["/you", "/autopay"] },
] as const
const TAB_ICON = { "/app": () => Icon.home(), "/money": () => Icon.money(), "/merchant": () => Icon.shop(24), "/you": () => Icon.user() } as const
export const tabIndex = (path: string) => TABS.findIndex((t) => t.match.some((m) => path === m || path.startsWith(m + "/")))

/** Tab bar. Rendered ONCE from the root layout (TabBarHost), so it survives navigation: the pill slides
 *  between tabs and switching is a client-side route change (prefetched), not a page reload. */
export function BottomNav() {
  const path = usePathname()
  const active = Math.max(0, tabIndex(path))
  const go = (idx: number) => {
    if (idx === active) { window.scrollTo({ top: 0, behavior: "smooth" }); return } // re-tap = scroll to top
    // tell the incoming page which way to slide in; cleared after the animation
    document.documentElement.dataset.navDir = idx > active ? "fwd" : "back"
    window.setTimeout(() => { delete document.documentElement.dataset.navDir }, 450)
    try { navigator.vibrate?.(8) } catch {}
  }
  return (
    <nav className="bottomnav" aria-label="Main">
      <div className="in" style={{ ["--i" as string]: active, ["--n" as string]: TABS.length }}>
        <span className="nav-pill" aria-hidden />
        {TABS.map((t, idx) => (
          <Link key={t.href} href={t.href} prefetch className={`navitem ${idx === active ? "on" : ""}`}
            aria-current={idx === active ? "page" : undefined} onClick={() => go(idx)}>
            <span className="ic">{TAB_ICON[t.href]()}</span>
            <span className="lbl">{t.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}

/** Mounted in the root layout: shows the tab bar only on tab routes (never on the marketing site or full-screen flows). */
export function TabBarHost() {
  const path = usePathname()
  return tabIndex(path) >= 0 ? <BottomNav /> : null
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
  kind: "p2m" | "p2p" | "transfer" | "whitepay" | "refund" | "autopay"
  txHash: string
  explorer: string
  source: "arkiv" | "chain"
}

export const activityLabel = (r: Activity) =>
  r.kind === "p2m" ? "Shop QR" : r.kind === "p2p" ? "Person" : r.kind === "refund" ? "Refund" : r.kind === "autopay" ? "Autopay" : r.kind === "whitepay" ? "WondrPay" : "Transfer"

/** Wallet + live data for the ACTIVE wallet (any kind): balance (Whitechain), name, unified activity
 *  (Arkiv receipts + every on-chain USDT transfer). Polls the balance and auto-detects incoming money. */
export function useWalletData() {
  const [wallet, setWallet] = useState<ReturnType<typeof getWallet> | undefined>(undefined)
  const [bal, setBal] = useState<{ usdt: string; wbt: string } | null>(null)
  const [rows, setRows] = useState<Activity[] | null>(null)
  const [name, setName] = useState<string | null | undefined>(undefined)
  /** personal = has a personal WondrPay name; business = registered shop; new = neither yet */
  const [account, setAccount] = useState<"personal" | "business" | "new" | undefined>(undefined)
  const [displayName, setDisplayName] = useState<string | undefined>(undefined)
  const [toast, setToast] = useState<string | null>(null)
  const last = useRef<bigint | null>(null)

  useEffect(() => setWallet(getWallet()), [])

  const loadActivity = useCallback((addr: string, fresh = false) =>
    fetch(`/api/activity?address=${addr}${fresh ? "&fresh=1" : ""}`).then((r) => r.json()).then((d) => setRows(d.rows ?? [])).catch(() => setRows((r) => r ?? [])), [])

  const loadBalance = useCallback(async (addr: string, detect: boolean) => {
    const b = await fetch(`/api/balance?address=${addr}`).then((r) => r.json()).catch(() => null)
    if (!b || b.error) return
    const now = BigInt(b.usdt)
    if (detect && last.current !== null && now !== last.current) {
      void loadActivity(addr) // something moved: refresh history (the pop-up + toast come from IncomingWatcher)
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
    // live: the chain watcher reports USDT moving to/from this wallet within ~1 s; this poll is only a fallback
    const unwatch = watchChain(wallet.address)
    const onTransfer = (e: Event) => {
      const d = (e as CustomEvent<{ address: string; balance?: string }>).detail
      if (d.address !== wallet.address.toLowerCase()) return
      if (d.balance) setBal((b) => (b ? { ...b, usdt: d.balance! } : b))
      void loadActivity(wallet.address, true)
      setTimeout(() => void loadActivity(wallet.address, true), 3500) // the explorer indexes a few seconds after the block
    }
    window.addEventListener("wondrpay:transfer", onTransfer)
    const t = setInterval(() => { if (document.visibilityState === "visible") void loadBalance(wallet.address, true) }, 20000)
    // IncomingWatcher / a payment screen saw a new balance: show it now instead of waiting for the next poll
    const onBal = (e: Event) => {
      const d = (e as CustomEvent<{ address: string; usdt: string }>).detail
      if (d.address !== wallet.address.toLowerCase()) return
      setBal((b) => (b ? { ...b, usdt: d.usdt } : b))
      if (last.current !== null && BigInt(d.usdt) !== last.current) void loadActivity(wallet.address)
      last.current = BigInt(d.usdt)
    }
    window.addEventListener("wondrpay:balance", onBal)
    return () => { clearInterval(t); unwatch(); window.removeEventListener("wondrpay:transfer", onTransfer); window.removeEventListener("wondrpay:balance", onBal) }
  }, [wallet, reload, loadBalance, loadActivity])

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
  : <span className="badge badge-neon">Personal</span>

/** Animated success check (draws itself, pulse rings) + a short vibration where supported. */
export function SuccessCheck() {
  useEffect(() => { try { navigator.vibrate?.([18, 40, 28]) } catch {} }, [])
  return (
    <div className="success" aria-hidden>
      <svg viewBox="0 0 96 96"><circle cx="48" cy="48" r="46" /><path d="M29 49l13 13 26-28" /></svg>
    </div>
  )
}

/** Animate a number up to its value (balances). */
export function useCountUp(target: number | null, ms = 700) {
  const [v, setV] = useState<number | null>(null)
  useEffect(() => {
    if (target === null) return
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduce) { setV(target); return }
    const from = 0, t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setV(from + (target - from) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

/** Brand loader: the W draws itself on the blue tile, the lime dot bounces. Used for every
 *  full-screen loading state instead of a spinner card. */
export function LogoLoader({ label }: { label?: string }) {
  return (
    <div className="logo-loader" role="status" aria-live="polite">
      <div className="ll-tile">
        <svg viewBox="0 0 512 512" aria-hidden>
          <path className="ll-w" d="M110 168l50 176 56-128 40 92 40-92 56 128 50-176" />
          <circle className="ll-dot" cx="410" cy="110" r="34" />
        </svg>
      </div>
      {label && <div className="ll-label">{label}</div>}
    </div>
  )
}

/** 30px animated brand mark for headers (same motion as LogoLoader). */
export const MiniLogo = () => (
  <span className="ll-tile mini" aria-hidden>
    <svg viewBox="0 0 512 512"><path className="ll-w" d="M110 168l50 176 56-128 40 92 40-92 56 128 50-176" /><circle className="ll-dot" cx="410" cy="110" r="34" /></svg>
  </span>
)

/** Self-updating countdown: re-renders only this <span> once a second (not the whole page), pauses in hidden tabs. */
export function Countdown({ to, format = mmss, done = "0:00" }: { to: number; format?: (s: number) => string; done?: string }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") tick((n) => n + 1) }, 1000)
    return () => clearInterval(t)
  }, [])
  const left = to - Date.now() / 1000
  return <span className="countdown">{left > 0 ? format(left) : done}</span>
}

/**
 * Generated avatar for a wallet: two-tone gradient + symmetric 5×5 pattern from keccak(address), so the same
 * address always gets the same picture and similar-looking addresses look different. Named contacts show
 * their initial on the same gradient. Pure SVG, memoised per seed.
 */
const identiconCache = new Map<string, { a: string; b: string; cells: boolean[] }>()
function identiconData(seed: string) {
  const k = seed.toLowerCase()
  const hit = identiconCache.get(k)
  if (hit) return hit
  const bytes = keccak256(toBytes(k), "bytes")
  const hue = (bytes[0] * 360) / 256
  const hue2 = (hue + 40 + (bytes[1] % 80)) % 360
  const cells: boolean[] = []
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) cells[r * 3 + c] = bytes[2 + r * 3 + c] % 2 === 0
  const d = { a: `hsl(${hue} 72% 52%)`, b: `hsl(${hue2} 78% 38%)`, cells }
  if (identiconCache.size > 500) identiconCache.clear()
  identiconCache.set(k, d)
  return d
}
export function Identicon({ seed, name, size = 48 }: { seed: string; name?: string; size?: number }) {
  const { a, b, cells } = identiconData(seed || "0x")
  const id = `ig${seed.slice(2, 10)}${size}`
  return (
    <svg className="identicon" width={size} height={size} viewBox="0 0 60 60" role="img" aria-label={name ?? seed}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
      <rect width="60" height="60" rx="30" fill={`url(#${id})`} />
      {name ? (
        <text x="30" y="31" textAnchor="middle" dominantBaseline="central" fontSize="26" fontWeight="800" fill="#fff">{initial(name)}</text>
      ) : (
        <g fill="#fff" opacity=".88">
          {Array.from({ length: 25 }, (_, i) => {
            const r = Math.floor(i / 5), c = i % 5, on = cells[r * 3 + (c < 3 ? c : 4 - c)]
            return on ? <rect key={i} x={12 + c * 7.2} y={12 + r * 7.2} width="6.4" height="6.4" rx="1.6" /> : null
          })}
        </g>
      )}
    </svg>
  )
}
