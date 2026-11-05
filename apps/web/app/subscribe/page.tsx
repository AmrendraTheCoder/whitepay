"use client"
// Approve autopay: ONE PIN / fingerprint, then the device signs one time-boxed authorization per cycle.
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { toHex, type Hex } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { cycleAuthTypedData, cycleDueAt } from "@whitepay/shared/autopay"
import { TopBar, UnlockSheet } from "../components"
import { SuccessCheck, LogoLoader, Icon } from "../ui"
import { getWallet } from "@/lib/wallet"
import { usdt, short, countdown, when } from "@/lib/format"

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
      const signatures: Hex[] = []
      for (let i = 0; i < plan.cycles; i++) {
        // cycle i can only ever execute between (due - 30 s) and (due + grace), to this shop, for this amount
        signatures.push(await acct.signTypedData(cycleAuthTypedData({ subscriber: acct.address, merchant: plan.merchant as Hex, amount, subscriptionId, cycle: i, startAt, period: plan.period, grace: plan.grace })))
        setProgress(i + 1)
      }
      setPhase("charging")
      const r = await fetch("/api/subscriptions", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ planKey, subscriber: acct.address, subscriptionId, startAt, signatures }) })
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
          <h1>Autopay is on</h1>
          <div className="sub">{plan.title} · {usdt(amount)} USDT {plan.periodLabel}. First payment done.</div>
          {done.nextDueAt && <div className="timer-big"><span>Next payment in</span><b>{countdown(done.nextDueAt - now)}</b></div>}
          <a className="chip" href={done.explorer} target="_blank" rel="noreferrer">First payment on Whitechain ↗</a>
          <a className="btn btn-primary btn-big" href="/autopay">Manage autopay</a>
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
        <h2>What you're approving</h2>
        <div className="guard"><b>Each payment has its own time window.</b> It can't be taken early, can't be repeated, and only this shop can receive it. Your phone signs the windows; the USDT contract enforces them.</div>
        <div className="guard"><b>Cancel anytime.</b> Cancelling revokes every remaining payment on-chain, so nobody can charge them later.</div>
        <div className="guard"><b>One approval.</b> You confirm once now. Later payments run on schedule without asking again.</div>
      </div>

      {phase === "signing" || phase === "charging" ? (
        <div className="card">
          <ul className="steps">
            <li className={phase === "signing" ? "active" : "done"}>{phase === "signing" ? <span className="spinner" /> : <span className="tick">✓</span>} Signed {progress}/{plan.cycles} payment windows on your device</li>
            <li className={phase === "charging" ? "active" : ""}>{phase === "charging" ? <span className="spinner" /> : <span className="tick" style={{ opacity: .3 }}>·</span>} First payment on Whitechain, schedule saved to Arkiv</li>
          </ul>
        </div>
      ) : (
        <button className="btn btn-primary btn-big" disabled={self} onClick={() => setUnlock(true)}>
          {self ? "This is your own shop" : `Approve autopay · ${usdt(amount)} USDT now`}
        </button>
      )}
      {err && <div className="card stack" style={{ borderColor: "var(--bad)" }}><div className="err" style={{ textAlign: "center", fontSize: 15 }}>{err}</div><div className="sub" style={{ textAlign: "center" }}>Nothing is charged unless the first payment succeeds.</div></div>}
      {unlock && <UnlockSheet title="Approve autopay" subtitle={`${usdt(amount)} USDT ${plan.periodLabel} · ${plan.cycles} payments`} onUnlocked={approve} onCancel={() => setUnlock(false)} />}
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
