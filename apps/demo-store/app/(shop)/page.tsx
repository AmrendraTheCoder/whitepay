"use client"
import Link from "next/link"
import { Icon, Skeleton } from "@whitepay/ui"
import { BY_SKU, CATEGORIES, PRODUCTS, off, type Category } from "@/lib/catalog"
import { ProductImage } from "@/lib/packshot"
import { Marker, useStore } from "../store-context"
import { ProductCard } from "./shell"

const BRAND_TILES: { brand: string; style: string; sub?: string }[] = [
  { brand: "Rangrez", style: "serif-plum" },
  { brand: "Saanjh", style: "spaced" },
  { brand: "Ketaki", style: "derma", sub: "Designed by dermatologists" },
  { brand: "Orbit", style: "badge" },
  { brand: "Stride", style: "bold" },
  { brand: "Dewdrop", style: "script" },
]

const CAT_ART: Record<Category, string> = { women: "rangrez-anarkali", men: "banyan-shirt", beauty: "neel-serum", home: "diya-candle", accessories: "orbit-watch" }

function FestiveBanner() {
  const her = [BY_SKU["rangrez-kurta"], BY_SKU["ketaki-spf"], BY_SKU["sutra-dress"]]
  const him = [BY_SKU["banyan-shirt"], BY_SKU["stride-sneaker"], BY_SKU["orbit-watch"]]
  return (
    <section className="ks-hero" aria-labelledby="sale-title">
      <svg className="ks-hero-bg" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <radialGradient id="hg" cx=".5" cy=".35" r=".7"><stop offset="0" stopColor="#ff9ec4" /><stop offset=".5" stopColor="#b44ad8" /><stop offset="1" stopColor="#4b1a8a" /></radialGradient>
          <pattern id="rangoli" width="80" height="80" patternUnits="userSpaceOnUse">
            <circle cx="40" cy="40" r="22" fill="none" stroke="#ffd36b" strokeWidth="2" opacity=".55" />
            {Array.from({ length: 8 }, (_, i) => <ellipse key={i} cx="40" cy="22" rx="5" ry="12" fill="#ff5fa2" opacity=".55" transform={`rotate(${i * 45} 40 40)`} />)}
            <circle cx="40" cy="40" r="6" fill="#ffd36b" opacity=".8" />
          </pattern>
        </defs>
        <rect width="1200" height="400" fill="url(#hg)" />
        <rect width="300" height="400" fill="url(#rangoli)" opacity=".9" />
        <rect x="900" width="300" height="400" fill="url(#rangoli)" opacity=".9" />
        {[[480, 60], [560, 120], [640, 40], [720, 110], [600, 200], [520, 30], [690, 190]].map(([x, y], i) => (
          <g key={i} className="ks-spark" style={{ animationDelay: `${i * 0.35}s` }}>
            {Array.from({ length: 12 }, (_, k) => <path key={k} d={`M${x} ${y}l0 -${18 + (i % 3) * 6}`} stroke={i % 2 ? "#ffd36b" : "#fff"} strokeWidth="2" strokeLinecap="round" transform={`rotate(${k * 30} ${x} ${y})`} />)}
          </g>
        ))}
        {[330, 410, 790, 870].map((x, i) => (
          <g key={x} className="ks-lantern" style={{ animationDelay: `${i * 0.4}s` }}>
            <path d={`M${x} 0v40`} stroke="#ffd36b" strokeWidth="2" />
            <path d={`M${x - 16} 44h32l-6 40h-20z`} fill="#ffb020" />
            <circle cx={x} cy={64} r="7" fill="#fff4c2" />
          </g>
        ))}
        <path d="M0 400c200-60 400-60 600-30s400 30 600-10v40H0z" fill="#2b0f57" opacity=".6" />
      </svg>

      <Link href="/shop?cat=women" className="ks-hero-side ks-hero-her" aria-label="Shop festive picks for her">
        <div className="ks-hero-stack">{her.map((p, i) => <span key={p.sku} style={{ ["--i" as string]: i }}><ProductImage p={p} /></span>)}</div>
        <span className="ks-hero-chip">Her <Icon name="arrowRight" size={14} /></span>
      </Link>

      <div className="ks-hero-copy">
        <span className="ks-hero-kicker">kesar</span>
        <h1 id="sale-title"><span>Festive</span> Sale</h1>
        <p className="ks-hero-big">Big Bright Prices</p>
        <p className="ks-hero-off">50–80% OFF</p>
        <Link href="/shop?sort=discount" className="ks-hero-cta">Shop the sale</Link>
      </div>

      <Link href="/shop?cat=men" className="ks-hero-side ks-hero-him" aria-label="Shop festive picks for him">
        <div className="ks-hero-stack">{him.map((p, i) => <span key={p.sku} style={{ ["--i" as string]: i }}><ProductImage p={p} /></span>)}</div>
        <span className="ks-hero-chip">Him <Icon name="arrowRight" size={14} /></span>
      </Link>
    </section>
  )
}

export default function Home() {
  const { sdkReady, sub } = useStore()
  const deals = [...PRODUCTS].sort((a, b) => off(b) - off(a)).slice(0, 10)
  const beauty = PRODUCTS.filter((p) => p.cat === "beauty").slice(0, 10)
  return (
    <>
      <div className="ks-wrap">
        <Link href="/shop" className="ks-ticket" aria-label="Zero gas fees on every order when you pay with WondrPay">
          <span className="ks-ticket-main">ZERO GAS FEES</span>
          <span className="ks-ticket-side">On every order<br />via <b>WondrPay</b></span>
        </Link>
      </div>

      <div className="ks-wrap"><FestiveBanner /></div>

      <section className="ks-wrap ks-brands" aria-labelledby="brands-title">
        <div className="ks-brands-grid">
          <span className="ks-ribbon"><span id="brands-title">Powered by</span></span>
          {BRAND_TILES.map((b) => (
            <Link key={b.brand} href={`/shop?brand=${encodeURIComponent(b.brand)}`} className="ks-brand-tile" data-style={b.style}>
              <span>{b.brand}</span>{b.sub && <small>{b.sub}</small>}
            </Link>
          ))}
          <span className="ks-ribbon ks-ribbon-end"><span>Up to 80% off</span></span>
        </div>
      </section>

      <section className="ks-wrap ks-section" aria-labelledby="cat-title">
        <h2 id="cat-title" className="ks-h2">Shop by category</h2>
        <ul className="ks-cats">
          {CATEGORIES.map((c) => {
            const p = BY_SKU[CAT_ART[c.id]]
            return (
              <li key={c.id}>
                <Link href={`/shop?cat=${c.id}`}>
                  <span className="ks-cat-art"><ProductImage p={p} /></span>
                  <b>{c.label}</b><small>{c.blurb}</small>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="ks-wrap ks-section" aria-labelledby="deals-title">
        <div className="ks-section-head"><h2 id="deals-title" className="ks-h2">Deals of the day</h2><Link href="/shop?sort=discount">View all</Link></div>
        <ul className="ks-row">{deals.map((p) => <ProductCard key={p.sku} p={p} />)}</ul>
      </section>

      <section className="ks-wrap ks-section" aria-labelledby="box-title">
        <div className="ks-box">
          <div className="ks-box-art" aria-hidden>
            {["neel-serum", "ketaki-spf", "dew-lipbalm"].map((s, i) => <span key={s} style={{ ["--i" as string]: i }}><ProductImage p={BY_SKU[s]} /></span>)}
          </div>
          <div className="ks-box-copy">
            <span className="ks-eyebrow">Kesar Glow Box · subscription</span>
            <h2 id="box-title">Three beauty minis, every cycle.</h2>
            <p>Pay for the first box now. When the next one is due, WondrPay asks you to approve it with one tap, or turn on Autopay once. Cancel any time from WondrPay.</p>
            <ul className="ks-ticks">
              <li><Icon name="check" size={16} /> 0.05 USDT per box (demo: every 2 minutes, 3 boxes)</li>
              <li><Icon name="check" size={16} /> One-tap renewals, or Autopay</li>
              <li><Icon name="check" size={16} /> Limits enforced on-chain</li>
            </ul>
            {sub
              ? <p className="ks-box-done" role="status"><Icon name="check" size={18} /> You&apos;re subscribed. Box 1 is paid; renewals show up in Developer view.</p>
              : (
                <div className="checkout-slot ks-box-cta">
                  <Marker n="②" title='the same button with mode="subscribe"' />
                  {sdkReady ? null : <Skeleton height={48} radius="pill" />}
                  <wondrpay-button hidden={!sdkReady} mode="subscribe" order-endpoint="/api/create-subscription" label="Subscribe · 0.05 USDT per box" />
                </div>
              )}
          </div>
        </div>
      </section>

      <section className="ks-wrap ks-section" aria-labelledby="beauty-title">
        <div className="ks-section-head"><h2 id="beauty-title" className="ks-h2">Trending in beauty</h2><Link href="/shop?cat=beauty">View all</Link></div>
        <ul className="ks-grid">{beauty.map((p) => <ProductCard key={p.sku} p={p} />)}</ul>
      </section>

      <section className="ks-wrap ks-section">
        <ul className="ks-trust">
          <li><Icon name="scan" size={22} /><div><b>Scan &amp; pay</b><span>Checkout is one QR scan in WondrPay</span></div></li>
          <li><Icon name="fingerprint" size={22} /><div><b>Fingerprint to confirm</b><span>No card numbers, no OTP</span></div></li>
          <li><Icon name="bolt" size={22} /><div><b>Settles in ~1 second</b><span>USDT on Whitechain, zero gas</span></div></li>
          <li><Icon name="receipt" size={22} /><div><b>Receipts that last</b><span>Every order has an on-chain receipt</span></div></li>
        </ul>
      </section>
    </>
  )
}
