"use client"
// Autopay timer rings around the profile avatar: one colored ring per active subscription, draining as its
// countdown runs. The drain is a pure CSS animation (duration = seconds left), so there are zero re-renders
// while it runs; the ring only re-keys when fresh data arrives. A payment waiting for approval pulses.
import { useSubscriptions } from "@/lib/reminders"
import { countdown } from "@/lib/format"

const COLORS = ["#DDF05A", "#3DE0FF", "#FF5CC8", "#FFA53D"]
const AVATAR = 48, STROKE = 3, GAP = 5

export function AvatarRings({ address, children }: { address?: string; children: React.ReactNode }) {
  const { rows, skew } = useSubscriptions(address)
  const active = rows.filter((r) => r.status === "active" && r.nextDueAt).slice(0, COLORS.length)
  if (!active.length) return <>{children}</>

  const now = Date.now() / 1000 + skew
  const pad = active.length * GAP + STROKE
  const size = AVATAR + pad * 2
  const label = active.map((r) => `${r.title}: ${r.payNow ? "payment due now" : `next in ${countdown(r.nextDueAt - now)}`}`).join(" · ")

  return (
    <span className="avatar-wrap" role="group" aria-label={`Subscriptions. ${label}`} title={label}>
      {children}
      <svg className="avatar-rings" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ margin: -pad }} aria-hidden>
        {active.map((r, i) => {
          const radius = AVATAR / 2 + STROKE / 2 + 2 + i * GAP
          const c = 2 * Math.PI * radius
          const due = r.payNow ? r.payBy : r.nextDueAt
          const span = r.payNow ? r.grace : r.period
          const left = Math.max(0, due - now)
          const from = c * (1 - Math.min(1, left / span))
          return (
            <g key={`${r.key}:${due}`} style={{ color: COLORS[i] }}>
              <circle className="track" cx={size / 2} cy={size / 2} r={radius} />
              <circle className={`bar ${r.payNow ? "due" : ""}`} cx={size / 2} cy={size / 2} r={radius}
                style={{ ["--c" as string]: `${c}`, ["--from" as string]: `${from}`, strokeDasharray: c, strokeDashoffset: from, animationDuration: `${left}s${r.payNow ? ", 1.1s" : ""}` }} />
            </g>
          )
        })}
      </svg>
      {active.some((r) => r.payNow) && <span className="avatar-due-dot" />}
    </span>
  )
}
