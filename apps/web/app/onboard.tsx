"use client"
import { useCallback, useEffect, useState } from "react"
import { isHex, type Hex } from "viem"
import { PinPad } from "./components"
import { Icon } from "./ui"
import { ClaimName } from "./claim-name"
import { getWallet, createWallet, enablePasskey, passkeySupported, connectInjectedWallet, hasInjectedWallet, connectWalletConnect, setExternalPin, enableExternalPasskey } from "@/lib/wallet"
import { wcConfigured } from "@/lib/walletconnect"

// -------------------------------------------------------------- onboarding
export function Onboard({ onDone, adding = false, business = false }: { onDone: () => void; adding?: boolean; business?: boolean }) {
  // ext* steps: an external wallet was just connected and gets its own WhitePay PIN / fingerprint
  const [step, setStep] = useState<"intro" | "pin" | "confirm" | "bio" | "extpin" | "extconfirm" | "extbio" | "name">("intro")
  const [extAddr, setExtAddr] = useState("")
  const [first, setFirst] = useState("")
  const [pin, setPin] = useState("")
  const [err, setErr] = useState("")
  const [importPk, setImportPk] = useState("")
  const [showImport, setShowImport] = useState(false)
  const [bioOk, setBioOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [injected, setInjected] = useState(false)
  useEffect(() => { passkeySupported().then(setBioOk); setInjected(hasInjectedWallet()) }, [])
  // World ID happens once, here at account creation: personal wallets claim their name now
  // (shops verify in shop signup). Payments never ask for World ID.
  const finish = () => (business ? onDone() : setStep("name"))

  /** Connect MetaMask without leaving Chrome: extension if present (desktop), otherwise WalletConnect. */
  const connect = async (via: "extension" | "walletconnect") => {
    setBusy(true); setErr("")
    try {
      const addr = via === "extension" ? await connectInjectedWallet() : await connectWalletConnect()
      setExtAddr(addr)
      setStep("extpin")
    } catch (e) {
      const m = (e as Error).message
      setErr(/reject|denied|closed|4001/i.test(m) ? "Connection cancelled" : m.split("\n")[0])
    } finally { setBusy(false) }
  }
  const onExtFirst = useCallback((p: string) => { setFirst(p); setStep("extconfirm"); setErr("") }, [])
  const onExtConfirm = useCallback(async (p: string) => {
    if (p !== first) { setErr("PINs didn't match. Try again."); setStep("extpin"); return }
    try { await setExternalPin(extAddr, p); setPin(p); setStep("extbio") } catch (e) { setErr((e as Error).message); setStep("extpin") }
  }, [first, extAddr])
  const enableExtBio = async () => {
    setBusy(true); setErr("")
    try { await enableExternalPasskey(extAddr, pin); finish() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

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
    try { await enablePasskey(pin); finish() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <main className="shell">
      <div className="topbar"><span className="brand"><img src="/icon.svg" alt="" />WhitePay</span>{adding && <a className="chip" href="/you">Cancel</a>}</div>
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
          <button className="btn btn-primary btn-big" onClick={() => setStep("pin")}>{adding ? "Create another wallet" : "Create my wallet"}</button>
          {injected && (
            <button className="btn btn-ghost" onClick={() => connect("extension")} disabled={busy}>
              {busy ? <span className="spinner" /> : null} Connect browser extension (MetaMask)
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => connect("walletconnect")} disabled={busy || !wcConfigured()}>
            {busy ? <span className="spinner" /> : null} Connect MetaMask app (WalletConnect)
          </button>
          <div className="sub" style={{ textAlign: "center" }}>
            {wcConfigured()
              ? "WhitePay stays open in this browser. MetaMask opens only to approve, then you come back here."
              : "WalletConnect isn't configured on this server yet."}
          </div>
          {err && step === "intro" && <div className="err">{err}</div>}
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
          <button className="btn btn-ghost" onClick={finish}>{bioOk ? "Skip for now" : "Continue"}</button>
          <div className="err">{err}</div>
        </div>
      )}
      {(step === "extpin" || step === "extconfirm") && (
        <div className="stack" style={{ marginTop: 24 }}>
          <div style={{ textAlign: "center", fontSize: 24, fontWeight: 700 }}>{step === "extpin" ? "Set your WhitePay PIN" : "Confirm your PIN"}</div>
          <div className="sub" style={{ textAlign: "center" }}>Connected {extAddr.slice(0, 6)}…{extAddr.slice(-4)}. WhitePay asks for this PIN before MetaMask signs any payment.</div>
          <PinPad key={step} onComplete={step === "extpin" ? onExtFirst : onExtConfirm} />
          <div className="err">{err}</div>
        </div>
      )}
      {step === "extbio" && (
        <div className="stack" style={{ textAlign: "center", marginTop: 30 }}>
          <div style={{ margin: "0 auto", width: 96, height: 96, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--brand)", color: "#fff" }}>{Icon.finger(48)}</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Confirm payments with your fingerprint?</div>
          <div className="sub">Before MetaMask is asked to sign, WhitePay checks your fingerprint or Face ID. Your PIN always works too.</div>
          {bioOk && <button className="btn btn-primary btn-big" onClick={enableExtBio} disabled={busy}>{busy ? <span className="spinner" /> : null} Enable fingerprint</button>}
          <button className="btn btn-ghost" onClick={finish}>{bioOk ? "Skip for now" : "Continue"}</button>
          <div className="err">{err}</div>
        </div>
      )}
      {step === "name" && (
        <div className="stack" style={{ marginTop: 18 }}>
          <div style={{ textAlign: "center", fontSize: 22, fontWeight: 700 }}>Last step: your WhitePay name</div>
          <div className="sub" style={{ textAlign: "center" }}>Verify you're a real person with World ID once, now. Payments never ask for it.</div>
          <ClaimName address={getWallet()!.address as `0x${string}`} onClaimed={() => setTimeout(onDone, 1200)} />
          <button className="btn btn-ghost" onClick={onDone}>Skip, use my address only</button>
        </div>
      )}
    </main>
  )
}

