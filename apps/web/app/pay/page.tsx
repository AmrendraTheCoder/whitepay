"use client"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { hashTypedData, type Hex } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { orderTypedData, receiveAuthTypedData, ROUTER_ADDRESS, type Order } from "@whitepay/shared"
import { TopBar, UnlockSheet } from "../components"
import { SuccessCheck, LogoLoader, Countdown, Icon } from "../ui"
import { Processing } from "../processing"
import { getWallet } from "@/lib/wallet"
import { usdt, initials, mmss } from "@/lib/format"
import { settle, SettleError } from "@/lib/settle"

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
  const [, refresh] = useState(0) // re-render once, exactly when the request expires
  const [unlock, setUnlock] = useState(false)
  const [phase, setPhase] = useState<"idle" | "signing" | "settling" | "finishing" | "done" | "failed">("idle")
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
  const deadline = data?.state === "pending" ? Number(data.order.deadline) : 0
  useEffect(() => {
    if (!deadline) return
    const t = setTimeout(() => refresh((n) => n + 1), Math.max(0, deadline * 1000 - Date.now()) + 50)
    return () => clearTimeout(t)
  }, [deadline])

  if (wallet === undefined) return <main className="shell"><LogoLoader /></main>
  if (!wallet)
    return (
      <main className="shell">
        <TopBar />
        <div className="card stack">
          <h2>Set up WondrPay first</h2>
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
          <div className={`icon ${paid ? "ok" : "bad"}`}>{paid ? Icon.check(40) : "!"}</div>
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
  const left = pending ? Number(pending.order.deadline) - Date.now() / 1000 : 0
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
      setResult({ error: friendlyPayError((e as Error).message), code: (e as any).code })
      setPhase("failed")
    }
  }

  async function submit(body: any, payer: string, ref: Hex) {
    setPhase("settling")
    try {
      // a timeout or dropped connection is checked against the chain before we say anything
      const out = await settle("/api/pay", body, { from: payer, nonce: ref })
      setResult({ explorer: out.explorer as string | undefined })
      setPhase("finishing")
      setTimeout(() => setPhase("done"), 900)
    } catch (e) {
      const err = e as SettleError
      setResult({ error: err.code === "unconfirmed" ? err.message : friendlyPayError(err.message), code: err.code })
      setPhase("failed")
    }
  }

  if (phase === "done" || phase === "failed")
    return (
      <main className="shell">
        <TopBar right={<a className="chip" href="/app">Home</a>} />
        <div className="card result">
          {phase === "done" ? <SuccessCheck /> : <div className="icon bad" aria-hidden>{Icon.close(40)}</div>}
          <h1>{phase === "done" ? `Paid ${usdt(req.amount)} USDT` : result.code === "unconfirmed" ? "Couldn't confirm" : "Payment not sent"}</h1>
          <div className="sub">
            {phase === "done"
              ? `to ${req.merchantName}. Settled on Whitechain, receipt saved on Arkiv. You paid no gas.`
              : result.error}
          </div>
          {result.explorer && <a className="chip" href={result.explorer} target="_blank" rel="noreferrer">View on Whitechain ↗</a>}
        </div>
        {phase === "failed" && result.code !== "unconfirmed" && !/already|expired/i.test(result.error ?? "") && (
          <button className="btn btn-primary" onClick={() => { setResult({}); setPhase("idle") }}>Try again</button>
        )}
        <a className={`btn ${phase === "failed" ? "btn-ghost" : "btn-primary"}`} href={phase === "failed" && result.code === "unconfirmed" ? "/transactions" : "/app"}>
          {phase === "failed" && result.code === "unconfirmed" ? "Check history" : "Done"}
        </a>
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
          <div className="mt-2">
            {pending?.verifiedMerchant ? <span className="badge badge-ok">{Icon.check(14)} Verified merchant</span> : <span className="badge badge-warn">Unverified merchant</span>}
          </div>
        </div>
        <div className="sub center mt-4">You are paying</div>
        <div className="big-amount">{usdt(req.amount)} <span className="unit">USDT</span></div>
        <div className="sub center">
          {expired ? <span className="badge badge-bad">Expired</span> : <>Request expires in <Countdown to={Number(pending!.order.deadline)} /></>}
        </div>
      </div>

      {pending && (
        <div className="card">
          <h2>Verified before you pay</h2>
          <ul className="checks">
            {pending.checks.map((c) => (
              <li key={c.label}><span className="tick" aria-hidden>{Icon.check(14)}</span><div><div>{c.label}</div><div className="sub">{c.detail}</div></div></li>
            ))}
          </ul>
        </div>
      )}

      {phase === "idle" ? (
        <button className="btn btn-primary btn-big" disabled={expired} onClick={() => setUnlock(true)}>
          {wallet.hasPasskey ? <>{Icon.finger(20)} Pay with fingerprint</> : "Pay with PIN"}
        </button>
      ) : (
        <Processing
          amount={`${usdt(req.amount)} USDT`}
          title={`Paying ${req.merchantName ?? "the shop"}`}
          steps={["Approve on your device", "Paying on Whitechain", "Paid"]}
          step={phase === "signing" ? 0 : phase === "settling" ? 1 : 2}
          done={phase === "finishing"}
        />
      )}
      <div className="sub center">Network fee: 0. WondrPay covers the gas.</div>

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
  return msg
}
