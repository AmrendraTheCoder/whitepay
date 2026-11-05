"use client"
import { useEffect, useState } from "react"
import { BottomNav, Icon, prettyName, useWalletData } from "../ui"
import { ClaimName } from "../claim-name"
import { enablePasskey, passkeySupported, removeWallet } from "@/lib/wallet"
import { PinPad } from "../components"
import { short } from "@/lib/format"

/** GPay "You": name, WhitePay ID (ENS, like a UPI ID), QR, security. */
export default function You() {
  const { wallet, name, reload, setWallet } = useWalletData()
  const [copied, setCopied] = useState(false)
  const [bioOk, setBioOk] = useState(false)
  const [askPin, setAskPin] = useState(false)
  const [msg, setMsg] = useState("")
  useEffect(() => { passkeySupported().then(setBioOk) }, [])

  if (wallet === undefined) return <main className="shell" />
  if (!wallet) return <main className="shell"><a className="btn btn-primary" href="/">Create your wallet</a></main>

  return (
    <main className="shell with-nav">
      <div className="profile-hero">
        <div className="nm">{name ? prettyName(name) : "WhitePay user"}</div>
        <div className="id">WhitePay ID: <b>{name ?? "not claimed yet"}</b></div>
        <button className="addr chip" style={{ background: "rgba(255,255,255,.14)", border: 0, color: "#fff" }}
          onClick={() => { navigator.clipboard?.writeText(wallet.address); setCopied(true); setTimeout(() => setCopied(false), 1400) }}>
          {copied ? "Copied ✓" : short(wallet.address)}
        </button>
        <a className="qrbtn" href="/receive" aria-label="My QR code">{Icon.receive(44)}</a>
      </div>

      {!name && <div id="claim"><ClaimName address={wallet.address} onClaimed={reload} /></div>}

      <div className="menu-list">
        <a className="menu-row" href="/receive"><span className="ic">{Icon.receive(26)}</span><div>Your QR code<div className="s">Use to receive money from any WhitePay user</div></div><span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href="/merchant"><span className="ic">{Icon.shop(26)}</span><div>Shop &amp; merchant tools<div className="s">Sign up a shop, show QR, verify with World ID</div></div><span className="chev">{Icon.chev()}</span></a>
        <div className="menu-row">
          <span className="ic">{Icon.finger(26)}</span>
          <div>Fingerprint / Face ID<div className="s">{wallet.hasPasskey ? "On: payments unlock with your fingerprint" : bioOk ? "Off: using PIN only" : "Not supported in this browser"}</div></div>
          {!wallet.hasPasskey && bioOk && <button className="chip" style={{ marginLeft: "auto" }} onClick={() => setAskPin(true)}>Turn on</button>}
        </div>
        <a className="menu-row" href="/transactions"><span className="ic">{Icon.history(26)}</span><div>Transaction history<div className="s">Receipts stored on Arkiv</div></div><span className="chev">{Icon.chev()}</span></a>
      </div>
      {msg && <div className="sub" style={{ textAlign: "center" }}>{msg}</div>}

      <button className="btn btn-ghost" style={{ color: "var(--bad)" }}
        onClick={() => { if (confirm("Remove this wallet from the device? Funds are lost unless you have the key.")) { removeWallet(); setWallet(null); location.href = "/" } }}>
        Remove wallet from this device
      </button>

      {askPin && (
        <div className="sheet-backdrop" onClick={() => setAskPin(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Enter your PIN to turn on fingerprint</h3>
            <PinPad onComplete={async (pin) => {
              try { await enablePasskey(pin); setMsg("Fingerprint is on ✓"); setAskPin(false); location.reload() }
              catch (e) { setMsg((e as Error).message); setAskPin(false) }
            }} />
          </div>
        </div>
      )}
      <BottomNav />
    </main>
  )
}
