"use client"
// Money moments around a payment:
//  - NewBalance:      after sending, the balance counts down to its new value.
//  - RewardEarned:    after paying a listed shop, the scratch card appears right on the success screen.
//  - IncomingWatcher: mounted once in the root layout; when USDT arrives it shows a pop-up, a toast and
//                     (if allowed and the tab is in the background) a system notification.
import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import type { RewardCard } from "@whitepay/shared/rewards"
import { EXPLORER_URL, ROUTER_ADDRESS } from "@whitepay/shared"
import { getWallet } from "@/lib/wallet"
import { usdt } from "@/lib/format"
import { Gift } from "./rewards/art"
import { ScratchSheet, prettyShop } from "./rewards/scratch"
import "./money-events.css"

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const getBalance = async (address: string, fresh = false): Promise<bigint | null> => {
  const b = await fetch(`/api/balance?address=${address}${fresh ? "&fresh=1" : ""}`).then((r) => r.json()).catch(() => null)
  return b && !b.error ? BigInt(b.usdt) : null
}
/** tell every mounted balance (home hero, watcher) what the chain now says */
export const announceBalance = (address: string, usdt: bigint) =>
  window.dispatchEvent(new CustomEvent("wondrpay:balance", { detail: { address: address.toLowerCase(), usdt: usdt.toString() } }))

function useTicker(target: number | null, from: number | null, ms = 900) {
  const [v, setV] = useState<number | null>(from ?? target)
  useEffect(() => {
    if (target === null) return
    const start = from ?? target
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || start === target) { setV(target); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setV(start + (target - start) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, from, ms])
  return v
}

// ------------------------------------------------------------------ after sending
export function NewBalance({ address, spent }: { address: string; spent: bigint }) {
  const [now, setNow] = useState<bigint | null>(null)
  useEffect(() => {
    let live = true
    void getBalance(address, true).then((b) => {
      if (!live || b === null) return
      setNow(b)
      announceBalance(address, b)
    })
    return () => { live = false }
  }, [address])
  const target = now === null ? null : Number(now) / 1e6
  const shown = useTicker(target, target === null ? null : target + Number(spent) / 1e6)
  return (
    <div className="mx-balance" aria-live="polite">
      <span className="mx-l">Updated balance</span>
      {shown === null ? <span className="skel" style={{ width: 96, height: 22 }} /> : <span className="mx-v">{fmt(shown)} <small>USDT</small></span>}
      <span className="mx-delta">−{usdt(spent)}</span>
    </div>
  )
}

// ------------------------------------------------------------------ merchant payment reward
/** Polls for the scratch card this payment earned (written a few seconds after the payment) and lets the
 *  payer scratch it right here. Only for shop payments of >= 0.10 USDT; never for person-to-person sends. */
export function RewardEarned({ owner, merchant, merchantName, amount, since }: { owner: string; merchant: string; merchantName?: string; amount: bigint; since: number }) {
  const [card, setCard] = useState<RewardCard | null | undefined>(undefined) // undefined = waiting, null = none came
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (amount < 100_000n) { setCard(null); return }
    let live = true, tries = 0
    const look = async () => {
      const d = await fetch(`/api/rewards?owner=${owner}`).then((r) => r.json()).catch(() => null)
      if (!live) return
      const hit = (d?.cards as RewardCard[] | undefined)?.find((c) => c.merchant.toLowerCase() === merchant.toLowerCase() && c.earnedAt >= since - 30)
      if (hit) { setCard(hit); return }
      if (++tries < 15) setTimeout(look, 2000)
      else setCard(null)
    }
    const t = setTimeout(look, 1500)
    return () => { live = false; clearTimeout(t) }
  }, [owner, merchant, amount, since])

  if (amount < 100_000n) return null
  if (card === null)
    return <a className="mx-reward" href="/rewards"><span className="mx-gift"><Gift size={30} /></span><div><b>Scratch card on its way</b><span>It lands in Rewards within a minute.</span></div></a>
  return (
    <>
      <button className={`mx-reward ${card ? "ready" : ""}`} disabled={!card || card.status !== "new"} onClick={() => setOpen(true)}>
        <span className="mx-gift"><Gift size={30} /></span>
        <div>
          <b>{card ? (card.status === "new" ? "You won a scratch card!" : "Card scratched") : "Wrapping your scratch card…"}</b>
          <span>{card ? `From ${prettyShop(merchantName)} · tap to scratch` : "For paying a WondrPay shop"}</span>
        </div>
        {card?.status === "new" ? <span className="mx-cta">Scratch</span> : !card ? <span className="spinner" aria-hidden /> : null}
      </button>
      {open && card && (
        <ScratchSheet card={card} owner={owner} onClose={() => setOpen(false)} onRevealed={(c) => setCard(c)} />
      )}
    </>
  )
}

// ------------------------------------------------------------------ incoming money
type Incoming = { amount: bigint; from?: string; balance: bigint; tx?: string }
const SITE = new Set(["/", "/business", "/pricing", "/security", "/status", "/terms", "/privacy", "/developers", "/film"])
const seenKey = (a: string) => `whitepay.lastbal.${a.toLowerCase()}`

export function IncomingWatcher() {
  const path = usePathname()
  const [addr, setAddr] = useState<string | null>(null)
  const [pop, setPop] = useState<Incoming | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("unsupported")
  const last = useRef<bigint | null>(null)

  useEffect(() => {
    setAddr(getWallet()?.address ?? null)
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission)
  }, [path])

  useEffect(() => {
    if (!addr || SITE.has(path)) return
    try { const s = localStorage.getItem(seenKey(addr)); last.current = s ? BigInt(s) : null } catch { last.current = null }
    let stop = false

    const remember = (b: bigint) => { last.current = b; try { localStorage.setItem(seenKey(addr), b.toString()) } catch {} }
    const check = async () => {
      const b = await getBalance(addr)
      if (stop || b === null) return
      const prev = last.current
      remember(b)
      if (prev === null || b <= prev) return // first look, or money went out (sends update their own screen)
      const diff = b - prev
      // who sent it: the newest incoming row(s) in history
      const d = await fetch(`/api/activity?address=${addr}`).then((r) => r.json()).catch(() => null)
      const recent = Date.now() / 1000 - 600 // only name a sender from the last few minutes, never an old row
      const row = (d?.rows as { direction: string; amount: string; counterparty: string; counterpartyName?: string; txHash: string; at: number }[] | undefined)
        ?.find((r) => r.direction === "in" && r.at >= recent && BigInt(r.amount) <= diff)
      let from = row?.counterpartyName
      let sender = row?.counterparty
      // money pushed through the router shows the router as sender: the real payer is the other leg of that tx
      if (row && from === "WondrPay payment") {
        from = undefined
        sender = await fetch(`${EXPLORER_URL}/api/v2/transactions/${row.txHash}/token-transfers`).then((r) => r.json())
          .then((x) => (x.items as { from: { hash: string }; to: { hash: string } }[]).find((t) => t.to.hash.toLowerCase() === ROUTER_ADDRESS.toLowerCase())?.from.hash)
          .catch(() => undefined)
      }
      if (sender && !from) from = await fetch(`/api/resolve?q=${sender}`).then((r) => r.json()).then((x) => x.displayName ?? x.name).catch(() => undefined)
      if (sender && !from) from = `${sender.slice(0, 6)}…${sender.slice(-4)}`
      if (stop) return
      const evt = { amount: diff, from, balance: b, tx: row?.txHash }
      announceBalance(addr, b)
      setPop(evt)
      setToast(`${usdt(diff)} USDT added to your balance`)
      try { navigator.vibrate?.([20, 60, 20]) } catch {}
      if (document.visibilityState === "hidden" && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(`Received ${usdt(diff)} USDT`, { body: `${from ? `From ${from}. ` : ""}Added to your WondrPay balance (${usdt(b)} USDT).`, icon: "/icon.svg", tag: row?.txHash ?? String(b) })
        } catch {}
      }
    }

    // a send/pay screen announces its new balance: take it as the baseline, so it's never "received"
    const onBal = (e: Event) => {
      const d = (e as CustomEvent<{ address: string; usdt: string }>).detail
      if (d.address === addr.toLowerCase() && (last.current === null || BigInt(d.usdt) < last.current)) remember(BigInt(d.usdt))
    }
    window.addEventListener("wondrpay:balance", onBal)
    void check()
    // every 6 s while visible; every 20 s in the background (for the system notification)
    let t: ReturnType<typeof setTimeout>
    const loop = () => { t = setTimeout(async () => { await check(); if (!stop) loop() }, document.visibilityState === "visible" ? 6000 : 20000) }
    loop()
    const onVis = () => { if (document.visibilityState === "visible") void check() }
    document.addEventListener("visibilitychange", onVis)
    return () => { stop = true; clearTimeout(t); window.removeEventListener("wondrpay:balance", onBal); document.removeEventListener("visibilitychange", onVis) }
  }, [addr, path])

  useEffect(() => { if (!pop) return; const t = setTimeout(() => setPop(null), 7000); return () => clearTimeout(t) }, [pop])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4200); return () => clearTimeout(t) }, [toast])

  const askNotify = async () => { try { setPerm(await Notification.requestPermission()) } catch {} }

  return (
    <>
      {pop && <ReceivedPop p={pop} perm={perm} onNotify={askNotify} onClose={() => setPop(null)} />}
      {toast && <div className="mx-toast" role="status"><span className="mx-tick" aria-hidden>✓</span>{toast}</div>}
    </>
  )
}

function ReceivedPop({ p, perm, onNotify, onClose }: { p: Incoming; perm: NotificationPermission | "unsupported"; onNotify: () => void; onClose: () => void }) {
  const amount = Number(p.amount) / 1e6
  const shownBal = useTicker(Number(p.balance) / 1e6, (Number(p.balance) - Number(p.amount)) / 1e6, 1100)
  return (
    <div className="mx-pop" role="alertdialog" aria-label={`Received ${fmt(amount)} USDT`}>
      <div className="mx-pop-in">
        <div className="mx-coin" aria-hidden>₮</div>
        <div className="mx-pop-body">
          <div className="mx-pop-t">+{fmt(amount)} USDT received</div>
          <div className="mx-pop-s">{p.from ? <>From <b>{p.from}</b> · </> : null}added to your balance</div>
          <div className="mx-pop-bal">Balance <b>{fmt(shownBal ?? 0)} USDT</b></div>
        </div>
        <button className="mx-x" onClick={onClose} aria-label="Dismiss">×</button>
      </div>
      <div className="mx-pop-actions">
        <a href="/transactions">View</a>
        {perm === "default" && <button onClick={onNotify}>Alert me when the app is closed</button>}
      </div>
    </div>
  )
}
