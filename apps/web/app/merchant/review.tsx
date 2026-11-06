"use client"
// Shop reviews a refund request: approve a share (20/50/100% or custom) and pay it on-chain in the same
// step, or decline with a message. Both are signed by the shop's payout wallet on this device.
import { useState } from "react"
import type { PrivateKeyAccount } from "viem/accounts"
import type { Hex } from "viem"
import { receiveAuthTypedData, refundResponseMessage, ROUTER_ADDRESS } from "@whitepay/shared"
import { UnlockSheet } from "../components"
import { SuccessCheck } from "../ui"
import { RefundTimeline, type RefundCase } from "../refund-timeline"
import { usdt, short } from "@/lib/format"

const PCTS = [20, 50, 100]

export function ReviewSheet({ c, account, setAccount, onClose }: {
  c: RefundCase; account: PrivateKeyAccount | null; setAccount: (a: PrivateKeyAccount) => void; onClose: (changed: boolean) => void
}) {
  const [decision, setDecision] = useState<"approve" | "reject">("approve")
  const [pct, setPct] = useState(100)
  const [custom, setCustom] = useState("")
  const [message, setMessage] = useState("")
  const [unlock, setUnlock] = useState(false)
  const [phase, setPhase] = useState<"form" | "busy" | "done">("form")
  const [err, setErr] = useState("")
  const [result, setResult] = useState<RefundCase | null>(null)
  const percent = custom ? Math.round(Number(custom)) : pct
  const paid = BigInt(c.amount)
  const already = BigInt(c.refunded)
  const amount = (paid * BigInt(Math.max(0, Math.min(100, percent || 0)))) / 100n
  const open = c.status === "open" || c.status === "responded"
  const valid = open && (decision === "approve" ? percent >= 1 && percent <= 100 : message.trim().length >= 5)

  const run = async (acct: PrivateKeyAccount) => {
    setUnlock(false); setAccount(acct); setPhase("busy"); setErr("")
    try {
      const issuedAt = Math.floor(Date.now() / 1000)
      const resp = { caseId: c.caseId, merchant: acct.address, decision, percent: decision === "approve" ? percent : 0, message: message.trim(), issuedAt }
      let refundAuth: Record<string, string> | undefined
      if (decision === "approve") {
        const info = await fetch(`/api/refund?paymentId=${c.paymentId}`).then((r) => r.json())
        if (info.error) throw new Error(info.error)
        let value = (BigInt(info.amount) * BigInt(percent)) / 100n
        if (value > BigInt(info.refundable)) value = BigInt(info.refundable)
        if (value <= 0n) throw new Error("Nothing left to refund on this order")
        const validBefore = BigInt(issuedAt + 600)
        // the refund itself: only the router can pull it, only to the original payer, capped at what was paid
        const signature = await acct.signTypedData(receiveAuthTypedData({ from: acct.address, to: ROUTER_ADDRESS, value, validAfter: 0n, validBefore, nonce: info.nonce as Hex }))
        refundAuth = { from: acct.address, validAfter: "0", validBefore: validBefore.toString(), signature, value: value.toString() }
      }
      const signature = await acct.signMessage({ message: refundResponseMessage(resp) })
      const r = await fetch("/api/refunds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "respond", ...resp, signature, refundAuth }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error === "NotMerchantPayout" ? "Only this shop's payout wallet can refund" : d.error)
      setResult(d.case); setPhase("done")
    } catch (e) { setErr((e as Error).message); setPhase("form") }
  }

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget && phase !== "busy") onClose(phase === "done") }}>
      <div className="sheet stack" style={{ maxHeight: "88dvh", overflowY: "auto" }}>
        {phase === "done" && result ? (
          <div className="result py-2">
            <SuccessCheck />
            <h1>{decision === "approve" ? `Refunded ${usdt(result.refunded)} USDT` : "Response sent"}</h1>
            <div className="sub">{decision === "approve" ? `Paid back to ${short(c.payer)} on Whitechain.` : "The customer can reply within 12 hours; otherwise it closes on its own."}</div>
            <button className="btn btn-primary" onClick={() => onClose(true)}>Done</button>
          </div>
        ) : (
          <>
            <div className="title">Refund request</div>
            <div className="sub">{c.item ?? "Order"} · paid {usdt(c.amount)} USDT{already > 0n ? ` · ${usdt(already)} already refunded` : ""}</div>
            <RefundTimeline c={c} viewer="shop" />
            {open && (
              <>
                <div className="rv-seg" role="radiogroup" aria-label="Decision">
                  <button role="radio" aria-checked={decision === "approve"} className={`ok ${decision === "approve" ? "on" : ""}`} onClick={() => setDecision("approve")}>Approve</button>
                  <button role="radio" aria-checked={decision === "reject"} className={`bad ${decision === "reject" ? "on" : ""}`} onClick={() => setDecision("reject")}>Decline</button>
                </div>
                {decision === "approve" && (
                  <>
                    <div className="rv-pcts" role="radiogroup" aria-label="Refund share">
                      {PCTS.map((p) => <button key={p} role="radio" aria-checked={!custom && pct === p} className={!custom && pct === p ? "on" : ""} onClick={() => { setPct(p); setCustom("") }}>{p}%</button>)}
                      <input className="input" style={{ textAlign: "center" }} inputMode="numeric" placeholder="%" aria-label="Custom percent" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 3))} />
                    </div>
                    <div className="sub center">Refund <b>{usdt(amount)} USDT</b> to {short(c.payer)} now, on-chain. No gas.</div>
                  </>
                )}
                <textarea className="rf-text" maxLength={500} placeholder={decision === "approve" ? "Message to the customer (optional)" : "Why are you declining? The customer sees this."} value={message} onChange={(e) => setMessage(e.target.value)} />
                <button className={`btn btn-big ${decision === "approve" ? "btn-primary" : "btn-ghost"}`} disabled={!valid || phase === "busy"} onClick={() => (account ? run(account) : setUnlock(true))}>
                  {phase === "busy" ? <><span className="spinner" /> {decision === "approve" ? "Refunding on Whitechain…" : "Sending…"}</> : decision === "approve" ? `Approve & refund ${usdt(amount)} USDT` : "Send response"}
                </button>
                <div className="err">{err}</div>
              </>
            )}
            <button className="btn btn-ghost" disabled={phase === "busy"} onClick={() => onClose(false)}>Close</button>
          </>
        )}
      </div>
      {unlock && <UnlockSheet title={decision === "approve" ? `Refund ${usdt(amount)} USDT` : "Decline refund"} subtitle={`to ${short(c.payer)}`} onUnlocked={run} onCancel={() => setUnlock(false)} />}
    </div>
  )
}
