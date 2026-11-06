"use client"
// Approve autopay: ONE PIN / fingerprint, then the device signs one time-boxed authorization per cycle.
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { createPublicClient, http, toHex, type Hex } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { cycleDueAt, cycleAuthTypedData, termsFor, autopayPermitTypedData, AUTOPAY_FACTORY, AUTOPAY_FACTORY_ABI, USDT_PERMIT_ABI } from "@whitepay/shared/autopay"
import { whitechainSepolia, USDT_ADDRESS } from "@whitepay/shared"
import { TopBar, UnlockSheet } from "../components"
import { SuccessCheck, LogoLoader, Icon, Countdown } from "../ui"
import { getWallet } from "@/lib/wallet"
import { usdt, short, countdown, when } from "@/lib/format"
import { enableReminderNotifications } from "@/lib/reminders"
import { Processing } from "../processing"
import { settle } from "@/lib/settle"
import "./subscribe.css"

type PlanResp = {
  state: "open" | "subscribed" | "expired"; planKey: string; title: string; merchant: string; merchantName?: string; amount: string
  period: number; periodLabel: string; grace: number; cycles: number; expiresAt: string; single: boolean; error?: string
}

export default function SubscribePage() {
  return <Suspense fallback={<main className="shell"><LogoLoader /></main>}><Subscribe /></Suspense>
}

function Subscribe() {
  const planKey = useSearchParams().get("plan") ?? ""
  const [plan, setPlan] = useState<PlanResp | null>(null)
  const [verified, setVerified] = useState<boolean | null>(null)
  const [wallet, setWallet] = useState<ReturnType<typeof getWallet> | undefined>(undefined)
  const [unlock, setUnlock] = useState(false)
  const [phase, setPhase] = useState<"idle" | "signing" | "charging" | "finishing" | "done" | "failed">("idle")
  const [progress, setProgress] = useState(0)
  const [mode, setMode] = useState<"reminder" | "autopay">("reminder")
  const [notif, setNotif] = useState("")
  const [err, setErr] = useState("")
  const [done, setDone] = useState<{ explorer: string; nextDueAt: number | null; tx?: string } | null>(null)
  const [now] = useState(() => Date.now() / 1000) // schedule preview is anchored at page open; no per-tick re-renders
  const [loadErr, setLoadErr] = useState("")

  useEffect(() => {
    setWallet(getWallet())
    if (!planKey) { setLoadErr("This subscription link has no plan id. Scan the shop's QR again."); return }
    if (!/^0x[0-9a-fA-F]{64}$/.test(planKey)) { setLoadErr("This subscription link is damaged (the plan id isn't valid). Ask the shop for a new QR."); return }
    let tries = 0
    const load = () => fetch(`/api/plans/${planKey}`).then(async (r) => {
      const p = (await r.json().catch(() => ({}))) as PlanResp
      // scanned before the plan's Arkiv write landed (a few seconds): keep checking for up to 45 s
      if ((p.state as string) === "publishing") { if (tries++ < 30) { setTimeout(load, 1500); return } return setPlan({ state: "expired" } as PlanResp) }
      if (r.status === 404 || p.state === "expired") return setPlan({ state: "expired" } as PlanResp)
      if (!r.ok || !p.state) return setLoadErr(`WondrPay couldn't load this plan${p.error ? `: ${p.error}` : ` (HTTP ${r.status})`}. Try again in a moment.`)
      setPlan(p)
      if (p.merchant) fetch(`/api/merchants?address=${p.merchant}`).then((r) => r.json()).then((d) => setVerified(!!d.merchant?.verified)).catch(() => {})
    }).catch(() => setLoadErr("You're offline or WondrPay is unreachable. Check your connection and try again."))
    void load()
    return undefined
  }, [planKey])

  if (loadErr)
    return (
      <main className="shell"><TopBar />
        <div className="card stack center">
          <div className="title">Can't open this subscription</div>
          <div className="err" style={{ fontSize: 15 }}>{loadErr}</div>
          <button className="btn btn-primary" onClick={() => location.reload()}>Try again</button>
          <a className="btn btn-ghost" href="/scan">Scan another QR</a>
        </div>
      </main>
    )
  if (!plan || wallet === undefined) return <main className="shell"><LogoLoader /></main>
  if (plan.state !== "open" && phase !== "done")
    return (
      <main className="shell"><TopBar />
        <div className="card stack center">
          <div className="title">{plan.state === "subscribed" ? "Already subscribed" : "This offer has expired"}</div>
          <div className="sub">{plan.state === "subscribed" ? "This checkout QR was already used to start a subscription (each checkout QR works once). Manage it in Autopay." : "The shop's subscription offer behind this QR has expired (checkout QRs last 15 minutes, shared links 7 days). Ask the shop for a fresh one."}</div>
          <a className="btn btn-primary" href="/autopay">Open Autopay</a>
        </div>
      </main>
    )
  if (!wallet)
    return <main className="shell"><TopBar /><div className="card stack"><b>Create a WondrPay wallet first</b><a className="btn btn-primary" href="/app">Create wallet</a></div></main>

  const amount = BigInt(plan.amount)
  const total = amount * BigInt(plan.cycles)
  const self = wallet.address.toLowerCase() === plan.merchant.toLowerCase()
  const schedule = Array.from({ length: plan.cycles }, (_, i) => cycleDueAt(Math.floor(now), plan.period, i))

  const approve = async (acct: PrivateKeyAccount) => {
    setUnlock(false); setPhase("signing"); setErr(""); setProgress(0)
    try {
      const subscriptionId = toHex(crypto.getRandomValues(new Uint8Array(32))) as Hex
      const startAt = Math.floor(Date.now() / 1000)
      if (mode === "reminder") {
        // sign ONLY the first payment; every later one is requested when due and approved then
        const td = cycleAuthTypedData({ subscriber: acct.address, merchant: plan.merchant as Hex, amount, subscriptionId, cycle: 0, startAt, period: plan.period, grace: plan.grace })
        const signature = await acct.signTypedData(td)
        setProgress(1); setPhase("charging")
        // timeout / dropped connection: ask the chain whether the first payment went through
        const d = await settle("/api/subscriptions", { planKey, subscriber: acct.address, subscriptionId, startAt, signature },
          { from: acct.address, nonce: (td.message as any).nonce }) as any
        setDone({ explorer: d.explorer, nextDueAt: d.nextDueAt ?? (plan.cycles > 1 ? cycleDueAt(startAt, plan.period, 1) : null), tx: d.firstTx }); setPhase("finishing"); setTimeout(() => setPhase("done"), 1100)
        return
      }
      const terms = termsFor({ subscriber: acct.address, merchant: plan.merchant as Hex, amount, period: plan.period, grace: plan.grace, cycles: plan.cycles, startAt, subscriptionId })
      // read the subscription's contract address and permit nonce straight from Whitechain, not from our server:
      // the one signature below is only valid for the clone that encodes exactly these terms
      const chain = createPublicClient({ chain: whitechainSepolia, transport: http() })
      const [spender, nonce] = await Promise.all([
        chain.readContract({ address: AUTOPAY_FACTORY, abi: AUTOPAY_FACTORY_ABI, functionName: "mandateAddress", args: [terms] }),
        chain.readContract({ address: USDT_ADDRESS, abi: USDT_PERMIT_ABI, functionName: "nonces", args: [acct.address] }),
      ])
      const deadline = startAt + 1800
      // the ONE signature (one MetaMask prompt): let this subscription's contract pull at most amount × cycles
      const signature = await acct.signTypedData(autopayPermitTypedData({ owner: acct.address, spender, value: total, nonce, deadline: BigInt(deadline) }))
      setProgress(1)
      setPhase("charging")
      const r = await fetch("/api/subscriptions", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ planKey, subscriber: acct.address, subscriptionId, startAt, permit: { deadline, signature } }), signal: AbortSignal.timeout(50_000) })
        .catch(() => { throw new Error("Network problem. Check Subscriptions before trying again.") })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? "Subscription failed")
      setDone({ explorer: d.explorer, nextDueAt: d.nextDueAt, tx: d.firstTx }); setPhase("finishing"); setTimeout(() => setPhase("done"), 1100)
    } catch (e) { setErr(friendly((e as Error).message, amount)); setPhase("failed") }
  }

  if (phase === "done" && done)
    return (
      <main className="shell"><TopBar />
        <div className="result sbx-done">
          <SuccessCheck />
          <h1>{mode === "reminder" ? "Subscribed" : "Autopay is on"}</h1>
          <div className="sub">{plan.title} · {usdt(amount)} USDT {shortPeriod(plan.periodLabel)}</div>
          {done.nextDueAt && (
            <div className="sbx-next">
              <span>{mode === "reminder" ? "Next request in" : "Next payment in"}</span>
              <b><Countdown to={done.nextDueAt} format={countdown} /></b>
            </div>
          )}
          <a className="receipt-card" href={done.explorer} target="_blank" rel="noreferrer">
            <span className="ic" aria-hidden>{Icon.check(18)}</span>
            <span className="grow">
              <b>First payment · {usdt(amount)} USDT</b>
              <span className="sub">to {plan.merchantName ?? short(plan.merchant)} · tx {done.tx ? short(done.tx) : "confirmed"}</span>
            </span>
            <span className="go">Explorer {Icon.arrow(14)}</span>
          </a>
          {mode === "reminder" && (
            <button className="btn btn-lime" onClick={async () => setNotif(await enableReminderNotifications())}>{Icon.bell(18)} Remind me when it's due</button>
          )}
          {notif && <div className="sub">{notif}</div>}
          <a className="btn btn-primary btn-big" href="/autopay">My subscriptions</a>
        </div>
      </main>
    )

  const busyNow = phase === "signing" || phase === "charging" || phase === "finishing"
  return (
    <main className="shell sbx">
      <TopBar />
      <section className="card sbx-head">
        <div className="sbx-shop">
          <span className="sub-ic">{Icon.repeat(26)}</span>
          <div className="grow">
            <b>{plan.title}</b>
            <span className="sub">{plan.merchantName ?? short(plan.merchant)} {verified ? <span className="badge badge-ok badge-sm">{Icon.check(12)} Verified</span> : verified === false ? <span className="badge badge-warn badge-sm">Unverified</span> : null}</span>
          </div>
        </div>
        <div className="sbx-amt"><b>{usdt(amount)}</b><span>USDT</span><em>{shortPeriod(plan.periodLabel)}</em></div>
        <div className="sbx-meta"><span>{plan.cycles} payments</span><span>{usdt(total)} USDT total</span><span>0 gas</span></div>
        <ol className="sbx-tl" aria-label="Schedule">
          {schedule.map((t, i) => (
            <li key={i} className={i === 0 ? "now" : ""}><i aria-hidden /><b>{i === 0 ? "Today" : when(t).replace(/^.*?, /, "")}</b><span>{usdt(amount)}</span></li>
          ))}
        </ol>
      </section>

      <section className="card sbx-modes" role="radiogroup" aria-label="How to pay the next ones">
        <h2>Next payments</h2>
        <label className={`sbx-mode ${mode === "reminder" ? "on" : ""}`}>
          <input type="radio" name="mode" checked={mode === "reminder"} onChange={() => setMode("reminder")} />
          <span className="ic" aria-hidden>{Icon.bell(18)}</span>
          <span className="grow"><b>Ask me each time</b><span className="sub">One tap when each one is due</span></span>
          <span className="badge badge-ok badge-sm">Best</span>
        </label>
        <label className={`sbx-mode ${mode === "autopay" ? "on" : ""}`}>
          <input type="radio" name="mode" checked={mode === "autopay"} onChange={() => setMode("autopay")} />
          <span className="ic" aria-hidden>{Icon.repeat(18)}</span>
          <span className="grow"><b>Autopay</b><span className="sub">Approve once, runs on schedule</span></span>
        </label>
        <ul className="sbx-points">
          {(mode === "reminder"
            ? [`Only today's ${usdt(amount)} USDT now`, "Each next payment asks you first", "Cancel anytime"]
            : [`Capped at ${usdt(total)} USDT`, "Only to this shop, on schedule", "Cancel anytime, on-chain"]
          ).map((p) => <li key={p}><span aria-hidden>{Icon.check(14)}</span>{p}</li>)}
        </ul>
      </section>

      {err && <div className="notice bad" role="alert">{err}</div>}
      <button className="btn btn-primary btn-big sbx-cta" disabled={self || busyNow} onClick={() => setUnlock(true)}>
        {self ? "This is your own shop" : mode === "reminder" ? `Subscribe · pay ${usdt(amount)} USDT` : `Turn on autopay · ${usdt(amount)} USDT`}
      </button>

      {busyNow && (
        <Processing
          amount={`${usdt(amount)} USDT`}
          title={mode === "reminder" ? "Subscribing" : "Turning on autopay"}
          steps={[mode === "reminder" ? "Approve on your device" : "Approve once on your device", "Paying on Whitechain", "Subscribed"]}
          step={phase === "signing" ? 0 : phase === "charging" ? 1 : 2}
          done={phase === "finishing"}
        />
      )}
      {unlock && <UnlockSheet title={mode === "reminder" ? `Pay ${usdt(amount)} USDT` : "Approve autopay"} subtitle={mode === "reminder" ? `${plan.title}: first payment only` : `${usdt(amount)} USDT ${shortPeriod(plan.periodLabel)} · ${plan.cycles} payments`} onUnlocked={approve} onCancel={() => setUnlock(false)} />}
    </main>
  )
}

const shortPeriod = (label: string) => label.replace(" (demo)", "").replace(/^every 2 minutes$/, "every 2 min")

/** Turn contract / relayer errors into something a person can act on. */
function friendly(msg: string, amount: bigint) {
  const m = msg.toLowerCase()
  if (/check your history|check subscriptions|nothing was charged\.$/.test(m)) return msg
  if (/exceeds balance|insufficient|transfer amount/.test(m)) return `Not enough USDT for the first payment (${usdt(amount)} USDT). Add USDT to this wallet and try again.`
  if (/authorization is used|authorizationused|nonce/.test(m)) return "These payment approvals were already used. Reload the page to start fresh."
  if (/not yet valid|authorization is expired|expired/.test(m)) return "Your phone's clock looks off, so the payment windows don't line up. Turn on automatic date & time and try again."
  if (/already used/.test(m)) return "This checkout QR was already used. Ask the shop for a new one."
  if (/rate|too many/.test(m)) return "Too many attempts. Wait a minute and try again."
  if (/daily limit/.test(m)) return "You've reached today's WondrPay spending limit."
  if (/reject|denied|cancel/.test(m)) return "Approval cancelled."
  if (/fetch|network|failed to fetch/.test(m)) return "Network problem: nothing was charged. Check your connection and try again."
  return `Subscription failed: ${msg}`
}
