"use client"
// Approve autopay: ONE PIN / fingerprint, then the device signs one time-boxed authorization per cycle.
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { createPublicClient, http, toHex, type Hex } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { cycleDueAt, cycleAuthTypedData, termsFor, autopayPermitTypedData, AUTOPAY_FACTORY, AUTOPAY_FACTORY_ABI, USDT_PERMIT_ABI } from "@whitepay/shared/autopay"
import { whitechainSepolia, USDT_ADDRESS } from "@whitepay/shared"
import { TopBar, UnlockSheet } from "../components"
import { SuccessCheck, LogoLoader, Icon } from "../ui"
import { getWallet } from "@/lib/wallet"
import { usdt, short, countdown, when } from "@/lib/format"
import { enableReminderNotifications } from "@/lib/reminders"

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
  const [phase, setPhase] = useState<"idle" | "signing" | "charging" | "done" | "failed">("idle")
  const [progress, setProgress] = useState(0)
  const [mode, setMode] = useState<"reminder" | "autopay">("reminder")
  const [notif, setNotif] = useState("")
  const [err, setErr] = useState("")
  const [done, setDone] = useState<{ explorer: string; nextDueAt: number | null } | null>(null)
  const [now, setNow] = useState(() => Date.now() / 1000)
  const [loadErr, setLoadErr] = useState("")

  useEffect(() => {
    setWallet(getWallet())
    const t = setInterval(() => setNow(Date.now() / 1000), 500)
    if (!planKey) { setLoadErr("This subscription link has no plan id. Scan the shop's QR again."); return () => clearInterval(t) }
    if (!/^0x[0-9a-fA-F]{64}$/.test(planKey)) { setLoadErr("This subscription link is damaged (the plan id isn't valid). Ask the shop for a new QR."); return () => clearInterval(t) }
    fetch(`/api/plans/${planKey}`).then(async (r) => {
      const p = (await r.json().catch(() => ({}))) as PlanResp
      if (r.status === 404 || p.state === "expired") return setPlan({ state: "expired" } as PlanResp)
      if (!r.ok || !p.state) return setLoadErr(`WhitePay couldn't load this plan${p.error ? `: ${p.error}` : ` (HTTP ${r.status})`}. Try again in a moment.`)
      setPlan(p)
      if (p.merchant) fetch(`/api/merchants?address=${p.merchant}`).then((r) => r.json()).then((d) => setVerified(!!d.merchant?.verified)).catch(() => {})
    }).catch(() => setLoadErr("You're offline or WhitePay is unreachable. Check your connection and try again."))
    return () => clearInterval(t)
  }, [planKey])

  if (loadErr)
    return (
      <main className="shell"><TopBar />
        <div className="card stack" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Can't open this subscription</div>
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
        <div className="card stack" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{plan.state === "subscribed" ? "Already subscribed" : "This offer has expired"}</div>
          <div className="sub">{plan.state === "subscribed" ? "This checkout QR was already used to start a subscription (each checkout QR works once). Manage it in Autopay." : "The shop's subscription offer behind this QR has expired (checkout QRs last 15 minutes, shared links 7 days). Ask the shop for a fresh one."}</div>
          <a className="btn btn-primary" href="/autopay">Open Autopay</a>
        </div>
      </main>
    )
  if (!wallet)
    return <main className="shell"><TopBar /><div className="card stack"><b>Create a WhitePay wallet first</b><a className="btn btn-primary" href="/app">Create wallet</a></div></main>

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
        const signature = await acct.signTypedData(cycleAuthTypedData({ subscriber: acct.address, merchant: plan.merchant as Hex, amount, subscriptionId, cycle: 0, startAt, period: plan.period, grace: plan.grace }))
        setProgress(1); setPhase("charging")
        const r = await fetch("/api/subscriptions", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ planKey, subscriber: acct.address, subscriptionId, startAt, signature }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "Subscription failed")
        setDone({ explorer: d.explorer, nextDueAt: d.nextDueAt }); setPhase("done")
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
        body: JSON.stringify({ planKey, subscriber: acct.address, subscriptionId, startAt, permit: { deadline, signature } }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Subscription failed")
      setDone({ explorer: d.explorer, nextDueAt: d.nextDueAt }); setPhase("done")
    } catch (e) { setErr(friendly((e as Error).message, amount)); setPhase("failed") }
  }

  if (phase === "done" && done)
    return (
      <main className="shell"><TopBar />
        <div className="result">
          <SuccessCheck />
          <h1>{mode === "reminder" ? "Subscribed" : "Autopay is on"}</h1>
          <div className="sub">{plan.title} · {usdt(amount)} USDT {plan.periodLabel}. First payment done.</div>
          {done.nextDueAt && <div className="timer-big"><span>{mode === "reminder" ? "We'll ask you to pay the next one in" : "Next payment in"}</span><b>{countdown(done.nextDueAt - now)}</b></div>}
          {mode === "reminder" && (
            <button className="btn btn-lime" onClick={async () => setNotif(await enableReminderNotifications())}>
              🔔 Remind me when a payment is due
            </button>
          )}
          {notif && <div className="sub">{notif}</div>}
          <a className="chip" href={done.explorer} target="_blank" rel="noreferrer">First payment on Whitechain ↗</a>
          <a className="btn btn-primary btn-big" href="/autopay">My subscriptions</a>
        </div>
      </main>
    )

  return (
    <main className="shell">
      <TopBar />
      <div className="card stack">
        <div className="row" style={{ justifyContent: "flex-start", gap: 12 }}>
          <span className="sub-ic">{Icon.repeat(28)}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 19 }}>{plan.title}</div>
            <div className="sub">{plan.merchantName ?? short(plan.merchant)} {verified ? <span className="badge badge-ok" style={{ padding: "2px 8px" }}>✓ Verified</span> : verified === false ? <span className="badge badge-warn" style={{ padding: "2px 8px" }}>Unverified shop</span> : null}</div>
          </div>
        </div>
        <div className="big-amount" style={{ textAlign: "center" }}>{usdt(amount)} <span style={{ fontSize: 18, color: "var(--muted)" }}>USDT {plan.periodLabel}</span></div>
        <div className="sub" style={{ textAlign: "center" }}>{plan.cycles} payments · {usdt(total)} USDT total · first one now · 0 gas</div>
      </div>

      <div className="card">
        <h2>Schedule</h2>
        <div className="sched">
          {schedule.map((t, i) => (
            <div key={i} className="sched-row"><span className="dot" data-first={i === 0} /><span>{i === 0 ? "Today, on approval" : when(t)}</span><b>{usdt(amount)}</b></div>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h2>How do you want to pay the next ones?</h2>
        <label className={`mode-opt ${mode === "reminder" ? "on" : ""}`}>
          <input type="radio" name="mode" checked={mode === "reminder"} onChange={() => setMode("reminder")} />
          <div><b>Ask me each time</b> <span className="badge badge-ok" style={{ padding: "1px 7px" }}>Recommended</span>
            <div className="sub">You approve only today's {usdt(amount)} USDT now. When the next payment is due you get a reminder and approve it with one tap. Nothing is pre-approved.</div></div>
        </label>
        <label className={`mode-opt ${mode === "autopay" ? "on" : ""}`}>
          <input type="radio" name="mode" checked={mode === "autopay"} onChange={() => setMode("autopay")} />
          <div><b>Autopay</b>
            <div className="sub">Approve once now; the next payments run on schedule without asking.</div></div>
        </label>
      </div>

      <div className="card stack">
        <h2>What you're approving</h2>
        {mode === "reminder" ? (<>
        <div className="guard"><b>Only this payment.</b> You sign one payment of {usdt(amount)} USDT to this shop. Nothing else is approved.</div>
        <div className="guard"><b>Each later payment asks you first.</b> When it's due, WhitePay shows a request; you approve it (one signature) within {Math.round(plan.grace / 60)} minutes{plan.grace >= 86400 ? ` (${Math.round(plan.grace / 86400)} days)` : ""}. Ignore it and it's simply skipped.</div>
        <div className="guard"><b>Cancel anytime.</b> One signature stops all future requests.</div>
        </>) : (<>
        <div className="guard"><b>One approval, hard limits.</b> You sign once. A contract made only for this subscription can send exactly {usdt(amount)} USDT to this shop once per period, at most {plan.cycles} times ({usdt(total)} USDT cap). It can't be taken early, can't be repeated, and can't go anywhere else.</div>
        <div className="guard"><b>Cancel anytime.</b> One tap (one signature) switches the contract off on-chain, so nobody can charge the remaining payments.</div>
        <div className="guard"><b>Missed payment = skipped.</b> If a payment can't run inside its window, it is skipped, never charged late.</div>
        </>)}
      </div>

      {phase === "signing" || phase === "charging" ? (
        <div className="card">
          <ul className="steps">
            <li className={phase === "signing" ? "active" : "done"}>{phase === "signing" ? <span className="spinner" /> : <span className="tick">✓</span>} {mode === "reminder" ? `${progress ? "Signed" : "Sign"} today's payment on your device (${usdt(amount)} USDT)` : `${progress ? "Approved once" : "Approve once"} on your device (cap ${usdt(total)} USDT)`}</li>
            <li className={phase === "charging" ? "active" : ""}>{phase === "charging" ? <span className="spinner" /> : <span className="tick" style={{ opacity: .3 }}>·</span>} First payment on Whitechain, schedule saved to Arkiv</li>
          </ul>
        </div>
      ) : (
        <button className="btn btn-primary btn-big" disabled={self} onClick={() => setUnlock(true)}>
          {self ? "This is your own shop" : mode === "reminder" ? `Subscribe · pay ${usdt(amount)} USDT now` : `Turn on autopay · ${usdt(amount)} USDT now`}
        </button>
      )}
      {err && <div className="card stack" style={{ borderColor: "var(--bad)" }}><div className="err" style={{ textAlign: "center", fontSize: 15 }}>{err}</div><div className="sub" style={{ textAlign: "center" }}>Nothing is charged unless the first payment succeeds.</div></div>}
      {unlock && <UnlockSheet title={mode === "reminder" ? `Pay ${usdt(amount)} USDT` : "Approve autopay"} subtitle={mode === "reminder" ? `${plan.title}: first payment only` : `${usdt(amount)} USDT ${plan.periodLabel} · ${plan.cycles} payments`} onUnlocked={approve} onCancel={() => setUnlock(false)} />}
    </main>
  )
}

/** Turn contract / relayer errors into something a person can act on. */
function friendly(msg: string, amount: bigint) {
  const m = msg.toLowerCase()
  if (/exceeds balance|insufficient|transfer amount/.test(m)) return `Not enough USDT for the first payment (${usdt(amount)} USDT). Add USDT to this wallet and try again.`
  if (/authorization is used|authorizationused|nonce/.test(m)) return "These payment approvals were already used. Reload the page to start fresh."
  if (/not yet valid|authorization is expired|expired/.test(m)) return "Your phone's clock looks off, so the payment windows don't line up. Turn on automatic date & time and try again."
  if (/already used/.test(m)) return "This checkout QR was already used. Ask the shop for a new one."
  if (/rate|too many/.test(m)) return "Too many attempts. Wait a minute and try again."
  if (/daily limit/.test(m)) return "You've reached today's WhitePay spending limit."
  if (/reject|denied|cancel/.test(m)) return "Approval cancelled."
  if (/fetch|network|failed to fetch/.test(m)) return "Network problem: nothing was charged. Check your connection and try again."
  return `Subscription failed: ${msg}`
}
