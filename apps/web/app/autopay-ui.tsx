"use client"
import { countdown } from "@/lib/format"

export type MandateRow = {
  key: string; subscriber: string; merchant: string; merchantName?: string; title: string; subscriptionId: string; amount: string
  period: number; cycles: number; paidCycles: number; nextDueAt: number; status: string; startAt: number; updatedAt: number; lastTxUrl: string | null
}
export const PERIOD_LABEL = (s: number) => (s === 120 ? "every 2 min" : s === 86400 ? "daily" : s === 604800 ? "weekly" : s === 2592000 ? "every 30 days" : `every ${s}s`)

export function TimerRing({ left, period }: { left: number; period: number }) {
  const pct = Math.max(0, Math.min(1, left / period))
  const r = 30, c = 2 * Math.PI * r
  return (
    <div className="ring" aria-label={`next payment in ${countdown(left)}`}>
      <svg viewBox="0 0 72 72"><circle cx="36" cy="36" r={r} className="track" /><circle cx="36" cy="36" r={r} className="bar" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} /></svg>
      <b>{left > 0 ? countdown(left) : "0:00"}</b>
    </div>
  )
}

