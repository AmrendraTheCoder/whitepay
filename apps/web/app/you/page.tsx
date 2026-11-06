"use client"
import { useEffect, useState } from "react"
import { Icon, avatarColor, prettyName, useWalletData, AccountBadge, LogoLoader, Identicon } from "../ui"
import { PinPad, UnlockSheet } from "../components"
import { paySecurity, setPaySecurity, looser, WORLD_THRESHOLDS, type PaySecurity } from "@/lib/security"
import {
  enablePasskey, passkeySupported, removeWallet, listWallets, setActiveWallet, type WalletInfo,
} from "@/lib/wallet"
import { useTheme, type Theme } from "@/lib/prefs"
import { short } from "@/lib/format"
import { ENS_WHITEPAY } from "@whitepay/shared"

/** GPay "You": name, WondrPay ID (ENS, like a UPI ID), QR, wallets, appearance, security. */
export default function You() {
  const { wallet, name, account, displayName, reload } = useWalletData()
  const [types, setTypes] = useState<Record<string, string>>({})
  const [ensLive, setEnsLive] = useState<{ address?: string; source?: string } | null>(null)
  useEffect(() => {
    if (!name) return
    // resolve the name through ENS (not our directory) to show what the chain says
    fetch(`/api/resolve?q=${encodeURIComponent(name)}`).then((r) => r.json()).then(setEnsLive).catch(() => setEnsLive({}))
  }, [name])
  const { theme, setTheme } = useTheme()
  const [wallets, setWallets] = useState<WalletInfo[]>([])
  const [copied, setCopied] = useState(false)
  const [bioOk, setBioOk] = useState(false)
  const [askPin, setAskPin] = useState(false)
  const [sec, setSec] = useState<PaySecurity | null>(null)
  const [pendingSec, setPendingSec] = useState<PaySecurity | null>(null)
  useEffect(() => { if (wallet) setSec(paySecurity(wallet.address)) }, [wallet])
  // tightening applies at once; loosening needs the PIN / fingerprint, so a borrowed unlocked phone can't turn checks off
  const changeSec = (next: PaySecurity) => {
    if (!wallet || !sec) return
    if (looser(sec, next)) { setPendingSec(next); return }
    setPaySecurity(wallet.address, next); setSec(next)
  }
  const [msg, setMsg] = useState("")
  useEffect(() => {
    passkeySupported().then(setBioOk)
    const ws = listWallets()
    setWallets(ws)
    // label every wallet Personal / Business from the directory (ENS + Arkiv)
    ws.forEach((w) => fetch(`/api/resolve?q=${w.address}`).then((r) => r.json()).then((d) =>
      setTypes((t) => ({ ...t, [w.address]: d.kind === "merchant" ? `Business · ${d.displayName ?? d.name}` : d.name ? `Personal · ${d.name}` : "Personal · no name yet" }))).catch(() => {}))
  }, [])

  if (wallet === undefined) return <main className="shell"><LogoLoader /></main>
  if (!wallet) return <main className="shell"><a className="btn btn-primary" href="/app">Create your wallet</a></main>

  const switchTo = (a: string) => { setActiveWallet(a); location.reload() }
  // connecting (extension or WalletConnect) + setting its WondrPay PIN happens in the add-wallet flow
  const connect = () => { location.href = "/add?connect=1" }


  return (
    <main className="shell with-nav">
      <div className="profile-hero">
        <div className="hero-top"><span className="hero-ident"><Identicon seed={wallet.address} size={52} /></span><AccountBadge account={account} /></div>
        <div className="nm">{name === undefined ? <span className="skel" style={{ width: 200, height: 34 }} /> : account === "business" && displayName ? displayName : name ? prettyName(name) : wallet.label}</div>
        <div className="id">{account === "business" ? "Shop ID" : "WondrPay ID"}: {name === undefined ? <span className="skel" style={{ width: 160, height: 16 }} /> : <b>{name ?? "not claimed yet"}</b>}</div>
        <button className="addr chip" style={{ background: "rgba(255,255,255,.14)", border: 0, color: "#fff" }}
          onClick={() => { navigator.clipboard?.writeText(wallet.address); setCopied(true); setTimeout(() => setCopied(false), 1400) }}>
          {copied ? "Copied" : <>{short(wallet.address)} <span style={{ opacity: .7 }}>· {wallet.kind === "walletconnect" ? "MetaMask app" : wallet.kind === "injected" ? "browser extension" : "this device"}</span> <span aria-hidden style={{ opacity: .8 }}>⧉</span></>}
        </button>
        <a className="qrbtn" href="/receive" aria-label="My QR code">{Icon.receive(44)}</a>
      </div>

      {account === "new" && (
        <>
          <div className="sub center">Running a shop? Use a <a href="/add?type=business" className="text-brand strong">separate business wallet</a>, like GPay for Business.</div>
        </>
      )}
      {account === "business" && (
        <a className="card row" href="/merchant">
          <div><div className="strong">Business account</div><div className="sub">Show QR, see payments, refunds and CSV export</div></div>
          <span className="chev">{Icon.chev()}</span>
        </a>
      )}

      {name && (
        <>
          <div className="section-title">On ENS</div>
          <div className="card stack">
            <div className="row"><span className="sub">Name</span><b>{name}</b></div>
            <div className="row"><span className="sub">Resolves to (Whitechain)</span>
              <span className="mono">{ensLive === null ? <span className="skel" style={{ width: 110, height: 14 }} /> : ensLive.source === "ens" && ensLive.address ? short(ensLive.address) : "updating…"}</span></div>
            <div className="row"><span className="sub">Resolver</span><a className="mono text-brand" href={ENS_WHITEPAY.etherscan(ENS_WHITEPAY.resolver)} target="_blank" rel="noreferrer">{short(ENS_WHITEPAY.resolver)} ↗</a></div>
            <div className="row"><span className="sub">Registry</span><a className="mono text-brand" href={ENS_WHITEPAY.etherscan(ENS_WHITEPAY.userRegistry)} target="_blank" rel="noreferrer">{short(ENS_WHITEPAY.userRegistry)} ↗</a></div>
            <a className="btn btn-ghost" href={ENS_WHITEPAY.app(name)} target="_blank" rel="noreferrer">Open in ENS app ↗</a>
            <div className="sub">ENSv2 on Ethereum Sepolia. The resolver stores your Whitechain address (coin type 2147485522) plus display/kind/verified records.</div>
          </div>
        </>
      )}

      <div className="section-title">Wallets</div>
      <div className="card" style={{ padding: "6px 14px" }}>
        {wallets.map((w) => {
          const on = w.address.toLowerCase() === wallet.address.toLowerCase()
          return (
            <button key={w.address} className="wallet-row" onClick={() => !on && switchTo(w.address)}>
              <span className="tx-av"><Identicon seed={w.address} size={48} />{w.kind !== "device" && <span className="dir kind" title="external wallet">{Icon.shield(12)}</span>}</span>
              <div>
                <div className="strong">{w.label}</div>
                <div className="sub">{types[w.address] ?? "…"}</div>
                <div className="sub">{short(w.address)} · {w.kind === "walletconnect" ? "MetaMask app" : w.kind === "injected" ? "browser extension" : "this device"} · {w.hasPasskey ? "fingerprint + PIN" : w.hasPin ? "PIN" : "PIN not set"}</div>
              </div>
              <span className={`radio ${on ? "on" : ""}`} aria-label={on ? "Active" : "Switch"} />
            </button>
          )
        })}
      </div>
      <div className="actions">
        <a className="btn btn-ghost" href="/add">+ Add wallet</a>
        <button className="btn btn-ghost" onClick={connect}>Connect MetaMask</button>
      </div>

      <div className="section-title">Appearance</div>
      <div className="seg" role="radiogroup" aria-label="Theme">
        {(["system", "light", "dark"] as Theme[]).map((t) => (
          <button key={t} className={theme === t ? "on" : ""} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {sec && (
        <>
          <div className="section-title">Payment security</div>
          <div className="card stack">
            <div className="strong">Ask for {wallet.hasPasskey ? "fingerprint / PIN" : "PIN"}</div>
            <div className="seg seg-2" role="radiogroup" aria-label="When to ask for PIN or fingerprint">
              {([["every", "Every payment"], ["session", "Once per 15 min"]] as const).map(([v, l]) => (
                <button key={v} className={sec.confirm === v ? "on" : ""} role="radio" aria-checked={sec.confirm === v} onClick={() => changeSec({ ...sec, confirm: v })}>{l}</button>
              ))}
            </div>
            <div className="sub">{sec.confirm === "every" ? "Every send, QR payment and subscription payment asks for it, even right after another one." : "One check unlocks payments for 15 minutes of use. Faster, but anyone holding your unlocked phone can pay in that window."}</div>
            <div className="strong" style={{ marginTop: 8 }}>Also ask for World ID</div>
            <div className="seg seg-4" role="radiogroup" aria-label="World ID above this amount">
              {WORLD_THRESHOLDS.map((t) => (
                <button key={String(t)} className={sec.worldAboveUsd === t ? "on" : ""} role="radio" aria-checked={sec.worldAboveUsd === t} onClick={() => changeSec({ ...sec, worldAboveUsd: t })}>{t === null ? "Never" : `$${t}+`}</button>
              ))}
            </div>
            <div className="sub">{sec.worldAboveUsd === null ? "World ID is never asked when you pay." : `Payments of $${sec.worldAboveUsd} or more also need a World App scan, after your ${wallet.hasPasskey ? "fingerprint" : "PIN"}.`}{wallet.kind !== "device" ? " MetaMask always asks you to approve each payment too." : ""}</div>
          </div>
        </>
      )}
      {pendingSec && (
        <UnlockSheet payment={{ amountMicro: 0n }} title="Change payment security" subtitle="Confirm it's you to relax these checks"
          onUnlocked={() => { setPaySecurity(wallet.address, pendingSec); setSec(pendingSec); setPendingSec(null) }}
          onCancel={() => setPendingSec(null)} />
      )}

      <div className="section-title">Payments &amp; security</div>
      <div className="menu-list">
        <a className="menu-row" href="/receive"><span className="ic">{Icon.receive(26)}</span><div>Your QR code<div className="s">Use to receive money from any WondrPay user</div></div><span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href="/autopay"><span className="ic">{Icon.repeat(26)}</span><div>Subscriptions<div className="s">Payment requests, countdowns, cancel anytime</div></div><span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href="/merchant"><span className="ic">{Icon.shop(26)}</span><div>Shop &amp; merchant tools<div className="s">Sign up a shop, QR payments, subscription plans</div></div><span className="chev">{Icon.chev()}</span></a>
        {wallet.kind === "device" && (
          <div className="menu-row">
            <span className="ic">{Icon.finger(26)}</span>
            <div>Fingerprint / Face ID<div className="s">{wallet.hasPasskey ? "On: payments unlock with your fingerprint" : bioOk ? "Off: using PIN only" : "Not supported in this browser"}</div></div>
            {!wallet.hasPasskey && bioOk && <button className="chip" style={{ marginLeft: "auto" }} onClick={() => setAskPin(true)}>Turn on</button>}
          </div>
        )}
        <a className="menu-row" href="/transactions"><span className="ic">{Icon.history(26)}</span><div>Transaction history<div className="s">Receipts stored on Arkiv</div></div><span className="chev">{Icon.chev()}</span></a>
      </div>
      {msg && <div className="sub center">{msg}</div>}

      <button className="btn btn-ghost text-bad"
        onClick={() => {
          const warn = wallet.kind === "device" ? "Remove this wallet from the device? Its funds are lost unless you have the key." : "Disconnect MetaMask from WondrPay?"
          if (confirm(warn)) { removeWallet(wallet.address); location.href = "/app" }
        }}>
        {wallet.kind === "device" ? "Remove this wallet from device" : "Disconnect MetaMask"}
      </button>

      {askPin && (
        <div className="sheet-backdrop" onClick={() => setAskPin(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Enter your PIN to turn on fingerprint</h3>
            <PinPad onComplete={async (pin) => {
              try { await enablePasskey(pin); setMsg("Fingerprint is on"); setAskPin(false); location.reload() }
              catch (e) { setMsg((e as Error).message); setAskPin(false) }
            }} />
          </div>
        </div>
      )}
      
    </main>
  )
}
