"use client"
import { useEffect, useState } from "react"
import type { PrivateKeyAccount } from "viem/accounts"
import { nameClaimMessage, linkAccountMessage, LABEL_RE } from "@whitepay/shared"
import { listWallets, type WalletInfo } from "@/lib/wallet"
import { UnlockSheet } from "./components"
import { WorldVerify } from "./world"

/** UPI VPA, on ENS: claim <name>.wondrpay.eth. Each wallet gets its own name; one World ID covers up to
 *  5 wallets. A wallet on this device that is already verified can vouch for a new one (no second scan). */
export function ClaimName({ address, onClaimed }: { address: `0x${string}`; onClaimed: () => void }) {
  const [label, setLabel] = useState("")
  const [avail, setAvail] = useState<{ available: boolean; reason?: string | null } | null>(null)
  const [unlock, setUnlock] = useState(false)
  const [signed, setSigned] = useState<{ issuedAt: number; signature: string } | null>(null)
  const [msg, setMsg] = useState("")
  // another wallet on this device that already passed World ID: it can vouch for this one
  const [sponsor, setSponsor] = useState<(WalletInfo & { name?: string }) | null>(null)
  const [useWorld, setUseWorld] = useState(false)
  const [cosign, setCosign] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    const others = listWallets().filter((w) => w.address.toLowerCase() !== address.toLowerCase())
    void (async () => {
      for (const w of others) {
        const st = await fetch(`/api/world/status?address=${w.address}`).then((r) => r.json()).catch(() => null)
        if (!st?.nameVerified) continue
        const who = await fetch(`/api/resolve?q=${w.address}`).then((r) => r.json()).catch(() => null)
        if (live) setSponsor({ ...w, name: who?.name })
        return
      }
    })()
    return () => { live = false }
  }, [address])

  const link = async (from: PrivateKeyAccount) => {
    setCosign(false)
    if (!signed) return
    setBusy(true); setMsg("")
    try {
      const fromSignature = await from.signMessage({ message: linkAccountMessage({ from: from.address, to: address, label, issuedAt: signed.issuedAt }) })
      const r = await fetch("/api/names", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, address, issuedAt: signed.issuedAt, signature: signed.signature, from: from.address, fromSignature }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg(`You are ${d.name}, verified through ${sponsor?.name ?? "your other wallet"}`)
      onClaimed()
    } catch (e) { setMsg(`Name not claimed: ${(e as Error).message}`) } finally { setBusy(false) }
  }

  useEffect(() => {
    setAvail(null); setSigned(null)
    if (!label) return
    if (!LABEL_RE.test(label)) { setAvail({ available: false, reason: "3-32 chars: a-z, 0-9, hyphen" }); return }
    const t = setTimeout(() => fetch(`/api/names?label=${label}`).then((r) => r.json()).then(setAvail).catch(() => {}), 350)
    return () => clearTimeout(t)
  }, [label])

  const sign = async (acct: PrivateKeyAccount) => {
    setUnlock(false)
    const issuedAt = Math.floor(Date.now() / 1000)
    const signature = await acct.signMessage({ message: nameClaimMessage({ label, address: acct.address, issuedAt }) })
    setSigned({ issuedAt, signature })
  }

  return (
    <div className="card stack">
      <h2>Claim your WondrPay name</h2>
      <div className="sub">Friends pay <b>you.wondrpay.eth</b> instead of a long address. Each wallet gets its own name, verified with World ID. One verification covers up to 5 of your wallets.</div>
      {sponsor && !useWorld && <div className="sub">Already verified as <b>{sponsor.name ?? sponsor.label}</b>. It can approve this wallet, no new World ID scan.</div>}
      <div className="row gap-2">
        <input className="input" placeholder="ravi" value={label} autoCapitalize="none" onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
        <span className="sub nowrap">.wondrpay.eth</span>
      </div>
      <div className="sub min-line">
        {avail === null ? "" : avail.available ? <span className="text-ok">Available</span> : <span className="text-bad">{avail.reason}</span>}
      </div>
      {!signed ? (
        <button className="btn btn-ghost" disabled={!avail?.available} onClick={() => setUnlock(true)}>1. Sign with fingerprint / PIN</button>
      ) : sponsor && !useWorld ? (
        <>
          <button className="btn btn-primary" disabled={busy} onClick={() => setCosign(true)}>
            {busy ? <span className="spinner" /> : null} 2. Approve from {sponsor.name ?? sponsor.label}
          </button>
          <button className="chip" onClick={() => setUseWorld(true)}>Verify with World ID instead</button>
        </>
      ) : (
        <WorldVerify
          purpose="name"
          signal={address}
          label="2. Verify with World ID & claim"
          verify={async (proof) => {
            const r = await fetch("/api/names", { method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ label, address, issuedAt: signed.issuedAt, signature: signed.signature, result: proof }) })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            return d
          }}
          onVerified={(d) => {
            setMsg(`You are ${d?.name ?? label + ".wondrpay.eth"}`)
            onClaimed()
          }}
          onDenied={(reason) => setMsg(`Name not claimed: ${reason}`)}
        />
      )}
      {msg && <div className="sub center">{msg}</div>}
      {cosign && sponsor && <UnlockSheet wallet={sponsor} title="Approve new account" subtitle={`${label}.wondrpay.eth, verified through ${sponsor.name ?? sponsor.label}`} onUnlocked={link} onCancel={() => setCosign(false)} />}
      {unlock && <UnlockSheet title="Sign name claim" subtitle={`${label}.wondrpay.eth`} onUnlocked={sign} onCancel={() => setUnlock(false)} />}
    </div>
  )
}
