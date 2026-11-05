"use client"
// Shop dashboard: publish a subscription plan (signed on this device) and watch subscribers' countdowns.
import { useCallback, useEffect, useState } from "react"
import { parseUnits, toHex, type Hex } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { PERIODS, planTypedData, MAX_CYCLES, type PeriodKey } from "@whitepay/shared/autopay"
import { UnlockSheet } from "../components"
import { TimerRing, PERIOD_LABEL, type MandateRow } from "../autopay-ui"
import { usdt, short, countdown } from "@/lib/format"

export function PlansCard({ merchant, account, setAccount }: { merchant: { address: string; ensName: string }; account: PrivateKeyAccount | null; setAccount: (a: PrivateKeyAccount) => void }) {
  const [title, setTitle] = useState("")
  const [amount, setAmount] = useState("")
  const [periodKey, setPeriodKey] = useState<PeriodKey>("demo")
  const [cycles, setCycles] = useState(6)
  const [unlock, setUnlock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [link, setLink] = useState<{ url: string; qr: string } | null>(null)
  const [subs, setSubs] = useState<MandateRow[]>([])
  const [skew, setSkew] = useState(0)
  const [now, setNow] = useState(() => Date.now() / 1000)

  const load = useCallback(() => fetch(`/api/subscriptions?merchant=${merchant.address}`).then((r) => r.json()).then((d) => { if (d.rows) { setSubs(d.rows); setSkew(d.now - Date.now() / 1000) } }).catch(() => {}), [merchant.address])
  useEffect(() => {
    void load()
    const a = setInterval(() => setNow(Date.now() / 1000), 1000), b = setInterval(load, 15_000)
    return () => { clearInterval(a); clearInterval(b) }
  }, [load])

  const valid = title.trim().length > 1 && /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0 && cycles >= 1 && cycles <= MAX_CYCLES
  const create = async (acct: PrivateKeyAccount) => {
    setUnlock(false); setAccount(acct); setBusy(true); setErr("")
    try {
      const plan = { merchant: acct.address, amount: parseUnits(amount, 6), period: PERIODS[periodKey].seconds, cycles, planId: toHex(crypto.getRandomValues(new Uint8Array(32))) as Hex, expiresAt: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400) }
      const merchantSig = await acct.signTypedData(planTypedData(plan))
      const r = await fetch("/api/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        plan: { ...plan, amount: plan.amount.toString(), expiresAt: plan.expiresAt.toString() }, merchantSig, title: title.trim(), periodKey }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setLink({ url: d.subscribeUrl, qr: await (await import("qrcode")).default.toDataURL(d.subscribeUrl, { margin: 1, width: 480 }) })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const t = now + skew
  const active = subs.filter((s) => s.status === "active")
  return (
    <div className="card stack">
      <div className="row"><h2 className="m-0">Subscriptions (Autopay)</h2><span className="sub">{active.length} active</span></div>
      {link ? (
        <div className="stack center">
          <div className="sub">Customers scan to subscribe. Valid for 7 days, any number of subscribers.</div>
          <div className="qr-wrap"><img src={link.qr} alt="Subscribe QR" /></div>
          <button className="chip self-center" onClick={() => navigator.clipboard?.writeText(link.url)}>Copy subscribe link</button>
          <button className="btn btn-ghost" onClick={() => setLink(null)}>New plan</button>
        </div>
      ) : (
        <>
          <input className="input" placeholder="Plan name, e.g. Chai Club" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
          <div className="row gap-2">
            <input className="input" inputMode="decimal" placeholder="USDT per cycle" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
            <select className="input" value={periodKey} onChange={(e) => setPeriodKey(e.target.value as PeriodKey)}>
              {Object.entries(PERIODS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select>
          </div>
          <label className="sub row gap-2">Payments
            <input className="input" type="number" min={1} max={MAX_CYCLES} value={cycles} onChange={(e) => setCycles(Math.max(1, Math.min(MAX_CYCLES, Number(e.target.value) || 1)))} style={{ maxWidth: 90 }} />
            {valid && <span>= {usdt(parseUnits(amount, 6) * BigInt(cycles))} USDT total</span>}
          </label>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={() => (account ? create(account) : setUnlock(true))}>
            {busy ? <><span className="spinner" /> Signing plan…</> : "Create subscribe link"}
          </button>
          <div className="err">{err}</div>
        </>
      )}
      {subs.length > 0 && (
        <div className="list">
          {subs.slice(0, 8).map((s) => (
            <div key={s.key} className="item" style={{ gap: 12 }}>
              {s.status === "active" ? <TimerRing left={s.nextDueAt - t} period={s.period} /> : null}
              <div className="grow">
                <div className="t">{s.title} · {short(s.subscriber)}</div>
                <div className="sub">{usdt(s.amount)} {PERIOD_LABEL(s.period)} · {s.paidCycles}/{s.cycles} paid · {s.status === "active" ? `next in ${countdown(s.nextDueAt - t)}` : s.status}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {unlock && <UnlockSheet title="Sign subscription plan" subtitle={`${title} · ${amount} USDT ${PERIODS[periodKey].label}`} onUnlocked={create} onCancel={() => setUnlock(false)} />}
    </div>
  )
}
