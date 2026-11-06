"use client"
// Order details for a shop payment you made, and its refund request: ask for a refund (proof + World ID),
// follow the shop's response, reply with more proof.
import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { PrivateKeyAccount } from "viem/accounts"
import type { Hex } from "viem"
import { REFUND_REASONS, refundRequestMessage, refundReplyMessage, refundCaseId } from "@whitepay/shared"
import { TopBar, UnlockSheet } from "../components"
import { LogoLoader, Icon } from "../ui"
import { WorldVerify } from "../world"
import { RefundTimeline, REASON_LABEL, type RefundCase } from "../refund-timeline"
import { getWallet } from "@/lib/wallet"
import { usdt, short } from "@/lib/format"

type Receipt = { merchant: string; merchantName?: string; payer: string; amount: string; refunded: string; status: string; paidAt: number; txHash: string; explorer: string; paymentId: string; item?: string | null; orderId?: string | null }

export default function OrderPage() {
  return <Suspense fallback={<main className="shell"><LogoLoader /></main>}><Order /></Suspense>
}

function Order() {
  const tx = (useSearchParams().get("tx") ?? "").toLowerCase()
  const [wallet] = useState(() => (typeof window === "undefined" ? null : getWallet()))
  const [rc, setRc] = useState<Receipt | null | undefined>(undefined)
  const [cases, setCases] = useState<RefundCase[] | null>(null)

  const loadCases = useCallback(async (paymentId: string, payer: string) => {
    const d = await fetch(`/api/refunds?paymentId=${paymentId}`).then((r) => r.json()).catch(() => ({ cases: [] }))
    setCases(((d.cases ?? []) as RefundCase[]).filter((c) => c.payer.toLowerCase() === payer.toLowerCase()))
  }, [])

  useEffect(() => {
    if (!wallet) return
    fetch(`/api/receipts?payer=${wallet.address}&limit=100`).then((r) => r.json()).then((d) => {
      const r = (d.rows ?? []).find((x: Receipt) => x.txHash?.toLowerCase() === tx) ?? null
      setRc(r)
      if (r) void loadCases(r.paymentId, wallet.address)
    }).catch(() => setRc(null))
  }, [wallet, tx, loadCases])

  if (!wallet) return <main className="shell"><TopBar back="/transactions" /><div className="card">Open this on the device with the wallet that paid.</div></main>
  if (rc === undefined) return <main className="shell"><TopBar back="/transactions" /><LogoLoader label="Loading your order…" /></main>
  if (rc === null) return <main className="shell"><TopBar back="/transactions" /><div className="card stack"><h2>Order not found</h2><div className="sub">This payment isn't a shop order from this wallet.</div></div></main>

  const live = cases?.find((c) => c.status === "open" || c.status === "responded")
  const past = cases?.filter((c) => c !== live) ?? []
  const refundable = BigInt(rc.amount) - BigInt(rc.refunded ?? "0")
  const shop = rc.merchantName ?? short(rc.merchant)

  return (
    <main className="shell">
      <TopBar back="/transactions" />
      <section className="card stack">
        <div className="sub">Order from</div>
        <h1 className="m-0">{shop}</h1>
        <div className="od">
          <div className="od-row"><span>Item</span><b>{rc.item ?? "Order"}</b></div>
          <div className="od-row"><span>Paid</span><b>{usdt(rc.amount)} USDT</b></div>
          {BigInt(rc.refunded ?? "0") > 0n && <div className="od-row"><span>Refunded</span><b className="pos">{usdt(rc.refunded)} USDT</b></div>}
          <div className="od-row"><span>When</span><b>{new Date(rc.paidAt * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</b></div>
          {rc.orderId && <div className="od-row"><span>Order id</span><b className="mono">{short(rc.orderId)}</b></div>}
        </div>
        <a className="chip" href={rc.explorer} target="_blank" rel="noreferrer">View payment on Whitechain ↗</a>
      </section>

      {cases === null ? <LogoLoader /> : live ? (
        <section className="card stack">
          <h2 className="m-0">Refund request</h2>
          <RefundTimeline c={live} viewer="payer" />
          {live.status === "responded" && <Reply c={live} payer={wallet.address} onDone={() => loadCases(rc.paymentId, wallet.address)} />}
        </section>
      ) : refundable > 0n ? (
        <RequestForm rc={rc} payer={wallet.address as `0x${string}`} onDone={() => loadCases(rc.paymentId, wallet.address)} />
      ) : (
        <div className="card sub">This order was fully refunded.</div>
      )}

      {past.length > 0 && (
        <section className="card stack">
          <h2 className="m-0">Earlier requests</h2>
          {past.map((c) => <RefundTimeline key={c.caseId} c={c} viewer="payer" />)}
        </section>
      )}
    </main>
  )
}

/** Ask for a refund: reason + proof, sign with your wallet, then prove you're a real person (World ID). */
function RequestForm({ rc, payer, onDone }: { rc: Receipt; payer: `0x${string}`; onDone: () => void }) {
  const [reason, setReason] = useState<string>("")
  const [message, setMessage] = useState("")
  const [evidence, setEvidence] = useState("")
  const [unlock, setUnlock] = useState(false)
  const [signed, setSigned] = useState<{ issuedAt: number; signature: Hex; caseId: Hex } | null>(null)
  const [msg, setMsg] = useState("")
  const ev = evidence.trim()
  const valid = !!reason && message.trim().length >= 10 && message.trim().length <= 500 && (!ev || /^https:\/\/\S{4,200}$/.test(ev))

  // editing the request after signing invalidates the signature
  useEffect(() => { setSigned(null) }, [reason, message, evidence])

  const sign = async (acct: PrivateKeyAccount) => {
    setUnlock(false); setMsg("")
    const issuedAt = Math.floor(Date.now() / 1000)
    const signature = await acct.signMessage({ message: refundRequestMessage({ paymentId: rc.paymentId as Hex, payer, reason, message: message.trim(), evidence: ev || undefined, issuedAt }) })
    setSigned({ issuedAt, signature, caseId: refundCaseId(rc.paymentId as Hex, payer, issuedAt) })
  }

  return (
    <section className="card stack">
      <h2 className="m-0">Request a refund</h2>
      <div className="sub">Tell {rc.merchantName ?? "the shop"} what went wrong. They can refund part or all of it; the money can only come back to this wallet.</div>
      <div className="rf-reasons" role="radiogroup" aria-label="Reason">
        {REFUND_REASONS.map((r) => <button key={r} role="radio" aria-checked={reason === r} className={reason === r ? "on" : ""} onClick={() => setReason(r)}>{REASON_LABEL[r]}</button>)}
      </div>
      <textarea className="rf-text" placeholder="What happened? Be specific: what you received, what's wrong." maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="rf-count">{message.trim().length}/500</div>
      <input className="input" placeholder="Proof link (optional): https://… photo, tracking page" value={evidence} onChange={(e) => setEvidence(e.target.value)} inputMode="url" autoCapitalize="none" />
      <div className="rf-steps">
        {!signed ? (
          <button className="btn btn-primary" disabled={!valid} onClick={() => setUnlock(true)}>1. Sign with fingerprint / PIN</button>
        ) : (
          <WorldVerify
            purpose="refund"
            signal={signed.caseId}
            label="2. Verify you're human & send"
            verify={async (result) => {
              const r = await fetch("/api/refunds", { method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "open", paymentId: rc.paymentId, payer, reason, message: message.trim(), evidence: ev || undefined, issuedAt: signed.issuedAt, signature: signed.signature, result }) })
              const d = await r.json()
              if (!r.ok) { if (/expired/i.test(String(d.error))) setSigned(null); throw new Error(d.error) }
              return d
            }}
            onVerified={() => onDone()}
            onDenied={(reason) => setMsg(`Not sent: ${reason}`)}
          />
        )}
        <div className="sub center">{Icon.shield()} World ID proves one real person is asking, so refund claims can't come from bots or a pile of fresh wallets. Your identity isn't shared with the shop.</div>
        {msg && <div className="err">{msg}</div>}
      </div>
      {unlock && <UnlockSheet title="Sign refund request" subtitle={`${usdt(rc.amount)} USDT order · ${REASON_LABEL[reason] ?? ""}`} onUnlocked={sign} onCancel={() => setUnlock(false)} />}
    </section>
  )
}

/** After the shop answers: add more proof or a reply (keeps the request active for another 12 h). */
function Reply({ c, payer, onDone }: { c: RefundCase; payer: string; onDone: () => void }) {
  const [message, setMessage] = useState("")
  const [evidence, setEvidence] = useState("")
  const [unlock, setUnlock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const ev = evidence.trim()
  const valid = message.trim().length >= 5 && (!ev || /^https:\/\/\S{4,200}$/.test(ev))
  const send = async (acct: PrivateKeyAccount) => {
    setUnlock(false); setBusy(true); setErr("")
    try {
      const issuedAt = Math.floor(Date.now() / 1000)
      const p = { caseId: c.caseId, payer: payer as `0x${string}`, message: message.trim(), evidence: ev || undefined, issuedAt }
      const signature = await acct.signMessage({ message: refundReplyMessage(p) })
      const r = await fetch("/api/refunds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reply", ...p, signature }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMessage(""); setEvidence(""); onDone()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="stack">
      <textarea className="rf-text" placeholder={c.decision === "reject" ? "Add more proof or explain…" : "Reply to the shop…"} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
      <input className="input" placeholder="Proof link (optional): https://…" value={evidence} onChange={(e) => setEvidence(e.target.value)} inputMode="url" autoCapitalize="none" />
      <button className="btn btn-ghost" disabled={!valid || busy} onClick={() => setUnlock(true)}>{busy ? <span className="spinner" /> : null} Send reply</button>
      {err && <div className="err">{err}</div>}
      {unlock && <UnlockSheet title="Sign reply" subtitle="to the shop" onUnlocked={send} onCancel={() => setUnlock(false)} />}
    </div>
  )
}
