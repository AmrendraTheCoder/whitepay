"use client"
import { useCallback, useEffect, useState } from "react"
import { isHex, type Hex } from "viem"
import { PinPad } from "./components"
import { Icon } from "./ui"
import { createWallet, enablePasskey, passkeySupported, connectInjectedWallet, hasInjectedWallet, metamaskDeepLink } from "@/lib/wallet"

// -------------------------------------------------------------- onboarding
export function Onboard({ onDone, adding = false }: { onDone: () => void; adding?: boolean }) {
  const [step, setStep] = useState<"intro" | "pin" | "confirm" | "bio">("intro")
  const [first, setFirst] = useState("")
  const [pin, setPin] = useState("")
  const [err, setErr] = useState("")
  const [importPk, setImportPk] = useState("")
  const [showImport, setShowImport] = useState(false)
  const [bioOk, setBioOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [injected, setInjected] = useState(false)
  useEffect(() => { passkeySupported().then(setBioOk); setInjected(hasInjectedWallet()) }, [])

  const connect = async () => {
    // no wallet in this browser (e.g. Safari/Chrome on a phone): reopen this page inside MetaMask
    if (!hasInjectedWallet()) { location.href = metamaskDeepLink(location.pathname + location.search); return }
    setBusy(true); setErr("")
    try { await connectInjectedWallet(); onDone() } catch (e) { setErr((e as Error).message.split("\n")[0]) } finally { setBusy(false) }
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
    try { await enablePasskey(pin); onDone() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
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
          <button className="btn btn-ghost" onClick={connect} disabled={busy}>
            {busy ? <span className="spinner" /> : null} {injected ? "Connect existing wallet (MetaMask…)" : "Open in MetaMask app to connect"}
          </button>
          {!injected && <div className="sub" style={{ textAlign: "center" }}>This opens WhitePay inside the MetaMask app. Tap Connect there; your MetaMask address is added as a WhitePay wallet.</div>}
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
          <button className="btn btn-ghost" onClick={onDone}>{bioOk ? "Skip for now" : "Continue"}</button>
          <div className="err">{err}</div>
        </div>
      )}
    </main>
  )
}

