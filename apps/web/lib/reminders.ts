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

/** Payments waiting for this wallet's approval, refreshed every 20 s. */
export function useDueReminders(address?: string) {
  const [due, setDue] = useState<DueRow[]>([])
  useEffect(() => {
    if (!address) return
    let stop = false
    const load = async () => {
      const d = await fetch(`/api/subscriptions?subscriber=${address}`).then((r) => r.json()).catch(() => null)
      if (stop || !d?.rows) return
      const rows = (d.rows as any[]).filter((r) => r.payNow) as DueRow[]
      setDue(rows)
      rows.forEach(notifyOnce)
    }
    void load()
    const t = setInterval(load, 20_000)
    return () => { stop = true; clearInterval(t) }
  }, [address])
  return due
}
