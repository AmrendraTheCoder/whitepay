"use client"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { isAddress, keccak256, parseUnits, toHex, type Address, type Hex } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { directNonce, receiveAuthTypedData, ROUTER_ADDRESS } from "@whitepay/shared"
import { TopBar, UnlockSheet } from "../components"
import { SuccessCheck, LogoLoader, Icon } from "../ui"
import { Processing } from "../processing"
import { NewBalance, RewardEarned } from "../money-events"
import { getWallet } from "@/lib/wallet"
import { PayeeSearch } from "./search"
import { usdt, short, initials } from "@/lib/format"
import { playSound } from "@/lib/sound"
import { settle, SettleError } from "@/lib/settle"
import { friendlyError } from "@/lib/errors"

type Payee = { address: Address; name?: string; displayName?: string; kind?: string; source?: string }

export default function SendPage() {
  return (
    <Suspense fallback={<main className="shell"><LogoLoader /></main>}>
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
  const [phase, setPhase] = useState<"idle" | "signing" | "settling" | "finishing" | "done" | "failed">("idle")
  const [result, setResult] = useState<{ explorer?: string; error?: string; code?: string }>({})
  const [startedAt, setStartedAt] = useState(0)
  // P2P is free for 10 transfers a month (WondrPay pays the gas), then $0.03 each: not deducted on testnet
  const [allow, setAllow] = useState<{ used: number; free: number; left: number } | null>(null)
  useEffect(() => {
    if (!wallet) return
    fetch(`/api/send?from=${wallet.address}`).then((r) => (r.ok ? r.json() : null)).then((a) => a && setAllow(a)).catch(() => {})
  }, [wallet])

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

  if (wallet === undefined) return <main className="shell"><LogoLoader /></main>
  if (!wallet)
    return (
      <main className="shell">
        <TopBar />
        <div className="card stack">
          <h2>Set up WondrPay first</h2>
          <a className="btn btn-primary" href="/app">Create wallet</a>
        </div>
      </main>
    )

  const validAmount = /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0
  const self = payee && payee.address.toLowerCase() === wallet.address.toLowerCase()

  const pay = async (account: PrivateKeyAccount) => {
    if (!payee) return
    setUnlock(false)
    setPhase("signing")
    setStartedAt(Math.floor(Date.now() / 1000))
    try {
      const value = parseUnits(amount, 6)
      const memo = keccak256(toHex(`p2p/${account.address}/${payee.address}/${Date.now()}/${crypto.randomUUID()}`))
      const nonce = directNonce(payee.address, memo) // binds recipient + memo: the relayer can't redirect it
      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600)
      const signature = await account.signTypedData(
        receiveAuthTypedData({ from: account.address, to: ROUTER_ADDRESS, value, validAfter: 0n, validBefore, nonce }),
      )
      const body = {
        to: payee.address,
        toName: payee.name ?? payee.displayName,
        amount: value.toString(),
        memo,
        auth: { from: account.address, validAfter: "0", validBefore: validBefore.toString(), signature },
      }
      await submit(body, account.address, nonce)
    } catch (e) {
      setResult({ error: friendlyPayError((e as Error).message) })
      playSound("error")
      setPhase("failed")
    }
  }

  async function submit(body: any, payer: Address, nonce: Hex) {
    setPhase("settling")
    try {
      const out = await settle("/api/send", body, { from: payer, nonce })
      setResult({ explorer: out.explorer as string | undefined })
      if (out.allowance) setAllow(out.allowance as { used: number; free: number; left: number })
      setPhase("finishing")
      playSound("sent")
      setTimeout(() => setPhase("done"), 900)
    } catch (e) {
      const err = e as SettleError
      setResult({ error: err.code === "unconfirmed" ? err.message : friendlyPayError(err.message), code: err.code })
      playSound("error")
      setPhase("failed")
    }
  }

  if (phase === "done" || phase === "failed")
    return (
      <main className="shell">
        <TopBar right={<a className="chip" href="/app">Home</a>} />
        <div className="card result">
          {phase === "done" ? <SuccessCheck /> : <div className="icon bad" aria-hidden>{Icon.close(40)}</div>}
          <h1>{phase === "done" ? `Sent ${amount} USDT` : result.code === "unconfirmed" ? "Couldn't confirm" : "Not sent"}</h1>
          <div className="sub">
            {phase === "done" ? `to ${payee?.displayName ?? payee?.name ?? short(payee?.address)}. Settled on Whitechain. You paid no gas.` : result.error}
          </div>
          {result.explorer && <a className="chip" href={result.explorer} target="_blank" rel="noreferrer">View on Whitechain ↗</a>}
          {phase === "done" && <NewBalance address={wallet.address} spent={parseUnits(amount, 6)} />}
          {phase === "done" && payee?.kind !== "merchant" && allow && <div className="sub">{p2pNote(allow)}</div>}
        </div>
        {/* rewards are for paying shops only, never person-to-person */}
        {phase === "done" && payee?.kind === "merchant" && (
          <RewardEarned owner={wallet.address} merchant={payee.address} merchantName={payee.name} amount={parseUnits(amount, 6)} since={startedAt} />
        )}
        {phase === "failed" && result.code !== "unconfirmed" && !/already|expired/i.test(result.error ?? "") && (
          <button className="btn btn-primary" onClick={() => { setResult({}); setPhase("idle") }}>Try again</button>
        )}
        <a className={`btn ${phase === "failed" ? "btn-ghost" : "btn-primary"}`} href={phase === "failed" && result.code === "unconfirmed" ? "/transactions" : "/app"}>
          {phase === "failed" && result.code === "unconfirmed" ? "Check history" : "Done"}
        </a>
      </main>
    )

  const label = payee?.displayName ?? payee?.name ?? (payee ? short(payee.address) : "")
  return (
    <main className="shell">
      <TopBar right={<a className="chip" href="/app">Cancel</a>} />
      {!payee ? (
        <>
          <h1 className="ps-title">Pay anyone</h1>
          {lookupErr && <div className="err" role="alert">{lookupErr}</div>}
          <PayeeSearch initialQuery={query} onPick={(p) => { setQuery(p.name ?? p.address); setPayee(p) }} />
        </>
      ) : (
        <>
          <div className="card">
            <div className="payee">
              <div className="avatar">{initials(payee.displayName ?? payee.name)}</div>
              <div className="name">{label}</div>
              {payee.name && payee.name !== label && <div className="sub">{payee.name}</div>}
              <div className="sub mono" style={{ marginTop: 4 }}>{short(payee.address)}</div>
              <div className="mt-2">
                {payee.source === "ens" ? <span className="badge badge-ok">{Icon.check(14)} ENS name</span>
                  : payee.kind === "merchant" ? <span className="badge badge-ok">Merchant</span>
                  : <span className="badge badge-warn">Unnamed address: check it's right</span>}
              </div>
            </div>
            <div className="sub center mt-4">You are paying</div>
            <input className="amount-input" inputMode="decimal" placeholder="0.00" value={amount} readOnly={fixedAmount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
            <div className="sub center">USDT</div>
          </div>
          {self && <div className="err">That's your own wallet.</div>}
          {phase === "idle" ? (
            <button className="btn btn-primary btn-big" disabled={!validAmount || !!self} onClick={() => setUnlock(true)}>
              {wallet.hasPasskey ? <>{Icon.finger(20)} Pay with fingerprint</> : "Pay with PIN"}
            </button>
          ) : (
            <Processing
              amount={`${amount} USDT`}
              title={`Sending to ${payee?.displayName ?? payee?.name ?? short(payee?.address)}`}
              steps={["Approve on your device", "Sending on Whitechain", "Sent"]}
              step={phase === "signing" ? 0 : phase === "settling" ? 1 : 2}
              done={phase === "finishing"}
            />
          )}
          <div className="sub center">
            {payee.kind === "merchant" || !allow ? "Network fee: 0. WondrPay covers the gas." : `Network fee: 0. ${p2pNote(allow)}`}
          </div>
        </>
      )}
      {unlock && payee && (
        <UnlockSheet payment={{ amountMicro: parseUnits(amount, 6) }} title={`Send ${amount} USDT`} subtitle={`to ${label}`} onUnlocked={pay} onCancel={() => setUnlock(false)} />
      )}
    </main>
  )
}

/** "7 of 10 free transfers left this month", or the fee once they're used up */
function p2pNote(a: { used: number; free: number; left: number }) {
  return a.left > 0
    ? `${a.left} of ${a.free} free transfers left this month.`
    : `Free transfers used this month: later ones cost $0.03 (not charged on testnet).`
}

/** Contract / relayer errors in words a person can act on (same wording as subscriptions). */
function friendlyPayError(msg: string) {
  const m = msg.toLowerCase()
  if (/check your history|check subscriptions|nothing was charged\.$/.test(m)) return msg
  if (/exceeds balance|insufficient|not enough usdt/.test(m)) return "Not enough USDT in this wallet. Add USDT and try again."
  if (/authorization is used|already paid|orderalreadypaid/.test(m)) return "This payment was already made. Nothing more was charged."
  if (/expired|orderexpired/.test(m)) return "This payment request expired. Ask for a new QR code."
  if (/rate|too many/.test(m)) return "Too many attempts. Wait a minute and try again."
  if (/daily limit/.test(m)) return "You've reached today's WondrPay spending limit."
  if (/reject|denied|cancel/.test(m)) return "Cancelled. Nothing was charged."
  if (/fetch|network/.test(m)) return "Network problem: nothing was charged. Check your connection and try again."
  return friendlyError(msg, { action: "sending" })
}
