"use client"
import { useEffect, useState } from "react"
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts"
import { sessionFor } from "@/lib/session"
import { getWallet, unlockWithPasskey, unlockWithPin, pinLockout, isExternal, externalSigner, verifyExternalPin, verifyExternalPasskey, setExternalPin } from "@/lib/wallet"

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
        WhitePay
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
/** Payment confirmation sheet. EVERY wallet is guarded by WhitePay's own PIN / fingerprint first:
 *  - device wallet: fingerprint (passkey PRF) or PIN decrypts the on-device key
 *  - external wallet (MetaMask extension / WalletConnect): fingerprint or WhitePay PIN, THEN the wallet signs */
export function UnlockSheet({
  title,
  subtitle,
  onUnlocked,
  onCancel,
}: {
  title: string
  subtitle?: string
  onUnlocked: (account: PrivateKeyAccount) => void
  onCancel: () => void
}) {
  const w = getWallet()
  const external = isExternal(w)
  // already unlocked this session? then don't ask for the PIN / fingerprint again
  const [session] = useState(() => (w ? sessionFor(w.address) : null))
  type Mode = "passkey" | "pin" | "setpin" | "confirmpin" | "wallet"
  const [mode, setMode] = useState<Mode>(external && session ? "wallet" : external && !w?.hasPin ? "setpin" : w?.hasPasskey ? "passkey" : "pin")
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
      onUnlocked((await externalSigner(w)) as unknown as PrivateKeyAccount)
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
      onUnlocked(await unlockWithPasskey())
    } catch (e) {
      setErr((e as Error).message.includes("NotAllowed") ? "Fingerprint cancelled" : (e as Error).message)
      setMode("pin")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    // (an effect may only return a cleanup function, so never `return onUnlocked(...)` here)
    if (session?.pk && !external) { void onUnlocked(privateKeyToAccount(session.pk)); return }
    if (session && external) { void tryWallet(); return }
    if (mode === "passkey") void tryPasskey()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onPin = async (pin: string) => {
    setBusy(true)
    setErr("")
    try {
      if (external) { await verifyExternalPin(w!.address, pin); setMode("wallet"); setBusy(false); void tryWallet(); return }
      onUnlocked(await unlockWithPin(pin))
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

  const locked = pinLockout() > 0
  if (session && !external) return null
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {subtitle && <div className="sub" style={{ textAlign: "center" }}>{subtitle}</div>}
        {mode === "wallet" ? (
          <>
            <div className="sub" style={{ textAlign: "center" }}>✓ Verified. Now approve the signature in {walletName}. It costs no gas.</div>
            <button className="btn btn-primary btn-big" onClick={tryWallet} disabled={busy}>
              {busy ? <span className="spinner" /> : null} Confirm in {walletName}
            </button>
          </>
        ) : mode === "passkey" ? (
          <button className="btn btn-primary btn-big" onClick={tryPasskey} disabled={busy}>
            {busy ? <span className="spinner" /> : null} Confirm with fingerprint
          </button>
        ) : mode === "setpin" || mode === "confirmpin" ? (
          <>
            <div className="sub" style={{ textAlign: "center" }}>
              {mode === "setpin" ? "Set a 6-digit WhitePay PIN for this wallet. You'll enter it before every payment." : "Confirm your WhitePay PIN"}
            </div>
            <PinPad key={mode} onComplete={onSetPin} busy={busy} />
          </>
        ) : (
          <>
            <div className="sub" style={{ textAlign: "center" }}>Enter your 6-digit WhitePay PIN</div>
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
