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

export function PinPad({ length = 6, onComplete, busy }: { length?: number; onComplete: (pin: string) => void; busy?: boolean }) {
  const [pin, setPin] = useState("")
  useEffect(() => {
    if (pin.length === length) {
      onComplete(pin)
      setPin("")
    }
  }, [pin, length, onComplete])
  const press = (d: string) => !busy && setPin((p) => (p.length < length ? p + d : p))
  return (
    <div>
      <div className="dots" aria-label={`${pin.length} of ${length} digits`}>
        {Array.from({ length }, (_, i) => (
          <span key={i} className={i < pin.length ? "on" : ""} />
        ))}
      </div>
      <div className="pinpad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => press("0")}>
          0
        </button>
        <button type="button" aria-label="Delete" onClick={() => setPin((p) => p.slice(0, -1))}>
          ⌫
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

  const tryPasskey = async () => {
    setBusy(true)
    setErr("")
    try {
      if (external) { await verifyExternalPasskey(w!.address); setMode("wallet"); setBusy(false); void tryWallet(); return }
      finish(await unlockWithPasskey(w?.address))
    } catch (e) {
      setErr((e as Error).message.includes("NotAllowed") ? "Fingerprint cancelled" : (e as Error).message)
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
      if (m === "passkey") void tryPasskey()
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
          <button className="btn btn-primary btn-big" onClick={tryPasskey} disabled={busy}>
            {busy ? <span className="spinner" /> : null} Confirm with fingerprint
          </button>
        ) : mode === "setpin" || mode === "confirmpin" ? (
          <>
            <div className="sub center">
              {mode === "setpin" ? "Set a 6-digit WondrPay PIN for this wallet. You'll enter it before every payment." : "Confirm your WondrPay PIN"}
            </div>
            <PinPad key={mode} onComplete={onSetPin} busy={busy} />
          </>
        ) : (
          <>
            <div className="sub center">Enter your 6-digit WondrPay PIN</div>
            {!locked && <PinPad onComplete={onPin} busy={busy} />}
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
