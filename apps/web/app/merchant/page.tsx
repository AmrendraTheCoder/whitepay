"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { formatUnits, parseUnits, toHex, type Hex } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { merchantSignupMessage, orderTypedData, receiveAuthTypedData, ROUTER_ADDRESS, REQUEST_TTL, LABEL_RE, type Order } from "@whitepay/shared"
import { TopBar, UnlockSheet } from "../components"
import { SuccessCheck, MiniLogo, Countdown, Identicon, Icon } from "../ui"
import { WorldVerify } from "../world"
import { ShopLink } from "./shop-link"
import { ReviewSheet } from "./review"
import type { RefundCase } from "../refund-timeline"
import { PlansCard } from "./plans"
import { OfferCard } from "./offer"
import { getWallet } from "@/lib/wallet"
import { endSession } from "@/lib/session"
import { usdt, short, ago, mmss } from "@/lib/format"

type Merchant = { address: string; label: string; ensName: string; displayName: string; category?: string; verified: boolean; active: boolean }
type Created = { entityKey: string; payUrl: string; amount: string; deadline: string }
type Row = { key: string; payer: string; amount: string; paidAt: number; explorer: string; kind: string; status?: string; paymentId?: string; refunded?: string; txHash?: string; item?: string | null }

export default function MerchantPage() {
  const [wallet, setWallet] = useState<ReturnType<typeof getWallet> | undefined>(undefined)
  const [merchant, setMerchant] = useState<Merchant | null | undefined>(undefined)
  // the unlocked key is kept in memory for this session only (like a logged-in POS terminal)
  const [account, setAccount] = useState<PrivateKeyAccount | null>(null)

  // stale-while-revalidate: show the last known shop profile instantly, refresh in the background
  const cacheKey = (a: string) => `whitepay.shop.${a.toLowerCase()}`
  useEffect(() => {
    const w = getWallet()
    setWallet(w)
    if (!w) return
    try {
      const c = JSON.parse(localStorage.getItem(cacheKey(w.address)) ?? "null")
      if (c) { setMerchant(c.merchant); setPersonalName(c.personalName) }
    } catch {}
  }, [])
  const loadMerchant = useCallback(async (address: string) => {
    const d = await fetch(`/api/merchants?address=${address}`).then((r) => r.json()).catch(() => null)
    if (!d) return setMerchant((m) => (m === undefined ? null : m)) // offline: keep cached view
    setMerchant(d.merchant ?? null)
    try {
      const prev = JSON.parse(localStorage.getItem(cacheKey(address)) ?? "{}")
      localStorage.setItem(cacheKey(address), JSON.stringify({ ...prev, merchant: d.merchant ?? null }))
    } catch {}
  }, [])
  useEffect(() => { if (wallet) void loadMerchant(wallet.address) }, [wallet, loadMerchant])
  // a personal name (ENS kind=person) means this is a personal wallet
  const [personalName, setPersonalName] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!wallet) return
    fetch(`/api/resolve?q=${wallet.address}`).then((r) => r.json())
      .then((d) => {
        const pn = d.kind !== "merchant" && d.name ? d.name : null
        setPersonalName(pn)
        try {
          const prev = JSON.parse(localStorage.getItem(cacheKey(wallet.address)) ?? "{}")
          localStorage.setItem(cacheKey(wallet.address), JSON.stringify({ ...prev, personalName: pn }))
        } catch {}
      }).catch(() => setPersonalName((p) => (p === undefined ? null : p)))
  }, [wallet])

  if (wallet === undefined || (wallet && merchant === undefined)) return <ShopSkeleton />
  if (!wallet)
    return (
      <main className="shell with-nav">
        <TopBar />
        <div className="card stack"><h2>Merchant mode</h2><div className="sub">Create a WondrPay wallet first. It becomes your shop's payout and signing key.</div></div>
        <a className="btn btn-primary" href="/app">Create wallet</a>
      </main>
    )
  if (!merchant && personalName === undefined) return <ShopSkeleton />
  if (!merchant && personalName)
    return (
      <main className="shell with-nav">
        <TopBar back={null} right={<a className="chip" href="/app">Personal</a>} />
        <div className="card stack">
          <span className="badge badge-brand" style={{ alignSelf: "flex-start" }}>Personal account</span>
          <div className="title">This wallet is personal</div>
          <div className="sub">{personalName} is your personal WondrPay name. Shops use a separate <b>business wallet</b> so personal and shop money, names and history never mix, like Google Pay and Google Pay for Business.</div>
          <a className="btn btn-primary btn-big" href="/add?type=business">Create a business wallet</a>
          <div className="sub center">Already have one? Switch wallets in <a href="/you" className="text-brand strong">You</a>.</div>
        </div>
        
      </main>
    )
  if (!merchant) return <Signup address={wallet.address} account={account} setAccount={setAccount} onDone={() => loadMerchant(wallet.address)} />
  return <Dashboard merchant={merchant} account={account} setAccount={setAccount} onChange={() => loadMerchant(wallet.address)} />
}

function Signup({ address, account, setAccount, onDone }: {
  address: string; account: PrivateKeyAccount | null; setAccount: (a: PrivateKeyAccount) => void; onDone: () => void
}) {
  const [displayName, setDisplayName] = useState("")
  const [label, setLabel] = useState("")
  const [category, setCategory] = useState("")
  const [avail, setAvail] = useState<{ available: boolean; reason?: string } | null>(null)
  const [unlock, setUnlock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [verifyStep, setVerifyStep] = useState(false)
  const [worldMsg, setWorldMsg] = useState("")

  useEffect(() => {
    setAvail(null)
    if (!label) return
    if (!LABEL_RE.test(label)) { setAvail({ available: false, reason: "3-32 chars: a-z, 0-9, hyphen" }); return }
    const t = setTimeout(() => fetch(`/api/merchants?label=${label}`).then((r) => r.json()).then(setAvail).catch(() => {}), 350)
    return () => clearTimeout(t)
  }, [label])

  const submit = async (acct: PrivateKeyAccount) => {
    setUnlock(false); setAccount(acct); setBusy(true); setErr("")
    try {
      const issuedAt = Math.floor(Date.now() / 1000)
      const signature = await acct.signMessage({ message: merchantSignupMessage({ label, displayName: displayName.trim(), address: acct.address, issuedAt }) })
      const r = await fetch("/api/merchants", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, displayName: displayName.trim(), category: category.trim() || undefined, address: acct.address, issuedAt, signature }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setVerifyStep(true) // World ID happens once, right here at shop creation
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  if (verifyStep)
    return (
      <main className="shell with-nav">
        <TopBar back={null} />
        <div className="card stack center">
          <SuccessCheck />
          <div className="title">{label}.wondrpay.eth is yours</div>
          <div className="sub">Last step: prove a real, unique person runs this shop with World ID (one World ID covers up to 5 of your shops). Customers see the Verified badge before they pay. You only do this once; payments never ask for it.</div>
          <ShopLink shop={account} onVerified={onDone} />
          <WorldVerify
            purpose="shop"
            signal={address}
            label="Verify with World ID"
            verify={async (proof) => {
              const r = await fetch("/api/world/verify", { method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ purpose: "merchant", address, result: proof }) })
              const d = await r.json()
              if (!r.ok) throw new Error(d.error)
              return d
            }}
            onVerified={() => { setWorldMsg("Verified"); setTimeout(onDone, 900) }}
            onDenied={(reason) => setWorldMsg(`Not verified: ${reason}`)}
          />
          {worldMsg && <div className="sub">{worldMsg}</div>}
          <button className="btn btn-ghost" onClick={onDone}>Skip, open my shop unverified</button>
        </div>
        
      </main>
    )

  const ok = displayName.trim().length > 1 && avail?.available
  return (
    <main className="shell with-nav">
      <TopBar back={null} right={<a className="chip" href="/app">Customer mode</a>} />
      <div className="card stack">
        <div className="title">Accept USDT payments</div>
        <div className="sub">Your shop gets a WondrPay name and a QR. Customers pay with no gas; money lands in this wallet ({short(address)}) instantly.</div>
      </div>
      <div className="card stack">
        <h2>Business name</h2>
        <input className="input" placeholder="Chai Point, Bandra" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
        <h2>Your handle</h2>
        <div className="row gap-2">
          <input className="input" placeholder="chai-point" value={label} autoCapitalize="none"
            onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
          <span className="sub nowrap">.wondrpay.eth</span>
        </div>
        <div className="sub min-line">
          {avail === null ? "" : avail.available ? <span className="text-ok">{label}.wondrpay.eth is available</span> : <span className="text-bad">{avail.reason === "taken" ? "Already taken" : avail.reason}</span>}
        </div>
        <h2>Category (optional)</h2>
        <input className="input" placeholder="Food & beverage" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} />
      </div>
      <button className="btn btn-primary btn-big" disabled={!ok || busy} onClick={() => (account ? submit(account) : setUnlock(true))}>
        {busy ? <><span className="spinner" /> Registering on Whitechain…</> : "Register my shop"}
      </button>
      <div className="err">{err}</div>
      <div className="sub center">New shops start unverified. Verify with World ID to get the Verified badge.</div>
      {unlock && <UnlockSheet title="Sign shop registration" subtitle={`${label}.wondrpay.eth`} onUnlocked={submit} onCancel={() => setUnlock(false)} />}
    </main>
  )
}

type ShopTab = "charge" | "payments" | "plans" | "offers"
const SHOP_TABS: { id: ShopTab; label: string }[] = [{ id: "charge", label: "Charge" }, { id: "payments", label: "Payments" }, { id: "plans", label: "Plans" }, { id: "offers", label: "Offers" }]
const QUICK = ["0.50", "1", "2", "5", "10"]
const dayKey = (t: number) => { const d = new Date(t * 1000); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
const dayLabel = (k: number) => { const today = dayKey(Date.now() / 1000); return k === today ? "Today" : k === today - 864e5 ? "Yesterday" : new Date(k).toLocaleDateString([], { day: "numeric", month: "short" }) }

function Dashboard({ merchant, account, setAccount, onChange }: { merchant: Merchant; account: PrivateKeyAccount | null; setAccount: (a: PrivateKeyAccount | null) => void; onChange: () => void }) {
  void onChange
  const [tab, setTabState] = useState<ShopTab>("charge")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [req, setReq] = useState<Created | null>(null)
  const [qr, setQr] = useState("")
  const [status, setStatus] = useState<"pending" | "paid" | "depleted">("pending")
  const [paidTx, setPaidTx] = useState("")
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState("0")
  const [unlock, setUnlock] = useState(false)
  const [refundRow, setRefundRow] = useState<Row | null>(null)
  const [copied, setCopied] = useState(false)
  const poll = useRef<ReturnType<typeof setInterval>>(undefined)

  // section lives in the URL hash (#payments) so a refresh or shared link opens the same view
  useEffect(() => {
    const read = () => { const h = location.hash.slice(1); if (h === "charge" || h === "payments" || h === "plans" || h === "offers") setTabState(h) }
    read(); window.addEventListener("hashchange", read)
    return () => window.removeEventListener("hashchange", read)
  }, [])
  const setTab = (t: ShopTab) => { setTabState(t); history.replaceState(null, "", `#${t}`) }
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? (i + 1) % SHOP_TABS.length : e.key === "ArrowLeft" ? (i + SHOP_TABS.length - 1) % SHOP_TABS.length : -1
    if (n < 0) return
    e.preventDefault(); setTab(SHOP_TABS[n].id); (document.getElementById(`shop-tab-${SHOP_TABS[n].id}`) as HTMLElement | null)?.focus()
  }

  const loadReceipts = useCallback(() =>
    fetch(`/api/receipts?merchant=${merchant.address}&limit=100`).then((r) => r.json()).then((d) => { setRows(d.rows ?? []); setTotal(d.total ?? "0") }), [merchant.address])
  // refund requests on this shop's orders (signed, immutable cases on Arkiv)
  const [cases, setCases] = useState<RefundCase[]>([])
  const [review, setReview] = useState<RefundCase | null>(null)
  const loadCases = useCallback(() =>
    fetch(`/api/refunds?merchant=${merchant.address}`).then((r) => r.json()).then((d) => setCases(d.cases ?? [])).catch(() => {}), [merchant.address])
  useEffect(() => { void loadCases() }, [loadCases])
  const caseFor = (paymentId?: string) => (paymentId ? cases.find((c) => c.paymentId.toLowerCase() === paymentId.toLowerCase()) : undefined)
  const waiting = cases.filter((c) => c.status === "open")
  useEffect(() => {
    void loadReceipts()
    return () => clearInterval(poll.current)
  }, [loadReceipts])

  const create = async (acct: PrivateKeyAccount) => {
    setUnlock(false); setAccount(acct); setBusy(true); setErr("")
    try {
      // the order is signed HERE, on the merchant's device (UPI "Reference ID")
      const order: Order = {
        merchant: acct.address,
        amount: parseUnits(amount, 6),
        orderId: toHex(crypto.getRandomValues(new Uint8Array(32))) as Hex,
        deadline: BigInt(Math.floor(Date.now() / 1000) + REQUEST_TTL.p2mQr),
      }
      const merchantSig = await acct.signTypedData(orderTypedData(ROUTER_ADDRESS, order))
      const r = await fetch("/api/requests", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          order: { merchant: order.merchant, amount: order.amount.toString(), orderId: order.orderId, deadline: order.deadline.toString() },
          merchantSig, note: note.trim() || undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setReq(d); setStatus("pending"); setPaidTx("")
      setQr(await (await import("qrcode")).default.toDataURL(d.payUrl, { margin: 1, width: 600, errorCorrectionLevel: "M" }))
      clearInterval(poll.current)
      poll.current = setInterval(async () => {
        const s = await fetch(`/api/requests/${d.entityKey}`).then((x) => x.json()).catch(() => null)
        if (!s) return
        if (s.state === "paid") { setStatus("paid"); setPaidTx(s.receipt?.explorer ?? ""); clearInterval(poll.current); void loadReceipts(); try { navigator.vibrate?.([18, 40, 28]) } catch {} }
        // instant QRs report "publishing" until Arkiv has them; past the deadline (+30 s grace) the QR is expired
        if (s.state === "depleted" || (s.state === "publishing" && Date.now() / 1000 > Number(d.deadline) + 30)) { setStatus("depleted"); clearInterval(poll.current) }
      }, 2000)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const newCharge = () => { clearInterval(poll.current); setReq(null); setStatus("pending"); setAmount(""); setNote("") }

  const validAmount = /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0
  const today = dayKey(Date.now() / 1000)
  const todays = (rows ?? []).filter((r) => dayKey(r.paidAt) === today)
  const todayNet = todays.reduce((s, r) => s + BigInt(r.amount) - BigInt(r.refunded ?? "0"), 0n)
  const groups = (rows ?? []).reduce<{ k: number; items: Row[] }[]>((g, r) => {
    const k = dayKey(r.paidAt); const last = g[g.length - 1]
    if (last && last.k === k) last.items.push(r); else g.push({ k, items: [r] })
    return g
  }, [])

  return (
    <main className="shell with-nav">
      <TopBar back={null} right={<div className="row gap-2">
        {account && <button className="chip" onClick={() => { endSession(); setAccount(null) }} aria-label="Lock terminal">Lock</button>}
        <a className="chip" href="/app">Personal</a>
      </div>} />

      <section className="shop-hero" aria-label="Your shop">
        <div className="shop-id">
          <Identicon seed={merchant.address} name={merchant.displayName} size={52} />
          <div className="shop-id-text">
            <div className="shop-name">{merchant.displayName} {merchant.verified ? <span className="badge badge-ok">{Icon.check(12)} Verified</span> : <span className="badge badge-warn">Unverified</span>}</div>
            <button className="shop-ens" onClick={() => { navigator.clipboard?.writeText(merchant.ensName); setCopied(true); setTimeout(() => setCopied(false), 1400) }} aria-label={`Copy ${merchant.ensName}`}>
              {copied ? "Copied" : merchant.ensName}
            </button>
          </div>
        </div>
        <dl className="shop-stats">
          <div><dt>Today</dt><dd>{rows === null ? <span className="skel" style={{ width: 70, height: 22 }} /> : `${usdt(todayNet.toString())}`}<small> USDT</small></dd></div>
          <div><dt>Payments today</dt><dd>{rows === null ? <span className="skel" style={{ width: 30, height: 22 }} /> : todays.length}</dd></div>
          <div><dt>All time</dt><dd>{rows === null ? <span className="skel" style={{ width: 30, height: 22 }} /> : total}</dd></div>
        </dl>
      </section>

      <div className="shop-seg" role="tablist" aria-label="Shop sections" style={{ ["--i" as string]: SHOP_TABS.findIndex((t) => t.id === tab) }}>
        <span className="shop-seg-pill" aria-hidden />
        {SHOP_TABS.map((t, i) => (
          <button key={t.id} id={`shop-tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls={`shop-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e, i)}>
            {t.label}{t.id === "payments" && todays.length > 0 && <span className="seg-badge">{todays.length}</span>}
          </button>
        ))}
      </div>

      {tab === "charge" && (
        <div id="shop-panel-charge" role="tabpanel" aria-labelledby="shop-tab-charge" className="shop-panel">
          {req && status === "pending" ? (
            <div className="card stack charge-live">
              <div className="sub center">Ask the customer to scan</div>
              <div className="big-amount">{usdt(req.amount)} <span className="unit">USDT</span></div>
              {note.trim() && <div className="sub center">“{note.trim()}”</div>}
              <div className="qr-wrap"><img src={qr} alt={`Payment QR for ${usdt(req.amount)} USDT`} /></div>
              <div className="row" style={{ justifyContent: "center", gap: 10 }} role="status">
                <span className="spinner" /> <span>Waiting for payment · <Countdown to={Number(req.deadline)} /></span>
              </div>
              <div className="row" style={{ justifyContent: "center", gap: 8 }}>
                <a className="chip" href={req.payUrl} target="_blank" rel="noreferrer">Open link</a>
                <button className="chip" onClick={() => navigator.clipboard?.writeText(req.payUrl)}>Copy link</button>
              </div>
              <button className="btn btn-ghost" onClick={newCharge}>Cancel</button>
            </div>
          ) : status === "paid" && req ? (
            <div className="card stack" role="status">
              <div className="result py-2">
                <SuccessCheck />
                <h1>Received {usdt(req.amount)} USDT</h1>
                {paidTx && <a className="chip" href={paidTx} target="_blank" rel="noreferrer">View on Whitechain ↗</a>}
              </div>
              <button className="btn btn-primary btn-big" onClick={newCharge}>New charge</button>
            </div>
          ) : (
            <div className="card stack">
              {status === "depleted" && <div className="badge badge-warn self-center">Last QR expired unpaid</div>}
              <label className="sr-only" htmlFor="charge-amount">Amount in USDT</label>
              <input id="charge-amount" className="amount-input" inputMode="decimal" placeholder="0.00" value={amount} autoComplete="off"
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))} />
              <div className="sub center">USDT · QR valid for 5 minutes</div>
              <div className="quick-amts" role="group" aria-label="Quick amounts">
                {QUICK.map((q) => <button key={q} className={`fchip ${amount === q ? "on" : ""}`} onClick={() => setAmount(q)}>{q}</button>)}
              </div>
              <input className="input" placeholder="Note for the customer (optional)" value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} aria-label="Note for the customer" />
              <button className="btn btn-primary btn-big" onClick={() => (account ? create(account) : setUnlock(true))} disabled={busy || !validAmount}>
                {busy ? <><span className="spinner" /> Creating QR…</> : validAmount ? `Charge ${usdt(parseUnits(amount, 6).toString())} USDT` : "Enter an amount"}
              </button>
              <div className="err" role="alert">{err}</div>
            </div>
          )}
        </div>
      )}

      {tab === "payments" && (
        <div id="shop-panel-payments" role="tabpanel" aria-labelledby="shop-tab-payments" className="shop-panel">
          <div className="card">
            <div className="row">
              <h2 className="m-0">Payments</h2>
              <button className="chip" onClick={() => exportCsv(merchant)} aria-label="Download payments as CSV">Export CSV</button>
            </div>
            {rows === null && <div className="list" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="item"><span className="pic skel circle" /><div className="grow"><span className="skel" style={{ width: "50%", height: 14 }} /></div></div>)}</div>}
            {waiting.length > 0 && (
              <button className="rf-status warn" style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 3, padding: "12px 14px", borderRadius: 16, margin: "10px 0" }} onClick={() => setReview(waiting[0])}>
                <b>{waiting.length} refund request{waiting.length === 1 ? "" : "s"} waiting for you</b>
                <span className="sub">Unanswered requests re-open every 7 days. Tap to review.</span>
              </button>
            )}
            {rows?.length === 0 && <div className="empty">No payments yet. Charge your first customer from the Charge tab.</div>}
            {groups.map((g) => (
              <div key={g.k} className="pay-group">
                <div className="pay-day">{dayLabel(g.k)}</div>
                <div className="list">
                  {g.items.map((r) => {
                    const refunded = BigInt(r.refunded ?? "0")
                    const full = refunded >= BigInt(r.amount)
                    const canRefund = r.kind !== "p2p" && !!r.paymentId && !full
                    const rc = caseFor(r.paymentId)
                    const live = rc && (rc.status === "open" || rc.status === "responded")
                    return (
                      <div key={r.key} className="item">
                        <Identicon seed={r.payer} size={40} />
                        <a href={r.explorer} target="_blank" rel="noreferrer" className="grow" style={{ color: "inherit", textDecoration: "none", minWidth: 0 }}>
                          <div className="t">{r.item ?? short(r.payer)}</div>
                          <div className="sub">{r.item ? `${short(r.payer)} · ` : ""}{new Date(r.paidAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {r.kind === "p2p" ? "Direct" : r.kind === "autopay" ? "Subscription" : "Order"}{refunded > 0n ? ` · refunded ${usdt(refunded.toString())}` : ""}</div>
                          {rc && <span className={`badge ${rc.status === "open" ? "badge-warn" : rc.decision === "approve" ? "badge-ok" : "badge-bad"}`} style={{ marginTop: 4 }}>
                            {rc.status === "open" ? "Refund requested" : rc.status === "responded" ? (rc.decision === "approve" ? "Refund approved" : "Refund declined") : "Refund resolved"}
                          </span>}
                        </a>
                        <div className="right">
                          <div className={`amt ${full ? "" : "pos"}`} style={full ? { color: "var(--muted)", textDecoration: "line-through" } : undefined}>+{usdt(r.amount)}</div>
                          {rc ? <button className={`chip ${live ? "chip-warn" : ""}`} style={{ marginTop: 4, fontSize: 12 }} onClick={() => setReview(rc)}>{rc.status === "open" ? "Review" : "View"}</button>
                            : canRefund && <button className="chip" style={{ marginTop: 4, fontSize: 12 }} onClick={() => setRefundRow(r)}>Refund</button>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "plans" && (
        <div id="shop-panel-plans" role="tabpanel" aria-labelledby="shop-tab-plans" className="shop-panel">
          <PlansCard merchant={merchant} account={account} setAccount={setAccount} />
        </div>
      )}

      {tab === "offers" && (
        <div id="shop-panel-offers" role="tabpanel" aria-labelledby="shop-tab-offers" className="shop-panel">
          <OfferCard merchant={merchant} account={account} setAccount={setAccount} />
        </div>
      )}

      {unlock && <UnlockSheet title="Unlock terminal" subtitle={`${amount} USDT request`} onUnlocked={create} onCancel={() => setUnlock(false)} />}
      {review && <ReviewSheet c={review} account={account} setAccount={setAccount} onClose={(changed) => { setReview(null); if (changed) { void loadCases(); void loadReceipts() } }} />}
      {refundRow && <RefundSheet row={refundRow} account={account} setAccount={setAccount} onClose={(done) => { setRefundRow(null); if (done) void loadReceipts() }} />}
    </main>
  )
}

/** Refund a QR payment back to the customer who paid it. The shop signs on this device; WondrPay pays the gas. */
function RefundSheet({ row, account, setAccount, onClose }: {
  row: Row; account: PrivateKeyAccount | null; setAccount: (a: PrivateKeyAccount) => void; onClose: (done: boolean) => void
}) {
  const remaining = BigInt(row.amount) - BigInt(row.refunded ?? "0")
  const [amt, setAmt] = useState(formatUnits(remaining, 6))
  const [unlock, setUnlock] = useState(false)
  const [phase, setPhase] = useState<"form" | "busy" | "done">("form")
  const [err, setErr] = useState("")
  const [tx, setTx] = useState("")
  const valid = /^\d+(\.\d{1,6})?$/.test(amt) && Number(amt) > 0 && parseUnits(amt, 6) <= remaining

  const run = async (acct: PrivateKeyAccount) => {
    setUnlock(false); setAccount(acct); setPhase("busy"); setErr("")
    try {
      const info = await fetch(`/api/refund?paymentId=${row.paymentId}`).then((r) => r.json())
      if (info.error) throw new Error(info.error)
      const value = parseUnits(amt, 6)
      if (value > BigInt(info.refundable)) throw new Error("More than what can still be refunded")
      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600)
      const signature = await acct.signTypedData(receiveAuthTypedData({ from: acct.address, to: ROUTER_ADDRESS, value, validAfter: 0n, validBefore, nonce: info.nonce }))
      const r = await fetch("/api/refund", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId: row.paymentId, amount: value.toString(), auth: { from: acct.address, validAfter: "0", validBefore: validBefore.toString(), signature } }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error === "NotMerchantPayout" ? "Only this shop's payout wallet can refund" : d.error === "RefundExceedsPaid" ? "Already refunded" : d.error)
      setTx(d.explorer); setPhase("done")
    } catch (e) { setErr((e as Error).message); setPhase("form") }
  }

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget && phase !== "busy") onClose(phase === "done") }}>
      <div className="sheet stack">
        {phase === "done" ? (
          <div className="result py-2">
            <SuccessCheck />
            <h1>Refunded {amt} USDT</h1>
            <div className="sub">Sent back to {short(row.payer)}. Receipt updated on Arkiv.</div>
            <a className="chip" href={tx} target="_blank" rel="noreferrer">View on Whitechain ↗</a>
            <button className="btn btn-primary" onClick={() => onClose(true)}>Done</button>
          </div>
        ) : (
          <>
            <div className="title">Refund payment</div>
            <div className="sub">Goes back to the customer who paid ({short(row.payer)}), never anywhere else. Up to {usdt(remaining.toString())} USDT. No gas.</div>
            <input className="amount-input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))} />
            <button className="btn btn-primary btn-big" disabled={!valid || phase === "busy"} onClick={() => (account ? run(account) : setUnlock(true))}>
              {phase === "busy" ? <><span className="spinner" /> Refunding on Whitechain…</> : `Refund ${amt || "0"} USDT`}
            </button>
            <div className="err">{err}</div>
            <button className="btn btn-ghost" disabled={phase === "busy"} onClick={() => onClose(false)}>Cancel</button>
          </>
        )}
      </div>
      {unlock && <UnlockSheet title={`Refund ${amt} USDT`} subtitle={`to ${short(row.payer)}`} onUnlocked={run} onCancel={() => setUnlock(false)} />}
    </div>
  )
}

/** Accountant export: every receipt (up to 200) with the on-chain tx for each line. */
async function exportCsv(merchant: Merchant) {
  const d = await fetch(`/api/receipts?merchant=${merchant.address}&limit=200`).then((r) => r.json())
  const head = ["paid_at_utc", "type", "payer", "amount_usdt", "refunded_usdt", "net_usdt", "status", "payment_id", "tx_hash", "explorer"]
  const lines = (d.rows ?? []).map((r: any) => {
    const amt = BigInt(r.amount), ref = BigInt(r.refunded ?? 0)
    return [new Date(r.paidAt * 1000).toISOString(), r.kind === "p2p" ? "direct" : "qr", r.payer, formatUnits(amt, 6), formatUnits(ref, 6),
      formatUnits(amt - ref, 6), r.status, r.paymentId ?? "", r.txHash, r.explorer].join(",")
  })
  const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `${merchant.label}-whitepay-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

/** First-visit loading state: the real dashboard's shape, with the brand mark animating in the header. */
function ShopSkeleton() {
  return (
    <main className="shell with-nav" aria-busy="true">
      <div className="topbar">
        <div className="brand"><MiniLogo /> Opening your shop…</div>
      </div>
      <div className="card row">
        <div className="grow">
          <span className="skel" style={{ width: "55%", height: 18 }} /><br />
          <span className="skel" style={{ width: "70%", height: 13, marginTop: 8 }} />
        </div>
        <span className="skel" style={{ width: 72, height: 24, borderRadius: 999 }} />
      </div>
      <div className="card stack" style={{ alignItems: "center" }}>
        <span className="skel" style={{ width: 120, height: 14 }} />
        <span className="skel" style={{ width: 170, height: 52, borderRadius: 14 }} />
        <span className="skel" style={{ width: 150, height: 12 }} />
        <span className="skel" style={{ width: "100%", height: 58, borderRadius: 999 }} />
      </div>
      <div className="card">
        <span className="skel" style={{ width: 140, height: 14 }} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="item">
            <span className="pic skel circle" />
            <div className="grow"><span className="skel" style={{ width: "50%", height: 14 }} /><br /><span className="skel" style={{ width: "30%", height: 11, marginTop: 6 }} /></div>
            <span className="skel" style={{ width: 48, height: 14 }} />
          </div>
        ))}
      </div>
      
    </main>
  )
}
