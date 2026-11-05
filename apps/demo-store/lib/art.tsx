// Hand-built product illustrations (inline SVG: crisp at any size, no image requests, CSP-safe).
// One palette across all art so the catalog reads as a single brand.
const C = { ink: "#2a1a10", cream: "#fbf5ea", kraft: "#c9935a", kraftD: "#a8743f", terra: "#c2562b", terraD: "#9e4220", saffron: "#e9a23b", leaf: "#5b7a4a", leafL: "#86a56f", brass: "#d7a43b", milk: "#f3e3c8", chai: "#b36a33" }

const Steam = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="none" stroke={C.cream} strokeWidth="5" strokeLinecap="round" opacity=".85">
    <path className="steam s1" d="M0 0c-10-14 10-22 0-38" /><path className="steam s2" d="M22 4c-10-14 10-22 0-38" /><path className="steam s3" d="M44 0c-10-14 10-22 0-38" />
  </g>
)

export function HeroArt() {
  return (
    <svg viewBox="0 0 520 520" role="img" aria-label="A glass of masala chai with cardamom, cinnamon and star anise">
      <defs>
        <radialGradient id="hglow" cx="50%" cy="45%" r="55%"><stop offset="0" stopColor="#f4c98a" /><stop offset="1" stopColor="#e7a35c" stopOpacity="0" /></radialGradient>
        <linearGradient id="hglass" x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".5" stopColor="#fff" stopOpacity=".15" /><stop offset="1" stopColor="#fff" stopOpacity=".4" /></linearGradient>
        <linearGradient id="hchai" y1="0" y2="1"><stop offset="0" stopColor="#c98445" /><stop offset="1" stopColor="#8c4a1f" /></linearGradient>
      </defs>
      <circle cx="260" cy="250" r="230" fill="url(#hglow)" />
      <ellipse cx="260" cy="440" rx="170" ry="22" fill={C.ink} opacity=".18" />
      {/* saucer */}
      <ellipse cx="260" cy="420" rx="150" ry="30" fill={C.terra} /><ellipse cx="260" cy="414" rx="150" ry="28" fill="#d8693a" /><ellipse cx="260" cy="412" rx="96" ry="16" fill={C.terraD} opacity=".35" />
      {/* cutting-chai glass */}
      <path d="M180 190 L340 190 L322 412 Q260 426 198 412 Z" fill="url(#hchai)" />
      <path d="M186 214 L334 214 L322 412 Q260 426 198 412 Z" fill="url(#hchai)" />
      <ellipse cx="260" cy="214" rx="74" ry="12" fill="#e3b07a" />
      <ellipse cx="248" cy="212" rx="30" ry="5" fill="#f3d3a6" opacity=".7" />
      <path d="M176 186 L344 186 L326 414 Q260 432 194 414 Z" fill="url(#hglass)" stroke="#fff" strokeOpacity=".6" strokeWidth="3" />
      {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M${200 + i * 24} 190 L${206 + i * 21} 410`} stroke="#fff" strokeOpacity=".22" strokeWidth="5" />)}
      <ellipse cx="260" cy="186" rx="84" ry="13" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="3" />
      <Steam x={226} y={160} s={1.2} />
      {/* spices */}
      <g transform="translate(70 360) rotate(-18)"><rect width="120" height="22" rx="11" fill="#8a4b25" /><rect y="4" width="120" height="6" rx="3" fill="#a9622f" /><rect x="6" y="2" width="6" height="18" rx="3" fill="#6f3a1b" /></g>
      <g transform="translate(400 380)">
        {[0, 72, 144, 216, 288].map((r) => <ellipse key={r} rx="11" ry="26" cy="-18" fill="#7a3b17" transform={`rotate(${r})`} />)}
        <circle r="8" fill="#5a2a10" />
      </g>
      {[[110, 300], [420, 300], [380, 450], [140, 455]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${i * 40})`}><ellipse rx="12" ry="18" fill={C.leafL} /><path d="M0 -16 V16" stroke={C.leaf} strokeWidth="2" /></g>
      ))}
    </svg>
  )
}

function Kit() {
  return (
    <svg viewBox="0 0 300 300" aria-hidden>
      <ellipse cx="150" cy="262" rx="104" ry="12" fill={C.ink} opacity=".14" />
      {/* tin */}
      <rect x="62" y="70" width="116" height="186" rx="14" fill={C.terra} />
      <rect x="62" y="70" width="116" height="30" rx="12" fill={C.terraD} />
      <rect x="74" y="122" width="92" height="96" rx="10" fill={C.cream} />
      <circle cx="120" cy="158" r="24" fill={C.saffron} /><path d="M108 152h20v6a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8z" fill={C.cream} /><path d="M128 154h3a3.5 3.5 0 0 1 0 7h-3" fill="none" stroke={C.cream} strokeWidth="2.6" /><path d="M114 146c-2-3 2-4 0-7M121 146c-2-3 2-4 0-7" stroke={C.cream} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <rect x="88" y="190" width="64" height="8" rx="4" fill={C.ink} opacity=".75" /><rect x="96" y="203" width="48" height="6" rx="3" fill={C.ink} opacity=".35" />
      {/* kraft pouch */}
      <path d="M170 120 h70 l-6 136 h-58 Z" fill={C.kraft} />
      <path d="M170 120 h70 l-4 18 h-62 Z" fill={C.kraftD} />
      <rect x="186" y="170" width="38" height="40" rx="6" fill={C.cream} /><path d="M196 190 q9 -14 18 0 q-9 14 -18 0Z" fill={C.leaf} />
      {/* cardamom */}
      {[[86, 250], [108, 258], [222, 262]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="11" ry="7" fill={C.leafL} transform={`rotate(${i * 25 - 20} ${x} ${y})`} />)}
    </svg>
  )
}

function Gift() {
  return (
    <svg viewBox="0 0 300 300" aria-hidden>
      <ellipse cx="150" cy="262" rx="108" ry="12" fill={C.ink} opacity=".14" />
      <rect x="54" y="118" width="192" height="138" rx="12" fill={C.leaf} />
      <rect x="44" y="96" width="212" height="40" rx="10" fill="#6c8d58" />
      <rect x="136" y="96" width="28" height="160" fill={C.saffron} />
      <path d="M150 96 C110 50 82 78 110 96 Z" fill={C.saffron} /><path d="M150 96 C190 50 218 78 190 96 Z" fill="#f0b552" />
      <circle cx="150" cy="96" r="12" fill={C.terra} />
      {/* note card */}
      <g transform="rotate(-8 214 196)"><rect x="180" y="168" width="70" height="52" rx="6" fill={C.cream} /><path d="M190 186h48M190 198h36" stroke={C.ink} strokeOpacity=".35" strokeWidth="4" strokeLinecap="round" /></g>
      {/* brass strainer */}
      <g transform="translate(70 214) rotate(-14)"><circle r="22" fill={C.brass} /><circle r="15" fill="#b98722" /><rect x="18" y="-4" width="46" height="8" rx="4" fill={C.brass} /></g>
    </svg>
  )
}

function Tote() {
  return (
    <svg viewBox="0 0 300 300" aria-hidden>
      <ellipse cx="150" cy="264" rx="96" ry="11" fill={C.ink} opacity=".14" />
      <path d="M108 104 C108 46 192 46 192 104" fill="none" stroke="#d9c4a2" strokeWidth="12" strokeLinecap="round" />
      <path d="M70 100 h160 l12 160 h-184 Z" fill="#efe2c8" />
      <path d="M70 100 h160 l2 14 h-164 Z" fill="#e2d1b0" />
      {/* block print */}
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
        <g key={`${r}${c}`} transform={`translate(${104 + c * 46} ${142 + r * 40})`}>
          <circle r="13" fill="none" stroke={r === 1 && c === 1 ? C.terra : C.leaf} strokeWidth="4" />
          <circle r="4" fill={r === 1 && c === 1 ? C.terra : C.saffron} />
        </g>
      )))}
    </svg>
  )
}

function Stickers() {
  return (
    <svg viewBox="0 0 300 300" aria-hidden>
      <ellipse cx="150" cy="262" rx="100" ry="12" fill={C.ink} opacity=".14" />
      <g transform="rotate(-6 150 160)">
        <rect x="56" y="62" width="188" height="196" rx="16" fill="#fff" />
        <rect x="56" y="62" width="188" height="196" rx="16" fill="none" stroke="#ead9bf" strokeWidth="3" />
        <g transform="translate(110 118)"><circle r="34" fill={C.terra} /><path d="M-14 -6 h28 l-4 26 h-20 Z" fill={C.cream} /><path d="M-6 -16c-4-6 4-8 0-14M6 -16c-4-6 4-8 0-14" stroke={C.cream} strokeWidth="3" fill="none" strokeLinecap="round" /></g>
        <g transform="translate(192 116)"><rect x="-30" y="-24" width="60" height="48" rx="24" fill={C.saffron} /><path d="M-14 0h28" stroke={C.ink} strokeWidth="5" strokeLinecap="round" /></g>
        <g transform="translate(108 206)"><path d="M0 -30 L9 -9 L31 -9 L13 4 L20 26 L0 13 L-20 26 L-13 4 L-31 -9 L-9 -9 Z" fill={C.leaf} /></g>
        <g transform="translate(192 204)"><circle r="30" fill="#2448ff" /><path d="M-15 -6 l7 22 7 -14 7 14 7 -22" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>
      </g>
    </svg>
  )
}

export function ClubArt() {
  return (
    <svg viewBox="0 0 300 260" aria-hidden>
      <ellipse cx="150" cy="236" rx="110" ry="12" fill="#000" opacity=".25" />
      <rect x="50" y="96" width="200" height="132" rx="14" fill={C.kraft} />
      <path d="M50 96 l100 -40 l100 40 l-100 30 Z" fill="#d9a56b" />
      <path d="M150 126 v102" stroke={C.kraftD} strokeWidth="4" />
      <rect x="80" y="150" width="56" height="44" rx="8" fill={C.cream} /><text x="108" y="178" textAnchor="middle" fontSize="18" fontWeight="800" fill={C.terra} fontFamily="Georgia, serif">03</text>
      <circle cx="206" cy="172" r="26" fill={C.terra} /><path d="M196 172 l8 8 14 -16" stroke={C.cream} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Steam x={112} y={70} s={0.8} />
    </svg>
  )
}

export function ProductArt({ kind }: { kind: "kit" | "tote" | "stickers" | "gift" }) {
  return kind === "kit" ? <Kit /> : kind === "gift" ? <Gift /> : kind === "tote" ? <Tote /> : <Stickers />
}
