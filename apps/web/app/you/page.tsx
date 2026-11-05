"use client"
import { useEffect, useState } from "react"
import { BottomNav, Icon, avatarColor, prettyName, useWalletData } from "../ui"
import { ClaimName } from "../claim-name"
import { PinPad } from "../components"
import {
  enablePasskey, passkeySupported, removeWallet, listWallets, setActiveWallet, connectInjectedWallet, hasInjectedWallet, type WalletInfo,
} from "@/lib/wallet"
import { useTheme, type Theme } from "@/lib/prefs"
import { short } from "@/lib/format"

/** GPay "You": name, WhitePay ID (ENS, like a UPI ID), QR, wallets, appearance, security. */
export default function You() {
  const { wallet, name, reload } = useWalletData()
  const { theme, setTheme } = useTheme()
  const [wallets, setWallets] = useState<WalletInfo[]>([])
  const [copied, setCopied] = useState(false)
  const [bioOk, setBioOk] = useState(false)
  const [askPin, setAskPin] = useState(false)
  const [msg, setMsg] = useState("")
  useEffect(() => { passkeySupported().then(setBioOk); setWallets(listWallets()) }, [])

  if (wallet === undefined) return <main className="shell" />
  if (!wallet) return <main className="shell"><a className="btn btn-primary" href="/">Create your wallet</a></main>

  const switchTo = (a: string) => { setActiveWallet(a); location.reload() }
  const connect = async () => {
    try { await connectInjectedWallet(); location.reload() } catch (e) { setMsg((e as Error).message.split("\n")[0]) }
  }

  return (
    <main className="shell with-nav">
      <div className="profile-hero">
        <div className="nm">{name === undefined ? <span className="skel" style={{ width: 200, height: 34 }} /> : name ? prettyName(name) : wallet.label}</div>
        <div className="id">WhitePay ID: {name === undefined ? <span className="skel" style={{ width: 160, height: 16 }} /> : <b>{name ?? "not claimed yet"}</b>}</div>
        <button className="addr chip" style={{ background: "rgba(255,255,255,.14)", border: 0, color: "#fff" }}
          onClick={() => { navigator.clipboard?.writeText(wallet.address); setCopied(true); setTimeout(() => setCopied(false), 1400) }}>
          {copied ? "Copied ✓" : `${short(wallet.address)} · ${wallet.kind === "injected" ? "browser wallet" : "this device"}`}
        </button>
        <a className="qrbtn" href="/receive" aria-label="My QR code">{Icon.receive(44)}</a>
      </div>

      {name === null && <div id="claim"><ClaimName address={wallet.address} onClaimed={reload} /></div>}

      <div className="section-title">Wallets</div>
      <div className="card" style={{ padding: "6px 14px" }}>
        {wallets.map((w) => {
          const on = w.address.toLowerCase() === wallet.address.toLowerCase()
          return (
            <button key={w.address} className="wallet-row" onClick={() => !on && switchTo(w.address)}>
              <span className="pic" style={{ background: avatarColor(w.address) }}>{w.kind === "injected" ? Icon.shield(22) : w.label.slice(-1)}</span>
              <div>
                <div style={{ fontWeight: 700 }}>{w.label}</div>
                <div className="sub">{short(w.address)} · {w.kind === "injected" ? "MetaMask / browser" : w.hasPasskey ? "fingerprint + PIN" : "PIN"}</div>
              </div>
              <span className={`radio ${on ? "on" : ""}`} aria-label={on ? "Active" : "Switch"} />
            </button>
          )
        })}
      </div>
      <div className="actions">
        <a className="btn btn-ghost" href="/add">+ Add wallet</a>
        <button className="btn btn-ghost" onClick={connect} disabled={!hasInjectedWallet()} title={hasInjectedWallet() ? "" : "Open in MetaMask's browser to connect"}>Connect MetaMask</button>
      </div>

      <div className="section-title">Appearance</div>
      <div className="seg" role="radiogroup" aria-label="Theme">
        {(["system", "light", "dark"] as Theme[]).map((t) => (
          <button key={t} className={theme === t ? "on" : ""} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="section-title">Payments &amp; security</div>
      <div className="menu-list">
        <a className="menu-row" href="/receive"><span className="ic">{Icon.receive(26)}</span><div>Your QR code<div className="s">Use to receive money from any WhitePay user</div></div><span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href="/merchant"><span className="ic">{Icon.shop(26)}</span><div>Shop &amp; merchant tools<div className="s">Sign up a shop, show QR, verify with World ID</div></div><span className="chev">{Icon.chev()}</span></a>
        {wallet.kind === "device" && (
          <div className="menu-row">
            <span className="ic">{Icon.finger(26)}</span>
            <div>Fingerprint / Face ID<div className="s">{wallet.hasPasskey ? "On: payments unlock with your fingerprint" : bioOk ? "Off: using PIN only" : "Not supported in this browser"}</div></div>
            {!wallet.hasPasskey && bioOk && <button className="chip" style={{ marginLeft: "auto" }} onClick={() => setAskPin(true)}>Turn on</button>}
          </div>
        )}
        <a className="menu-row" href="/transactions"><span className="ic">{Icon.history(26)}</span><div>Transaction history<div className="s">Receipts stored on Arkiv</div></div><span className="chev">{Icon.chev()}</span></a>
      </div>
      {msg && <div className="sub" style={{ textAlign: "center" }}>{msg}</div>}

      <button className="btn btn-ghost" style={{ color: "var(--bad)" }}
        onClick={() => {
          const warn = wallet.kind === "device" ? "Remove this wallet from the device? Its funds are lost unless you have the key." : "Disconnect this browser wallet from WhitePay?"
          if (confirm(warn)) { removeWallet(wallet.address); location.href = "/" }
        }}>
        {wallet.kind === "device" ? "Remove this wallet from device" : "Disconnect browser wallet"}
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
