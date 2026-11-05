"use client"
import { useCallback, useEffect, useState } from "react"
import { isHex, type Hex } from "viem"
import { TopBar, PinPad, UnlockSheet } from "./components"
import { WorldVerify } from "./world"
import { nameClaimMessage, LABEL_RE } from "@whitepay/shared"
import type { PrivateKeyAccount } from "viem/accounts"
import { createWallet, enablePasskey, getWallet, passkeySupported, removeWallet } from "@/lib/wallet"
import { usdt, short, ago } from "@/lib/format"

type Receipt = { key: string; merchantName?: string; merchant: string; payer: string; amount: string; paidAt: number; explorer: string; kind: string }

export default function Home() {
  const [wallet, setWallet] = useState<ReturnType<typeof getWallet>>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setWallet(getWallet())
    setReady(true)
  }, [])
  if (!ready) return <main className="shell"><TopBar /></main>
  return wallet ? <Wallet wallet={wallet} onChange={() => setWallet(getWallet())} /> : <Onboard onDone={() => setWallet(getWallet())} />
}

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
      <TopBar />
      {step === "intro" && (
        <>
          <div className="card stack" style={{ padding: 24 }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15 }}>Scan. Verify. Pay.</div>
            <div className="sub" style={{ fontSize: 15 }}>
              UPI-style payments in USDT on Whitechain. No gas fees, no seed phrase. Your key stays on this phone,
              locked by your fingerprint or PIN.
            </div>
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
        <div className="card stack">
          <h2 style={{ textAlign: "center", color: "var(--text)", fontSize: 18 }}>
            {step === "pin" ? "Set a 6-digit PIN" : "Confirm your PIN"}
          </h2>
          <div className="sub" style={{ textAlign: "center" }}>Like your UPI PIN. Used when fingerprint isn't available.</div>
          <PinPad key={step} onComplete={step === "pin" ? onFirst : onConfirm} />
          <div className="err">{err}</div>
        </div>
      )}
      {step === "bio" && (
        <div className="card stack" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>☝︎</div>
          <h2 style={{ color: "var(--text)", fontSize: 18 }}>Unlock payments with your fingerprint?</h2>
          <div className="sub">Your phone's fingerprint or Face ID will encrypt your wallet key. You can always use your PIN.</div>
          {bioOk ? (
            <button className="btn btn-primary" onClick={enableBio} disabled={busy}>
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

function Wallet({ wallet, onChange }: { wallet: NonNullable<ReturnType<typeof getWallet>>; onChange: () => void }) {
  const [bal, setBal] = useState<{ usdt: string; wbt: string } | null>(null)
  const [rows, setRows] = useState<Receipt[] | null>(null)
  const [copied, setCopied] = useState(false)

  const [myName, setMyName] = useState<string | null | undefined>(undefined)
  const loadName = useCallback(() =>
    fetch(`/api/resolve?q=${wallet.address}`).then((r) => r.json()).then((d) => setMyName(d.name ?? null)).catch(() => setMyName(null)), [wallet.address])
  useEffect(() => { void loadName() }, [loadName])
  useEffect(() => {
    fetch(`/api/balance?address=${wallet.address}`).then((r) => r.json()).then((b) => !b.error && setBal(b))
    fetch(`/api/receipts?account=${wallet.address}`).then((r) => r.json()).then((d) => setRows(d.rows ?? []))
  }, [wallet.address])

  return (
    <main className="shell">
      <TopBar right={<a className="chip" href="/merchant">Merchant mode</a>} />
      <div className="card">
        <div className="row">
          <h2>Balance</h2>
          <span className="badge badge-ok">0 gas needed</span>
        </div>
        <div className="balance">{bal ? usdt(bal.usdt) : "…"}<small>USDT</small></div>
        {myName && <div style={{ fontWeight: 650, marginTop: 6 }}>{myName}</div>}
        <button
          className="sub mono"
          style={{ background: "none", border: 0, padding: 0, marginTop: 8, cursor: "pointer", textAlign: "left" }}
          onClick={() => { navigator.clipboard?.writeText(wallet.address); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        >
          {copied ? "Copied ✓" : `${short(wallet.address)} · tap to copy`}
        </button>
      </div>

      {myName === null && <ClaimName address={wallet.address} onClaimed={loadName} />}

      <a className="btn btn-primary btn-big" href="/scan">⌗ Scan & Pay</a>
      <div className="actions">
        <a className="btn btn-ghost" href="/receive">↓ Receive</a>
        <a className="btn btn-ghost" href="/send">↑ Pay a person</a>
      </div>

      <div className="card">
        <h2>Recent activity</h2>
        <div className="list">
          {rows === null && <div className="empty">Loading from Arkiv…</div>}
          {rows?.length === 0 && <div className="empty">No payments yet. Scan a merchant QR to pay.</div>}
          {rows?.map((r) => {
            const incoming = r.merchant.toLowerCase() === wallet.address.toLowerCase()
            return (
              <a key={r.key} className="item" href={r.explorer} target="_blank" rel="noreferrer">
                <div>
                  <div className="t">{incoming ? `From ${short(r.payer)}` : r.merchantName ?? short(r.merchant)}</div>
                  <div className="sub">{ago(r.paidAt)} · {r.kind === "p2p" ? "person" : "merchant QR"} · receipt on Arkiv</div>
                </div>
                <div className="amt" style={incoming ? { color: "var(--ok)" } : undefined}>{incoming ? "+" : "−"}{usdt(r.amount)}</div>
              </a>
            )
          })}
        </div>
      </div>

      <div className="row" style={{ justifyContent: "center", gap: 8 }}>
        <span className="sub">{wallet.hasPasskey ? "☝︎ Fingerprint on" : "PIN only"}</span>
        <button
          className="chip"
          onClick={() => { if (confirm("Remove this wallet from the device? Funds are lost unless you have the key.")) { removeWallet(); onChange() } }}
        >
          Reset wallet
        </button>
      </div>
    </main>
  )
}

/** UPI VPA, on ENS: claim <name>.whitepay.eth. One per human (World ID), proven wallet control (signature). */
function ClaimName({ address, onClaimed }: { address: `0x${string}`; onClaimed: () => void }) {
  const [label, setLabel] = useState("")
  const [avail, setAvail] = useState<{ available: boolean; reason?: string | null } | null>(null)
  const [unlock, setUnlock] = useState(false)
  const [signed, setSigned] = useState<{ issuedAt: number; signature: string } | null>(null)
  const [msg, setMsg] = useState("")

  useEffect(() => {
    setAvail(null); setSigned(null)
    if (!label) return
    if (!LABEL_RE.test(label)) { setAvail({ available: false, reason: "3-32 chars: a-z, 0-9, hyphen" }); return }
    const t = setTimeout(() => fetch(`/api/names?label=${label}`).then((r) => r.json()).then(setAvail).catch(() => {}), 350)
    return () => clearTimeout(t)
  }, [label])

  const sign = async (acct: PrivateKeyAccount) => {
    setUnlock(false)
    const issuedAt = Math.floor(Date.now() / 1000)
    const signature = await acct.signMessage({ message: nameClaimMessage({ label, address: acct.address, issuedAt }) })
    setSigned({ issuedAt, signature })
  }

  return (
    <div className="card stack">
      <h2>Claim your WhitePay name</h2>
      <div className="sub">Friends pay <b>you.whitepay.eth</b> instead of a long address. One name per person, verified with World ID.</div>
      <div className="row" style={{ gap: 6 }}>
        <input className="input" placeholder="ravi" value={label} autoCapitalize="none" onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
        <span className="sub" style={{ whiteSpace: "nowrap" }}>.whitepay.eth</span>
      </div>
      <div className="sub" style={{ minHeight: 18 }}>
        {avail === null ? "" : avail.available ? <span style={{ color: "var(--ok)" }}>✓ available</span> : <span style={{ color: "var(--bad)" }}>{avail.reason}</span>}
      </div>
      {!signed ? (
        <button className="btn btn-ghost" disabled={!avail?.available} onClick={() => setUnlock(true)}>1. Sign with fingerprint / PIN</button>
      ) : (
        <WorldVerify
          action="ens-claim"
          signal={address}
          label="2. Verify with World ID & claim"
          verify={async (proof) => {
            const r = await fetch("/api/names", { method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ label, address, issuedAt: signed.issuedAt, signature: signed.signature, result: proof }) })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            return d
          }}
          onVerified={(d) => { setMsg(`You are ${d?.name ?? label + ".whitepay.eth"} ✓`); onClaimed() }}
          onDenied={(reason) => setMsg(`Name not claimed: ${reason}`)}
        />
      )}
      {msg && <div className="sub" style={{ textAlign: "center" }}>{msg}</div>}
      {unlock && <UnlockSheet title="Sign name claim" subtitle={`${label}.whitepay.eth`} onUnlocked={sign} onCancel={() => setUnlock(false)} />}
    </div>
  )
}
