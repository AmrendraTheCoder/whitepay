"use client"
// Rewards: scratch cards earned by paying listed shops, plus every shop's current offer.
import { useCallback, useEffect, useState } from "react"
import type { OfferView, RewardCard } from "@whitepay/shared/rewards"
import { getWallet } from "@/lib/wallet"
import { Icon, Identicon } from "../ui"
import { Chest, Gift } from "./art"
import { PrizeFace, usdt3 } from "./prize"
import { ScratchSheet, prettyShop } from "./scratch"
import "./rewards.css"

type Data = { cards: RewardCard[]; offers: OfferView[]; totalCashback: string; cashbackLive: boolean }

export default function RewardsPage() {
  const [owner, setOwner] = useState<string | null | undefined>(undefined)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState("")
  const [open, setOpen] = useState<RewardCard | null>(null)
  const [toast, setToast] = useState("")

  const cacheKey = (a: string) => `whitepay.rewards.${a.toLowerCase()}`
  const load = useCallback(async (address: string) => {
    try {
      const r = await fetch(`/api/rewards?owner=${address}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Could not load rewards")
      setData(d); setErr("")
      try { localStorage.setItem(cacheKey(address), JSON.stringify(d)) } catch {}
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    const w = getWallet()
    setOwner(w?.address ?? null)
    if (!w) return
    try { const c = localStorage.getItem(cacheKey(w.address)); if (c) setData(JSON.parse(c)) } catch {}
    void load(w.address)
  }, [load])

  const onRevealed = (c: RewardCard, payout?: { txHash: string; explorer: string } | null) => {
    setData((d) => d && {
      ...d,
      cards: d.cards.map((x) => (x.key === c.key ? c : x)),
      totalCashback: (BigInt(d.totalCashback) + (c.prize === "cashback" && c.amount ? BigInt(c.amount) : 0n)).toString(),
    })
    if (c.prize === "cashback" && payout) { setToast(`${usdt3(c.amount)} USDT cashback received`); setTimeout(() => setToast(""), 3200) }
  }

  const cards = data?.cards ?? []
  const fresh = cards.filter((c) => c.status === "new").length

  return (
    <main className="rw-page">
      <header className="rw-head">
        <div className="rw-bar">
          <a href="/app" className="rw-back" aria-label="Back">{Icon.back(22)}</a>
          <span className="rw-title">Rewards</span>
        </div>
        <div className="rw-hero">
          <div>
            <div className="rw-total">{data ? usdt3(data.totalCashback) : <span className="skel" style={{ width: 90, height: 34 }} />}<small>USDT</small></div>
            <div className="rw-total-l">Total cashback won</div>
            {fresh > 0 && <div className="rw-fresh">{fresh} new card{fresh > 1 ? "s" : ""} to scratch</div>}
          </div>
          <Chest />
        </div>
      </header>

      <div className="rw-body">
        {owner === null && (
          <div className="rw-empty">
            <Gift size={52} />
            <p>Create a wallet to start earning scratch cards.</p>
            <a className="btn btn-primary" href="/app">Get started</a>
          </div>
        )}

        {owner && (
          <>
            <h2 className="rw-h">Your rewards</h2>
            {err && !data && <div className="notice">{err} <button className="chip" onClick={() => void load(owner)}>Retry</button></div>}
            <div className="rw-grid">
              {!data && Array.from({ length: 4 }, (_, i) => <div key={i} className="rw-tile skel" />)}
              {cards.map((c) => (
                <button key={c.key} className={`rw-tile ${c.status === "new" ? "new" : "done"}`} onClick={() => setOpen(c)}
                  aria-label={c.status === "new" ? `Unscratched card from ${prettyShop(c.merchantName)}` : `Scratched card from ${prettyShop(c.merchantName)}`}>
                  {c.status === "new" ? (
                    <>
                      <span className="rw-new">New</span>
                      <Gift />
                      <span className="rw-tile-from">{prettyShop(c.merchantName)}</span>
                      <span className="rw-exp">{daysLeft(c.expiresAt)}</span>
                    </>
                  ) : (
                    <>
                      <PrizeFace card={c} />
                      <span className="rw-tile-from">{prettyShop(c.merchantName)}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
            {data && cards.length === 0 && (
              <div className="rw-empty">
                <Gift size={52} />
                <p><b>No scratch cards yet</b><br />Pay any listed shop 0.10 USDT or more with WondrPay and a card lands here.</p>
                <a className="btn btn-primary" href="/scan">{Icon.scan(22)} Scan a shop QR</a>
              </div>
            )}

            <h2 className="rw-h" id="offers">Offers from shops</h2>
            {data && data.offers.length === 0 && <p className="sub">No shop offers right now. Shops add them from Shop › Offers.</p>}
            <div className="rw-offers">
              {data?.offers.map((o) => (
                <div key={o.key} className="rw-offer-row">
                  <span className="rw-ident"><Identicon seed={o.merchant} name={o.merchantName} size={44} /></span>
                  <div className="grow">
                    <div className="rw-o-name">{o.displayName || prettyShop(o.merchantName)}</div>
                    <div className="rw-o-text">{o.text}</div>
                    <button className="rw-o-code" onClick={() => { navigator.clipboard?.writeText(o.code); setToast(`Code ${o.code} copied`); setTimeout(() => setToast(""), 2000) }}>
                      {o.code} <span aria-hidden>⧉</span>
                    </button>
                  </div>
                  <a className="rw-pay" href={`/send?to=${o.merchant}${o.merchantName ? `&name=${o.merchantName}` : ""}`}>Pay</a>
                </div>
              ))}
            </div>

            <div className="rw-how">
              <b>How it works</b>
              <ol>
                <li>Pay a listed shop 0.10 USDT or more (QR or by name).</li>
                <li>A scratch card appears here, valid for 30 days.</li>
                <li>Scratch it for USDT cashback{data && !data.cashbackLive ? " (paused while the reward pool refills)" : ""} or the shop's own offer.</li>
              </ol>
            </div>
          </>
        )}
      </div>

      {toast && <div className="rw-toast" role="status">{toast}</div>}
      {open && owner && (
        <ScratchSheet card={open} owner={owner} onClose={() => setOpen(null)} onRevealed={(c, p) => { onRevealed(c, p); setOpen(c) }} />
      )}
    </main>
  )
}

function daysLeft(expiresAt?: number) {
  if (!expiresAt) return ""
  const d = Math.ceil((expiresAt - Date.now() / 1000) / 86400)
  return d <= 1 ? "Expires today" : `Expires in ${d} days`
}
