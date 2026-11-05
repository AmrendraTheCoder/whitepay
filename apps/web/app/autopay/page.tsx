"use client"
// Autopay manager: every subscription with its live countdown (the Arkiv "due" entity's timer).
import { useCallback, useEffect, useRef, useState } from "react"
import type { Hex } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { directNonce } from "@whitepay/shared"
import { cancelAuthTypedData, cycleMemo } from "@whitepay/shared/autopay"
import { TopBar, UnlockSheet } from "../components"
import { BottomNav, Icon, LogoLoader } from "../ui"
import { getWallet } from "@/lib/wallet"
import { usdt, short, countdown, ago } from "@/lib/format"
import { TimerRing, PERIOD_LABEL, type MandateRow } from "../autopay-ui"

export default function Autopay() {
  const [wallet, setWallet] = useState<ReturnType<typeof getWallet> | undefined>(undefined)
  const [rows, setRows] = useState<MandateRow[] | null>(null)
  const [skew, setSkew] = useState(0)
  const [now, setNow] = useState(() => Date.now() / 1000)
  const [cancel, setCancel] = useState<MandateRow | null>(null)
  const [busy, setBusy] = useState("")
  const [msg, setMsg] = useState("")
  const ticking = useRef(false)

  const load = useCallback(async (address: string) => {
    const d = await fetch(`/api/subscriptions?subscriber=${address}`).then((r) => r.json()).catch(() => null)
    if (!d?.rows) return
    setRows(d.rows); setSkew(d.now - Date.now() / 1000)
  }, [])

  useEffect(() => {
    const w = getWallet(); setWallet(w)
    if (!w) return
    void load(w.address)
    const t1 = setInterval(() => setNow(Date.now() / 1000), 500)
    const t2 = setInterval(() => load(w.address), 10_000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [load])

  // when a countdown reaches 0, nudge the keeper (it would also run on its own schedule)
  const t = now + skew
  useEffect(() => {
    if (!wallet || !rows || ticking.current) return
    if (!rows.some((r) => r.status === "active" && r.nextDueAt && r.nextDueAt - t <= 0)) return
    ticking.current = true
    fetch("/api/autopay/tick").catch(() => {}).finally(() => { ticking.current = false; void load(wallet.address) })
  }, [Math.floor(t / 5), rows, wallet, load]) // eslint-disable-line react-hooks/exhaustive-deps

  const doCancel = async (acct: PrivateKeyAccount) => {
    const m = cancel!
    setCancel(null); setBusy(m.key); setMsg("")
    try {
      const cancels = []
      for (let c = m.paidCycles; c < m.cycles; c++) {
        const nonce = directNonce(m.merchant as Hex, cycleMemo(m.subscriptionId as Hex, c))
        cancels.push({ cycle: c, signature: await acct.signTypedData(cancelAuthTypedData(acct.address, nonce)) })
      }
      const r = await fetch("/api/subscriptions/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mandateKey: m.key, subscriber: acct.address, cancels }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg(`Cancelled. ${d.revoked} remaining payment${d.revoked === 1 ? "" : "s"} revoked on-chain.`)
      await load(acct.address)
    } catch (e) { setMsg((e as Error).message) } finally { setBusy("") }
  }

  if (wallet === undefined || (wallet && rows === null)) return <main className="shell with-nav"><TopBar back="/you" /><LogoLoader /><BottomNav /></main>
  if (!wallet) return <main className="shell with-nav"><TopBar /><div className="card">Create a wallet first.</div><BottomNav /></main>

  const active = rows!.filter((r) => r.status === "active")
  const past = rows!.filter((r) => r.status !== "active")
  return (
    <main className="shell with-nav">
      <TopBar back="/you" />
      <div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>Autopay</div>
        <div className="sub">Subscriptions you approved once. Each countdown is a live entity on Arkiv; at 0 the payment runs and the next countdown starts.</div>
      </div>
      {msg && <div className="card sub">{msg}</div>}
      {active.length === 0 && <div className="card stack" style={{ textAlign: "center" }}><span style={{ margin: "0 auto", color: "var(--brand-soft)" }}>{Icon.repeat(40)}</span><b>No active autopay</b><div className="sub">Subscribe from a shop's WhitePay link or checkout to see it here.</div></div>}
      {active.map((m) => {
        const left = m.nextDueAt - t
        return (
          <div key={m.key} className="card stack autopay-card">
            <div className="row" style={{ gap: 14, justifyContent: "flex-start" }}>
              <TimerRing left={left} period={m.period} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{m.title}</div>
                <div className="sub">{m.merchantName ?? short(m.merchant)}</div>
                <div style={{ fontWeight: 800, marginTop: 4 }}>{usdt(m.amount)} USDT <span className="sub">{PERIOD_LABEL(m.period)}</span></div>
              </div>
            </div>
            <div className="sub">{left > 0 ? `Next payment in ${countdown(left)}` : "Due now: paying…"} · payment {m.paidCycles + 1} of {m.cycles}</div>
            <div className="progress"><span style={{ width: `${(m.paidCycles / m.cycles) * 100}%` }} /></div>
            <div className="row">
              {m.lastTxUrl ? <a className="chip" href={m.lastTxUrl} target="_blank" rel="noreferrer">Last payment ↗</a> : <span />}
              <button className="chip" disabled={busy === m.key} onClick={() => setCancel(m)}>{busy === m.key ? <><span className="spinner" /> Revoking…</> : "Cancel autopay"}</button>
            </div>
          </div>
        )
      })}
      {past.length > 0 && <div className="section-title">Ended</div>}
      {past.map((m) => (
        <div key={m.key} className="card row">
          <div><div style={{ fontWeight: 700 }}>{m.title}</div><div className="sub">{m.merchantName ?? short(m.merchant)} · {m.paidCycles}/{m.cycles} paid · {ago(m.updatedAt)}</div></div>
          <span className={`badge ${m.status === "completed" ? "badge-ok" : m.status === "cancelled" ? "badge-warn" : "badge-bad"}`}>{m.status}</span>
        </div>
      ))}
      {cancel && (
        <UnlockSheet title="Cancel autopay" subtitle={`${cancel.title}: revoke ${cancel.cycles - cancel.paidCycles} remaining payment(s) on-chain`} onUnlocked={doCancel} onCancel={() => setCancel(null)} />
      )}
      <BottomNav />
    </main>
  )
}
