"use client"
// Shop dashboard: publish the offer customers can win from scratch cards (and see on the Rewards page).
// Signed by the shop's own key, so nobody else can change a shop's offer.
import { useEffect, useState } from "react"
import type { PrivateKeyAccount } from "viem/accounts"
import { offerMessage, OFFER_TEXT_MAX, OFFER_CODE_RE, type OfferView } from "@whitepay/shared/rewards"
import { UnlockSheet } from "../components"
import { Gift } from "../rewards/art"
import "../rewards/rewards.css"

const SUGGEST = [
  { text: "10% off your next order", code: "SAVE10" },
  { text: "Free chai with any snack", code: "FREECHAI" },
  { text: "Buy 2, get 1 free", code: "B2G1" },
]

export function OfferCard({ merchant, account, setAccount }: { merchant: { address: string; displayName: string; ensName: string }; account: PrivateKeyAccount | null; setAccount: (a: PrivateKeyAccount) => void }) {
  const [offer, setOffer] = useState<OfferView | null | undefined>(undefined)
  const [text, setText] = useState("")
  const [code, setCode] = useState("")
  const [unlock, setUnlock] = useState<null | boolean>(null) // pending "active" value while unlocking
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`/api/offers?merchant=${merchant.address}`).then((r) => r.json()).then((d) => {
      setOffer(d.offer ?? null)
      if (d.offer) { setText(d.offer.text); setCode(d.offer.code) }
    }).catch(() => setOffer(null))
  }, [merchant.address])

  const cleanCode = code.trim().toUpperCase()
  const valid = text.trim().length >= 3 && text.trim().length <= OFFER_TEXT_MAX && OFFER_CODE_RE.test(cleanCode)

  const save = async (acct: PrivateKeyAccount, active: boolean) => {
    setUnlock(null); setAccount(acct); setBusy(true); setErr(""); setSaved(false)
    try {
      const issuedAt = Math.floor(Date.now() / 1000)
      const t = text.trim().replace(/\s+/g, " ")
      const signature = await acct.signMessage({ message: offerMessage({ merchant: acct.address, text: t, code: cleanCode, active, issuedAt }) })
      const r = await fetch("/api/offers", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ merchant: acct.address, text: t, code: cleanCode, active, issuedAt, signature }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Could not save the offer")
      setOffer(d.offer); setSaved(true)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const go = (active: boolean) => (account ? save(account, active) : setUnlock(active))

  return (
    <div className="card stack">
      <div className="row"><h2 className="m-0">Scratch-card offer</h2>{offer?.active ? <span className="badge badge-lime">Live</span> : offer ? <span className="sub">Paused</span> : null}</div>
      <div className="row gap-2" style={{ justifyContent: "flex-start", alignItems: "flex-start" }}>
        <span style={{ flex: "none", width: 48, height: 48, borderRadius: 14, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#3a5cff,#142aa8)" }}><Gift size={30} /></span>
        <p className="sub m-0">Customers who pay you 0.10 USDT or more get a scratch card. Some cards win your offer, and about 1 in 9 wins 1–5% cashback in WBT, funded by WondrPay from the fee. Your shop and offer are listed on everyone's Rewards page.</p>
      </div>
      {offer === undefined ? <span className="skel" style={{ height: 96 }} /> : (
        <>
          <label className="sub" htmlFor="offer-text">Offer</label>
          <input id="offer-text" className="input" placeholder="e.g. 10% off your next order" value={text} maxLength={OFFER_TEXT_MAX} onChange={(e) => setText(e.target.value)} />
          <label className="sub" htmlFor="offer-code">Code customers show you</label>
          <input id="offer-code" className="input mono" placeholder="SAVE10" value={code} maxLength={16} autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} />
          {!offer && (
            <div className="row gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
              {SUGGEST.map((s) => <button key={s.code} className="chip" onClick={() => { setText(s.text); setCode(s.code) }}>{s.text}</button>)}
            </div>
          )}
          {text.trim() && cleanCode && (
            <div className="rw-offer-row" aria-label="Preview">
              <div className="grow">
                <div className="rw-o-name">{merchant.displayName}</div>
                <div className="rw-o-text">{text.trim()}</div>
                <span className="rw-o-code">{cleanCode}</span>
              </div>
              <span className="rw-pay">Pay</span>
            </div>
          )}
          <button className="btn btn-primary" disabled={!valid || busy} onClick={() => go(true)}>
            {busy ? <><span className="spinner" /> Saving…</> : offer ? "Update offer" : "Publish offer"}
          </button>
          {offer?.active && <button className="btn btn-ghost" disabled={busy} onClick={() => go(false)}>Pause offer</button>}
          {saved && <div className="sub" role="status">Saved. It shows on the Rewards page within a few seconds.</div>}
          <div className="err">{err}</div>
        </>
      )}
      {unlock !== null && <UnlockSheet title="Unlock shop" subtitle="Sign your offer" onUnlocked={(a) => save(a, unlock)} onCancel={() => setUnlock(null)} />}
    </div>
  )
}
