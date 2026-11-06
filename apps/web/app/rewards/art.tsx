// Illustrations and the scratch-card face, drawn once and shared by the grid tiles and the scratch canvas.

/** Treasure chest for the Rewards header (original art, brand palette). */
export function Chest({ size = 132 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" aria-hidden className="rw-chest">
      <defs>
        <linearGradient id="rwLid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b7cfa" /><stop offset="1" stopColor="#2448ff" /></linearGradient>
        <linearGradient id="rwBox" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2448ff" /><stop offset="1" stopColor="#1530b8" /></linearGradient>
        <radialGradient id="rwGlow" cx=".5" cy=".55" r=".5"><stop offset="0" stopColor="#ddf05a" stopOpacity=".55" /><stop offset="1" stopColor="#ddf05a" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="70" cy="74" r="64" fill="url(#rwGlow)" />
      {/* lid, flipped open behind the box */}
      <path d="M30 66 L36 30 Q37 24 43 24 L97 24 Q103 24 104 30 L110 66 Z" fill="url(#rwLid)" stroke="#0b1033" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M36 52 H104" stroke="#ddf05a" strokeWidth="5" />
      {/* coins heaped in the open box */}
      <g className="rw-coins">
        <circle cx="48" cy="66" r="11" fill="#ddf05a" stroke="#1b2108" strokeWidth="2" />
        <text x="48" y="70.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#1b2108">₮</text>
        <circle cx="92" cy="66" r="11" fill="#ddf05a" stroke="#1b2108" strokeWidth="2" />
        <text x="92" y="70.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#1b2108">₮</text>
        <circle cx="70" cy="58" r="13" fill="#ddf05a" stroke="#1b2108" strokeWidth="2" />
        <text x="70" y="63" textAnchor="middle" fontSize="14" fontWeight="800" fill="#1b2108">₮</text>
      </g>
      {/* box */}
      <rect x="24" y="70" width="92" height="50" rx="8" fill="url(#rwBox)" stroke="#0b1033" strokeWidth="2.5" />
      <rect x="24" y="84" width="92" height="7" fill="#ddf05a" stroke="#0b1033" strokeWidth="2" />
      <rect x="61" y="78" width="18" height="22" rx="4" fill="#ddf05a" stroke="#0b1033" strokeWidth="2.5" />
      <circle cx="70" cy="88" r="2.6" fill="#0b1033" />
      <path d="M118 22l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#ddf05a" className="rw-spark" />
      <path d="M20 30l1.8 4.2 4.2 1.8-4.2 1.8L20 42l-1.8-4.2L14 36l4.2-1.8z" fill="#fff" className="rw-spark rw-spark-2" />
    </svg>
  )
}

/** Gift glyph shown in the middle of an unscratched card. */
export const Gift = ({ size = 44 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
    <rect x="7" y="19" width="34" height="23" rx="3" fill="#ddf05a" stroke="#0b1033" strokeWidth="2.5" />
    <rect x="4" y="13" width="40" height="9" rx="3" fill="#ddf05a" stroke="#0b1033" strokeWidth="2.5" />
    <path d="M24 13v29" stroke="#0b1033" strokeWidth="2.5" />
    <path d="M24 13c-3-7-12-8-12-3 0 3 6 3 12 3zm0 0c3-7 12-8 12-3 0 3-6 3-12 3z" fill="#fff" stroke="#0b1033" strokeWidth="2.5" strokeLinejoin="round" />
  </svg>
)

/** Paint the scratch-card face (same look as .rw-tile.new) onto a canvas. */
export function paintCardFace(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, "#3a5cff"); g.addColorStop(0.6, "#1d39d9"); g.addColorStop(1, "#142aa8")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // dotted texture + soft rings (the same pattern as the grid tiles)
  ctx.fillStyle = "rgba(255,255,255,.16)"
  const step = Math.round(w / 14)
  for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) { ctx.beginPath(); ctx.arc(x, y, w / 160, 0, Math.PI * 2); ctx.fill() }
  ctx.strokeStyle = "rgba(185,198,251,.22)"
  ctx.lineWidth = w / 60
  for (const r of [0.28, 0.42, 0.56]) { ctx.beginPath(); ctx.arc(w * 0.82, h * 0.18, w * r, 0, Math.PI * 2); ctx.stroke() }
  // gift + caption
  const s = w * 0.26, gx = (w - s) / 2, gy = h * 0.3
  ctx.save(); ctx.translate(gx, gy); ctx.scale(s / 48, s / 48)
  ctx.lineWidth = 2.5; ctx.strokeStyle = "#0b1033"; ctx.lineJoin = "round"
  const box = (x: number, y: number, bw: number, bh: number) => { ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 3); ctx.fillStyle = "#ddf05a"; ctx.fill(); ctx.stroke() }
  box(7, 19, 34, 23); box(4, 13, 40, 9)
  ctx.beginPath(); ctx.moveTo(24, 13); ctx.lineTo(24, 42); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(24, 13); ctx.bezierCurveTo(21, 6, 12, 5, 12, 10); ctx.bezierCurveTo(12, 13, 18, 13, 24, 13)
  ctx.bezierCurveTo(27, 6, 36, 5, 36, 10); ctx.bezierCurveTo(36, 13, 30, 13, 24, 13); ctx.fillStyle = "#fff"; ctx.fill(); ctx.stroke()
  ctx.restore()
  ctx.fillStyle = "#fff"
  ctx.font = `700 ${Math.round(w / 15)}px ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.textAlign = "center"
  ctx.fillText("Scratch to reveal", w / 2, h * 0.76)
  ctx.font = `500 ${Math.round(w / 22)}px ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.fillStyle = "rgba(255,255,255,.75)"
  ctx.fillText("Use your finger", w / 2, h * 0.84)
}
