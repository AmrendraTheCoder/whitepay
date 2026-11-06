"use client"
// Verify another shop with the World ID you already used: a verified wallet on this device vouches
// for the new shop wallet (both sign). No second World ID scan; counts toward the 5-per-person limit.
import { useEffect, useState } from "react"
import type { PrivateKeyAccount } from "viem/accounts"
import { linkShopMessage } from "@whitepay/shared"
import { listWallets, type WalletInfo } from "@/lib/wallet"
import { UnlockSheet } from "../components"

export function ShopLink({ shop, onVerified }: { shop: PrivateKeyAccount | null; onVerified: () => void }) {
  const [sponsor, setSponsor] = useState<(WalletInfo & { name?: string }) | null>(null)
  const [cosign, setCosign] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  useEffect(() => {
    if (!shop) return
    let live = true
    void (async () => {
      for (const w of listWallets().filter((x) => x.address.toLowerCase() !== shop.address.toLowerCase())) {
        const st = await fetch(`/api/world/status?address=${w.address}`).then((r) => r.json()).catch(() => null)
        if (!st?.nameVerified && !st?.shopVerified) continue
        const who = await fetch(`/api/resolve?q=${w.address}`).then((r) => r.json()).catch(() => null)
        if (live) setSponsor({ ...w, name: who?.name })
        return
      }
    })()
    return () => { live = false }
  }, [shop])
  if (!shop || !sponsor) return null

  const approve = async (from: PrivateKeyAccount) => {
    setCosign(false); setBusy(true); setMsg("")
    try {
      const issuedAt = Math.floor(Date.now() / 1000)
      const message = linkShopMessage({ from: from.address, shop: shop.address, issuedAt })
      const [signature, fromSignature] = await Promise.all([shop.signMessage({ message }), from.signMessage({ message })])
      const r = await fetch("/api/world/verify", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "merchant-link", address: shop.address, from: from.address, issuedAt, signature, fromSignature }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg("Verified"); setTimeout(onVerified, 900)
    } catch (e) { setMsg(`Not verified: ${(e as Error).message}`) } finally { setBusy(false) }
  }
  const who = sponsor.name ?? sponsor.label
  return (
    <>
      <button className="btn btn-primary" disabled={busy} onClick={() => setCosign(true)}>
        {busy ? <span className="spinner" /> : null} Use my verification ({who})
      </button>
      <div className="sub">You're already verified as {who}. It approves this shop, no new World ID scan.</div>
      {msg && <div className="sub">{msg}</div>}
      {cosign && <UnlockSheet wallet={sponsor} title="Approve your new shop" subtitle={`verified through ${who}`} onUnlocked={approve} onCancel={() => setCosign(false)} />}
    </>
  )
}
