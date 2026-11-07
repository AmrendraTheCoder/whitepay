"use client"
import { useCallback, useEffect, useState } from "react"
import { isHex, type Hex } from "viem"
import { PinPad } from "./components"
import { Icon } from "./ui"
import { getWallet, createWallet, enablePasskey, passkeySupported, connectInjectedWallet, hasInjectedWallet, connectWalletConnect, setExternalPin, enableExternalPasskey } from "@/lib/wallet"
import { wcConfigured } from "@/lib/walletconnect"

// -------------------------------------------------------------- onboarding
export function Onboard({ onDone, adding = false, business = false, resumeExternal }: {
  onDone: () => void; adding?: boolean; business?: boolean
  /** an external wallet that is connected but has no WondrPay PIN yet: finish its setup first */
  resumeExternal?: string
}) {
  // ext* steps: an external wallet was just connected and gets its own WondrPay PIN / fingerprint
  const [step, setStep] = useState<"intro" | "pin" | "confirm" | "bio" | "extpin" | "extconfirm" | "extbio" | "welcome">(resumeExternal ? "extpin" : "intro")
  const [known, setKnown] = useState("") // username this wallet already has
  const [extAddr, setExtAddr] = useState(resumeExternal ?? "")
  const [showExternal, setShowExternal] = useState(false) // MetaMask options are tucked away: new people create a wallet
  const [first, setFirst] = useState("")
  const [pin, setPin] = useState("")
  const [err, setErr] = useState("")
  const [importPk, setImportPk] = useState("")
  const [showImport, setShowImport] = useState(false)
  const [bioOk, setBioOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [injected, setInjected] = useState(false)
  const [mobile, setMobile] = useState(false)
  // developer helper (import a raw test key): only on localhost or with ?dev=1, never shown to real people
  const [devTools, setDevTools] = useState(false)
  useEffect(() => {
    passkeySupported().then(setBioOk); setInjected(hasInjectedWallet())
    setMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
    setDevTools(/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || new URLSearchParams(location.search).get("dev") === "1")
  }, [])
  // No World ID or name step here: people get into the app first. The WondrPay name is claimed later from Home
  // (one tap, with World ID); World ID is only asked where it matters (name, cashback, refunds, large payments).
  const finish = () => (known ? (setStep("welcome"), setTimeout(onDone, 1600)) : onDone())
  /** MetaMask's own in-app browser: MetaMask is injected there, so no WalletConnect and no app switching */
  const inMetaMask = () => `https://metamask.app.link/dapp/${location.host}${location.pathname}${location.search}`

  /** Connect MetaMask without leaving Chrome: extension if present (desktop), otherwise WalletConnect. */
  const connect = async (via: "extension" | "walletconnect") => {
    setBusy(true); setErr("")
    try {
      const addr = via === "extension" ? await connectInjectedWallet() : await connectWalletConnect()
      setExtAddr(addr)
      // seen before? (a username is linked to it): no World ID / name steps again. But EVERY external wallet gets a
      // WondrPay PIN on this device right now, before anything else: payments ask for it before MetaMask signs.
      const who = await fetch(`/api/resolve?q=${addr}`).then((r) => r.json()).catch(() => null)
      const name = typeof who?.name === "string" && (who.kind === "person" || business) ? (who.name as string) : ""
      if (name) setKnown(name)
      const hasPin = getWallet()?.address?.toLowerCase() === addr.toLowerCase() && getWallet()?.hasPin
      if (hasPin) { if (name) { setStep("welcome"); setTimeout(onDone, 1600) } else finish(); return }
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
      <div className="topbar"><span className="brand"><img src="/icon.svg" alt="" />WondrPay</span>{adding && <a className="chip" href="/you">Cancel</a>}</div>
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
          <div className="sub center">Takes 20 seconds: set a 6-digit PIN, optionally your fingerprint. No seed phrase, no sign-up.</div>
          {!showExternal ? (
            <button className="chip self-center" onClick={() => setShowExternal(true)} aria-expanded={false}>I already use MetaMask</button>
          ) : (
            <div className="card stack" role="region" aria-label="Use MetaMask">
              <div className="sub">Use your MetaMask wallet with WondrPay. You'll still set a WondrPay PIN (and fingerprint, if you like) right after connecting: it's asked before MetaMask signs any payment.</div>
              {injected ? (
                <button className="btn btn-primary" onClick={() => connect("extension")} disabled={busy}>
                  {busy ? <span className="spinner" /> : null} {mobile ? "Connect MetaMask" : "Connect browser extension (MetaMask)"}
                </button>
              ) : mobile ? (
                <>
                  <a className="btn btn-primary" href={inMetaMask()}>Open WondrPay in MetaMask</a>
                  <div className="sub center">Most reliable on phones: WondrPay opens inside the MetaMask app and connects directly.</div>
                </>
              ) : null}
              {!injected && (
                <button className="btn btn-ghost" onClick={() => connect("walletconnect")} disabled={busy || !wcConfigured()}>
                  {busy ? <span className="spinner" /> : null} {mobile ? "Or connect with WalletConnect" : "Connect MetaMask app (WalletConnect QR)"}
                </button>
              )}
              {!injected && (
                <div className="sub center">
                  {wcConfigured()
                    ? "WondrPay stays open in this browser. MetaMask opens only to approve, then you come back here."
                    : "WalletConnect isn't configured on this server yet."}
                </div>
              )}
            </div>
          )}
          {err && step === "intro" && <div className="err">{err}</div>}
          {devTools && (
            <button className="chip self-center" onClick={() => setShowImport((s) => !s)}>
              {showImport ? "Hide" : "Use an existing test key"}
            </button>
          )}
          {devTools && showImport && (
            <div className="card stack">
              <div className="sub">Paste a test private key (it is encrypted with your PIN and never leaves this device).</div>
              <input className="input mono" placeholder="0x…" value={importPk} onChange={(e) => setImportPk(e.target.value)} autoComplete="off" />
            </div>
          )}
        </>
      )}
      {(step === "pin" || step === "confirm") && (
        <div className="stack mt-6">
          <div className="title center">{step === "pin" ? "Set your WondrPay PIN" : "Confirm your PIN"}</div>
          <div className="sub center">6 digits, like your UPI PIN. Used when fingerprint isn't available.</div>
          <PinPad key={step} onComplete={step === "pin" ? onFirst : onConfirm} error={err} label={step === "pin" ? "new PIN" : "PIN again"} />
          <div className="err">{err}</div>
        </div>
      )}
      {step === "bio" && (
        <div className="stack center mt-8">
          <div className="hero-icon">{Icon.finger(48)}</div>
          <div className="title">Pay with your fingerprint?</div>
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
        <div className="stack mt-6">
          <div className="title center">{step === "extpin" ? "Set your WondrPay PIN" : "Confirm your PIN"}</div>
          <div className="sub center">{resumeExternal && step === "extpin" ? "One step left before you can use WondrPay. " : ""}Connected {extAddr.slice(0, 6)}…{extAddr.slice(-4)}. WondrPay asks for this PIN before MetaMask signs any payment.</div>
          <PinPad key={step} onComplete={step === "extpin" ? onExtFirst : onExtConfirm} error={err} label={step === "extpin" ? "new PIN" : "PIN again"} />
          <div className="err">{err}</div>
        </div>
      )}
      {step === "extbio" && (
        <div className="stack center mt-8">
          <div className="hero-icon">{Icon.finger(48)}</div>
          <div className="title">Confirm payments with your fingerprint?</div>
          <div className="sub">Before MetaMask is asked to sign, WondrPay checks your fingerprint or Face ID. Your PIN always works too.</div>
          {bioOk && <button className="btn btn-primary btn-big" onClick={enableExtBio} disabled={busy}>{busy ? <span className="spinner" /> : null} Enable fingerprint</button>}
          <button className="btn btn-ghost" onClick={finish}>{bioOk ? "Skip for now" : "Continue"}</button>
          <div className="err">{err}</div>
        </div>
      )}
      {step === "welcome" && (
        <div className="stack center" style={{ marginTop: 48 }}>
          <div className="hero-icon">{Icon.check(48)}</div>
          <div className="title">Welcome back</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{known}</div>
          <div className="sub">This wallet is already linked to your WondrPay name. Nothing to verify.</div>
        </div>
      )}
    </main>
  )
}

