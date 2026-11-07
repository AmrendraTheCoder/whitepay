"use client"
// Home-screen "Offers & rewards" row (GPay style): scratch cards with a new-count badge, and shop offers.
import { useEffect, useState } from "react"
import { Gift } from "./art"
import "./rewards.css"

const HIDE = "whitepay.rewards.hidden"
/** the person chose "Hide rewards from Home" (a new card still shows the row) */
export const rewardsHidden = () => { try { return localStorage.getItem(HIDE) === "1" } catch { return false } }
export const setRewardsHidden = (h: boolean) => { try { if (h) localStorage.setItem(HIDE, "1"); else localStorage.removeItem(HIDE) } catch {} }

export function RewardsEntry({ address }: { address: string }) {
  const [fresh, setFresh] = useState(0)
  const [offers, setOffers] = useState<number | null>(null)
  const [hidden, setHidden] = useState(false)
  useEffect(() => setHidden(rewardsHidden()), [])
  useEffect(() => {
    let live = true
    fetch(`/api/rewards?owner=${address}`).then((r) => r.json()).then((d) => {
      if (!live || !d.cards) return
      setFresh(d.cards.filter((c: { status: string }) => c.status === "new").length)
      setOffers(d.offers?.length ?? 0)
    }).catch(() => {})
    return () => { live = false }
  }, [address])
  if (hidden && !fresh) return null
  return (
    <>
    <div className="section-title">Offers &amp; rewards</div>
    <div className="rw-home">
      <a href="/rewards">
        <span className="ic cards"><Gift size={26} /></span>
        <div><div className="t1">Rewards</div><div className="t2">{fresh ? "Scratch now" : "Scratch cards"}</div></div>
        {fresh > 0 && <span className="dot" aria-label={`${fresh} new`}>{fresh}</span>}
      </a>
      <a href="/rewards#offers">
        <span className="ic offers" aria-hidden>%</span>
        <div><div className="t1">Offers</div><div className="t2">{offers ? `${offers} shop${offers > 1 ? "s" : ""}` : "From shops"}</div></div>
      </a>
    </div>
    </>
  )
}
