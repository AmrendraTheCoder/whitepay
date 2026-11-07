"use client"
// Approve adding another of your wallets (e.g. MetaMask on a laptop) to your WondrPay name, from the device
// that holds the named wallet. The new wallet already signed its half; this device adds the named wallet's
// signature and sends both to the same endpoint the on-device "Approve from …" flow uses.
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { getAddress, isAddress, verifyMessage } from "viem"
import type { PrivateKeyAccount } from "viem/accounts"
import { nameClaimMessage, linkAccountMessage, LABEL_RE } from "@whitepay/shared"
import { listWallets, type WalletInfo } from "@/lib/wallet"
import { short } from "@/lib/format"
import { TopBar, UnlockSheet } from "../components"
import { LogoLoader } from "../ui"
import { matchCode } from "../claim-name"

type Req = { label: string; to: `0x${string}`; issuedAt: number; signature: `0x${string}` }
type Sponsor = WalletInfo & { name: string }

function parse(p: URLSearchParams): Req | string {
  const label = (p.get("l") ?? "").toLowerCase(), to = p.get("to") ?? "", t = Number(p.get("t")), s = p.get("s") ?? ""
  if (!LABEL_RE.test(label) || !isAddress(to) || !Number.isInteger(t) || !/^0x[0-9a-fA-F]{130,}$/.test(s)) return "This approval link is incomplete. Make a new one on the other device."
  return { label, to: getAddress(to), issuedAt: t, signature: s as `0x${string}` }
}

function Approve() {
  const params = useSearchParams()
  const [req, setReq] = useState<Req | string | null>(null)
  const [sponsor, setSponsor] = useState<Sponsor | null | undefined>(undefined)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [unlock, setUnlock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [done, setDone] = useState<string | null>(null)

  // check the link: well formed, and really signed by the new wallet for this name
  useEffect(() => {
    const r = parse(params)
    if (typeof r === "string") { setReq(r); return }
    verifyMessage({ address: r.to, message: nameClaimMessage({ label: r.label, address: r.to, issuedAt: r.issuedAt }), signature: r.signature })
      .then((ok) => setReq(ok ? r : "This link wasn't signed by the wallet it names. Don't approve it."))
      .catch(() => setReq("This link wasn't signed by the wallet it names. Don't approve it."))
  }, [params])
  // the wallet on THIS device that holds the name
  useEffect(() => {
    if (!req || typeof req === "string") return
    let live = true
    void (async () => {
      for (const w of listWallets()) {
        const d = await fetch(`/api/resolve?q=${w.address}`).then((r) => r.json()).catch(() => null)
        if (d?.kind === "person" && d.name === `${req.label}.wondrpay.eth`) { if (live) setSponsor({ ...w, name: d.name }); return }
      }
      if (live) setSponsor(null)
    })()
    return () => { live = false }
  }, [req])
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t) }, [])

  const approve = async (from: PrivateKeyAccount) => {
    setUnlock(false)
    if (!req || typeof req === "string" || !sponsor) return
    setBusy(true); setErr("")
    try {
      const fromSignature = await from.signMessage({ message: linkAccountMessage({ from: from.address, to: req.to, label: req.label, issuedAt: req.issuedAt }) })
      const r = await fetch("/api/names", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: req.label, address: req.to, issuedAt: req.issuedAt, signature: req.signature, from: from.address, fromSignature }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? "Couldn't add the wallet. Try again.")
      setDone(d.name ?? sponsor.name)
    } catch (e) {
      const m = (e as Error).message
      setErr(/expired/i.test(m) ? "This link expired. Make a new one on the other device." : /reject|denied|cancel/i.test(m) ? "Cancelled. Nothing changed." : m)
    } finally { setBusy(false) }
  }

  if (req === null || (typeof req !== "string" && sponsor === undefined)) return <main className="shell"><LogoLoader /></main>
  const left = typeof req === "string" ? 0 : req.issuedAt + 600 - now

  return (
    <main className="shell">
      <TopBar />
      <div className="card stack">
        {typeof req === "string" ? (
          <><h2>Can’t use this link</h2><div className="sub text-bad" role="alert">{req}</div></>
        ) : done ? (
          <>
            <h2>Wallet added</h2>
            <div className="sub"><b>{short(req.to)}</b> now shows as <b>{done}</b>. Go back to your other device: it finishes on its own.</div>
            <a className="btn btn-primary" href="/app">Done</a>
          </>
        ) : !sponsor ? (
          <>
            <h2>Open this on your other device</h2>
            <div className="sub">No wallet on this device holds <b>{req.label}.wondrpay.eth</b>. Open the link on the phone or browser where that name’s wallet lives, then approve there.</div>
            <a className="btn btn-ghost" href="/app">Back to WondrPay</a>
          </>
        ) : left <= 0 ? (
          <><h2>This link expired</h2><div className="sub text-bad" role="alert">Approval links last 10 minutes. Make a new one on the other device.</div></>
        ) : (
          <>
            <h2>Add a wallet to {sponsor.name}?</h2>
            <div className="sub">The wallet <b>{short(req.to)}</b> asked to use your name. Once added, it shows as {sponsor.name} and shares your World ID limits.</div>
            <div className="center"><div className="sub">Check this code matches your other screen</div><div className="strong" style={{ fontSize: 28, letterSpacing: 2 }}>{matchCode(req.signature)}</div></div>
            <div className="sub text-bad">Only approve if you started this on your own device just now. Never approve a link someone sent you.</div>
            <button className="btn btn-primary" disabled={busy} onClick={() => setUnlock(true)}>{busy ? <span className="spinner" /> : null} Approve with {sponsor.label}</button>
            <a className="btn btn-ghost" href="/app">Don’t approve</a>
            <div className="sub center">Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div>
          </>
        )}
        {err && <div className="sub center text-bad" role="alert">{err}</div>}
      </div>
      {unlock && sponsor && typeof req !== "string" && (
        <UnlockSheet wallet={sponsor} title="Approve new wallet" subtitle={`add ${short(req.to)} to ${sponsor.name}`} onUnlocked={approve} onCancel={() => setUnlock(false)} />
      )}
    </main>
  )
}

export default function ApprovePage() {
  return <Suspense fallback={<main className="shell"><LogoLoader /></main>}><Approve /></Suspense>
}
