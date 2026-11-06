"use client"
// The ten scenes of the 3-minute WondrPay film. Time inside a scene is local seconds from its start.
// CSS animations use `--d` (delay inside the scene); the scene wrapper sets `--off` (playhead at mount),
// so a scrub lands every animation on the right frame.
import type { CSSProperties, ReactNode } from "react"
import { Identicon } from "../ui"
import { useState } from "react"
import { useBeat, useLocal, ease, clock } from "./clock"

export type Scene = { id: string; title: string; start: number; end: number; vo: string; render: (s: number) => ReactNode }
const d = (sec: number, extra?: CSSProperties) => ({ ["--d" as string]: `${sec}s`, ...extra }) as CSSProperties

// ------------------------------------------------------------------------------------- primitives
/** subtree mounted mid-scene: re-stamp --off with the scene-local playhead at mount so --d stays scene-relative */
function Off({ s, children, className, style }: { s: number; children: ReactNode; className?: string; style?: CSSProperties }) {
  const [off] = useState(() => Math.max(0, clock.t - s))
  return <div className={`off ${className ?? ""}`} style={{ ["--off" as string]: `${off}s`, ...style }}>{children}</div>
}
function Num({ s, from = 0, to, at, dur = 1.6, dec = 2, prefix = "", suffix = "" }: { s: number; from?: number; to: number; at: number; dur?: number; dec?: number; prefix?: string; suffix?: string }) {
  const l = useLocal(s + at, 0.04)
  const v = from + (to - from) * ease(l / dur)
  return <span className="tab">{prefix}{v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}{suffix}</span>
}

function QR({ size = 220, seed = 7 }: { size?: number; seed?: number }) {
  const n = 25, cells: [number, number][] = []
  let x = seed
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    const finder = (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)
    if (!finder && x % 100 < 47) cells.push([r, c])
  }
  const F = ({ r, c }: { r: number; c: number }) => (<g><rect x={c} y={r} width="7" height="7" rx="1.6" fill="#0b1033" /><rect x={c + 1} y={r + 1} width="5" height="5" rx="1.1" fill="#fff" /><rect x={c + 2} y={r + 2} width="3" height="3" rx=".8" fill="#0b1033" /></g>)
  return (
    <svg width={size} height={size} viewBox={`-1 -1 ${n + 2} ${n + 2}`} className="qr-svg">
      <rect x="-1" y="-1" width={n + 2} height={n + 2} rx="2" fill="#fff" />
      {cells.map(([r, c]) => <rect key={`${r}-${c}`} x={c + 0.06} y={r + 0.06} width=".88" height=".88" rx=".22" fill="#0b1033" />)}
      <F r={0} c={0} /><F r={0} c={n - 7} /><F r={n - 7} c={0} />
      <rect x={n / 2 - 2.5} y={n / 2 - 2.5} width="5" height="5" rx="1.3" fill="#2448ff" />
    </svg>
  )
}

const Logo = ({ size = 120, draw = false }: { size?: number; draw?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 512 512" className={draw ? "logo-draw" : ""}>
    <rect width="512" height="512" rx="120" fill="#fff" />
    <path d="M110 168l50 176 56-128 40 92 40-92 56 128 50-176" fill="none" stroke="#2448ff" strokeWidth="56" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
  </svg>
)

function Phone({ children, tilt = 0, className = "", style }: { children: ReactNode; tilt?: number; className?: string; style?: CSSProperties }) {
  return (
    <div className={`phone ${className}`} style={{ ["--tilt" as string]: `${tilt}deg`, ...style }}>
      <div className="island" />
      <div className="screen">{children}</div>
    </div>
  )
}

function TabBar({ on = 0 }: { on?: number }) {
  return (
    <div className="m-tabbar" style={{ ["--i" as string]: on }}>
      <span className="pill" />
      {["Home", "Money", "Shop", "You"].map((l, i) => <span key={l} className={i === on ? "on" : ""}>{l}</span>)}
    </div>
  )
}

function Rings({ s, size = 64, rings }: { s: number; size?: number; rings: { color: string; dur: number; at: number }[] }) {
  const pad = rings.length * 7 + 4, box = size + pad * 2
  return (
    <div className="m-rings" style={{ width: box, height: box }}>
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`}>
        {rings.map((r, i) => {
          const rad = size / 2 + 4 + i * 7, c = 2 * Math.PI * rad
          return (
            <g key={i} style={{ color: r.color }}>
              <circle cx={box / 2} cy={box / 2} r={rad} className="track" />
              <circle cx={box / 2} cy={box / 2} r={rad} className="bar a drain" style={d(r.at, { strokeDasharray: c, ["--c" as string]: c, animationDuration: `${r.dur}s` })} />
            </g>
          )
        })}
      </svg>
      <div className="m-avatar" style={{ width: size, height: size }}><Identicon seed="0x97c6bb8a9aeb0aa4148201ad6595b54ca72110e2" size={size} /></div>
    </div>
  )
}

function HomeScreen({ s, at = 0, rings = true }: { s: number; at?: number; rings?: boolean }) {
  return (
    <div className="m-home">
      <div className="m-top">
        <div className="m-search">Pay friends and merchants</div>
        {rings ? <Rings s={s} size={38} rings={[{ color: "#DDF05A", dur: 30, at }, { color: "#3DE0FF", dur: 60, at }]} /> : <div className="m-avatar" style={{ width: 38, height: 38 }} />}
      </div>
      <div className="m-balance">
        <div className="lbl">USDT BALANCE <span className="neon">PERSONAL</span></div>
        <div className="big"><Num s={s} to={3.7} at={at + 0.3} /> <small>USDT</small></div>
        <div className="row"><span className="lime-pill">0 gas</span><span>amrendra.wondrpay.eth</span></div>
      </div>
      <div className="m-tiles">
        {["Scan any QR", "Pay anyone", "Receive", "Shop QR"].map((t, i) => <div key={t} className="a rise" style={d(at + 0.5 + i * 0.08)}><span className="sq" />{t}</div>)}
      </div>
      <div className="m-h">Send money</div>
      <div className="m-people">
        {["0xCF69aAdd6357Afd3C1b5EcFE3eecA134f49b6e10", "0x66858D8623a401aE16eD320b6F927EA796d01254", "0x158D9f52Fe527C85E876ADA9e982B294827EBC14"].map((a, i) => (
          <div key={a} className="a rise" style={d(at + 0.8 + i * 0.1)}><Identicon seed={a} size={46} /><span>{["chai-shop", "masala", "demo-store"][i]}</span></div>
        ))}
      </div>
      <TabBar />
    </div>
  )
}

// ------------------------------------------------------------------------------------- scenes
function S1Problem({ s }: { s: number }) {
  return (
    <div className="sc sc-problem">
      <div className="bokeh" />
      <div className="a fade" style={d(0)}><div className="kicker">The problem</div><h1 className="h1">Small payments lose money<br />on the way.</h1></div>
      <div className="problem-row">
        <div className="terminal a rise" style={d(0.8)}>
          <div className="t-screen"><span className="a blink-in" style={d(2.4)}>DECLINED</span></div>
          <div className="t-keys">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div>
          <div className="card-chip a tapin" style={d(1.4)} />
        </div>
        <div className="remit a rise" style={d(3.2)}>
          <div className="r-h">International transfer</div>
          <div className="r-line"><span>You send</span><b>$200.00</b></div>
          <div className="r-line"><span>They receive</span><b className="neg"><Num s={s} from={200} to={187} at={4.2} dur={2} prefix="$" /></b></div>
          <div className="r-line"><span>Arrives</span><b>in 3 days</b></div>
        </div>
      </div>
      <div className="fee-chips">
        {["−6% on transfers", "3 days to arrive", "2.9% + 30¢ per card sale"].map((t, i) => <span key={t} className="chip-red a pop" style={d(6 + i * 1.1)}>{t}</span>)}
      </div>
    </div>
  )
}

function S2Reveal() {
  return (
    <div className="sc sc-reveal">
      <div className="a pop" style={d(0.3)}><Logo size={170} draw /></div>
      <div className="brand a rise" style={d(2.2)}>WondrPay</div>
      <div className="tagline">
        {["Scan.", "Verify.", "Pay."].map((w, i) => <span key={w} className="a rise" style={d(3.4 + i * 0.7)}>{w}</span>)}
      </div>
      <div className="row-c">
        <span className="lime-pill big a pop" style={d(6)}>0 gas</span>
        <span className="glass-chip a pop" style={d(6.6)}>No seed phrase</span>
        <span className="glass-chip a pop" style={d(7.2)}>No waiting</span>
      </div>
      <div className="sub-c a fade" style={d(8.2)}>Digital dollars (USDT) on Whitechain · names on ENS · receipts on Arkiv · one human, one account (World ID)</div>
    </div>
  )
}

function S3Pay({ s }: { s: number }) {
  const beat = useBeat(s, [6, 10.5, 18, 20.5]) // 0 home · 1 scan · 2 checks · 3 fingerprint · 4 success
  const checks = ["Created by WondrPay", "Amount untampered", "Signed by the merchant", "Still valid"]
  return (
    <div className="sc sc-split">
      <Phone tilt={-6} className="a rise" style={d(0)}>
        {beat === 0 && <HomeScreen s={s} at={0.4} />}
        {beat === 1 && (
          <div className="m-scan">
            <div className="brackets"><QR size={210} seed={11} /><div className="sweep" /></div>
            <div className="m-scan-t">Scan any WondrPay QR</div>
          </div>
        )}
        {(beat === 2 || beat === 3) && (
          <Off s={s} className="full"><div className="m-pay">
            <div className="m-merchant"><Identicon seed="0xCF69aAdd6357Afd3C1b5EcFE3eecA134f49b6e10" size={56} /><div><b>Chai Point, Bandra</b><span>chai-shop.wondrpay.eth</span></div><span className="ok-badge">✓ Verified</span></div>
            <div className="m-amt">2.50 <small>USDT</small></div>
            <ul className="m-checks">{checks.map((c, i) => <li key={c} className="a slide" style={d(10.9 + i * 1.3)}><span className="tick">✓</span>{c}</li>)}</ul>
            <div className={`m-finger ${beat === 3 ? "press" : ""}`}><span className="fp" />{beat === 3 ? "Confirming…" : "Pay with fingerprint"}</div>
          </div></Off>
        )}
        {beat === 4 && (
          <div className="m-success">
            <svg viewBox="0 0 96 96" className="check-draw"><circle cx="48" cy="48" r="44" /><path d="M29 49l13 13 26-28" /></svg>
            <div className="ring r1" /><div className="ring r2" />
            <div className="m-amt">Paid 2.50 <small>USDT</small></div>
            <div className="m-sub">Settled on Whitechain · receipt on Arkiv</div>
            <span className="m-chip">View on explorer ↗</span>
          </div>
        )}
      </Phone>
      <div className="copy">
        <div className="kicker a fade" style={d(0.2)}>Paying a shop</div>
        <h2 className="h2 a rise" style={d(0.5)}>Scan. We check it.<br />You touch. Done.</h2>
        <div className="facts">
          <div className="fact a rise" style={d(11)}><b>4 checks</b><span>before you pay: real merchant, untampered amount</span></div>
          <div className="fact a rise" style={d(19)}><b>~4 s</b><span>fingerprint to receipt, settled in ~1 s</span></div>
          <div className="fact a rise" style={d(21)}><b className="lime">0 gas</b><span>WondrPay covers the network fee</span></div>
        </div>
      </div>
    </div>
  )
}

function S4Merchant({ s }: { s: number }) {
  const beat = useBeat(s, [2.6, 8.6, 11.5]) // 0 typing · 1 QR waiting · 2 received · 3 refund
  return (
    <div className="sc sc-merchant">
      <div className="kicker a fade" style={d(0)}>For the shop</div>
      <div className="duo">
        <div className="col">
          <Phone tilt={4}>
            <div className="m-term">
              <div className="m-h">New payment request</div>
              <div className="m-amt typed">{beat === 0 ? <span className="type-2-50" /> : <>2.50 <small>USDT</small></>}</div>
              {beat >= 1 && <Off s={s}><div className="term-qr a pop" style={d(2.6)}><QR size={190} seed={23} /><span className="stopwatch">⏱ 0.5 s</span></div></Off>}
              {beat === 1 && <div className="m-wait"><span className="spin" />Waiting for payment · 4:59</div>}
              {beat >= 2 && <div className="m-toast">Received 2.50 USDT</div>}
              {beat === 3 && (
                <div className="m-sheet">
                  <b>Refund payment</b>
                  <span>Goes back to the customer who paid. Never anywhere else.</span>
                  <div className="m-btn">Refunded to the original payer ✓</div>
                </div>
              )}
            </div>
          </Phone>
          <div className="cap">Shop terminal</div>
        </div>
        <div className="col">
          <Phone tilt={-4}>
            {beat < 2 ? (
              <div className="m-pay compact"><div className="m-amt">2.50 <small>USDT</small></div><div className="m-sub">to Chai Point, Bandra</div><div className={`m-finger ${beat === 1 ? "press" : ""}`}><span className="fp" />Pay with fingerprint</div></div>
            ) : (
              <div className="m-success"><svg viewBox="0 0 96 96" className="check-draw"><circle cx="48" cy="48" r="44" /><path d="M29 49l13 13 26-28" /></svg><div className="m-amt">Paid</div></div>
            )}
          </Phone>
          <div className="cap">Customer</div>
        </div>
        <div className="col facts">
          <div className="fact a rise" style={d(3)}><b>0.5 s</b><span>QR on screen</span></div>
          <div className="fact a rise" style={d(9)}><b>Seconds</b><span>money in, not T+2</span></div>
          <div className="fact a rise" style={d(12)}><b>Safe refunds</b><span>only to the original payer, capped on-chain</span></div>
          <div className="fact a rise csv" style={d(14.5)}><b>CSV ↓</b><span>books in one tap</span></div>
        </div>
      </div>
    </div>
  )
}

function S5Website({ s }: { s: number }) {
  const beat = useBeat(s, [3, 7, 10]) // 0 store · 1 modal · 2 paid · 3 pins + code
  const pins = [[1.5, 3], [5, 56], [4.5, 87], [35.5, 87], [66.5, 87]]
  return (
    <div className="sc sc-web">
      <div className="browser a rise" style={d(0)}>
        <div className="bar"><i /><i /><i /><span>wondrpay-demo-store.vercel.app</span></div>
        <div className="store">
          <div className="store-h"><b>☕ Chai &amp; Co.</b><span>pays with WondrPay</span></div>
          <div className="products">
            {[["🫖", "Masala Chai Kit", "2.50"], ["👜", "Chai & Co. Tote", "1.20"], ["✨", "Sticker Pack", "0.40"]].map(([e, n, p], i) => (
              <div key={n} className="product"><div className="art">{e}</div><b>{n}</b><div className="price">{p} USDT</div><div className={`wp-btn ${i === 0 && beat === 0 ? "hover" : ""}`}>Pay {p} USDT</div></div>
            ))}
          </div>
          {beat === 3 && <Off s={s}><div className="srv a fade" style={d(10)}><span>server · /api/create-order</span><span>server · /api/webhook</span><span>server · /api/verify</span></div></Off>}
          {(beat === 1 || beat === 2) && (
            <div className="modal-back"><div className="modal">
              {beat === 1 ? <><b>WondrPay</b><div className="m-amt">2.50 <small>USDT</small></div><QR size={170} seed={31} /><div className="m-wait"><span className="spin" />Waiting for payment</div></>
                : <><div className="ok-big">✓</div><b>Paid 2.50 USDT</b><span>Settled on Whitechain</span></>}
            </div></div>
          )}
          {beat === 3 && <Off s={s} className="pins">{pins.map(([x, y], i) => <span key={i} className="pin a pop" style={d(10 + i * 0.35, { left: `${x}%`, top: `${y}%` })}>{"①②③④⑤"[i]}</span>)}</Off>}
        </div>
      </div>
      {beat === 3 && (
        <Off s={s}><div className="code a slide-l" style={d(11.5)}>
          <div className="code-h">Integration <b className="lime">≈ 20 lines</b></div>
          <pre>{`① <script src=".../sdk/v1.2.0/checkout.js"\n     integrity="sha384-…" />\n② <wondrpay-button order-endpoint="/api/create-order"\n     payload='{"sku":"chai-kit"}' />\n③ createWondrPayOrder({ merchantKey, amount })\n④ verifyWondrPayWebhook(req) → verifyWondrPayPayment(tx)`}</pre>
          <div className="code-f">Prices are signed by the shop. The browser can't change them.</div>
        </div></Off>
      )}
    </div>
  )
}

function S6Subs({ s }: { s: number }) {
  const beat = useBeat(s, [5, 11, 14, 15.5]) // 0 choose · 1 rings · 2 due · 3 tapped · 4 paid
  return (
    <div className="sc sc-split">
      <Phone tilt={-5}>
        {beat === 0 ? (
          <div className="m-sub-page">
            <b className="t">Chai Club</b><div className="m-amt">0.10 <small>USDT / 2 min</small></div>
            <div className="m-h">How do you want to pay the next ones?</div>
            <div className="opt on a pop" style={d(1.2)}><span className="radio on" /><div><b>Ask me each time</b><span>Recommended · nothing pre-approved</span></div></div>
            <div className="opt a pop" style={d(1.6)}><span className="radio" /><div><b>Autopay</b><span>approve once, runs on schedule</span></div></div>
            <div className="m-btn a pop" style={d(3)}>Subscribe · pay 0.10 USDT now</div>
          </div>
        ) : (
          <Off s={s} className="full"><div className="m-ringstage">
            <Rings s={s} size={120} rings={[{ color: "#DDF05A", dur: 6, at: 5 }, { color: "#3DE0FF", dur: 40, at: 5 }, { color: "#FF5CC8", dur: 70, at: 5 }]} />
            <div className="ring-legend"><span className="l1">Chai Club</span><span className="l2">Music Pro</span><span className="l3">Cloud 2TB</span></div>
            {beat >= 2 && (
              <div className={`due-card ${beat >= 3 ? "tapped" : ""}`}>
                <span className="bell">🔔</span><div><b>Payment due · Chai Club</b><span>0.10 USDT · approve within 9:59</span></div>
                <span className="due-pay">{beat >= 4 ? "Paid ✓" : "Pay"}</span>
              </div>
            )}
          </div></Off>
        )}
      </Phone>
      <div className="copy">
        <div className="kicker a fade" style={d(0)}>Subscriptions, done right</div>
        <h2 className="h2 a rise" style={d(0.4)}>Nothing charged<br />behind your back.</h2>
        <div className="facts">
          <div className="fact a rise" style={d(5.5)}><b className="lime">Timer rings</b><span>each subscription counts down around your avatar</span></div>
          <div className="fact a rise" style={d(11.5)}><b>1 tap</b><span>to approve the payment that's due</span></div>
          <div className="fact cancel a rise" style={d(15.8)}><b>1 tap to cancel</b><span>Won't be charged: 1 payment · 0.10 USDT</span></div>
        </div>
      </div>
    </div>
  )
}

const ROWS = [
  ["Fee for the shop", "1.5–3.5% + fixed", "≈ 0 · payer pays 0 gas"],
  ["Settlement", "T+1 to T+3", "~1 second, final"],
  ["Cross-border", "6%+ and days", "same as paying next door"],
  ["Chargebacks", "the shop loses", "refunds only to the payer, capped"],
  ["Receipts", "private, siloed", "permanent, verifiable on Arkiv"],
  ["Identity", "a card number", "name.wondrpay.eth + one human"],
  ["Open", "banking days", "24 / 7 / 365"],
]
function S7Compare({ s }: { s: number }) {
  const beat = useBeat(s, [17.5])
  return (
    <div className="sc sc-compare">
      <div className="kicker a fade" style={d(0)}>Web2 vs Web3</div>
      {beat === 0 ? (
        <div className="cmp">
          <div className="cmp-h"><span /><span className="w2">Cards &amp; banks</span><span className="w3">WondrPay on Whitechain</span></div>
          {ROWS.map(([k, a, b], i) => (
            <div key={k} className="cmp-r a flip" style={d(0.8 + i * 2.2)}><span className="k">{k}</span><span className="w2">{a}</span><span className="w3"><i>✓</i>{b}</span></div>
          ))}
        </div>
      ) : (
        <Off s={s} className="cmp-charts">
          <div className="bars-h">
            <div className="ch-t">Cost on a $100 payment</div>
            {[["Card rails", 3.5, "$1.50–3.50", "grey"], ["Cross-border transfer", 6, "≈ $6.00", "grey"], ["WondrPay", 0.08, "$0 for the payer", "wp"]].map(([l, v, t, c], i) => (
              <div key={l as string} className="hb"><span>{l}</span><div className="track"><div className={`fill ${c} a grow-x`} style={d(18 + i * 0.5, { width: `${((v as number) / 6) * 100}%` })} /></div><b className={c === "wp" ? "lime" : ""}>{t}</b></div>
            ))}
          </div>
          <div className="settle">
            <div className="ch-t">Time until the money arrives</div>
            <div className="tl">
              {[["~1 s", "WondrPay", 4], ["T+1 to T+3", "Card payout", 72], ["1–3 days", "Bank transfer", 94]].map(([v, l, x], i) => (
                <div key={l as string} className={`tl-m a pop ${i === 0 ? "wp" : ""}`} style={d(20 + i * 0.6, { left: `${x}%` })}><b>{v}</b><span>{l}</span></div>
              ))}
              <div className="tl-axis"><span>seconds</span><span>hours</span><span>days</span></div>
            </div>
          </div>
        </Off>
      )}
      <div className="note a fade" style={d(1)}>Card and transfer costs are typical public ranges; check current rates for your market.</div>
    </div>
  )
}

function UsersChart({ s }: { s: number }) {
  const l = useLocal(s, 0.03)
  const pts = [0, 1, 3, 9, 25, 60, 120, 250, 450, 700, 1000, 1500, 2100, 3000]
  const W = 760, H = 330
  const xy = pts.map((v, i) => [40 + (i / (pts.length - 1)) * (W - 80), H - 30 - (v / 3000) * (H - 70)] as const)
  const path = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const p = ease(l / 5)
  const users = Math.round(3000 * Math.pow(p, 2.2))
  return (
    <div className="chart">
      <div className="ch-t">Users <span className="sub">illustrative, 24 months</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lc">
        {[0, 1, 2, 3].map((g) => <line key={g} x1="40" x2={W - 40} y1={40 + g * 87} y2={40 + g * 87} className="grid" />)}
        <path d={path} className="line" pathLength={1} style={{ strokeDashoffset: 1 - p }} />
        {[[4, "First 100 shops"], [8, "First corridor"], [10, "1 M users"]].map(([i, t]) => p > (i as number) / 13 && (
          <g key={t as string}><circle cx={xy[i as number][0]} cy={xy[i as number][1]} r="7" className="dot" /><text x={xy[i as number][0] - 12} y={xy[i as number][1] - 16} className="lbl" textAnchor="end">{t}</text></g>
        ))}
      </svg>
      <div className="big-stat"><span className="tab">{users >= 1000 ? `${(users / 1000).toFixed(1)} M` : `${users} k`}</span> users</div>
    </div>
  )
}

function ActivityChart({ s }: { s: number }) {
  const l = useLocal(s, 0.04)
  const p = ease(l / 4)
  const users = [1, 25, 250, 1000, 3000]
  const W = 760, H = 300
  const area = (k: number, scale: number) => {
    const pts = users.map((u, i) => [40 + (i / 4) * (W - 80), H - 30 - ((u * k) / scale) * (H - 70) * p] as const)
    return `M40,${H - 30} ` + pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + ` L${W - 40},${H - 30} Z`
  }
  return (
    <div className="chart">
      <div className="ch-t">Network activity <span className="sub">illustrative · 0.8 payments/user/day · $6 average</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lc">
        <path d={area(0.8, 2400)} className="area blue" />
        <path d={area(0.8 * 0.6, 2400)} className="area lime" />
      </svg>
      <div className="stat-row">
        <div><b className="tab">{(2.4 * p).toFixed(1)} M</b><span>payments / day on Whitechain</span></div>
        <div><b className="tab lime">${(14.4 * p).toFixed(1)} M</b><span>USDT volume / day</span></div>
        <div><b className="tab">${(5.3 * p).toFixed(1)} B</b><span>per year</span></div>
      </div>
    </div>
  )
}

function S8Growth({ s }: { s: number }) {
  const beat = useBeat(s, [8.5, 17])
  return (
    <div className="sc sc-growth">
      <div className="kicker a fade" style={d(0)}>Good for the chain</div>
      <h2 className="h2 a rise" style={d(0.3)}>Every user is new activity on Whitechain.</h2>
      <div className="growth-stage">
        {beat === 0 && <UsersChart s={s + 0.8} />}
        {beat === 1 && <ActivityChart s={s + 8.8} />}
        {beat === 2 && (
          <Off s={s} className="flywheel">
            <div className="fw-spin" />
            {[["Users", "more places to pay"], ["Shops", "zero fees, instant money"], ["Transactions", "fees + liquidity on Whitechain"], ["Network value", "better UX, more corridors"]].map(([n, c], i) => (
              <div key={n} className={`fw-node n${i} a pop`} style={d(17.3 + i * 0.5)}><b>{n}</b><span>→ {c}</span></div>
            ))}
            <div className="fw-core"><Logo size={92} /></div>
          </Off>
        )}
      </div>
      <div className="note">Illustrative model; assumptions on screen.</div>
    </div>
  )
}

const CITIES: Record<string, [number, number]> = { Mumbai: [72.8, 19], Dubai: [55.3, 25.2], Lagos: [3.4, 6.5], London: [-0.1, 51.5], Manila: [121, 14.6], Riyadh: [46.7, 24.7], "Mexico City": [-99.1, 19.4], "Los Angeles": [-118.2, 34], Kyiv: [30.5, 50.4], Warsaw: [21, 52.2] }
const ROUTES: [string, string][] = [["Dubai", "Mumbai"], ["London", "Lagos"], ["Riyadh", "Manila"], ["Los Angeles", "Mexico City"], ["Warsaw", "Kyiv"]]
function S9Global({ s }: { s: number }) {
  const l = useLocal(s, 0.05)
  const rot = l * 6
  const R = 330, C = 400
  const latest = Math.min(ROUTES.length - 1, Math.floor((l - 1) / 1.4)) // label only the two newest corridors
  const proj = ([lon, lat]: [number, number]) => {
    const lam = ((lon + 20 - rot) * Math.PI) / 180, phi = (lat * Math.PI) / 180
    return { x: C + R * Math.cos(phi) * Math.sin(lam), y: C - R * Math.sin(phi), front: Math.cos(phi) * Math.cos(lam) > -0.1 }
  }
  return (
    <div className="sc sc-global">
      <div className="g-copy">
        <div className="kicker a fade" style={d(0)}>Global by design</div>
        <h2 className="h2 a rise" style={d(0.3)}>Same app. Same digital dollar.<br />Every country.</h2>
        <div className="fact a rise" style={d(4)}><b className="lime">$200 → $200</b><span>no slice lost on the way, settled in seconds</span></div>
      </div>
      <svg viewBox="0 0 800 800" className="globe">
        <defs><radialGradient id="gl" cx="40%" cy="35%"><stop offset="0" stopColor="#1d39d9" /><stop offset="1" stopColor="#0b1033" /></radialGradient></defs>
        <circle cx={C} cy={C} r={R} fill="url(#gl)" stroke="#2448ff" strokeOpacity=".5" />
        {[-60, -30, 0, 30, 60].map((lat) => <ellipse key={lat} cx={C} cy={C - R * Math.sin((lat * Math.PI) / 180)} rx={R * Math.cos((lat * Math.PI) / 180)} ry={8} className="grat" />)}
        {Array.from({ length: 12 }, (_, i) => { const a = (((i * 30 - rot) % 180) + 180) % 180; return <ellipse key={i} cx={C} cy={C} rx={Math.abs(R * Math.cos((a * Math.PI) / 180))} ry={R} className="grat" /> })}
        {ROUTES.map(([a, b], i) => {
          const A = proj(CITIES[a]), B = proj(CITIES[b])
          if (!A.front || !B.front) return null
          const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2 - 90
          const shown = l > 1 + i * 1.4
          return (
            <g key={a}>
              <path d={`M${A.x},${A.y} Q${mx},${my} ${B.x},${B.y}`} className={`arc ${shown ? "on" : ""}`} pathLength={1} />
              <circle cx={A.x} cy={A.y} r="5" className="city" /><circle cx={B.x} cy={B.y} r="5" className="city" />
              {shown && i >= latest - 1 && <text x={mx} y={my + (i === latest ? -14 : 44)} className="arc-l" textAnchor="middle">{a} → {b} · $200 → $200</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function S10Close({ s }: { s: number }) {
  return (
    <div className="sc sc-close">
      <Phone className="a rise" style={d(0)}><HomeScreen s={s} at={0.2} /></Phone>
      <div className="close-copy">
        <div className="tagline big">{["Scan.", "Verify.", "Pay.", "Everywhere."].map((w, i) => <span key={w} className={`a rise ${i === 3 ? "lime" : ""}`} style={d(0.5 + i * 0.5)}>{w}</span>)}</div>
        <div className="partners a fade" style={d(3)}><span>Whitechain</span><span>ENS</span><span>Arkiv</span><span>World ID</span></div>
        <div className="url a fade" style={d(3.6)}>wondrpay.vercel.app</div>
        <div className="sub-c a fade" style={d(4.2)}>Built at ETHGlobal</div>
      </div>
    </div>
  )
}

export const SCENES: Scene[] = [
  { id: "problem", title: "The problem", start: 0, end: 12, render: (s) => <S1Problem s={s} />,
    vo: "Every day, billions of small payments lose money on the way. Fees on the sender, fees on the shop, and days of waiting for the money to land." },
  { id: "reveal", title: "WondrPay", start: 12, end: 24, render: () => <S2Reveal />,
    vo: "This is WondrPay. Digital dollars that move like a text message. Scan, verify, pay. No gas, no seed phrase, no waiting." },
  { id: "pay", title: "Paying a shop", start: 24, end: 50, render: (s) => <S3Pay s={s} />,
    vo: "At the counter, scan the shop's code. WondrPay checks it before you pay: created by WondrPay, amount untouched, signed by the real merchant, still valid. Touch the fingerprint sensor, and it's done. Settled on Whitechain in about a second, with a permanent receipt on Arkiv. You never paid a cent in gas." },
  { id: "merchant", title: "For the shop", start: 50, end: 68, render: (s) => <S4Merchant s={s} />,
    vo: "For the shop, the QR appears in half a second. Money arrives in seconds, not days, at no card fee. Refunds can only go back to the person who paid, and the books export to CSV in one tap." },
  { id: "website", title: "Any website", start: 68, end: 90, render: (s) => <S5Website s={s} />,
    vo: "Any website can accept it. One script tag, one button, one server call, and a signed webhook that the shop verifies on-chain. Prices are signed by the shop, so nobody can change them in the browser." },
  { id: "subs", title: "Subscriptions", start: 90, end: 108, render: (s) => <S6Subs s={s} />,
    vo: "Subscriptions, done right. You approve only today's payment. When the next one is due, the ring around your avatar runs out and WondrPay asks you. One tap to pay, one tap to cancel. Nothing is charged behind your back." },
  { id: "compare", title: "Web2 vs Web3", start: 108, end: 135, render: (s) => <S7Compare s={s} />,
    vo: "Compare that to card rails: a few percent per sale, money that lands days later, chargebacks the shop pays for. On WondrPay, settlement is final in a second, cross-border costs the same as paying next door, and every receipt can be checked by anyone." },
  { id: "growth", title: "Growth", start: 135, end: 160, render: (s) => <S8Growth s={s} />,
    vo: "Every new user is new activity on Whitechain. More shops bring more customers. More customers bring more shops. Each payment is a real on-chain transaction and a real receipt on Arkiv: more fees for validators, more USDT moving on Whitechain, and a network that gets more useful the bigger it gets." },
  { id: "global", title: "Global", start: 160, end: 172, render: (s) => <S9Global s={s} />,
    vo: "And because it's a digital dollar, borders stop mattering. A worker in Dubai can pay a shop in Mumbai the same way they pay the one downstairs, in seconds, without losing a slice on the way." },
  { id: "close", title: "Close", start: 172, end: 180, render: (s) => <S10Close s={s} />,
    vo: "WondrPay. Scan, verify, pay. Everywhere." },
]

/** payment-success moments that get the chime (absolute seconds) */
export const CHIMES = [24 + 20.5, 50 + 8.6, 68 + 7, 90 + 15.5]
