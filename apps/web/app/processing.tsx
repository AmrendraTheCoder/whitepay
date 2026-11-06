"use client"
// GPay-style processing screen: the WhitePay mark draws itself inside a spinning gradient arc,
// one short line that changes per step, step dots, and a check burst when it's done.
import "./processing.css"
import { useEffect, useState } from "react"
import { onWalletPending, cancelWalletRequest, isMobile, type PendingWallet } from "@/lib/wallet"

export function Processing({ title, steps, step, done = false, amount }: { title: string; steps: string[]; step: number; done?: boolean; amount?: string }) {
  return (
    <div className={`proc ${done ? "done" : ""}`} role="status" aria-live="polite" aria-label={done ? "Done" : steps[step]}>
      <div className="proc-mark">
        <svg className="proc-arc" viewBox="0 0 120 120" aria-hidden>
          <defs><linearGradient id="proc-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2448ff" /><stop offset="1" stopColor="#ddf05a" /></linearGradient></defs>
          <circle cx="60" cy="60" r="54" className="track" />
          <circle cx="60" cy="60" r="54" className="arc" />
        </svg>
        <div className="proc-logo" aria-hidden>
          {done ? (
            <svg viewBox="0 0 52 52" className="proc-check"><path d="M14 27l8 8 16-17" /></svg>
          ) : (
            <svg viewBox="0 0 512 512"><path d="M110 168l50 176 56-128 40 92 40-92 56 128 50-176" /></svg>
          )}
        </div>
      </div>
      {amount && <div className="proc-amt">{amount}</div>}
      <div className="proc-title">{done ? "Done" : title}</div>
      <div className="proc-step" key={done ? "d" : step}>{done ? steps[steps.length - 1] : steps[step]}</div>
      <div className="proc-dots" aria-hidden>{steps.map((_, i) => <i key={i} className={i < step || done ? "on" : i === step ? "now" : ""} />)}</div>
      {!done && <WalletWait />}
    </div>
  )
}

/** While an external wallet is being asked to sign: a tap-to-open button (app switches need a real tap)
 *  and a Cancel, so the screen can never just spin. Renders nothing for on-device wallets. */
export function WalletWait() {
  const [p, setP] = useState<PendingWallet>(null)
  const [link, setLink] = useState<{ href: string; name: string } | null>(null)
  const [slow, setSlow] = useState(false)
  useEffect(() => onWalletPending(setP), [])
  useEffect(() => {
    setSlow(false)
    if (!p) return
    if (p.kind === "walletconnect" && isMobile())
      import("@/lib/walletconnect").then((m) => setLink({ href: m.wcWalletLink(), name: m.wcWalletName() })).catch(() => {})
    const t = setTimeout(() => setSlow(true), 12_000)
    return () => clearTimeout(t)
  }, [p])
  if (!p) return null
  const name = link?.name?.split(" ")[0] ?? (p.kind === "walletconnect" ? "MetaMask" : "your wallet")
  return (
    <div className="proc-wallet">
      <div className="proc-hint">
        {p.kind === "injected" ? `Approve the signature in ${name}. It costs no gas.`
          : link ? `Open ${name} to approve. It costs no gas.` : `Approve in ${name} on your phone. It costs no gas.`}
        {slow && <><br />Not seeing it? {link ? `Tap Open ${name}` : "Open the wallet app"}, then come back here.</>}
      </div>
      {link && <a className="btn btn-primary proc-open" href={link.href}>Open {name}</a>}
      <button type="button" className="btn btn-ghost proc-cancel" onClick={cancelWalletRequest}>Cancel</button>
    </div>
  )
}
