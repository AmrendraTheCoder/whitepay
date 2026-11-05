"use client"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { hashTypedData, type Hex } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { orderTypedData, receiveAuthTypedData, ROUTER_ADDRESS, type Order } from "@whitepay/shared"
import { TopBar, UnlockSheet } from "../components"
import { SuccessCheck, LogoLoader } from "../ui"
import { getWallet } from "@/lib/wallet"
import { usdt, initials, mmss } from "@/lib/format"

type Check = { label: string; detail: string }
type ReqResp =
  | { state: "pending"; verifiedMerchant: boolean; merchantDisplayName?: string; checks: Check[]; request: any; order: Record<keyof Order, string>; digest: Hex }
  | { state: "paid"; request: any; receipt?: { explorer: string } }
  | { state: "depleted" | "invalid" | "error" | "publishing"; reason: string; request?: any }

export default function PayPage() {
  return (
    <Suspense fallback={<main className="shell"><LogoLoader /></main>}>
      <Pay />
    </Suspense>
  )
}

function Pay() {
  const key = useSearchParams().get("req") ?? ""
  const [data, setData] = useState<ReqResp | null>(null)
  const [now, setNow] = useState(() => Date.now() / 1000)
  const [unlock, setUnlock] = useState(false)
  const [phase, setPhase] = useState<"idle" | "signing" | "settling" | "done" | "failed">("idle")
  const [result, setResult] = useState<{ explorer?: string; error?: string; code?: string }>({})
  // undefined = not read yet (server render / first paint); read localStorage only after mount
  const [wallet, setWallet] = useState<ReturnType<typeof getWallet> | undefined>(undefined)
  useEffect(() => setWallet(getWallet()), [])

  useEffect(() => {
    // an instant QR may be scanned before its Arkiv write lands (a few seconds): keep checking for up to 45 s
    let stop = false, tries = 0
    const load = async () => {
      const d: ReqResp = await fetch(`/api/requests/${key}`).then((r) => r.json()).catch((e) => ({ state: "error", reason: String(e) }))
      if (stop) return
      if (d.state === "publishing" && tries++ < 30) { setData(d); setTimeout(load, 1500); return }
      setData(d.state === "publishing" ? { state: "depleted", reason: "This payment request expired or doesn't exist. Ask the shop to show the QR again." } : d)
    }
    void load()
    return () => { stop = true }
  }, [key])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 500)
    return () => clearInterval(t)
  }, [])

  if (wallet === undefined) return <main className="shell"><LogoLoader /></main>
  if (!wallet)
    return (
      <main className="shell">
        <TopBar />
        <div className="card stack">
          <h2>Set up WhitePay first</h2>
          <div className="sub">Create your wallet (takes 20 seconds), then scan again.</div>
          <a className="btn btn-primary" href="/app">Create wallet</a>
        </div>
      </main>
    )

  if (!data) return <main className="shell"><LogoLoader label="Verifying payment request…" /></main>
  if (data.state === "publishing") return <main className="shell"><LogoLoader label="Getting the order ready… (saving to Arkiv)" /></main>

  if (data.state !== "pending" && phase === "idle") {
    const paid = data.state === "paid"
    return (
      <main className="shell">
        <TopBar right={<a className="chip" href="/app">Home</a>} />
        <div className="card result">
          <div className={`icon ${paid ? "ok" : "bad"}`}>{paid ? "✓" : "!"}</div>
          <h1>{paid ? "Already paid" : data.state === "depleted" ? "Request expired" : "Can't pay this"}</h1>
          <div className="sub">
            {paid ? "This request was completed. It can't be paid twice." : "reason" in data ? data.reason : ""}
          </div>
          {paid && data.receipt?.explorer && <a className="chip" href={data.receipt.explorer} target="_blank" rel="noreferrer">View on Whitechain ↗</a>}
        </div>
        <a className="btn btn-ghost" href="/scan">Scan another</a>
      </main>
    )
  }

  const pending = data.state === "pending" ? data : null
  const req = (data as any).request ?? {}
  const left = pending ? Number(pending.order.deadline) - now : 0
  const expired = !!pending && left <= 0

  const pay = async (account: PrivateKeyAccount) => {
    if (!pending) return
    setUnlock(false)
    setPhase("signing")
    try {
      const order: Order = {
        merchant: pending.order.merchant as Hex,
        amount: BigInt(pending.order.amount),
        orderId: pending.order.orderId as Hex,
        deadline: BigInt(pending.order.deadline),
      }
      // Don't trust the server blindly: recompute the order digest on the device.
      const digest = hashTypedData(orderTypedData(ROUTER_ADDRESS, order))
      if (digest.toLowerCase() !== pending.digest.toLowerCase()) throw new Error("Order digest mismatch. Not signing.")

      const auth = { from: account.address, to: ROUTER_ADDRESS, value: order.amount, validAfter: 0n, validBefore: order.deadline, nonce: digest }
      const signature = await account.signTypedData(receiveAuthTypedData(auth))
      const body = { entityKey: key, auth: { from: account.address, validAfter: "0", validBefore: order.deadline.toString(), signature } }
      await submit(body, account.address, digest)
    } catch (e) {
      setResult({ error: (e as Error).message, code: (e as any).code })
      setPhase("failed")
    }
  }

  async function submit(body: any, payer: string, ref: Hex) {
    setPhase("settling")
    try {
      const r = await fetch("/api/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const out = await r.json()
      if (!r.ok) throw Object.assign(new Error(out.error ?? "Payment failed"), { code: out.code })
      setResult({ explorer: out.explorer })
      setPhase("done")
    } catch (e) {
      setResult({ error: (e as Error).message, code: (e as any).code })
      setPhase("failed")
    }
  }

  if (phase === "done" || phase === "failed")
    return (
      <main className="shell">
        <TopBar right={<a className="chip" href="/app">Home</a>} />
        <div className="card result">
          {phase === "done" ? <SuccessCheck /> : <div className="icon bad">✕</div>}
          <h1>{phase === "done" ? `Paid ${usdt(req.amount)} USDT` : "Payment not sent"}</h1>
          <div className="sub">
            {phase === "done"
              ? `to ${req.merchantName}. Settled on Whitechain, receipt saved on Arkiv. You paid no gas.`
              : result.error}
          </div>
          {result.explorer && <a className="chip" href={result.explorer} target="_blank" rel="noreferrer">View on Whitechain ↗</a>}
        </div>
        <a className="btn btn-primary" href="/app">Done</a>
      </main>
    )

  return (
    <main className="shell">
      <TopBar right={<a className="chip" href="/scan">Cancel</a>} />
      <div className="card">
        <div className="payee">
          <div className="avatar">{initials(pending?.merchantDisplayName ?? req.merchantName)}</div>
          <div className="name">{pending?.merchantDisplayName ?? req.merchantName}</div>
          {pending?.merchantDisplayName && <div className="sub">{req.merchantName}</div>}
          <div style={{ marginTop: 6 }}>
            {pending?.verifiedMerchant ? <span className="badge badge-ok">✓ Verified merchant</span> : <span className="badge badge-warn">Unverified merchant</span>}
          </div>
        </div>
        <div className="sub" style={{ textAlign: "center", marginTop: 14 }}>You are paying</div>
        <div className="big-amount">{usdt(req.amount)} <span style={{ fontSize: 20, color: "var(--muted)" }}>USDT</span></div>
        <div className="sub" style={{ textAlign: "center" }}>
          {expired ? <span className="badge badge-bad">Expired</span> : <>Request expires in <span className="countdown">{mmss(left)}</span></>}
        </div>
      </div>

      {pending && (
        <div className="card">
          <h2>Verified before you pay</h2>
          <ul className="checks">
            {pending.checks.map((c) => (
              <li key={c.label}><span className="tick">✓</span><div><div>{c.label}</div><div className="sub">{c.detail}</div></div></li>
            ))}
          </ul>
        </div>
      )}

      {phase === "idle" ? (
        <button className="btn btn-primary btn-big" disabled={expired} onClick={() => setUnlock(true)}>
          {wallet.hasPasskey ? "☝︎ Pay with fingerprint" : "Pay with PIN"}
        </button>
      ) : (
        <div className="card">
          <ul className="steps">
            <li className="done"><span className="tick">✓</span> Request verified</li>
            <li className={phase === "signing" ? "active" : "done"}>{phase === "signing" ? <span className="spinner" /> : <span className="tick">✓</span>} Signed on your device</li>
            <li className={phase === "settling" ? "active" : ""}>{phase === "settling" ? <span className="spinner" /> : <span className="tick" style={{ opacity: 0.3 }}>·</span>} Settling on Whitechain, saving receipt to Arkiv</li>
          </ul>
        </div>
      )}
      <div className="sub" style={{ textAlign: "center" }}>Network fee: 0. WhitePay covers the gas.</div>

      {unlock && (
        <UnlockSheet
          title={`Pay ${usdt(req.amount)} USDT`}
          subtitle={`to ${req.merchantName}`}
          onUnlocked={pay}
          onCancel={() => setUnlock(false)}
        />
      )}
    </main>
  )
}
