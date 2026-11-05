"use client"
// "Payment due" cards for reminder-mode subscriptions (home screen).
import { useEffect, useState } from "react"
import { useDueReminders } from "@/lib/reminders"
import { usdt, countdown } from "@/lib/format"
import { Icon } from "./ui"

export function DueBanner({ address }: { address?: string }) {
  const due = useDueReminders(address)
  const [now, setNow] = useState(() => Date.now() / 1000)
  useEffect(() => { const t = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(t) }, [])
  if (!due.length) return null
  return (
    <>
      {due.map((r) => (
        <a key={r.key} className="due-card" href={`/autopay?pay=${r.key}`}>
          <span className="bell" aria-hidden>{Icon.bell(24)}</span>
          <div className="grow">
            <div className="strong">Payment due · {r.title}</div>
            <div className="sub">{usdt(r.amount)} USDT to {r.merchantName ?? "the shop"} · payment {r.nextCycle + 1} of {r.cycles} · approve within {countdown(r.payBy - now)}</div>
          </div>
          <span className="due-pay">Pay</span>
        </a>
      ))}
    </>
  )
}
