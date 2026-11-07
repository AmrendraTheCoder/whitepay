"use client"
import { useEffect, useRef, useState } from "react"
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts"
import { nameClaimMessage, linkAccountMessage, LABEL_RE } from "@whitepay/shared"
import { listWallets, type WalletInfo } from "@/lib/wallet"
import { restoreSession } from "@/lib/session"
import { UnlockSheet } from "./components"
import { WorldVerify } from "./world"

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
/** the server accepts claims signed in the last 10 min: re-sign when older than this */
const FRESH_S = 8 * 60

/** UPI VPA, on ENS: <name>.wondrpay.eth. ONE username per person, shared by up to 5 of their wallets;
 *  a wallet never gets a second username. A wallet that already has a name (e.g. reconnected after it
 *  was removed from this phone) just shows it. Another wallet of yours is added to your existing name,
 *  approved by your verified wallet on this device (no second World ID scan).
 *  One tap: the claim is signed in the same tap that opens World ID (silently when this wallet is already
 *  unlocked; otherwise the PIN / fingerprint, or MetaMask, asks once). */
export function ClaimName({ address, onClaimed }: { address: `0x${string}`; onClaimed: () => void }) {
  const [label, setLabel] = useState("")
  const [avail, setAvail] = useState<{ available: boolean; reason?: string | null } | null>(null)
  const [unlock, setUnlock] = useState(false)
  const signer = useRef<PrivateKeyAccount | null>(null)
  const signed = useRef<{ issuedAt: number; signature: string; label: string } | null>(null)
  const waiting = useRef<{ res: (a: PrivateKeyAccount) => void; rej: (e: Error) => void } | null>(null)
  const [msg, setMsg] = useState("")
  // another wallet on this device that already passed World ID: it can vouch for this one
  const [sponsor, setSponsor] = useState<(WalletInfo & { name?: string }) | null>(null)
  const [useWorld, setUseWorld] = useState(false)
  const [cosign, setCosign] = useState(false)
  const [busy, setBusy] = useState(false)
  // this wallet already has a username (reconnected / re-imported): accept it, never ask again
  const [own, setOwn] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    fetch(`/api/resolve?q=${address}`).then((r) => r.json()).catch(() => null).then((d) => {
      if (!live) return
      const name = d?.kind === "person" && typeof d.name === "string" ? d.name : null
      setOwn(name)
      if (name) onClaimed()
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])
  useEffect(() => {
    let live = true
    const others = listWallets().filter((w) => !same(w.address, address))
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

  useEffect(() => {
    setAvail(null)
    if (!label) return
    if (!LABEL_RE.test(label)) { setAvail({ available: false, reason: "3-32 chars: a-z, 0-9, hyphen" }); return }
    const t = setTimeout(() => fetch(`/api/names?label=${label}`).then((r) => r.json()).then(setAvail).catch(() => {}), 350)
    return () => clearTimeout(t)
  }, [label])

  /** this wallet's signer: silently if it's unlocked on this device, else one PIN / fingerprint (or MetaMask) prompt */
  const getSigner = async (): Promise<PrivateKeyAccount> => {
    if (signer.current && same(signer.current.address, address)) return signer.current
    const w = listWallets().find((x) => same(x.address, address))
    if (w?.kind === "device") {
      const s = await restoreSession(address).catch(() => null)
      if (s?.pk) return (signer.current = privateKeyToAccount(s.pk))
    }
    return new Promise((res, rej) => { waiting.current = { res, rej }; setUnlock(true) })
  }
  /** a claim signature for the current label, re-signed when it would be too old for the server */
  const claimSig = async () => {
    const now = Math.floor(Date.now() / 1000)
    const c = signed.current
    if (c && c.label === label && now - c.issuedAt < FRESH_S) return c
    const acct = await getSigner()
    const signature = await acct.signMessage({ message: nameClaimMessage({ label, address: acct.address, issuedAt: now }) })
    return (signed.current = { issuedAt: now, signature, label })
  }
  // the server rejected an old signature: drop it so the next attempt signs again
  const expired = (m: string) => { if (/expired/i.test(m)) signed.current = null }

  const joinLabel = sponsor && !useWorld && sponsor.name ? sponsor.name.split(".")[0] : null
  useEffect(() => { if (joinLabel) setLabel(joinLabel) }, [joinLabel])

  const startLink = async () => {
    setMsg("")
    try { await claimSig(); setCosign(true) } catch (e) { setMsg((e as Error).message) }
  }
  const link = async (from: PrivateKeyAccount) => {
    setCosign(false)
    setBusy(true); setMsg("")
    try {
      const claim = await claimSig()
      const fromSignature = await from.signMessage({ message: linkAccountMessage({ from: from.address, to: address, label, issuedAt: claim.issuedAt }) })
      const r = await fetch("/api/names", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, address, issuedAt: claim.issuedAt, signature: claim.signature, from: from.address, fromSignature }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg(`This wallet is now ${d.name}`)
      onClaimed()
    } catch (e) { const m = (e as Error).message; expired(m); setMsg(`Name not claimed: ${m}`) } finally { setBusy(false) }
  }

  if (own === undefined) return <div className="card stack"><span className="skel" style={{ width: 200, height: 18 }} /></div>
  if (own)
    return (
      <div className="card stack center">
        <h2>Welcome back, {own}</h2>
        <div className="sub">This wallet is already linked to your WondrPay name. Nothing to claim.</div>
      </div>
    )

  return (
    <div className="card stack">
      <h2>{joinLabel ? `Add this wallet to ${sponsor!.name}` : "Claim your WondrPay name"}</h2>
      {joinLabel ? (
        <div className="sub">One name, all your wallets: this wallet will also show as <b>{sponsor!.name}</b>. Your verified wallet approves it, no new World ID scan.</div>
      ) : (
        <>
          <div className="sub">Friends pay <b>you.wondrpay.eth</b> instead of a long address. One name per person, verified once with World ID; you can add up to 5 of your wallets to it.</div>
          <div className="row gap-2">
            <input className="input" placeholder="ravi" value={label} autoCapitalize="none" onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
            <span className="sub nowrap">.wondrpay.eth</span>
          </div>
          <div className="sub min-line">
            {avail === null ? "" : avail.available ? <span className="text-ok">Available</span> : <span className="text-bad">{avail.reason}</span>}
          </div>
        </>
      )}
      {joinLabel ? (
        <>
          <button className="btn btn-primary" disabled={busy} onClick={() => void startLink()}>
            {busy ? <span className="spinner" /> : null} Approve from {sponsor!.name ?? sponsor!.label}
          </button>
          <button className="chip" onClick={() => setUseWorld(true)}>Verify with World ID instead</button>
        </>
      ) : (
        <WorldVerify
          purpose="name"
          signal={address}
          label="Claim with World ID"
          disabled={!avail?.available}
          before={async () => { await claimSig() }}
          verify={async (proof) => {
            const claim = await claimSig()
            const r = await fetch("/api/names", { method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ label, address, issuedAt: claim.issuedAt, signature: claim.signature, result: proof }) })
            const d = await r.json()
            if (!r.ok) { expired(String(d.error ?? "")); throw new Error(d.error) }
            return d
          }}
          onVerified={(d) => {
            setMsg(`You are ${d?.name ?? label + ".wondrpay.eth"}`)
            onClaimed()
          }}
          onDenied={(reason) => { expired(reason); setMsg(`Name not claimed: ${reason}`) }}
        />
      )}
      {msg && <div className="sub center">{msg}</div>}
      {cosign && sponsor && <UnlockSheet wallet={sponsor} title="Approve new account" subtitle={`add this wallet to ${sponsor.name ?? sponsor.label}`} onUnlocked={link} onCancel={() => setCosign(false)} />}
      {unlock && (
        <UnlockSheet title="Confirm it's you" subtitle={`to claim ${label}.wondrpay.eth`}
          onUnlocked={(a) => { setUnlock(false); signer.current = a; waiting.current?.res(a); waiting.current = null }}
          onCancel={() => { setUnlock(false); waiting.current?.rej(new Error("Cancelled")); waiting.current = null }} />
      )}
    </div>
  )
}
