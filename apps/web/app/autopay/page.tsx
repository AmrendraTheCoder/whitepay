"use client"
// Subscriptions: reminder mode (approve each payment when it's requested) and autopay (approved once).
// Each countdown is a live "due" entity on Arkiv.
import { useCallback, useEffect, useRef, useState } from "react"
import type { Hex } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { directNonce } from "@whitepay/shared"
import { cancelAuthTypedData, cancelMandateTypedData, cycleMemo, cycleAuthTypedData, reminderCancelMessage } from "@whitepay/shared/autopay"
import { TopBar, UnlockSheet } from "../components"
import { BottomNav, Icon, LogoLoader, SuccessCheck } from "../ui"
import { getWallet } from "@/lib/wallet"
import { enableReminderNotifications } from "@/lib/reminders"
import { usdt, short, countdown, ago } from "@/lib/format"
import { TimerRing, PERIOD_LABEL, type MandateRow } from "../autopay-ui"

export default function Subscriptions() {
  const [wallet, setWallet] = useState<ReturnType<typeof getWallet> | undefined>(undefined)
  const [rows, setRows] = useState<MandateRow[] | null>(null)
  const [skew, setSkew] = useState(0)
  const [now, setNow] = useState(() => Date.now() / 1000)
  const [cancel, setCancel] = useState<MandateRow | null>(null)
  const [pay, setPay] = useState<MandateRow | null>(null)
  const [paid, setPaid] = useState<{ title: string; amount: string; explorer: string } | null>(null)
  const [busy, setBusy] = useState("")
  const [msg, setMsg] = useState("")
  const [notif, setNotif] = useState<string>("")
  const ticking = useRef(false)
  const deepLinked = useRef(false)

  const load = useCallback(async (address: string) => {
    const d = await fetch(`/api/subscriptions?subscriber=${address}`).then((r) => r.json()).catch(() => null)
    if (!d?.rows) return
    setRows(d.rows); setSkew(d.now - Date.now() / 1000)
  }, [])

  useEffect(() => {
    const w = getWallet(); setWallet(w)
    if (typeof Notification !== "undefined") setNotif(Notification.permission)
    if (!w) return
    void load(w.address)
    // 1 s is enough for second-level countdowns; skip work entirely while the tab is hidden
    const t1 = setInterval(() => { if (document.visibilityState === "visible") setNow(Date.now() / 1000) }, 1000)
    const t2 = setInterval(() => { if (document.visibilityState === "visible") void load(w.address) }, 8_000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [load])

  // opened from a reminder notification / home banner: jump straight to "approve this payment"
  useEffect(() => {
    if (!rows || deepLinked.current) return
    const k = new URLSearchParams(location.search).get("pay")
    const r = k && rows.find((x) => x.key === k && x.payNow)
    if (r) { deepLinked.current = true; setPay(r) }
  }, [rows])

  // when a countdown reaches 0, nudge the keeper (it also runs on its own schedule)
  const t = now + skew
  useEffect(() => {
    if (!wallet || !rows || ticking.current) return
    if (!rows.some((r) => r.status === "active" && r.nextDueAt && r.nextDueAt - t <= 0 && (r.mode !== "reminder" || !r.payNow || t > (r.payBy ?? 0)))) return
    ticking.current = true
    fetch("/api/autopay/tick").catch(() => {}).finally(() => { ticking.current = false; void load(wallet.address) })
  }, [Math.floor(t / 5), rows, wallet, load]) // eslint-disable-line react-hooks/exhaustive-deps

  const doPay = async (acct: PrivateKeyAccount) => {
    const m = pay!
    setPay(null); setBusy(m.key); setMsg("")
    try {
      const cycle = m.nextCycle!
      // ONE signature for THIS payment only, valid only inside its window
      const signature = await acct.signTypedData(cycleAuthTypedData({ subscriber: acct.address, merchant: m.merchant as Hex, amount: BigInt(m.amount), subscriptionId: m.subscriptionId as Hex, cycle, startAt: m.startAt, period: m.period, grace: m.grace }))
      const r = await fetch("/api/subscriptions/pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mandateKey: m.key, subscriber: acct.address, cycle, signature }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Payment failed")
      setPaid({ title: m.title, amount: m.amount, explorer: d.explorer })
      // the server answers as soon as the chain confirms and updates Arkiv right after: reflect it instantly
      setRows((rs) => rs?.map((x) => x.key === m.key ? { ...x, payNow: false, paidCycles: x.paidCycles + 1, nextCycle: (x.nextCycle ?? 0) + 1,
        nextDueAt: d.nextDueAt ?? 0, status: d.nextDueAt ? "active" : "completed", lastTxUrl: d.explorer } : x) ?? null)
    } catch (e) { setMsg(friendly((e as Error).message)) } finally { setBusy("") }
  }

  const doCancel = async (acct: PrivateKeyAccount) => {
    const m = cancel!
    setCancel(null); setBusy(m.key); setMsg("")
    try {
      let body: Record<string, unknown>
      if (m.mode === "reminder") {
        body = { mandateKey: m.key, subscriber: acct.address, signature: await acct.signMessage({ message: reminderCancelMessage(m.key as Hex) }) }
      } else if (m.vault) {
        body = { mandateKey: m.key, subscriber: acct.address, signature: await acct.signTypedData(cancelMandateTypedData(m.vault as Hex, m.subscriptionId as Hex)) }
      } else {
        const cancels = [] // oldest subscriptions: revoke each remaining pre-signed payment
        for (let c = m.paidCycles; c < m.cycles; c++) {
          const nonce = directNonce(m.merchant as Hex, cycleMemo(m.subscriptionId as Hex, c))
          cancels.push({ cycle: c, signature: await acct.signTypedData(cancelAuthTypedData(acct.address, nonce)) })
        }
        body = { mandateKey: m.key, subscriber: acct.address, cancels }
      }
      const r = await fetch("/api/subscriptions/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg(m.mode === "reminder" ? "Cancelled. You won't get any more payment requests." : `Cancelled on-chain. ${d.revoked} remaining payment${d.revoked === 1 ? "" : "s"} can never be charged.`)
      await load(acct.address)
    } catch (e) { setMsg(friendly((e as Error).message)) } finally { setBusy("") }
  }

  if (wallet === undefined || (wallet && rows === null)) return <main className="shell with-nav"><TopBar back="/you" /><LogoLoader /><BottomNav /></main>
  if (!wallet) return <main className="shell with-nav"><TopBar /><div className="card">Create a wallet first.</div><BottomNav /></main>

  if (paid)
    return (
      <main className="shell with-nav"><TopBar back="/you" />
        <div className="result">
          <SuccessCheck />
          <h1>Paid {usdt(paid.amount)} USDT</h1>
          <div className="sub">{paid.title} · settled on Whitechain, 0 gas</div>
          <a className="chip" href={paid.explorer} target="_blank" rel="noreferrer">View on Whitechain ↗</a>
          <button className="btn btn-primary btn-big" onClick={() => setPaid(null)}>Done</button>
        </div>
        <BottomNav />
      </main>
    )

  const active = rows!.filter((r) => r.status === "active")
  const past = rows!.filter((r) => r.status !== "active")
  return (
    <main className="shell with-nav">
      <TopBar back="/you" />
      <div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>Subscriptions</div>
        <div className="sub">Each countdown is a live entity on Arkiv. When it hits 0 you're asked to approve that payment (or it runs by itself if you chose Autopay).</div>
      </div>
      {notif && notif !== "granted" && active.some((r) => r.mode === "reminder") && (
        <button className="btn btn-lime" onClick={async () => { await enableReminderNotifications(); setNotif(typeof Notification !== "undefined" ? Notification.permission : "") }}>🔔 Turn on payment reminders</button>
      )}
      {msg && <div className="card sub" style={{ borderColor: msg.startsWith("Cancelled") ? undefined : "var(--bad)" }}>{msg}</div>}
      {active.length === 0 && <div className="card stack" style={{ textAlign: "center" }}><span style={{ margin: "0 auto", color: "var(--brand-soft)" }}>{Icon.repeat(40)}</span><b>No active subscriptions</b><div className="sub">Subscribe from a shop's WhitePay link or checkout to see it here.</div></div>}
      {active.map((m) => {
        const left = m.nextDueAt - t
        const reminder = m.mode === "reminder"
        const payNow = reminder && m.payNow && (m.payBy ?? 0) - t > 0
        return (
          <div key={m.key} className={`card stack autopay-card ${payNow ? "due-now" : ""}`}>
            <div className="row" style={{ gap: 14, justifyContent: "flex-start" }}>
              <TimerRing left={payNow ? (m.payBy ?? 0) - t : left} period={payNow ? m.grace : m.period} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{m.title}</div>
                <div className="sub">{m.merchantName ?? short(m.merchant)} · <span className={`badge ${reminder ? "badge-ok" : ""}`} style={{ padding: "1px 7px" }}>{reminder ? "Ask each time" : "Autopay"}</span></div>
                <div style={{ fontWeight: 800, marginTop: 4 }}>{usdt(m.amount)} USDT <span className="sub">{PERIOD_LABEL(m.period)}</span></div>
              </div>
            </div>
            <div className="sub">
              {payNow ? `Payment ${(m.nextCycle ?? 0) + 1} of ${m.cycles} is due · approve within ${countdown((m.payBy ?? 0) - t)} or it's skipped`
                : left > 0 ? `${reminder ? "Next payment request" : "Next payment"} in ${countdown(left)} · payment ${(m.nextCycle ?? m.paidCycles) + 1} of ${m.cycles}`
                : reminder ? "Requesting payment…" : "Due now: paying…"}
              {m.missedCycles ? ` · ${m.missedCycles} skipped` : ""}
            </div>
            <div className="progress"><span style={{ width: `${(m.paidCycles / m.cycles) * 100}%` }} /></div>
            {payNow && (
              <button className="btn btn-lime btn-big" disabled={busy === m.key} onClick={() => setPay(m)}>
                {busy === m.key ? <><span className="spinner" /> Paying…</> : `Pay ${usdt(m.amount)} USDT now`}
              </button>
            )}
            <div className="row">
              {m.lastTxUrl ? <a className="chip" href={m.lastTxUrl} target="_blank" rel="noreferrer">Last payment ↗</a> : <span />}
              <button className="chip" disabled={busy === m.key} onClick={() => setCancel(m)}>{busy === m.key && !payNow ? <><span className="spinner" /> Cancelling…</> : "Cancel subscription"}</button>
            </div>
          </div>
        )
      })}
      {past.length > 0 && <div className="section-title">Ended</div>}
      {past.map((m) => (
        <div key={m.key} className="card row">
          <div><div style={{ fontWeight: 700 }}>{m.title}</div><div className="sub">{m.merchantName ?? short(m.merchant)} · {m.paidCycles}/{m.cycles} paid{m.missedCycles ? `, ${m.missedCycles} skipped` : ""} · {ago(m.updatedAt)}</div></div>
          <span className={`badge ${m.status === "completed" ? "badge-ok" : m.status === "cancelled" ? "badge-warn" : "badge-bad"}`}>{m.status}</span>
        </div>
      ))}
      {pay && <UnlockSheet title={`Pay ${usdt(pay.amount)} USDT`} subtitle={`${pay.title}: payment ${(pay.nextCycle ?? 0) + 1} of ${pay.cycles}`} onUnlocked={doPay} onCancel={() => setPay(null)} />}
      {cancel && (
        <UnlockSheet title="Cancel subscription" subtitle={cancel.mode === "reminder" ? `${cancel.title}: stop all future payment requests` : `${cancel.title}: block ${cancel.cycles - cancel.paidCycles} remaining payment(s) on-chain`} onUnlocked={doCancel} onCancel={() => setCancel(null)} />
      )}
      <BottomNav />
    </main>
  )
}

function friendly(msg: string) {
  const m = msg.toLowerCase()
  if (/exceeds balance|insufficient|not enough usdt/.test(m)) return "Not enough USDT for this payment. Add USDT and try again before the window closes."
  if (/window .* closed|skipped/.test(m)) return "This payment's window closed, so it was skipped. You'll be asked for the next one."
  if (/opens in/.test(m)) return `Too early: ${msg}`
  if (/reject|denied|cancel/.test(m)) return "Cancelled in your wallet. Nothing was charged."
  if (/fetch|network/.test(m)) return "Network problem: nothing was charged. Try again."
  return msg
}
