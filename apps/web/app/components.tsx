"use client"
import { useEffect, useState } from "react"
import type { PrivateKeyAccount } from "viem/accounts"
import { getWallet, unlockWithPasskey, unlockWithPin, pinLockout } from "@/lib/wallet"

export function TopBar({ right }: { right?: React.ReactNode }) {
  return (
    <div className="topbar">
      <a className="brand" href="/">
        <img src="/icon.svg" alt="" />
        WhitePay
      </a>
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
  const [mode, setMode] = useState<"passkey" | "pin">(w?.hasPasskey ? "passkey" : "pin")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  const tryPasskey = async () => {
    setBusy(true)
    setErr("")
    try {
      onUnlocked(await unlockWithPasskey())
    } catch (e) {
      setErr((e as Error).message.includes("NotAllowed") ? "Fingerprint cancelled" : (e as Error).message)
      setMode("pin")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (mode === "passkey") void tryPasskey()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onPin = async (pin: string) => {
    setBusy(true)
    setErr("")
    try {
      onUnlocked(await unlockWithPin(pin))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const locked = pinLockout() > 0
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {subtitle && <div className="sub" style={{ textAlign: "center" }}>{subtitle}</div>}
        {mode === "passkey" ? (
          <button className="btn btn-primary btn-big" onClick={tryPasskey} disabled={busy}>
            {busy ? <span className="spinner" /> : "☝︎"} Confirm with fingerprint
          </button>
        ) : (
          <>
            <div className="sub" style={{ textAlign: "center" }}>Enter your 6-digit PIN</div>
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
