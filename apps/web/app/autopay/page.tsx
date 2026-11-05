"use client"
// Subscriptions: reminder mode (approve each payment when it's requested) and autopay (approved once).
// Each countdown is a live "due" entity on Arkiv.
import { useCallback, useEffect, useRef, useState } from "react"
import type { Hex } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { directNonce } from "@whitepay/shared"
import { cancelAuthTypedData, cancelMandateTypedData, cycleMemo, cycleAuthTypedData, reminderCancelMessage } from "@whitepay/shared/autopay"
import { TopBar, UnlockSheet } from "../components"
import { Icon, LogoLoader, SuccessCheck } from "../ui"
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
  const [confirm, setConfirm] = useState<MandateRow | null>(null)
  const [cancelled, setCancelled] = useState<{ m: MandateRow; remaining: number; txs: string[] } | null>(null)
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
      setCancelled({ m, remaining: Math.max(0, m.cycles - (m.nextCycle ?? m.paidCycles)), txs: d.txs ?? [] })
      setRows((rs) => rs?.map((x) => x.key === m.key ? { ...x, status: "cancelled", payNow: false } : x) ?? null)
    } catch (e) { setMsg(friendly((e as Error).message)) } finally { setBusy("") }
  }

  if (wallet === undefined || (wallet && rows === null)) return <main className="shell with-nav"><TopBar back="/you" /><LogoLoader /></main>
  if (!wallet) return <main className="shell with-nav"><TopBar /><div className="card">Create a wallet first.</div></main>

  if (cancelled) {
    const { m, remaining, txs } = cancelled
    return (
      <main className="shell with-nav"><TopBar back="/you" />
        <div className="result">
          <div className="cancel-mark" aria-hidden>{Icon.close(36)}</div>
          <h1>{m.title} cancelled</h1>
          <div className="sub">{m.merchantName ?? short(m.merchant)}</div>
          <div className="card stack w-full left">
            <div className="row"><span className="sub">Payments made</span><b>{m.paidCycles} of {m.cycles} · {usdt(BigInt(m.amount) * BigInt(m.paidCycles))} USDT</b></div>
            <div className="row"><span className="sub">Won't be charged</span><b className="pos">{remaining} payment{remaining === 1 ? "" : "s"} · {usdt(BigInt(m.amount) * BigInt(remaining))} USDT</b></div>
            <div className="row"><span className="sub">What changed</span><b className="right">{m.mode === "reminder" ? "No more payment requests" : "Blocked on-chain"}</b></div>
          </div>
          <div className="sub center">
            {m.mode === "reminder"
              ? "Nothing was pre-approved, so there is nothing left that could be charged. The shop has been notified."
              : "The subscription's contract is switched off on Whitechain: nobody, including WhitePay or the shop, can charge the remaining payments. The shop has been notified."}
          </div>
          {txs[0] && <a className="chip" href={txs[0]} target="_blank" rel="noreferrer">Cancellation on Whitechain ↗</a>}
          <button className="btn btn-primary btn-big" onClick={() => setCancelled(null)}>Done</button>
        </div>
        
      </main>
    )
  }

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
        
      </main>
    )

  const active = rows!.filter((r) => r.status === "active")
  const past = rows!.filter((r) => r.status !== "active")
  const dueSoonest = active.reduce<number | null>((min, r) => (r.nextDueAt > 0 && (min === null || r.nextDueAt < min) ? r.nextDueAt : min), null)
  const paidTotal = rows!.reduce((sum, r) => sum + BigInt(r.amount) * BigInt(r.paidCycles), 0n)
  return (
    <main className="shell with-nav">
      <TopBar back="/you" />
      <header className="page-head">
        <h1 className="page-title m-0">Subscriptions</h1>
        <p className="sub m-0">Each countdown is a live entity on Arkiv. At zero you approve that payment, or it runs by itself on Autopay.</p>
      </header>

      {rows!.length > 0 && (
        <dl className="sub-summary">
          <div><dt>Active</dt><dd>{active.length}</dd></div>
          <div><dt>Next payment</dt><dd>{dueSoonest ? (dueSoonest - t > 0 ? countdown(dueSoonest - t) : "Now") : "None"}</dd></div>
          <div><dt>Paid so far</dt><dd>{usdt(paidTotal)} <small>USDT</small></dd></div>
        </dl>
      )}

      {notif && notif !== "granted" && active.some((r) => r.mode === "reminder") && (
        <div className="notice">
          <span className="text-brand" aria-hidden>{Icon.bell(18)}</span>
          <div className="grow">Get a reminder when a payment needs your approval.</div>
          <button className="chip" onClick={async () => { await enableReminderNotifications(); setNotif(typeof Notification !== "undefined" ? Notification.permission : "") }}>Turn on</button>
        </div>
      )}
      {msg && <div className={`notice ${msg.startsWith("Cancelled") ? "ok" : "bad"}`} role="alert">{msg}</div>}

      {active.length === 0 && (
        <div className="card empty-state">
          <span className="ic" aria-hidden>{Icon.repeat(28)}</span>
          <b>No active subscriptions</b>
          <p className="sub m-0">Subscribe from a shop's WhitePay link or checkout and it will show up here.</p>
          <a className="chip mt-2" href="https://whitepay-demo-store.vercel.app/#club" target="_blank" rel="noreferrer">Try the demo store</a>
        </div>
      )}

      {active.map((m) => {
        const left = m.nextDueAt - t
        const reminder = m.mode === "reminder"
        const payNow = reminder && m.payNow && (m.payBy ?? 0) - t > 0
        const nextNo = (m.nextCycle ?? m.paidCycles) + 1
        return (
          <article key={m.key} className={`card sub-card autopay-card ${payNow ? "due-now" : ""}`} aria-label={`${m.title} subscription`}>
            <div className="sub-card-top">
              <TimerRing left={payNow ? (m.payBy ?? 0) - t : left} period={payNow ? m.grace : m.period} />
              <div className="grow sub-card-head">
                <div className="sub-card-title"><span className="item-title truncate">{m.title}</span><span className={`badge badge-sm nowrap ${reminder ? "badge-ok" : "badge-brand"}`}>{reminder ? "Ask each time" : "Autopay"}</span></div>
                <div className="sub truncate">{m.merchantName ?? short(m.merchant)}</div>
                <div className="sub-card-amt"><b>{usdt(m.amount)} USDT</b> <span className="sub">{PERIOD_LABEL(m.period)}</span></div>
              </div>
            </div>

            <p className="sub m-0" aria-live="polite">
              {payNow ? `Payment ${nextNo} of ${m.cycles} is due. Approve within ${countdown((m.payBy ?? 0) - t)} or it's skipped.`
                : left > 0 ? `${reminder ? "Next payment request" : "Next payment"} in ${countdown(left)}`
                : reminder ? "Requesting payment…" : "Due now: paying…"}
              {m.missedCycles ? ` · ${m.missedCycles} skipped` : ""}
            </p>

            <div className="sub-progress">
              <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={m.cycles} aria-valuenow={m.paidCycles} aria-label="Payments made"><span style={{ width: `${(m.paidCycles / m.cycles) * 100}%` }} /></div>
              <span className="sub nowrap">{m.paidCycles} of {m.cycles} paid</span>
            </div>

            {payNow && (
              <button className="btn btn-lime btn-big" disabled={busy === m.key} onClick={() => setPay(m)}>
                {busy === m.key ? <><span className="spinner" /> Paying…</> : `Pay ${usdt(m.amount)} USDT now`}
              </button>
            )}
            <div className="btn-row">
              {m.lastTxUrl ? <a className="chip" href={m.lastTxUrl} target="_blank" rel="noreferrer">Last payment ↗</a> : <span />}
              <button className="chip chip-danger" disabled={busy === m.key} onClick={() => setConfirm(m)}>{busy === m.key && !payNow ? <><span className="spinner" /> Cancelling…</> : "Cancel"}</button>
            </div>
          </article>
        )
      })}

      {past.length > 0 && (
        <section className="card" aria-labelledby="ended-title">
          <h2 id="ended-title">Ended</h2>
          <div className="list">
            {past.map((m) => (
              <div key={m.key} className="item">
                <div className="grow">
                  <div className="t">{m.title}</div>
                  <div className="sub">{m.merchantName ?? short(m.merchant)} · {m.paidCycles}/{m.cycles} paid{m.missedCycles ? `, ${m.missedCycles} skipped` : ""} · {ago(m.updatedAt)}</div>
                </div>
                <span className={`badge ${m.status === "completed" ? "badge-ok" : m.status === "cancelled" ? "badge-warn" : "badge-bad"}`}>{m.status === "completed" ? "Completed" : m.status === "cancelled" ? "Cancelled" : "Failed"}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {confirm && (() => {
        const left = Math.max(0, confirm.cycles - (confirm.nextCycle ?? confirm.paidCycles))
        return (
          <div className="sheet-backdrop" onClick={() => setConfirm(null)}>
            <div className="sheet stack" onClick={(e) => e.stopPropagation()}>
              <h3>Cancel {confirm.title}?</h3>
              <div className="sub center">
                You've paid {confirm.paidCycles} of {confirm.cycles}. {left ? `The remaining ${left} payment${left === 1 ? "" : "s"} (${usdt(BigInt(confirm.amount) * BigInt(left))} USDT) won't be charged.` : "No payments are left."}
                {" "}{confirm.mode === "reminder" ? "You'll stop getting payment requests." : "This switches the subscription's contract off on-chain."} Payments already made aren't refunded automatically; ask the shop if needed.
              </div>
              <button className="btn btn-big btn-danger" onClick={() => { setCancel(confirm); setConfirm(null) }}>Cancel subscription</button>
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Keep it</button>
            </div>
          </div>
        )
      })()}
      {pay && <UnlockSheet title={`Pay ${usdt(pay.amount)} USDT`} subtitle={`${pay.title}: payment ${(pay.nextCycle ?? 0) + 1} of ${pay.cycles}`} onUnlocked={doPay} onCancel={() => setPay(null)} />}
      {cancel && (
        <UnlockSheet title="Cancel subscription" subtitle={cancel.mode === "reminder" ? `${cancel.title}: stop all future payment requests` : `${cancel.title}: block ${cancel.cycles - cancel.paidCycles} remaining payment(s) on-chain`} onUnlocked={doCancel} onCancel={() => setCancel(null)} />
      )}
      
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
