"use client"
// Header, footer and the product card shared by every shop page.
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CATEGORIES, PRODUCTS, off, compactCount, type Product } from "@/lib/catalog"
import { ProductImage } from "@/lib/packshot"
import { useStore } from "../store-context"

export function Logo() {
  return (
    <Link href="/" className="ks-logo" aria-label="Kesar home">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
        <defs><linearGradient id="ksl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff8a00" /><stop offset=".55" stopColor="#ff3d6e" /><stop offset="1" stopColor="#7b2ff7" /></linearGradient></defs>
        <rect width="40" height="40" rx="12" fill="url(#ksl)" />
        <path d="M13 9v22M13 21l12-12M17 18l10 13" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span>kesar</span>
    </Link>
  )
}

function Search() {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get("q") ?? "")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { setQ(params.get("q") ?? "") }, [params])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    return PRODUCTS.filter((p) => `${p.brand} ${p.name} ${p.sub} ${p.cat}`.toLowerCase().includes(t)).slice(0, 6)
  }, [q])
  const go = (term: string) => { setOpen(false); router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop") }
  return (
    <div className="ks-search" ref={box}>
      <form role="search" onSubmit={(e) => { e.preventDefault(); if (active >= 0 && hits[active]) { setOpen(false); router.push(`/p/${hits[active].sku}`) } else go(q.trim()) }}>
        <svg className="ks-search-ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <input
          type="search" value={q} placeholder="Search for products, brands and more" aria-label="Search for products, brands and more"
          role="combobox" aria-expanded={open && hits.length > 0} aria-controls="ks-suggest" aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `ks-s-${active}` : undefined}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)) }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)) }
            else if (e.key === "Escape") setOpen(false)
          }}
        />
      </form>
      {open && hits.length > 0 && (
        <ul id="ks-suggest" role="listbox" className="ks-suggest">
          {hits.map((p, i) => (
            <li key={p.sku} id={`ks-s-${i}`} role="option" aria-selected={i === active}>
              <Link href={`/p/${p.sku}`} onClick={() => setOpen(false)}>
                <span className="ks-suggest-art"><ProductImage p={p} /></span>
                <span><b>{p.brand}</b> {p.name}<small>in {p.sub}</small></span>
              </Link>
            </li>
          ))}
          <li role="option" aria-selected={false}><button type="button" onClick={() => go(q.trim())}>See all results for “{q.trim()}”</button></li>
        </ul>
      )}
    </div>
  )
}

export function Header() {
  const { count, wish, openBag } = useStore()
  const path = usePathname()
  const params = useSearchParams()
  const cat = path === "/shop" ? params.get("cat") : null
  return (
    <header className="ks-header">
      <div className="ks-header-inner">
        <Logo />
        <nav className="ks-nav" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <Link key={c.id} href={`/shop?cat=${c.id}`} aria-current={cat === c.id ? "page" : undefined}>{c.label}</Link>
          ))}
          <Link href="/shop?sort=new" className="ks-nav-new">Studio<sup>NEW</sup></Link>
        </nav>
        <Search />
        <div className="ks-actions">
          <Link href="/orders" className="ks-action" aria-current={path === "/orders" ? "page" : undefined}><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg><span>Orders</span></Link>
          <Link href="/wishlist" className="ks-action" aria-label={`Wishlist, ${wish.length} saved`}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
            <span>Wishlist</span>{wish.length > 0 && <i className="ks-dot">{wish.length}</i>}
          </Link>
          <button type="button" className="ks-action" onClick={openBag} aria-label={`Bag, ${count} ${count === 1 ? "item" : "items"}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M5 8h14l-1 12H6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
            <span>Bag</span>{count > 0 && <i className="ks-dot">{count}</i>}
          </button>
        </div>
      </div>
    </header>
  )
}

export function Price({ p, size = "md" }: { p: Product; size?: "md" | "lg" }) {
  const pct = off(p)
  return (
    <p className={`ks-price ks-price-${size}`}>
      <b>{p.price} USDT</b>
      {pct > 0 && <><s>{size === "lg" ? "MRP " : ""}{p.mrp}</s><em>({pct}% OFF)</em></>}
    </p>
  )
}

export function RatingPill({ p }: { p: Product }) {
  return <span className="ks-rating" aria-label={`Rated ${p.rating} out of 5 by ${p.reviews.toLocaleString("en-US")} people`}><b>{p.rating}</b><span className="ks-star" aria-hidden>★</span><i aria-hidden>|</i>{compactCount(p.reviews)}</span>
}

export function ProductCard({ p }: { p: Product }) {
  const { wish, toggleWish } = useStore()
  const saved = wish.includes(p.sku)
  return (
    <li className="ks-card">
      <Link href={`/p/${p.sku}`} className="ks-card-link">
        <div className="ks-card-art">
          <ProductImage p={p} />
          {p.ad && <span className="ks-ad">AD</span>}
          {p.badge && <span className="ks-badge" data-kind={p.badge}>{p.badge === "New" ? "NEW PACK" : p.badge.toUpperCase()}</span>}
          <RatingPill p={p} />
          {p.sizes.length === 1 && /ml|g$/.test(p.sizes[0]) && <span className="ks-size-tag">{p.sizes[0].replace(" ", "")}</span>}
        </div>
        <div className="ks-card-body">
          <h3>{p.brand}</h3>
          <p className="ks-card-name">{p.name}</p>
          <Price p={p} />
        </div>
      </Link>
      <button type="button" className="ks-wish" data-on={saved || undefined} aria-pressed={saved} aria-label={saved ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`} onClick={() => toggleWish(p.sku)}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
        {saved ? "Wishlisted" : "Wishlist"}
      </button>
    </li>
  )
}

export function Footer() {
  return (
    <footer className="ks-footer">
      <div className="ks-wrap ks-footer-grid">
        <div>
          <h4>Online shopping</h4>
          <ul>{CATEGORIES.map((c) => <li key={c.id}><Link href={`/shop?cat=${c.id}`}>{c.label}</Link></li>)}</ul>
        </div>
        <div>
          <h4>Customer policies</h4>
          <ul><li><Link href="/orders">My orders</Link></li><li><a href="https://wondrpay.vercel.app/security">Payment security</a></li><li><a href="https://wondrpay.vercel.app/app">Refunds in WondrPay</a></li></ul>
        </div>
        <div>
          <h4>For developers</h4>
          <ul><li><a href="/dashboard">Seller dashboard (shop owner)</a></li><li><a href="/plain.html">Plain HTML checkout</a></li><li><a href="https://wondrpay.vercel.app/developers">Checkout SDK docs</a></li><li><a href="https://github.com/AmrendraTheCoder/whitepay/tree/main/apps/demo-store">Source code</a></li></ul>
        </div>
        <div className="ks-footer-promise">
          <p><b>100% original</b> guarantee for all products on kesar</p>
          <p><b>Return within 14 days</b> of receiving your order</p>
          <p><b>No card, no gas fees</b>: pay in USDT with WondrPay</p>
        </div>
      </div>
      <p className="ks-wrap ks-footer-note">Kesar is a demo store for the WondrPay Checkout SDK. Brands and products are invented, product photos are from Unsplash, payments use test USDT on Whitechain Sepolia, and nothing is shipped.</p>
    </footer>
  )
}
