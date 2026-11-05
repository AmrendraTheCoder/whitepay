"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import { parseUnits, toHex, type Hex } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { merchantSignupMessage, orderTypedData, ROUTER_ADDRESS, REQUEST_TTL, LABEL_RE, type Order } from "@whitepay/shared"
import { TopBar, UnlockSheet } from "../components"
import { BottomNav, SuccessCheck, LogoLoader } from "../ui"
import { WorldVerify } from "../world"
import { getWallet } from "@/lib/wallet"
import { usdt, short, ago, mmss } from "@/lib/format"

type Merchant = { address: string; label: string; ensName: string; displayName: string; category?: string; verified: boolean; active: boolean }
type Created = { entityKey: string; payUrl: string; amount: string; deadline: string }
type Row = { key: string; payer: string; amount: string; paidAt: number; explorer: string; kind: string }

export default function MerchantPage() {
  const [wallet, setWallet] = useState<ReturnType<typeof getWallet> | undefined>(undefined)
  const [merchant, setMerchant] = useState<Merchant | null | undefined>(undefined)
  // the unlocked key is kept in memory for this session only (like a logged-in POS terminal)
  const [account, setAccount] = useState<PrivateKeyAccount | null>(null)

  useEffect(() => setWallet(getWallet()), [])
  const loadMerchant = useCallback(async (address: string) => {
    const d = await fetch(`/api/merchants?address=${address}`).then((r) => r.json()).catch(() => ({}))
    setMerchant(d.merchant ?? null)
  }, [])
  useEffect(() => { if (wallet) void loadMerchant(wallet.address) }, [wallet, loadMerchant])
  // a personal name (ENS kind=person) means this is a personal wallet
  const [personalName, setPersonalName] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!wallet) return
    fetch(`/api/resolve?q=${wallet.address}`).then((r) => r.json())
      .then((d) => setPersonalName(d.kind !== "merchant" && d.name ? d.name : null)).catch(() => setPersonalName(null))
  }, [wallet])

  if (wallet === undefined || (wallet && merchant === undefined))
    return <main className="shell with-nav"><LogoLoader label="Opening your shop…" /><BottomNav /></main>
  if (!wallet)
    return (
      <main className="shell with-nav">
        <TopBar />
        <div className="card stack"><h2>Merchant mode</h2><div className="sub">Create a WhitePay wallet first. It becomes your shop's payout and signing key.</div></div>
        <a className="btn btn-primary" href="/">Create wallet</a>
      <BottomNav /></main>
    )
  if (!merchant && personalName === undefined) return <main className="shell with-nav"><LogoLoader label="Opening your shop…" /><BottomNav /></main>
  if (!merchant && personalName)
    return (
      <main className="shell with-nav">
        <TopBar back={null} right={<a className="chip" href="/">Personal</a>} />
        <div className="card stack">
          <span className="badge badge-brand" style={{ alignSelf: "flex-start" }}>Personal account</span>
          <div style={{ fontSize: 22, fontWeight: 800 }}>This wallet is personal</div>
          <div className="sub">{personalName} is your personal WhitePay name. Shops use a separate <b>business wallet</b> so personal and shop money, names and history never mix, like Google Pay and Google Pay for Business.</div>
          <a className="btn btn-primary btn-big" href="/add?type=business">Create a business wallet</a>
          <div className="sub" style={{ textAlign: "center" }}>Already have one? Switch wallets in <a href="/you" style={{ color: "var(--brand-soft)", fontWeight: 700 }}>You</a>.</div>
        </div>
        <BottomNav />
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
      onDone()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const ok = displayName.trim().length > 1 && avail?.available
  return (
    <main className="shell with-nav">
      <TopBar back={null} right={<a className="chip" href="/">Customer mode</a>} />
      <div className="card stack">
        <div style={{ fontSize: 22, fontWeight: 800 }}>Accept USDT payments</div>
        <div className="sub">Your shop gets a WhitePay name and a QR. Customers pay with no gas; money lands in this wallet ({short(address)}) instantly.</div>
      </div>
      <div className="card stack">
        <h2>Business name</h2>
        <input className="input" placeholder="Chai Point, Bandra" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
        <h2>Your handle</h2>
        <div className="row" style={{ gap: 6 }}>
          <input className="input" placeholder="chai-point" value={label} autoCapitalize="none"
            onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
          <span className="sub" style={{ whiteSpace: "nowrap" }}>.whitepay.eth</span>
        </div>
        <div className="sub" style={{ minHeight: 18 }}>
          {avail === null ? "" : avail.available ? <span style={{ color: "var(--ok)" }}>✓ {label}.whitepay.eth is available</span> : <span style={{ color: "var(--bad)" }}>{avail.reason === "taken" ? "Already taken" : avail.reason}</span>}
        </div>
        <h2>Category (optional)</h2>
        <input className="input" placeholder="Food & beverage" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} />
      </div>
      <button className="btn btn-primary btn-big" disabled={!ok || busy} onClick={() => (account ? submit(account) : setUnlock(true))}>
        {busy ? <><span className="spinner" /> Registering on Whitechain…</> : "Register my shop"}
      </button>
      <div className="err">{err}</div>
      <div className="sub" style={{ textAlign: "center" }}>New shops start unverified. Verify with World ID to get the ✓ badge.</div>
      {unlock && <UnlockSheet title="Sign shop registration" subtitle={`${label}.whitepay.eth`} onUnlocked={submit} onCancel={() => setUnlock(false)} />}
    <BottomNav /></main>
  )
}

function Dashboard({ merchant, account, setAccount, onChange }: { merchant: Merchant; account: PrivateKeyAccount | null; setAccount: (a: PrivateKeyAccount | null) => void; onChange: () => void }) {
  const [worldMsg, setWorldMsg] = useState("")
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [req, setReq] = useState<Created | null>(null)
  const [qr, setQr] = useState("")
  const [status, setStatus] = useState<"pending" | "paid" | "depleted">("pending")
  const [paidTx, setPaidTx] = useState("")
  const [now, setNow] = useState(() => Date.now() / 1000)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState("0")
  const [unlock, setUnlock] = useState(false)
  const poll = useRef<ReturnType<typeof setInterval>>(undefined)

  const loadReceipts = useCallback(() =>
    fetch(`/api/receipts?merchant=${merchant.address}`).then((r) => r.json()).then((d) => { setRows(d.rows ?? []); setTotal(d.total ?? "0") }), [merchant.address])
  useEffect(() => {
    void loadReceipts()
    const t = setInterval(() => setNow(Date.now() / 1000), 500)
    return () => { clearInterval(t); clearInterval(poll.current) }
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
          merchantSig,
        }),
      })
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

  const validAmount = /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0
  const left = req ? Number(req.deadline) - now : 0

  return (
    <main className="shell with-nav">
      <TopBar back={null} right={<a className="chip" href="/">Customer mode</a>} />
      <div className="card row">
        <div>
          <div style={{ fontWeight: 700 }}>{merchant.displayName}</div>
          <div className="sub">{merchant.ensName}</div>
        </div>
        {merchant.verified ? <span className="badge badge-ok">✓ Verified</span> : <span className="badge badge-warn">Unverified</span>}
      </div>
      {!merchant.verified && (
        <div className="card stack">
          <div style={{ fontWeight: 700 }}>Get the ✓ Verified badge</div>
          <div className="sub">Prove a real, unique person runs this shop with World ID (one verified shop per human). Customers see the badge before they pay.</div>
          <WorldVerify
            purpose="shop"
            signal={merchant.address}
            label="Verify with World ID"
            className="btn btn-ghost"
            verify={async (proof) => {
              const r = await fetch("/api/world/verify", { method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ purpose: "merchant", address: merchant.address, result: proof }) })
              const d = await r.json()
              if (!r.ok) throw new Error(d.error)
              return d
            }}
            onVerified={() => { setWorldMsg("Verified ✓"); onChange() }}
            onDenied={(reason) => setWorldMsg(`Not verified: ${reason}`)}
          />
          {worldMsg && <div className="sub" style={{ textAlign: "center" }}>{worldMsg}</div>}
        </div>
      )}

      {!req || status !== "pending" ? (
        <div className="card stack">
          {status === "paid" && req && (
            <div className="result" style={{ padding: "8px 0" }}>
              <SuccessCheck />
              <h1>Received {usdt(req.amount)} USDT</h1>
              {paidTx && <a className="chip" href={paidTx} target="_blank" rel="noreferrer">View on Whitechain ↗</a>}
            </div>
          )}
          {status === "depleted" && <div className="badge badge-warn" style={{ alignSelf: "center" }}>Last request expired unpaid and was removed from Arkiv</div>}
          <h2>New payment request</h2>
          <input className="amount-input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          <div className="sub" style={{ textAlign: "center" }}>USDT · QR valid for 5 minutes</div>
          <button className="btn btn-primary btn-big" onClick={() => (account ? create(account) : setUnlock(true))} disabled={busy || !validAmount}>
            {busy ? <><span className="spinner" /> Signing order & writing to Arkiv…</> : account ? "Show QR" : "Unlock & show QR"}
          </button>
          <div className="err">{err}</div>
          {account && <button className="chip" style={{ alignSelf: "center" }} onClick={() => setAccount(null)}>Lock terminal</button>}
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
              <div><div className="t">{short(r.payer)}</div><div className="sub">{ago(r.paidAt)} · {r.kind === "p2p" ? "direct" : "QR"}</div></div>
              <div className="amt" style={{ color: "var(--ok)" }}>+{usdt(r.amount)}</div>
            </a>
          ))}
        </div>
      </div>
      {unlock && <UnlockSheet title="Unlock terminal" subtitle={`${amount} USDT request`} onUnlocked={create} onCancel={() => setUnlock(false)} />}
    <BottomNav /></main>
  )
}
