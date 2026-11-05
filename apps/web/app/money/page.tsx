"use client"
import { useMemo, useState } from "react"
import { Icon, Identicon, useWalletData, Toast, type Activity } from "../ui"
import { usdt, short } from "@/lib/format"
import { useHideBalance } from "@/lib/prefs"
import { USDT_ADDRESS, EXPLORER_URL } from "@whitepay/shared"

const CATS: { id: string; label: string; color: string; test: (r: Activity) => boolean }[] = [
  { id: "shops", label: "Shops", color: "#3DE0FF", test: (r) => r.kind === "p2m" },
  { id: "people", label: "People", color: "#DDF05A", test: (r) => r.kind === "p2p" || r.kind === "transfer" },
  { id: "subs", label: "Subscriptions", color: "#FF5CC8", test: (r) => r.kind === "autopay" },
  { id: "other", label: "Other", color: "#8a92c8", test: () => true },
]

/** Money: balance, this month's in/out, 6-month trend, where money went, your address + QR. */
export default function Money() {
  const { wallet, bal, rows, toast } = useWalletData()
  const { hidden, toggle } = useHideBalance()
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const show = (v: bigint | string) => (hidden ? "••••" : usdt(v))

  const stats = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString("en-IN", { month: "short" }), inn: 0n, out: 0n }
    })
    const byKey = new Map(months.map((m) => [m.key, m]))
    const cats = new Map<string, bigint>(CATS.map((c) => [c.id, 0n]))
    const thisKey = months[5].key
    for (const r of rows ?? []) {
      const d = new Date(r.at * 1000)
      const m = byKey.get(`${d.getFullYear()}-${d.getMonth()}`)
      if (!m) continue
      const a = BigInt(r.amount)
      if (r.direction === "in") m.inn += a
      else {
        m.out += a
        if (m.key === thisKey) { const c = CATS.find((c) => c.test(r))!; cats.set(c.id, cats.get(c.id)! + a) }
      }
    }
    const max = months.reduce((x, m) => (m.inn > x ? m.inn : m.out > x ? m.out : x), 1n)
    return { months, max, cats, month: months[5] }
  }, [rows])

  const copy = () => { if (wallet) { navigator.clipboard?.writeText(wallet.address); setCopied(true); setTimeout(() => setCopied(false), 1400) } }
  const loadQr = async () => {
    if (!wallet || qr) return
    const { default: QR } = await import("qrcode") // only loaded when the user opens it
    setQr(await QR.toDataURL(wallet.address, { margin: 1, width: 360 }))
  }
  const m = stats.month
  const net = m.inn - m.out
  const catTotal = [...stats.cats.values()].reduce((a, b) => a + b, 0n)

  return (
    <main className="shell with-nav">
      <Toast text={toast} />
      <section className="money-hero">
        <div className="row">
          <span className="lbl">Total balance</span>
          <button className="eye" onClick={toggle} aria-label={hidden ? "Show balances" : "Hide balances"}>{hidden ? Icon.eyeOff() : Icon.eye()}</button>
        </div>
        <div className="bal">{bal ? show(bal.usdt) : <span className="skel" style={{ width: 160, height: 44 }} />}<small>USDT</small></div>
        <div className="meta"><span className="pill-lime">0 gas</span><span>Tether USD on Whitechain · ≈ ${hidden ? "••" : bal ? usdt(bal.usdt) : "…"}</span></div>
        <div className="qa">
          <a href="/send"><span>{Icon.pay(24)}</span>Send</a>
          <a href="/receive"><span>{Icon.receive(24)}</span>Receive</a>
          <button onClick={() => { setShowAdd(true); void loadQr(); document.getElementById("add")?.scrollIntoView({ behavior: "smooth" }) }}><span>{Icon.balance(24)}</span>Add money</button>
          <a href="/transactions"><span>{Icon.history(24)}</span>History</a>
        </div>
      </section>

      <section className="card stack">
        <div className="row"><h2 style={{ margin: 0 }}>This month</h2><a className="sub" href="/transactions">See all ›</a></div>
        <div className="io">
          <div><span className="sub">Sent</span><b className="neg">−{rows === null ? "…" : show(m.out)}</b></div>
          <div><span className="sub">Received</span><b className="pos">+{rows === null ? "…" : show(m.inn)}</b></div>
          <div><span className="sub">Net</span><b className={net < 0n ? "neg" : "pos"}>{net < 0n ? "−" : "+"}{rows === null ? "…" : show(net < 0n ? -net : net)}</b></div>
        </div>
        <div className="bars" role="img" aria-label="Received and sent per month, last 6 months">
          {stats.months.map((x) => (
            <div key={x.key} className="bar-col">
              <div className="bar-pair">
                <span className="b in" style={{ height: `${Number((x.inn * 100n) / stats.max)}%` }} title={`${x.label}: +${usdt(x.inn)}`} />
                <span className="b out" style={{ height: `${Number((x.out * 100n) / stats.max)}%` }} title={`${x.label}: −${usdt(x.out)}`} />
              </div>
              <span className="sub">{x.label}</span>
            </div>
          ))}
        </div>
        <div className="legend"><span><i className="in" />Received</span><span><i className="out" />Sent</span></div>
      </section>

      {catTotal > 0n && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Where it went</h2>
          <div className="stack-bar">
            {CATS.map((c) => { const v = stats.cats.get(c.id)!; return v > 0n ? <span key={c.id} style={{ width: `${Number((v * 1000n) / catTotal) / 10}%`, background: c.color }} /> : null })}
          </div>
          <div className="cat-list">
            {CATS.map((c) => { const v = stats.cats.get(c.id)!; return v > 0n ? (
              <div key={c.id} className="row"><span><i style={{ background: c.color }} />{c.label}</span><b>{show(v)} <span className="sub">{Math.round(Number((v * 100n) / catTotal))}%</span></b></div>
            ) : null })}
          </div>
        </section>
      )}

      <section className="card stack addr-card" id="add">
        <div className="row" style={{ gap: 12, justifyContent: "flex-start" }}>
          {wallet && <Identicon seed={wallet.address} size={52} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800 }}>Your wallet address</div>
            <div className="sub"><span className="mono">{wallet ? short(wallet.address) : ""}</span> · USDT on Whitechain</div>
          </div>
          <button className="chip" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
        </div>
        <button className="btn btn-ghost" onClick={() => { setShowAdd((v) => !v); void loadQr() }} aria-expanded={showAdd}>
          {showAdd ? "Hide" : "Show QR & ways to add money"}
        </button>
        {showAdd && (
          <div className="stack add-body">
            <div className="qr-wrap" style={{ maxWidth: 220, margin: "0 auto" }}>{qr ? <img src={qr} alt="Your wallet address QR" /> : <span className="skel" style={{ width: 200, height: 200 }} />}</div>
            <div className="mono addr-full" onClick={copy}>{wallet?.address}</div>
            <ol className="ways">
              <li><b>From a friend:</b> show your QR (Receive); they pay you in USDT, no gas for either of you.</li>
              <li><b>Testnet swap:</b> get WBT from the <a href="https://faucet.testnet.whitechain.io" target="_blank" rel="noreferrer">Whitechain faucet</a>, swap WBT → Tether USD (0xcedf…55a7) on <a href="https://testnet.yetitrade.fi" target="_blank" rel="noreferrer">YetiTrade</a>, send it here.</li>
              <li><b>From MetaMask:</b> on Whitechain Sepolia (chain 1874), send USDT to this address, or connect MetaMask under You.</li>
            </ol>
          </div>
        )}
      </section>

      <div className="menu-list">
        <a className="menu-row" href="/autopay"><span className="ic">{Icon.repeat(24)}</span>Subscriptions<span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href={wallet ? `${EXPLORER_URL}/address/${wallet.address}` : "#"} target="_blank" rel="noreferrer"><span className="ic">{Icon.history(24)}</span>View on Whitechain explorer<span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href={`${EXPLORER_URL}/address/${USDT_ADDRESS}`} target="_blank" rel="noreferrer"><span className="ic">{Icon.shield()}</span>About USDT on Whitechain<span className="chev">{Icon.chev()}</span></a>
      </div>

      
    </main>
  )
}
