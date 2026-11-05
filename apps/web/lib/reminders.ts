"use client"
// Subscription payment reminders (reminder mode): poll for payments waiting for approval, show them in the
// app and raise a system notification once per payment while WhitePay is open (foreground or background tab).
import { useEffect, useState } from "react"

export type DueRow = { key: string; title: string; merchantName?: string; merchant: string; amount: string; nextCycle: number; cycles: number; payBy: number; nextDueAt: number }

export async function enableReminderNotifications(): Promise<string> {
  if (typeof Notification === "undefined") return "This browser can't show notifications; you'll see due payments on the home screen."
  if (Notification.permission === "granted") return "Reminders are on ✓"
  const p = await Notification.requestPermission().catch(() => "denied" as NotificationPermission)
  return p === "granted" ? "Reminders are on ✓" : "Notifications are blocked; you'll still see due payments on the home screen."
}

const SEEN = "whitepay.reminded"
function notifyOnce(r: DueRow) {
  const id = `${r.key}:${r.nextCycle}`
  try {
    const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN) ?? "[]"))
    if (seen.has(id)) return
    seen.add(id)
    localStorage.setItem(SEEN, JSON.stringify([...seen].slice(-50)))
  } catch {}
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return
  const n = new Notification(`Payment due: ${r.title}`, {
    body: `${(Number(r.amount) / 1e6).toFixed(2)} USDT to ${r.merchantName ?? "the shop"} · tap to approve`,
    icon: "/icon.svg", tag: id,
  })
  n.onclick = () => { window.focus(); location.href = `/autopay?pay=${r.key}` }
}

export type SubRow = DueRow & { status: string; mode?: string; period: number; grace: number; payNow?: boolean; paidCycles: number }

/**
 * One shared subscriptions feed per page: the home banner, the avatar timer rings and the reminders all read
 * the same store, so the page makes ONE request every 20 s (paused while the tab is hidden, refreshed the
 * moment it becomes visible) instead of one poller per component.
 */
type Snap = { rows: SubRow[]; skew: number }
const feeds = new Map<string, { snap: Snap; subs: Set<(s: Snap) => void>; timer?: ReturnType<typeof setInterval>; inflight?: Promise<void> }>()

function feedFor(address: string) {
  let f = feeds.get(address)
  if (f) return f
  const feed: NonNullable<ReturnType<typeof feeds.get>> = { snap: { rows: [], skew: 0 }, subs: new Set() }
  const load = () => {
    if (document.visibilityState !== "visible" || feed.inflight) return
    feed.inflight = fetch(`/api/subscriptions?subscriber=${address}`).then((r) => r.json()).then((d) => {
      if (!d?.rows) return
      feed.snap = { rows: d.rows, skew: d.now - Date.now() / 1000 }
      ;(d.rows as SubRow[]).filter((r) => r.payNow).forEach(notifyOnce)
      feed.subs.forEach((fn) => fn(feed.snap))
    }).catch(() => {}).finally(() => { feed.inflight = undefined })
  }
  ;(feed as any).load = load
  feeds.set(address, feed)
  return feed
}

export function useSubscriptions(address?: string): Snap {
  const [snap, setSnap] = useState<Snap>({ rows: [], skew: 0 })
  useEffect(() => {
    if (!address) return
    const f = feedFor(address)
    const load = (f as any).load as () => void
    f.subs.add(setSnap)
    setSnap(f.snap)
    if (f.subs.size === 1) { load(); f.timer = setInterval(load, 20_000) }
    const onVis = () => { if (document.visibilityState === "visible") load() }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      f.subs.delete(setSnap)
      document.removeEventListener("visibilitychange", onVis)
      if (!f.subs.size) clearInterval(f.timer)
    }
  }, [address])
  return snap
}

/** Payments waiting for this wallet's approval. */
export function useDueReminders(address?: string) {
  return useSubscriptions(address).rows.filter((r) => r.payNow)
}
