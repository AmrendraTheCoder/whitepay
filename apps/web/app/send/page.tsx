"use client"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { isAddress, keccak256, parseUnits, toHex, type Address } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { directNonce, receiveAuthTypedData, ROUTER_ADDRESS } from "@whitepay/shared"
import { TopBar, UnlockSheet } from "../components"
import { getWallet } from "@/lib/wallet"
import { usdt, short, initials } from "@/lib/format"

type Payee = { address: Address; name?: string; displayName?: string; kind?: string; source?: string }

export default function SendPage() {
  return (
    <Suspense fallback={<main className="shell"><TopBar /></main>}>
      <Send />
    </Suspense>
  )
}

/** P2P push (UPI "send money"): pay a person by QR, ENS name or address. */
function Send() {
  const sp = useSearchParams()
  const [wallet, setWallet] = useState<ReturnType<typeof getWallet> | undefined>(undefined)
  const [query, setQuery] = useState(sp.get("to") ?? sp.get("name") ?? "")
  const [payee, setPayee] = useState<Payee | null>(null)
  const [lookupErr, setLookupErr] = useState("")
  const [amount, setAmount] = useState(sp.get("amount") ?? "")
  const fixedAmount = !!sp.get("amount")
  const [unlock, setUnlock] = useState(false)
  const [phase, setPhase] = useState<"idle" | "signing" | "settling" | "done" | "failed">("idle")
  const [result, setResult] = useState<{ explorer?: string; error?: string }>({})

  useEffect(() => setWallet(getWallet()), [])

  const lookup = async (q: string) => {
    setLookupErr("")
    setPayee(null)
    if (!q.trim()) return
    const r = await fetch(`/api/resolve?q=${encodeURIComponent(q.trim())}`)
    const d = await r.json()
    if (!r.ok) { setLookupErr(d.error ?? "Not found"); return }
    setPayee(d)
  }
  useEffect(() => {
    const to = sp.get("to")
    if (to && isAddress(to)) setPayee({ address: to, name: sp.get("name") ?? undefined })
    if (to || sp.get("name")) void lookup(to ?? sp.get("name")!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (wallet === undefined) return <main className="shell"><TopBar /></main>
  if (!wallet)
    return (
      <main className="shell">
        <TopBar />
        <div className="card stack">
          <h2>Set up WhitePay first</h2>
          <a className="btn btn-primary" href="/">Create wallet</a>
        </div>
      </main>
    )

  const validAmount = /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0
  const self = payee && payee.address.toLowerCase() === wallet.address.toLowerCase()

  const pay = async (account: PrivateKeyAccount) => {
    if (!payee) return
    setUnlock(false)
    setPhase("signing")
    try {
      const value = parseUnits(amount, 6)
      const memo = keccak256(toHex(`p2p/${account.address}/${payee.address}/${Date.now()}/${crypto.randomUUID()}`))
      const nonce = directNonce(payee.address, memo) // binds recipient + memo: the relayer can't redirect it
      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600)
      const signature = await account.signTypedData(
        receiveAuthTypedData({ from: account.address, to: ROUTER_ADDRESS, value, validAfter: 0n, validBefore, nonce }),
      )
      setPhase("settling")
      const r = await fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: payee.address,
          toName: payee.name ?? payee.displayName,
          amount: value.toString(),
          memo,
          auth: { from: account.address, validAfter: "0", validBefore: validBefore.toString(), signature },
        }),
      })
      const out = await r.json()
      if (!r.ok) throw new Error(out.code === "step_up_required" ? "This amount needs a World ID check." : out.error ?? "Payment failed")
      setResult({ explorer: out.explorer })
      setPhase("done")
    } catch (e) {
      setResult({ error: (e as Error).message })
      setPhase("failed")
    }
  }

  if (phase === "done" || phase === "failed")
    return (
      <main className="shell">
        <TopBar right={<a className="chip" href="/">Home</a>} />
        <div className="card result">
          <div className={`icon ${phase === "done" ? "ok" : "bad"}`}>{phase === "done" ? "✓" : "✕"}</div>
          <h1>{phase === "done" ? `Sent ${amount} USDT` : "Not sent"}</h1>
          <div className="sub">
            {phase === "done" ? `to ${payee?.displayName ?? payee?.name ?? short(payee?.address)}. Settled on Whitechain. You paid no gas.` : result.error}
          </div>
          {result.explorer && <a className="chip" href={result.explorer} target="_blank" rel="noreferrer">View on Whitechain ↗</a>}
        </div>
        <a className="btn btn-primary" href="/">Done</a>
      </main>
    )

  const label = payee?.displayName ?? payee?.name ?? (payee ? short(payee.address) : "")
  return (
    <main className="shell">
      <TopBar right={<a className="chip" href="/">Cancel</a>} />
      {!payee ? (
        <div className="card stack">
          <h2>Pay a person</h2>
          <input className="input" placeholder="name.whitepay.eth, handle or 0x address" value={query} onChange={(e) => setQuery(e.target.value)} autoCapitalize="none" />
          <button className="btn btn-primary" onClick={() => lookup(query)} disabled={!query.trim()}>Find</button>
          <div className="err">{lookupErr}</div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="payee">
              <div className="avatar">{initials(payee.displayName ?? payee.name)}</div>
              <div className="name">{label}</div>
              {payee.name && payee.name !== label && <div className="sub">{payee.name}</div>}
              <div className="sub mono" style={{ marginTop: 4 }}>{short(payee.address)}</div>
              <div style={{ marginTop: 6 }}>
                {payee.source === "ens" ? <span className="badge badge-ok">✓ ENS name</span>
                  : payee.kind === "merchant" ? <span className="badge badge-ok">Merchant</span>
                  : <span className="badge badge-warn">Unnamed address: check it's right</span>}
              </div>
            </div>
            <div className="sub" style={{ textAlign: "center", marginTop: 14 }}>You are paying</div>
            <input className="amount-input" inputMode="decimal" placeholder="0.00" value={amount} readOnly={fixedAmount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
            <div className="sub" style={{ textAlign: "center" }}>USDT</div>
          </div>
          {self && <div className="err">That's your own wallet.</div>}
          {phase === "idle" ? (
            <button className="btn btn-primary btn-big" disabled={!validAmount || !!self} onClick={() => setUnlock(true)}>
              {wallet.hasPasskey ? "☝︎ Pay with fingerprint" : "Pay with PIN"}
            </button>
          ) : (
            <div className="card row" style={{ justifyContent: "center" }}>
              <span className="spinner" /> {phase === "signing" ? "Signing on your device…" : "Settling on Whitechain…"}
            </div>
          )}
          <div className="sub" style={{ textAlign: "center" }}>Network fee: 0. WhitePay covers the gas.</div>
        </>
      )}
      {unlock && payee && (
        <UnlockSheet title={`Send ${amount} USDT`} subtitle={`to ${label}`} onUnlocked={pay} onCancel={() => setUnlock(false)} />
      )}
    </main>
  )
}
