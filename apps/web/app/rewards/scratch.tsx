"use client"
// Full-screen scratch experience. The first stroke asks the server for this card's (fixed) prize, so the
// result is already under the foil by the time ~half of it is cleared; then the foil fades and confetti fires.
import { useCallback, useEffect, useRef, useState } from "react"
import type { RewardCard } from "@whitepay/shared/rewards"
import { Icon } from "../ui"
import { paintCardFace } from "./art"
import { PrizeFace } from "./prize"
import "./rewards.css"

const REVEAL_AT = 0.5
const BRUSH = 34

export function ScratchSheet({ card, owner, onClose, onRevealed }: {
  card: RewardCard
  owner: string
  onClose: () => void
  onRevealed: (c: RewardCard, payout?: { txHash: string; explorer: string } | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [result, setResult] = useState<RewardCard | null>(card.status !== "new" ? card : null)
  const [payout, setPayout] = useState<{ txHash: string; explorer: string } | null>(null)
  const [err, setErr] = useState("")
  const [cleared, setCleared] = useState(card.status !== "new")
  const [confetti, setConfetti] = useState(false)
  const requested = useRef(false)
  const scratchedEnough = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const strokes = useRef(0)

  // ask the server once, on first touch
  const request = useCallback(async () => {
    if (requested.current) return
    requested.current = true
    try {
      const r = await fetch("/api/rewards/scratch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: card.key, owner }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Could not open this card")
      setResult(d.card); setPayout(d.payout)
    } catch (e) {
      requested.current = false
      setErr((e as Error).message)
    }
  }, [card.key, owner])

  // paint the foil
  useEffect(() => {
    const c = canvasRef.current, wrap = wrapRef.current
    if (!c || !wrap || cleared) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const { width, height } = wrap.getBoundingClientRect()
    c.width = Math.round(width * dpr); c.height = Math.round(height * dpr)
    const ctx = c.getContext("2d")!
    ctx.scale(dpr, dpr)
    paintCardFace(ctx, width, height)
  }, [cleared])

  const reveal = useCallback(() => {
    setCleared(true)
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setConfetti(true)
    try { navigator.vibrate?.([12, 40, 18]) } catch {}
  }, [])

  // reveal once enough is cleared AND the prize is known
  useEffect(() => { if (result && scratchedEnough.current && !cleared) reveal() }, [result, cleared, reveal])
  useEffect(() => { if (cleared && result && result !== card) onRevealed(result, payout) }, [cleared, result]) // eslint-disable-line react-hooks/exhaustive-deps

  const measure = () => {
    const c = canvasRef.current!
    const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height)
    let clear = 0, total = 0
    for (let i = 3; i < data.length; i += 4 * 24) { total++; if (data[i] < 40) clear++ }
    return clear / total
  }

  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const draw = (p: { x: number; y: number }) => {
    const ctx = canvasRef.current!.getContext("2d")!
    ctx.globalCompositeOperation = "destination-out"
    // destination-out erases by the SOURCE alpha: the brush must be fully opaque (the foil's last stroke colour is 22%)
    ctx.strokeStyle = "#000"
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = BRUSH
    ctx.beginPath()
    const from = last.current ?? { x: p.x - 0.1, y: p.y }
    ctx.moveTo(from.x, from.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p
    if (++strokes.current % 6 === 0 && !scratchedEnough.current && measure() >= REVEAL_AT) {
      scratchedEnough.current = true
      if (result) reveal()
    }
  }
  const down = (e: React.PointerEvent) => {
    if (cleared) return
    e.currentTarget.setPointerCapture(e.pointerId)
    void request()
    last.current = null
    draw(point(e))
  }
  const move = (e: React.PointerEvent) => { if (e.buttons && !cleared) draw(point(e)) }
  const up = () => { last.current = null }

  // keyboard / switch users: reveal without scratching
  const revealNow = () => { scratchedEnough.current = true; void request(); if (result) reveal() }

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [onClose])

  return (
    <div className="rw-modal" role="dialog" aria-modal="true" aria-label="Scratch card">
      <button className="rw-close" onClick={onClose} aria-label="Close">{Icon.close(24)}</button>
      {confetti && <Confetti />}
      <div className={`rw-big ${cleared ? "is-open" : ""}`} ref={wrapRef}>
        <div className="rw-under" aria-live="polite">
          {result ? <PrizeFace card={result} big /> : err ? <div className="rw-err">{err}</div> : <span className="spinner" aria-label="Opening card" />}
        </div>
        {!cleared && (
          <canvas ref={canvasRef} className="rw-foil" aria-hidden
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        )}
      </div>
      <div className="rw-modal-foot">
        {cleared && result ? (
          <>
            <Outcome card={result} payout={payout} />
            <button className="btn btn-lime" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <div className="rw-from">From your payment to <b>{prettyShop(card.merchantName)}</b></div>
            <button className="rw-reveal-link" onClick={revealNow}>Reveal without scratching</button>
          </>
        )}
      </div>
    </div>
  )
}

function Outcome({ card, payout }: { card: RewardCard; payout: { txHash: string; explorer: string } | null }) {
  if (card.prize === "cashback")
    return <div className="rw-outcome">Cashback sent to your wallet{payout ? <> · <a href={payout.explorer} target="_blank" rel="noreferrer">View on Whitechain</a></> : null}</div>
  if (card.prize === "wbt" || card.prize === "wbt_welcome")
    return (
      <div className="rw-outcome">
        {card.prize === "wbt_welcome" ? "Welcome bonus! " : ""}{(card.rateBps ?? 0) / 100}% back, paid in WBT. Claim it with one World ID
        check, so only real people collect rewards. <a href="/rewards#claim">Claim now</a>
      </div>
    )
  if (card.prize === "offer")
    return <div className="rw-outcome">Show code <b className="rw-code">{card.offerCode}</b> at {prettyShop(card.merchantName)}, or use it on your next order.</div>
  return <div className="rw-outcome">No prize this time. About 1 card in 9 wins cashback, and every shop payment of 0.10 USDT or more earns another card.</div>
}

export const prettyShop = (n?: string) =>
  n ? n.replace(/\.(whitepay|wondrpay)\.eth$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "the shop"

function Confetti() {
  const bits = Array.from({ length: 36 }, (_, i) => i)
  return (
    <div className="rw-confetti" aria-hidden>
      {bits.map((i) => (
        <i key={i} style={{
          ["--x" as string]: `${(i * 37) % 100}%`,
          ["--d" as string]: `${(i % 7) * 0.06}s`,
          ["--r" as string]: `${(i * 53) % 360}deg`,
          ["--c" as string]: ["#ddf05a", "#5b7cfa", "#ffffff", "#3ddc97", "#2448ff"][i % 5],
        }} />
      ))}
    </div>
  )
}
