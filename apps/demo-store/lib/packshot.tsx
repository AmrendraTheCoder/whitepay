// Product images: Unsplash photos, with drawn packshots (one per shape, coloured per product) as the fallback.
"use client"
import { useState } from "react"
import type { Product } from "./catalog"

type A = Product["art"]

const shade = (hex: string, amt: number) => {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, "0")).join("")}`
}

function Label({ x, y, text, color, size = 20, rotate = 0, weight = 800, max = 76 }: { x: number; y: number; text: string; color: string; size?: number; rotate?: number; weight?: number; max?: number }) {
  // shrink long names so they stay inside the label (≈0.6em per glyph)
  const fit = Math.min(size, max / (text.length * 0.6))
  return <text x={x} y={y} fill={color} fontSize={fit} fontWeight={weight} textAnchor="middle" fontFamily="var(--f-sans), system-ui, sans-serif" transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined} letterSpacing="-0.5">{text}</text>
}

function Shape({ a, uid }: { a: A; uid: string }) {
  const { fg, accent, label, claim } = a
  const dark = shade(fg, -0.18)
  const light = shade(fg, 0.22)
  const gloss = <linearGradient id={`g${uid}`} x1="0" x2="1"><stop offset="0" stopColor={dark} /><stop offset=".35" stopColor={light} /><stop offset=".55" stopColor={fg} /><stop offset="1" stopColor={dark} /></linearGradient>
  const fill = `url(#g${uid})`
  switch (a.shape) {
    case "tube":
      return <g><defs>{gloss}</defs>
        <rect x="118" y="292" width="64" height="26" rx="6" fill="#f4f4f4" stroke="#d9d9d9" />
        <path d="M96 60h108l-8 236H104z" fill={fill} />
        <rect x="96" y="52" width="108" height="14" rx="3" fill={dark} />
        <rect x="108" y="118" width="84" height="110" rx="10" fill={accent} opacity=".9" />
        <Label x={150} y={160} text={label} color={fg} size={22} />
        {claim && <Label x={150} y={190} text={claim} color={dark} size={12} weight={600} />}
      </g>
    case "pump":
      return <g><defs>{gloss}</defs>
        <path d="M138 40h38v12h-24v14h-14z" fill="#e9e9e9" stroke="#cfcfcf" />
        <rect x="134" y="62" width="32" height="34" rx="4" fill="#ededed" stroke="#d3d3d3" />
        <path d="M108 96h84c10 0 16 8 16 18v186c0 10-8 18-18 18h-80c-10 0-18-8-18-18V114c0-10 6-18 16-18z" fill={fill} />
        <rect x="104" y="150" width="92" height="104" rx="8" fill={accent} opacity=".92" />
        <Label x={150} y={196} text={label} color={fg === "#ffffff" ? "#ffffff" : fg} size={22} />
        {claim && <Label x={150} y={224} text={claim} color={fg === "#ffffff" ? "#ffffff" : shade(fg, -0.3)} size={12} weight={600} />}
      </g>
    case "bottle":
      return <g><defs>{gloss}</defs>
        <rect x="132" y="48" width="36" height="40" rx="6" fill={shade(accent, 0.1)} />
        <path d="M120 88h60l14 30v178c0 12-8 20-20 20h-48c-12 0-20-8-20-20V118z" fill={fill} opacity=".95" />
        <path d="M134 118h10v180h-10z" fill="#fff" opacity=".25" />
        <Label x={160} y={230} text={label} color={accent} size={26} rotate={-90} max={150} />
        {claim && <Label x={150} y={290} text={claim} color={accent} size={11} weight={600} />}
      </g>
    case "jar":
      return <g><defs>{gloss}</defs>
        <rect x="80" y="120" width="140" height="34" rx="8" fill={accent} />
        <path d="M84 154h132v118c0 16-12 26-28 26h-76c-16 0-28-10-28-26z" fill={fill} />
        <rect x="100" y="186" width="100" height="58" rx="8" fill="#ffffff" opacity=".85" />
        <Label x={150} y={216} text={label} color={accent} size={22} />
        {claim && <Label x={150} y={236} text={claim} color={dark} size={11} weight={600} />}
      </g>
    case "dropper":
      return <g><defs>{gloss}</defs>
        <path d="M140 34c0-8 20-8 20 0v44h-20z" fill="#2b2b2b" />
        <rect x="128" y="76" width="44" height="30" rx="5" fill="#d9b25b" />
        <rect x="108" y="106" width="84" height="190" rx="16" fill={fill} opacity=".95" />
        <rect x="116" y="160" width="68" height="90" rx="6" fill="#fff" opacity=".9" />
        <Label x={150} y={200} text={label} color={accent} size={20} />
        {claim && <Label x={150} y={226} text={claim} color={dark} size={12} weight={700} />}
      </g>
    case "tin":
      return <g><defs>{gloss}</defs>
        <ellipse cx="150" cy="232" rx="104" ry="30" fill={dark} />
        <rect x="46" y="150" width="208" height="82" fill={dark} />
        <ellipse cx="150" cy="150" rx="104" ry="30" fill={fill} />
        <ellipse cx="150" cy="150" rx="84" ry="22" fill={shade(fg, 0.08)} />
        <Label x={150} y={156} text={label} color={accent} size={22} />
        {claim && <Label x={150} y={200} text={claim.toUpperCase()} color={accent} size={12} weight={700} />}
      </g>
    case "lipstick":
      return <g><defs>{gloss}</defs>
        <path d="M128 70c6-20 38-20 44 0v60h-44z" fill={fg} />
        <rect x="120" y="128" width="60" height="24" rx="3" fill="#e8e8e8" />
        <rect x="114" y="152" width="72" height="150" rx="8" fill={fill} />
        <Label x={150} y={232} text={label} color={accent} size={18} rotate={-90} max={120} />
        {claim && <Label x={150} y={296} text={claim} color={accent} size={10} weight={700} />}
      </g>
    case "kit":
      return <g>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${60 + i * 12} ${180 - i * 44})`}>
            <rect width="180" height="66" rx="8" fill={i % 2 ? accent : fg} />
            <rect x="12" y="12" width="100" height="42" rx="6" fill="#fff" opacity=".85" />
            <Label x={62} y={40} text={label} color={i % 2 ? fg : fg} size={15} />
          </g>
        ))}
        {claim && <Label x={150} y={300} text={claim} color={fg} size={14} weight={700} />}
      </g>
    case "gift":
      return <g>
        <rect x="70" y="140" width="160" height="150" rx="10" fill={fg} />
        <rect x="60" y="116" width="180" height="40" rx="8" fill={shade(fg, 0.1)} />
        <rect x="140" y="116" width="20" height="174" fill={accent} />
        <path d="M150 116c-30-40-64-20-40 0zM150 116c30-40 64-20 40 0z" fill={accent} />
        <rect x="88" y="220" width="124" height="34" rx="6" fill="#fff" opacity=".9" />
        <Label x={150} y={243} text={label} color={fg} size={15} />
      </g>
    case "tee":
    case "shirt": {
      const shirt = a.shape === "shirt"
      return <g>
        <path d="M100 70l-56 34 22 46 26-12v156h116V138l26 12 22-46-56-34c-6 18-24 30-50 30s-44-12-50-30z" fill={fg} />
        <path d="M100 70c6 18 24 30 50 30s44-12 50-30" fill="none" stroke={shade(fg, -0.15)} strokeWidth="6" />
        {shirt && <><path d="M150 100v190" stroke={shade(fg, -0.15)} strokeWidth="2" />{[130, 170, 210, 250].map((y) => <circle key={y} cx="156" cy={y} r="3" fill={accent} />)}<path d="M126 74l24 28 24-28" fill="none" stroke={accent} strokeWidth="5" /></>}
        {!shirt && <g><circle cx="150" cy="180" r="34" fill={accent} opacity=".9" /><Label x={150} y={187} text={label} color={fg} size={14} /></g>}
      </g>
    }
    case "kurta":
      return <g>
        <path d="M112 54l-46 30 14 70 22-6-6 168h108l-6-168 22 6 14-70-46-30c-4 14-18 22-38 22s-34-8-38-22z" fill={fg} />
        <path d="M150 76v70" stroke={accent} strokeWidth="4" />
        {[0, 1, 2, 3, 4].map((r) => [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={118 + c * 32} cy={170 + r * 30} r="6" fill={accent} opacity=".8" />))}
        <path d="M96 296h108" stroke={accent} strokeWidth="8" />
      </g>
    case "dress":
      return <g>
        <path d="M128 56h44l4 70 56 170H68l56-170z" fill={fg} />
        <path d="M128 56c4 16 40 16 44 0" fill="none" stroke={accent} strokeWidth="4" />
        <path d="M118 126h64" stroke={accent} strokeWidth="5" />
        {[190, 240, 290].map((y, i) => <path key={y} d={`M${100 - i * 12} ${y}h${100 + i * 24}`} stroke={shade(fg, -0.15)} strokeWidth="3" />)}
      </g>
    case "sneaker":
      return <g>
        <path d="M44 236c0-30 20-54 46-60l50-36c14-10 34-8 46 4l40 40c14 12 30 18 48 20 14 2 22 12 22 26v14H44z" fill={fg} stroke="#d5d9df" strokeWidth="2" />
        <rect x="40" y="244" width="262" height="26" rx="10" fill="#f6f6f6" stroke="#d5d9df" />
        <path d="M116 202c30-6 70 0 96 26" fill="none" stroke={accent} strokeWidth="10" strokeLinecap="round" />
        {[0, 1, 2].map((i) => <path key={i} d={`M${140 + i * 16} ${156 + i * 10}l20 -12`} stroke="#888" strokeWidth="3" />)}
      </g>
    case "watch":
      return <g>
        <rect x="124" y="30" width="52" height="300" rx="14" fill={shade(accent, -0.25)} />
        <circle cx="150" cy="180" r="74" fill={accent} />
        <circle cx="150" cy="180" r="62" fill="#fbfaf7" />
        {Array.from({ length: 12 }, (_, i) => <rect key={i} x="149" y="124" width="2" height={i % 3 ? 6 : 12} fill={fg} transform={`rotate(${i * 30} 150 180)`} />)}
        <path d="M150 180V140M150 180l26 14" stroke={fg} strokeWidth="4" strokeLinecap="round" />
        <Label x={150} y={214} text={label.toUpperCase()} color={fg} size={9} weight={700} />
      </g>
    case "tote":
      return <g>
        <path d="M108 120c0-50 84-50 84 0" fill="none" stroke={fg} strokeWidth="10" />
        <rect x="74" y="116" width="152" height="186" rx="6" fill={accent} />
        {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <path key={`${r}${c}`} d={`M${104 + c * 46} ${152 + r * 46}l12 -12 12 12 -12 12z`} fill={fg} opacity=".85" />))}
        <Label x={150} y={290} text={label} color={fg} size={13} />
      </g>
    case "shades":
      return <g>
        <path d="M60 160h180" stroke={accent} strokeWidth="6" />
        <path d="M70 160c0 44 8 62 38 62s38-22 38-62zM154 160c0 40 8 62 38 62s38-18 38-62z" fill={fg} stroke={accent} strokeWidth="4" />
        <path d="M84 172c4 18 10 26 24 28" stroke="#fff" strokeWidth="4" opacity=".4" fill="none" />
        <Label x={150} y={280} text={label} color={fg} size={18} />
      </g>
    case "mug":
      return <g>
        {[0, 1].map((i) => (
          <g key={i} transform={`translate(${i * 86} ${i * 30})`}>
            <path d="M70 130h92l-10 140H80z" fill={fg} />
            <path d="M162 160c26 0 26 50-6 50" fill="none" stroke={fg} strokeWidth="9" />
            <rect x="70" y="124" width="92" height="12" rx="4" fill={accent} />
          </g>
        ))}
      </g>
    case "candle":
      return <g>
        <path d="M150 70c14 18 10 34 0 40-10-6-14-22 0-40z" fill="#f2a516" />
        <rect x="148" y="108" width="4" height="22" fill="#333" />
        <rect x="90" y="130" width="120" height="160" rx="14" fill={fg} />
        <rect x="90" y="130" width="120" height="22" rx="10" fill={shade(fg, 0.12)} />
        <rect x="104" y="196" width="92" height="52" rx="6" fill={accent} />
        <Label x={150} y={228} text={label} color="#fff" size={18} />
      </g>
    case "mask":
    default:
      return <Label x={150} y={180} text={label} color={fg} size={28} />
  }
}

/** A product image. `variant` gives the gallery a second, zoomed angle. */
export function Packshot({ p, variant = 0, className }: { p: Pick<Product, "sku" | "art" | "name">; variant?: number; className?: string }) {
  const uid = `${p.sku}-${variant}`
  return (
    <svg className={className} viewBox="0 0 300 360" role="img" aria-label={p.name} preserveAspectRatio="xMidYMid meet">
      <rect width="300" height="360" fill={p.art.bg} />
      {variant === 1 && <circle cx="232" cy="80" r="120" fill="#fff" opacity=".35" />}
      {variant === 2 && <path d="M0 260c80-40 220-40 300 0v100H0z" fill="#fff" opacity=".35" />}
      <ellipse cx="150" cy="322" rx="96" ry="12" fill="#000" opacity=".08" />
      <g transform={variant === 1 ? "translate(-45 -50) scale(1.3)" : variant === 3 ? "rotate(-8 150 180)" : undefined}><Shape a={p.art} uid={uid} /></g>
    </svg>
  )
}

// Unsplash serves through imgix: crop/zoom per gallery angle, sized for the slot, WebP/AVIF when supported.
const ANGLES = ["", "&crop=focalpoint&fp-x=.5&fp-y=.45&fp-z=1.5", "&crop=focalpoint&fp-x=.5&fp-y=.3&fp-z=1.3", "&crop=focalpoint&fp-x=.5&fp-y=.7&fp-z=1.3"]
export const photoUrl = (id: string, w: number, variant = 0) => `https://images.unsplash.com/${id}?w=${w}&h=${Math.round(w * 1.2)}&fit=crop${ANGLES[variant] ?? ""}&auto=format&q=70`

/** A product photo (Unsplash) with the drawn packshot as fallback when there is no photo or it fails to load. */
export function ProductImage({ p, variant = 0, width = 480, eager = false }: { p: Pick<Product, "sku" | "art" | "name" | "photo">; variant?: number; width?: number; eager?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (!p.photo || failed) return <Packshot p={p} variant={variant} />
  return (
    <img
      className="ks-photo" src={photoUrl(p.photo, width, variant)}
      srcSet={`${photoUrl(p.photo, width, variant)} 1x, ${photoUrl(p.photo, width * 2, variant)} 2x`}
      alt={p.name} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)}
      style={{ background: p.art.bg }}
    />
  )
}
