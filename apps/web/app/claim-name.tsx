"use client"
import { useEffect, useState } from "react"
import type { PrivateKeyAccount } from "viem/accounts"
import { nameClaimMessage, LABEL_RE } from "@whitepay/shared"
import { UnlockSheet } from "./components"
import { WorldVerify } from "./world"

/** UPI VPA, on ENS: claim <name>.whitepay.eth. One per human (World ID), proven wallet control (signature). */
export function ClaimName({ address, onClaimed }: { address: `0x${string}`; onClaimed: () => void }) {
  const [label, setLabel] = useState("")
  const [avail, setAvail] = useState<{ available: boolean; reason?: string | null } | null>(null)
  const [unlock, setUnlock] = useState(false)
  const [signed, setSigned] = useState<{ issuedAt: number; signature: string } | null>(null)
  const [msg, setMsg] = useState("")

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
      <h2>Claim your WhitePay name</h2>
      <div className="sub">Friends pay <b>you.whitepay.eth</b> instead of a long address. One name per person, verified with World ID.</div>
      <div className="row" style={{ gap: 6 }}>
        <input className="input" placeholder="ravi" value={label} autoCapitalize="none" onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
        <span className="sub" style={{ whiteSpace: "nowrap" }}>.whitepay.eth</span>
      </div>
      <div className="sub" style={{ minHeight: 18 }}>
        {avail === null ? "" : avail.available ? <span style={{ color: "var(--ok)" }}>✓ available</span> : <span style={{ color: "var(--bad)" }}>{avail.reason}</span>}
      </div>
      {!signed ? (
        <button className="btn btn-ghost" disabled={!avail?.available} onClick={() => setUnlock(true)}>1. Sign with fingerprint / PIN</button>
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
          onVerified={(d) => { setMsg(`You are ${d?.name ?? label + ".whitepay.eth"} ✓`); onClaimed() }}
          onDenied={(reason) => setMsg(`Name not claimed: ${reason}`)}
        />
      )}
      {msg && <div className="sub" style={{ textAlign: "center" }}>{msg}</div>}
      {unlock && <UnlockSheet title="Sign name claim" subtitle={`${label}.whitepay.eth`} onUnlocked={sign} onCancel={() => setUnlock(false)} />}
    </div>
  )
}
