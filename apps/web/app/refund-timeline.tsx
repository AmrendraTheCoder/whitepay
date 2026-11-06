"use client"
// One refund case as a timeline: request (with proof) -> shop response(s) -> replies, plus where it stands.
// Every entry is an immutable, signed Arkiv record; the badge says so.
import "./refund.css"
import { EXPLORER_URL } from "@whitepay/shared"
import { usdt } from "@/lib/format"

export type CaseEvent = {
  key: string; kind: "opened" | "renewed" | "response" | "reply"; round: number; at: number; deadline: number; actor: string
  reason?: string; message?: string; evidence?: string; decision?: "approve" | "reject"; percent?: number; refundAmount?: string; refundTx?: string
}
export type RefundCase = {
  caseId: string; paymentId: string; merchant: string; payer: string; amount: string; item?: string
  status: "open" | "responded" | "resolved" | "lapsed"; decision?: "approve" | "reject"; round: number; openedAt: number; until: number
  refunded: string; humanRequests30d: number; events: CaseEvent[]
}

export const REASON_LABEL: Record<string, string> = {
  not_received: "Not received", damaged: "Arrived damaged", not_as_described: "Not as described",
  wrong_item: "Wrong item", duplicate: "Charged twice", other: "Something else",
}

const when = (t: number) => new Date(t * 1000).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const left = (t: number) => {
  const s = t - Math.floor(Date.now() / 1000)
  if (s <= 0) return "now"
  const d = Math.floor(s / 86_400), h = Math.floor((s % 86_400) / 3_600), m = Math.floor((s % 3_600) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}

/** One line on where the case stands, from the viewer's side. */
export function caseStatus(c: RefundCase, viewer: "payer" | "shop") {
  if (c.status === "open")
    return { tone: "warn", title: viewer === "shop" ? "Waiting for your response" : "Waiting for the shop",
      sub: `Round ${c.round}. If there's no response in ${left(c.until)}, it re-opens for another 7 days.` }
  if (c.status === "responded")
    return { tone: c.decision === "approve" ? "ok" : "bad", title: c.decision === "approve" ? `Refunded ${usdt(c.refunded)} USDT` : "Shop declined",
      sub: `Closes in ${left(c.until)} if there's no more activity.` }
  if (c.status === "resolved")
    return { tone: c.decision === "approve" ? "ok" : "muted", title: c.decision === "approve" ? `Resolved · ${usdt(c.refunded)} USDT refunded` : "Resolved · declined", sub: `Closed ${when(c.until)}.` }
  return { tone: "muted", title: "Expired unanswered", sub: "The shop never responded." }
}

export function RefundTimeline({ c, viewer }: { c: RefundCase; viewer: "payer" | "shop" }) {
  const st = caseStatus(c, viewer)
  const rounds = c.events.filter((e) => e.kind === "renewed")
  return (
    <div className="rf">
      <div className={`rf-status ${st.tone}`}>
        <b>{st.title}</b>
        <span>{st.sub}</span>
      </div>
      {viewer === "shop" && (
        <div className="rf-human">
          <span className="rf-dot" aria-hidden />
          Verified human (World ID). This person filed <b>{c.humanRequests30d}</b> refund request{c.humanRequests30d === 1 ? "" : "s"} in 30 days, across all their wallets and shops.
        </div>
      )}
      <ol className="rf-tl">
        {c.events.filter((e) => e.kind !== "renewed").map((e) => (
          <li key={e.key} className={e.kind}>
            <div className="rf-head">
              <b>{e.kind === "opened" ? (viewer === "payer" ? "You asked for a refund" : "Customer asked for a refund")
                : e.kind === "response" ? (e.decision === "approve" ? `${viewer === "shop" ? "You" : "Shop"} approved ${e.percent}%` : `${viewer === "shop" ? "You" : "Shop"} declined`)
                : viewer === "payer" ? "You replied" : "Customer replied"}</b>
              <span>{when(e.at)}</span>
            </div>
            {e.reason && <div className="rf-reason">{REASON_LABEL[e.reason] ?? e.reason}</div>}
            {e.message && <p>{e.message}</p>}
            {e.evidence && <a className="rf-link" href={e.evidence} target="_blank" rel="noreferrer nofollow">Proof link ↗</a>}
            {e.refundTx && <a className="rf-link" href={`${EXPLORER_URL}/tx/${e.refundTx}`} target="_blank" rel="noreferrer">{usdt(e.refundAmount)} USDT refunded on Whitechain ↗</a>}
          </li>
        ))}
        {rounds.length > 0 && <li className="renewed"><div className="rf-head"><b>Re-opened {rounds.length}× (no response within 7 days)</b></div></li>}
      </ol>
      <div className="rf-foot">Every step is signed by the person who took it and stored on Arkiv, owned by no one, so it can't be edited or deleted.</div>
    </div>
  )
}
