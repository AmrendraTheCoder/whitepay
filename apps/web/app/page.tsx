"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { isHex, type Hex } from "viem"
import { PinPad } from "./components"
import { BottomNav, ScanFab, Icon, avatarColor, initial, prettyName, useWalletData } from "./ui"
import { createWallet, enablePasskey, passkeySupported } from "@/lib/wallet"
import { usdt } from "@/lib/format"

export default function Home() {
  const data = useWalletData()
  if (data.wallet === undefined) return <main className="shell" />
  if (!data.wallet) return <Onboard onDone={() => location.reload()} />
  return <WalletHome {...data} wallet={data.wallet} />
}

// ------------------------------------------------------------ home (GPay)
function WalletHome({ wallet, bal, rows, name }: ReturnType<typeof useWalletData> & { wallet: NonNullable<ReturnType<typeof useWalletData>["wallet"]> }) {
  const me = wallet.address.toLowerCase()
  const people = useMemo(() => {
    const seen = new Map<string, { address: string; name?: string }>()
    for (const r of rows ?? []) {
      const incoming = r.merchant.toLowerCase() === me
      const other = incoming ? r.payer : r.merchant
      if (!seen.has(other.toLowerCase())) seen.set(other.toLowerCase(), { address: other, name: incoming ? undefined : r.merchantName })
    }
    return [...seen.values()].slice(0, 7)
  }, [rows, me])

  return (
    <main className="shell with-nav">
      <div className="searchbar">
        <a className="search" href="/send">{Icon.search()} Pay friends and merchants</a>
        <a className="avatar-btn" href="/you" aria-label="Your profile">{initial(name ?? undefined, "W")}</a>
      </div>

      <a className="hero" href={name ? "/money" : "/you#claim"}>
        <div className="label">USDT balance · Whitechain</div>
        <div className="big">{bal ? usdt(bal.usdt) : "…"}<small>USDT</small></div>
        <div className="meta">
          <span className="pill-lime">0 gas</span>
          <span>{name ?? "No WhitePay name yet"}</span>
        </div>
        <div className="cta">
          {name ? "View money" : "Claim your name"} <span className="circle">{Icon.arrow()}</span>
        </div>
      </a>

      <div className="tiles">
        <a className="tile" href="/scan"><div className="sq">{Icon.scan()}</div><span>Scan any QR code</span></a>
        <a className="tile" href="/send"><div className="sq">{Icon.pay()}</div><span>Pay anyone</span></a>
        <a className="tile" href="/receive"><div className="sq">{Icon.receive()}</div><span>Receive money</span></a>
        <a className="tile" href="/merchant"><div className="sq">{Icon.shop()}</div><span>Shop QR</span></a>
      </div>

      <div className="chips">
        <a className="chip-card" href="/money"><span className="ic">{Icon.balance()}</span><div><div className="t1">USDT balance</div><div className="t2">Check</div></div></a>
        <a className="chip-card" href="/transactions"><span className="ic">{Icon.history()}</span><div><div className="t1">Transactions</div><div className="t2">See all</div></div></a>
        <a className="chip-card" href="/you"><span className="ic">{Icon.id()}</span><div><div className="t1">WhitePay ID</div><div className="t2 link">{name ? "View" : "Claim"}</div></div></a>
      </div>

      <div className="section-title">Pay again</div>
      <div className="people">
        {rows === null && <div className="empty" style={{ gridColumn: "1 / -1" }}>Loading from Arkiv…</div>}
        {rows?.length === 0 && <div className="empty" style={{ gridColumn: "1 / -1" }}>People and shops you pay show up here.</div>}
        {people.map((p) => (
          <a key={p.address} className="person" href={`/send?to=${p.address}${p.name ? `&name=${p.name}` : ""}`}>
            <span className="pic" style={{ background: avatarColor(p.name ?? p.address) }}>{initial(p.name ?? p.address.slice(2))}</span>
            <span className="nm">{prettyName(p.name, p.address)}</span>
          </a>
        ))}
        {!!rows?.length && (
          <a className="person" href="/transactions">
            <span className="pic more">{Icon.chev(26)}</span>
            <span className="nm">More</span>
          </a>
        )}
      </div>

      <div className="section-title">Manage your money</div>
      <div className="menu-list">
        <a className="menu-row" href="/transactions"><span className="ic">{Icon.history()}</span>See transaction history<span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href="/money"><span className="ic">{Icon.balance()}</span>Check USDT balance<span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href="/receive"><span className="ic">{Icon.receive(24)}</span>Your QR code<span className="chev">{Icon.chev()}</span></a>
      </div>

      <ScanFab />
      <BottomNav />
    </main>
  )
}

// -------------------------------------------------------------- onboarding
function Onboard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"intro" | "pin" | "confirm" | "bio">("intro")
  const [first, setFirst] = useState("")
  const [pin, setPin] = useState("")
  const [err, setErr] = useState("")
  const [importPk, setImportPk] = useState("")
  const [showImport, setShowImport] = useState(false)
  const [bioOk, setBioOk] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { passkeySupported().then(setBioOk) }, [])

  const onFirst = useCallback((p: string) => { setFirst(p); setStep("confirm"); setErr("") }, [])
  const onConfirm = useCallback(async (p: string) => {
    if (p !== first) { setErr("PINs didn't match. Try again."); setStep("pin"); return }
    try {
      const pk = importPk.trim()
      if (pk && (!isHex(pk) || pk.length !== 66)) throw new Error("Imported key must be 0x + 64 hex characters")
      await createWallet(p, pk ? (pk as Hex) : undefined)
      setPin(p)
      setStep("bio")
    } catch (e) { setErr((e as Error).message); setStep("pin") }
  }, [first, importPk])

  const enableBio = async () => {
    setBusy(true); setErr("")
    try { await enablePasskey(pin); onDone() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <main className="shell">
      <div className="topbar"><span className="brand"><img src="/icon.svg" alt="" />WhitePay</span></div>
      {step === "intro" && (
        <>
          <div className="hero" style={{ minHeight: 260 }}>
            <div className="label">USDT payments on Whitechain</div>
            <div className="big" style={{ fontSize: 44, marginTop: 14 }}>Scan.<br />Verify.<br />Pay.</div>
            <div className="meta"><span className="pill-lime">0 gas</span><span>No seed phrase. Fingerprint or PIN.</span></div>
          </div>
          <div className="sub" style={{ fontSize: 15, padding: "0 4px" }}>
            Your key stays on this phone, encrypted and unlocked only by your fingerprint or a 6-digit PIN, just like UPI.
          </div>
          <button className="btn btn-primary btn-big" onClick={() => setStep("pin")}>Create my wallet</button>
          <button className="chip" style={{ alignSelf: "center" }} onClick={() => setShowImport((s) => !s)}>
            {showImport ? "Hide" : "Use an existing test key"}
          </button>
          {showImport && (
            <div className="card stack">
              <div className="sub">Paste a test private key (it is encrypted with your PIN and never leaves this device).</div>
              <input className="input mono" placeholder="0x…" value={importPk} onChange={(e) => setImportPk(e.target.value)} autoComplete="off" />
            </div>
          )}
        </>
      )}
      {(step === "pin" || step === "confirm") && (
        <div className="stack" style={{ marginTop: 24 }}>
          <div style={{ textAlign: "center", fontSize: 24, fontWeight: 700 }}>{step === "pin" ? "Set your WhitePay PIN" : "Confirm your PIN"}</div>
          <div className="sub" style={{ textAlign: "center" }}>6 digits, like your UPI PIN. Used when fingerprint isn't available.</div>
          <PinPad key={step} onComplete={step === "pin" ? onFirst : onConfirm} />
          <div className="err">{err}</div>
        </div>
      )}
      {step === "bio" && (
        <div className="stack" style={{ textAlign: "center", marginTop: 30 }}>
          <div style={{ margin: "0 auto", width: 96, height: 96, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--brand)", color: "#fff" }}>{Icon.finger(48)}</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Pay with your fingerprint?</div>
          <div className="sub">Your phone's fingerprint or Face ID encrypts your wallet key. You can always use your PIN.</div>
          {bioOk ? (
            <button className="btn btn-primary btn-big" onClick={enableBio} disabled={busy}>
              {busy ? <span className="spinner" /> : null} Enable fingerprint
            </button>
          ) : (
            <div className="sub">This browser doesn't support biometric key protection. PIN only.</div>
          )}
          <button className="btn btn-ghost" onClick={onDone}>{bioOk ? "Skip for now" : "Continue"}</button>
          <div className="err">{err}</div>
        </div>
      )}
    </main>
  )
}

