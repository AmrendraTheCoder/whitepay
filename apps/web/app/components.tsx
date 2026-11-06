"use client"
import { WalletWait } from "./processing"
import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { getAddress, toHex } from "viem"
import { stepUpSignal } from "@whitepay/shared"
import { paySecurity } from "@/lib/security"
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts"
import { restoreSession } from "@/lib/session"
import { getWallet, unlockWithPasskey, unlockWithPin, pinLockout, isExternal, externalSigner, verifyExternalPin, verifyExternalPasskey, setExternalPin, type WalletInfo } from "@/lib/wallet"

// World ID widget only loads when a payment actually needs the scan
const WorldVerify = dynamic(() => import("./world").then((m) => m.WorldVerify), { ssr: false })

export function TopBar({ right, back = "/app" }: { right?: React.ReactNode; back?: string | null }) {
  return (
    <div className="topbar">
      <div className="brand">
        {back !== null && (
          <a href={back} aria-label="Back" style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: "50%", background: "var(--surface-2)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
          </a>
        )}
        <img src="/icon.svg" alt="" />
        <span className="brand-name">WondrPay<small>on Whitechain</small></span>
      </div>
      {right}
    </div>
  )
}

const KEYS: [string, string][] = [["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"]]
const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p) } catch {} }

/**
 * 6-digit PIN pad (UPI style).
 *  - tap keys, type on a keyboard (digits, Backspace, Enter), or paste a PIN
 *  - each digit shows for a moment as it's typed; the eye shows / hides the whole PIN
 *  - long-press ⌫ clears everything
 *  - `busy`: keys lock and the dots pulse while the PIN is checked
 *  - `error`: a NEW error message shakes the dots, turns them red, buzzes and clears the entry
 *  - `onBiometric`: a fingerprint key in the bottom-left corner
 * Screen readers hear "3 of 6 digits entered" and the error.
 */
export function PinPad({ length = 6, onComplete, busy, error, onBiometric, label = "PIN" }: {
  length?: number
  onComplete: (pin: string) => void
  busy?: boolean
  error?: string
  onBiometric?: () => void
  label?: string
}) {
  const [pin, setPin] = useState("")
  const [show, setShow] = useState(false)
  const [peek, setPeek] = useState(-1) // index of the digit shown for a moment
  const [shake, setShake] = useState(0)
  const peekT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const done = useRef(false)

  useEffect(() => {
    if (pin.length === length && !done.current) {
      done.current = true
      onComplete(pin)
      // keep the full dots on screen while it's checked; clear a moment later
      setTimeout(() => { setPin(""); done.current = false }, 160)
    }
  }, [pin, length, onComplete])

  // a new error: shake, buzz, clear
  useEffect(() => {
    if (!error) return
    setShake((n) => n + 1); setPin(""); buzz([40, 50, 40])
  }, [error])

  const add = (d: string) => {
    if (busy || done.current) return
    setPin((p) => {
      if (p.length >= length) return p
      setPeek(p.length)
      if (peekT.current) clearTimeout(peekT.current)
      peekT.current = setTimeout(() => setPeek(-1), 550)
      return p + d
    })
    buzz(6)
  }
  const del = () => { if (!busy) { setPin((p) => p.slice(0, -1)); setPeek(-1); buzz(4) } }
  const clear = () => { if (!busy) { setPin(""); setPeek(-1); buzz(12) } }

  // physical keyboard + paste (only while this pad is on screen)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); add(e.key) }
      else if (e.key === "Backspace") { e.preventDefault(); del() }
      else if (e.key === "Escape") clear()
    }
    const onPaste = (e: ClipboardEvent) => {
      const digits = (e.clipboardData?.getData("text") ?? "").replace(/\D/g, "").slice(0, length)
      if (!digits || busy) return
      e.preventDefault()
      setPin(digits); buzz(8)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("paste", onPaste)
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("paste", onPaste) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, length])
  useEffect(() => () => { if (peekT.current) clearTimeout(peekT.current); if (holdT.current) clearTimeout(holdT.current) }, [])

  const state = busy ? "busy" : error && !pin ? "bad" : ""
  return (
    <div className={`pin ${state}`} role="group" aria-label={`Enter your ${length}-digit ${label}`}>
      <div className="pin-head">
        <div key={shake} className={`dots ${shake && state === "bad" ? "shake" : ""}`} aria-hidden>
          {Array.from({ length }, (_, i) => {
            const filled = i < pin.length
            const digit = filled && (show || i === peek) ? pin[i] : ""
            return <span key={i} className={`${filled ? "on" : ""} ${digit ? "num" : ""}`}>{digit}</span>
          })}
        </div>
        <button type="button" className="pin-eye" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={show ? `Hide ${label}` : `Show ${label}`}>
          {show
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.6 7.6A17 17 0 0 0 2.5 12S6 18 12 18a9 9 0 0 0 4.4-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" /><circle cx="12" cy="12" r="3" /></svg>}
        </button>
      </div>
      <div className="pin-status" aria-live="polite">
        {busy ? <><span className="spinner" aria-hidden /> Checking…</> : <span className="sr-only">{pin.length} of {length} digits entered</span>}
      </div>
      <div className="pinpad">
        {KEYS.map(([d, letters]) => (
          <button key={d} type="button" onClick={() => add(d)} disabled={busy} aria-label={d}>
            <span className="k-d">{d}</span>{letters && <span className="k-l" aria-hidden>{letters}</span>}
          </button>
        ))}
        {onBiometric ? (
          <button type="button" className="k-alt" onClick={onBiometric} disabled={busy} aria-label="Use fingerprint or Face ID">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7.5 18.5c1-1.8 1.5-3.8 1.5-6a3 3 0 0 1 6 0c0 1.2-.1 2.3-.3 3.4M12 12.5c0 3.3-.8 6.2-2.4 8.5M18 16c.3-1.2.5-2.3.5-3.5a6.5 6.5 0 0 0-11.7-3.9M5.6 15.5c.3-1 .4-2 .4-3" /></svg>
          </button>
        ) : <span aria-hidden />}
        <button type="button" onClick={() => add("0")} disabled={busy} aria-label="0"><span className="k-d">0</span></button>
        <button type="button" className="k-alt" aria-label="Delete (hold to clear)" disabled={busy || !pin.length}
          onClick={del}
          onPointerDown={() => { holdT.current = setTimeout(() => { clear(); holdT.current = null }, 550) }}
          onPointerUp={() => { if (holdT.current) clearTimeout(holdT.current) }}
          onPointerLeave={() => { if (holdT.current) clearTimeout(holdT.current) }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round"><path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" /><path d="m12 9 5 6M17 9l-5 6" /></svg>
        </button>
      </div>
    </div>
  )
}

/** Bottom sheet: fingerprint/Face ID first (if set up), PIN fallback. Resolves to the unlocked account. */
/** Payment confirmation sheet. EVERY wallet is guarded by WondrPay's own PIN / fingerprint first:
 *  - device wallet: fingerprint (passkey PRF) or PIN decrypts the on-device key
 *  - external wallet (MetaMask extension / WalletConnect): fingerprint or WondrPay PIN, THEN the wallet signs */
export function UnlockSheet({
  title,
  subtitle,
  onUnlocked,
  onCancel,
  wallet,
  payment,
}: {
  title: string
  subtitle?: string
  onUnlocked: (account: PrivateKeyAccount) => void
  onCancel: () => void
  /** sign with this wallet instead of the active one (e.g. a verified wallet co-signing a new account) */
  wallet?: WalletInfo
  /** this sheet authorizes moving money: apply the wallet's payment security (You → Payment security) */
  payment?: { amountMicro: bigint }
}) {
  const w = wallet ?? getWallet()
  const external = isExternal(w)
  const sec = paySecurity(w?.address)
  // "every": a payment never rides on the 15-minute unlock; it asks for the PIN / fingerprint itself
  const fresh = !!payment && sec.confirm === "every"
  const needWorld = !!payment && sec.worldAboveUsd !== null && payment.amountMicro >= BigInt(Math.round(sec.worldAboveUsd * 1e6))
  const [paymentRef] = useState(() => toHex(crypto.getRandomValues(new Uint8Array(16))))
  const pendingAcct = useRef<PrivateKeyAccount | null>(null)
  /** PIN / fingerprint passed: World ID next if this payment is large, else hand the account over */
  const finish = (a: PrivateKeyAccount) => {
    if (!needWorld) return onUnlocked(a)
    pendingAcct.current = a
    setErr("")
    setMode("world")
  }
  // already unlocked this session? then don't ask for the PIN / fingerprint again
  // unlocked earlier (this tab or another one, e.g. after coming back from MetaMask)? then no PIN again.
  // undefined = still checking (an async decrypt for device wallets, a few ms)
  const [session, setSession] = useState<{ address: string; pk?: `0x${string}` } | null | undefined>(undefined)
  type Mode = "passkey" | "pin" | "setpin" | "confirmpin" | "wallet" | "world"
  const [mode, setMode] = useState<Mode>("pin")
  const [firstPin, setFirstPin] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  const walletName = w?.kind === "walletconnect" ? "MetaMask" : "your wallet"

  const tryWallet = async () => {
    if (!w) return
    setBusy(true)
    setErr("")
    try {
      // the external wallet only signs a message; it is never asked to send a transaction
      finish((await externalSigner(w)) as unknown as PrivateKeyAccount)
    } catch (e) {
      const m = (e as Error).message
      setErr(/reject|denied|4001|User rejected/i.test(m) ? "Request rejected in your wallet" : m.split("\n")[0])
    } finally {
      setBusy(false)
    }
  }

  // auto = opened by the sheet itself, not a tap. iPhone Safari only shows a passkey prompt right after a tap, so an
  // automatic attempt can fail through no fault of the person: then just wait for their tap on the button (no error,
  // no fall-back to the PIN pad), which was the "fingerprint fails the first time" bug.
  const tryPasskey = async (auto = false) => {
    setBusy(true)
    setErr("")
    try {
      if (external) { await verifyExternalPasskey(w!.address); setMode("wallet"); setBusy(false); void tryWallet(); return }
      finish(await unlockWithPasskey(w?.address))
    } catch (e) {
      const notAllowed = /NotAllowed|not allowed|user gesture|activation/i.test(`${(e as Error).name} ${(e as Error).message}`)
      if (auto && notAllowed) { setMode("passkey"); return } // wait for the tap on "Confirm with fingerprint"
      setErr(notAllowed ? "Fingerprint cancelled. Try again or use your PIN." : (e as Error).message)
      setMode("pin")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let live = true
    void restoreSession(w?.address ?? "").then((raw) => {
      if (!live) return
      const s = !fresh && raw && (external || raw.pk) ? raw : null // a device wallet is unlocked only if we have its key
      const m: Mode = external && s ? "wallet" : external && !w?.hasPin ? "setpin" : w?.hasPasskey ? "passkey" : "pin"
      setSession(s); setMode(m)
      // (an effect may only return a cleanup function, so never `return onUnlocked(...)` here)
      if (s?.pk && !external) { finish(privateKeyToAccount(s.pk)); return }
      if (s && external) { void tryWallet(); return }
      // try the fingerprint straight away where the browser allows it (it must follow a tap on iPhone)
      if (m === "passkey" && (navigator as any).userActivation?.isActive !== false) void tryPasskey(true)
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onPin = async (pin: string) => {
    setBusy(true)
    setErr("")
    try {
      if (external) { await verifyExternalPin(w!.address, pin); setMode("wallet"); setBusy(false); void tryWallet(); return }
      finish(await unlockWithPin(pin, w?.address))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onSetPin = async (pin: string) => {
    if (mode === "setpin") { setFirstPin(pin); setMode("confirmpin"); setErr(""); return }
    if (pin !== firstPin) { setErr("PINs didn't match. Try again."); setMode("setpin"); return }
    try {
      await setExternalPin(w!.address, pin)
      setMode("wallet")
      void tryWallet()
    } catch (e) { setErr((e as Error).message) }
  }

  const locked = pinLockout(w?.address) > 0
  if (session === undefined || (session && !external && mode !== "world")) return null
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {subtitle && <div className="sub center">{subtitle}</div>}
        {mode === "world" && w ? (
          <>
            <div className="sub center">This payment is at or above your ${sec.worldAboveUsd} World ID limit. Confirm it's you with World App{external ? `, then approve it in ${walletName}` : ""}.</div>
            <WorldVerify
              purpose="pay"
              paymentRef={paymentRef}
              address={w.address}
              onRepeat={async () => {
                // World refused a repeat one-time check: this wallet's person already passed World ID, so it passes
                const r = await fetch("/api/world/verify", { method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ purpose: "step-up", address: w.address, paymentRef, known: true }) })
                const d = await r.json()
                if (!r.ok) throw new Error(d.error)
                return d
              }}
              signal={stepUpSignal(getAddress(w.address), paymentRef)}
              label="Confirm with World ID"
              className="btn btn-primary btn-big"
              verify={async (proof) => {
                const r = await fetch("/api/world/verify", { method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ purpose: "step-up", address: w.address, paymentRef, result: proof }) })
                const d = await r.json()
                if (!r.ok) throw new Error(d.error)
                return d
              }}
              onVerified={() => { const a = pendingAcct.current; pendingAcct.current = null; if (a) onUnlocked(a) }}
              onDenied={(reason) => setErr(reason)}
            />
            <div className="sub center">Change this limit under You → Payment security.</div>
          </>
        ) : mode === "wallet" ? (
          <>
            <div className="sub center">Verified. Now approve the signature in {walletName}. It costs no gas.</div>
            {busy ? <WalletWait /> : (
              <button className="btn btn-primary btn-big" onClick={tryWallet}>Confirm in {walletName}</button>
            )}
          </>
        ) : mode === "passkey" ? (
          <button className="btn btn-primary btn-big" onClick={() => tryPasskey()} disabled={busy}>
            {busy ? <span className="spinner" /> : null} Confirm with fingerprint
          </button>
        ) : mode === "setpin" || mode === "confirmpin" ? (
          <>
            <div className="sub center">
              {mode === "setpin" ? "Set a 6-digit WondrPay PIN for this wallet. You'll enter it before every payment." : "Confirm your WondrPay PIN"}
            </div>
            <PinPad key={mode} onComplete={onSetPin} busy={busy} error={err} label="new PIN" />
          </>
        ) : (
          <>
            <div className="sub center">Enter your 6-digit WondrPay PIN</div>
            {!locked && <PinPad onComplete={onPin} busy={busy} error={err} onBiometric={w?.hasPasskey ? () => { setMode("passkey"); void tryPasskey() } : undefined} />}
          </>
        )}
        <div className="err">{err}</div>
        <div className="row">
          {w?.hasPasskey && mode === "pin" ? (
            <button className="chip" onClick={() => { setMode("passkey"); void tryPasskey() }}>Use fingerprint</button>
          ) : mode === "passkey" ? (
            <button className="chip" onClick={() => setMode("pin")}>Use PIN instead</button>
          ) : <span />}
          <button className="chip" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
