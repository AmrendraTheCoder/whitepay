"use client"
import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import { DEMO_MERCHANT } from "@whitepay/shared"
import { TopBar } from "../components"
import { usdt, short, ago, mmss } from "@/lib/format"

type Created = { entityKey: string; payUrl: string; amount: string; deadline: string; arkivTx: string }
type Row = { key: string; payer: string; amount: string; paidAt: number; explorer: string }

export default function Merchant() {
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [req, setReq] = useState<Created | null>(null)
  const [qr, setQr] = useState("")
  const [status, setStatus] = useState<"pending" | "paid" | "depleted">("pending")
  const [paidTx, setPaidTx] = useState("")
  const [now, setNow] = useState(() => Date.now() / 1000)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState<string>("0")
  const poll = useRef<ReturnType<typeof setInterval>>(undefined)

  const loadReceipts = () =>
    fetch(`/api/receipts?merchant=${DEMO_MERCHANT.address}`).then((r) => r.json()).then((d) => { setRows(d.rows ?? []); setTotal(d.total ?? "0") })

  useEffect(() => {
    void loadReceipts()
    const t = setInterval(() => setNow(Date.now() / 1000), 500)
    return () => { clearInterval(t); clearInterval(poll.current) }
  }, [])

  const create = async () => {
    setBusy(true); setErr("")
    try {
      const r = await fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setReq(d); setStatus("pending"); setPaidTx("")
      setQr(await QRCode.toDataURL(d.payUrl, { margin: 1, width: 600, errorCorrectionLevel: "M" }))
      clearInterval(poll.current)
      poll.current = setInterval(async () => {
        const s = await fetch(`/api/requests/${d.entityKey}`).then((x) => x.json()).catch(() => null)
        if (!s) return
        if (s.state === "paid") { setStatus("paid"); setPaidTx(s.receipt?.explorer ?? ""); clearInterval(poll.current); void loadReceipts() }
        if (s.state === "depleted") { setStatus("depleted"); clearInterval(poll.current) }
      }, 2000)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const left = req ? Number(req.deadline) - now : 0

  return (
    <main className="shell">
      <TopBar right={<a className="chip" href="/">Customer mode</a>} />
      <div className="card row">
        <div>
          <div style={{ fontWeight: 700 }}>{DEMO_MERCHANT.displayName}</div>
          <div className="sub">{DEMO_MERCHANT.name}</div>
        </div>
        <span className="badge badge-ok">✓ Verified</span>
      </div>

      {!req || status !== "pending" ? (
        <div className="card stack">
          {status === "paid" && req && (
            <div className="result" style={{ padding: "8px 0" }}>
              <div className="icon ok">✓</div>
              <h1>Received {usdt(req.amount)} USDT</h1>
              {paidTx && <a className="chip" href={paidTx} target="_blank" rel="noreferrer">View on Whitechain ↗</a>}
            </div>
          )}
          {status === "depleted" && <div className="badge badge-warn" style={{ alignSelf: "center" }}>Last request expired unpaid and was removed from Arkiv</div>}
          <h2>New payment request</h2>
          <input className="amount-input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          <div className="sub" style={{ textAlign: "center" }}>USDT · QR valid for 5 minutes</div>
          <button className="btn btn-primary btn-big" onClick={create} disabled={busy || !amount}>
            {busy ? <><span className="spinner" /> Signing order & writing to Arkiv…</> : "Show QR"}
          </button>
          <div className="err">{err}</div>
        </div>
      ) : (
        <div className="card stack" style={{ textAlign: "center" }}>
          <div className="sub">Ask the customer to scan</div>
          <div className="big-amount">{usdt(req.amount)} <span style={{ fontSize: 20, color: "var(--muted)" }}>USDT</span></div>
          <div className="qr-wrap"><img src={qr} alt="Payment QR" /></div>
          <div className="row" style={{ justifyContent: "center", gap: 10 }}>
            <span className="spinner" /> <span>Waiting for payment · <span className="countdown">{mmss(left)}</span></span>
          </div>
          <div className="sub mono">Arkiv entity {short(req.entityKey)}</div>
          <a className="sub" href={req.payUrl} target="_blank" rel="noreferrer">Open payment link</a>
          <button className="btn btn-ghost" onClick={() => { clearInterval(poll.current); setReq(null) }}>Cancel</button>
        </div>
      )}

      <div className="card">
        <div className="row"><h2>Received (from Arkiv)</h2><span className="sub">{total} total</span></div>
        <div className="list">
          {rows === null && <div className="empty">Loading…</div>}
          {rows?.length === 0 && <div className="empty">No payments yet.</div>}
          {rows?.map((r) => (
            <a key={r.key} className="item" href={r.explorer} target="_blank" rel="noreferrer">
              <div><div className="t">{short(r.payer)}</div><div className="sub">{ago(r.paidAt)}</div></div>
              <div className="amt" style={{ color: "var(--ok)" }}>+{usdt(r.amount)}</div>
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}
