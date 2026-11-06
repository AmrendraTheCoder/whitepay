"use client"
// Home-screen "Offers & rewards" row (GPay style): scratch cards with a new-count badge, and shop offers.
import { useEffect, useState } from "react"
import { Gift } from "./art"
import "./rewards.css"

export function RewardsEntry({ address }: { address: string }) {
  const [fresh, setFresh] = useState(0)
  const [offers, setOffers] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    fetch(`/api/rewards?owner=${address}`).then((r) => r.json()).then((d) => {
      if (!live || !d.cards) return
      setFresh(d.cards.filter((c: { status: string }) => c.status === "new").length)
      setOffers(d.offers?.length ?? 0)
    }).catch(() => {})
    return () => { live = false }
  }, [address])
  return (
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
  )
}
