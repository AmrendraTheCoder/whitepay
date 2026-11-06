"use client"
import { useState } from "react"
import Link from "next/link"
import { Icon, Skeleton } from "@whitepay/ui"
import { BY_SKU, CATEGORIES, PRODUCTS, compactCount } from "@/lib/catalog"
import { Packshot } from "@/lib/packshot"
import { Marker, useStore } from "../../../store-context"
import { Price, ProductCard } from "../../shell"

const deliveryDate = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })

export function ProductView({ sku }: { sku: string }) {
  const p = BY_SKU[sku]
  const { add, wish, toggleWish, sdkReady, openBag, cart } = useStore()
  const [size, setSize] = useState<string | null>(p.sizes.length === 1 ? p.sizes[0] : null)
  const [sizeErr, setSizeErr] = useState(false)
  const [pin, setPin] = useState("")
  const [eta, setEta] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number | null>(null)
  const saved = wish.includes(p.sku)
  const inBag = cart.some((l) => l.sku === p.sku && (l.size ?? null) === size)
  const cat = CATEGORIES.find((c) => c.id === p.cat)!
  const similar = PRODUCTS.filter((x) => x.sku !== p.sku && (x.sub === p.sub || x.cat === p.cat)).slice(0, 5)
  const fromBrand = PRODUCTS.filter((x) => x.sku !== p.sku && x.brand === p.brand).slice(0, 5)

  const addToBag = () => {
    if (inBag) return openBag()
    if (!size) { setSizeErr(true); document.getElementById("sizes")?.scrollIntoView({ behavior: "smooth", block: "center" }); return }
    add(p.sku, size)
  }

  return (
    <div className="ks-wrap ks-pdp">
      <nav aria-label="Breadcrumb" className="ks-crumbs">
        <Link href="/">Home</Link><span>/</span>
        <Link href={`/shop?cat=${p.cat}`}>{cat.label}</Link><span>/</span>
        <Link href={`/shop?cat=${p.cat}&sub=${encodeURIComponent(p.sub)}`}>{p.sub}</Link><span>/</span>
        <Link href={`/shop?brand=${encodeURIComponent(p.brand)}`}>{p.brand} {p.sub}</Link>
        <span>&gt;</span><b>More by {p.brand}</b>
      </nav>

      <div className="ks-pdp-main">
        <div className="ks-gallery" aria-label="Product images">
          {[0, 1, 2, 3].map((v) => (
            <button key={v} type="button" className="ks-gallery-img" onClick={() => setZoom(v)} aria-label={`Enlarge image ${v + 1} of ${p.name}`}>
              <Packshot p={p} variant={v} />
              {v === 0 && p.sizes.length === 1 && /ml|g$/.test(p.sizes[0]) && <span className="ks-size-tag ks-size-tag-lg">{p.sizes[0].replace(" ", "")}</span>}
            </button>
          ))}
        </div>

        <div className="ks-pdp-info">
          <h1 className="ks-pdp-brand">{p.brand}</h1>
          <p className="ks-pdp-name">{p.name}</p>
          <a href="#details" className="ks-pdp-rating"><b>{p.rating}</b><span className="ks-star" aria-hidden>★</span><i aria-hidden>|</i>{compactCount(p.reviews)} Ratings</a>
          <hr />
          <Price p={p} size="lg" />
          <p className="ks-taxes">inclusive of all taxes · zero network fee</p>

          <div className="ks-sizes" id="sizes">
            <div className="ks-sizes-head"><b>SELECT SIZE</b>{p.sizes.length > 1 && <span className="ks-size-chart">SIZE CHART <Icon name="arrowRight" size={12} /></span>}</div>
            <div className="ks-size-row" role="radiogroup" aria-label="Size" aria-invalid={sizeErr || undefined}>
              {p.sizes.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={size === s} className="ks-size" onClick={() => { setSize(s); setSizeErr(false) }}>{s}</button>
              ))}
            </div>
            {sizeErr && <p className="ks-size-err" role="alert">Please select a size</p>}
          </div>

          <div className="ks-pdp-cta">
            <button type="button" className="ks-btn ks-btn-bag" onClick={addToBag}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path d="M5 8h14l-1 12H6z" fill="currentColor" /><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
              {inBag ? "GO TO BAG" : "ADD TO BAG"}{inBag && <Icon name="arrowRight" size={16} />}
            </button>
            <button type="button" className="ks-btn ks-btn-wish" data-on={saved || undefined} aria-pressed={saved} onClick={() => toggleWish(p.sku)}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
              {saved ? "WISHLISTED" : "WISHLIST"}
            </button>
          </div>

          <div className="ks-buynow checkout-slot">
            <Marker n="②" title="<wondrpay-button>, buy this product now" />
            {sdkReady ? null : <Skeleton height={48} radius="md" />}
            {/* ── WONDRPAY INTEGRATION ② ── the checkout button: sku + qty only, the server signs the price (the same element powers the bag) */}
            <wondrpay-button hidden={!sdkReady} order-endpoint="/api/create-order" payload={JSON.stringify({ items: [{ sku: p.sku, qty: 1 }] })} data-items={JSON.stringify([{ sku: p.sku, qty: 1, size: size ?? undefined }])} label={`Buy now · ${p.price} USDT with WondrPay`} />
            <p className="ks-buynow-note"><Icon name="fingerprint" size={14} /> Scan, confirm with your fingerprint, paid in about a second. No gas.</p>
          </div>

          <div className="ks-seller">
            <Price p={p} />
            <p className="ks-seller-name">Seller: <b>{p.seller}</b></p>
          </div>

          <div className="ks-offer">
            <span className="ks-offer-ico" aria-hidden><Icon name="bolt" size={16} /></span>
            <div><b>Zero gas, zero card fees</b><p>WondrPay&apos;s relayer pays the network fee. You pay exactly {p.price} USDT. <a href="https://wondrpay.vercel.app" target="_blank" rel="noopener noreferrer">How it works</a></p></div>
          </div>

          <div className="ks-delivery">
            <b>DELIVERY OPTIONS <svg width="20" height="16" viewBox="0 0 26 18" aria-hidden><path d="M1 2h14v11H1zM15 6h5l4 4v3h-9z" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="6" cy="15" r="2" fill="#fff" stroke="currentColor" strokeWidth="1.6" /><circle cx="19" cy="15" r="2" fill="#fff" stroke="currentColor" strokeWidth="1.6" /></svg></b>
            <form className="ks-pin" onSubmit={(e) => { e.preventDefault(); setEta(/^[1-9]\d{5}$/.test(pin) ? deliveryDate(2 + (Number(pin[0]) % 4)) : "") }}>
              <input inputMode="numeric" maxLength={6} placeholder="Enter pincode" value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setEta(null) }} aria-label="Pincode" />
              <button type="submit">Check</button>
            </form>
            {eta === null ? <p className="ks-muted">Please enter PIN code to check delivery time (demo, nothing ships).</p>
              : eta ? <p className="ks-ok" role="status"><Icon name="check" size={14} /> Get it by <b>{eta}</b> · free delivery</p>
              : <p className="ks-bad" role="alert">Please enter a valid 6-digit pincode.</p>}
            <ul className="ks-promises">
              <li>100% Original Products</li>
              <li>Pay with WondrPay: USDT on Whitechain</li>
              <li>Easy 14 days returns, refunded on-chain to the wallet that paid</li>
            </ul>
          </div>

          <div className="ks-details" id="details">
            <h2>PRODUCT DETAILS <Icon name="receipt" size={16} /></h2>
            <ul>{p.details.map((d) => <li key={d}>{d}</li>)}</ul>
            <dl>
              <div><dt>Category</dt><dd>{p.sub}</dd></div>
              <div><dt>Sizes</dt><dd>{p.sizes.join(", ")}</dd></div>
              <div><dt>Rating</dt><dd>{p.rating} / 5 from {p.reviews.toLocaleString()} ratings</dd></div>
              <div><dt>SKU</dt><dd><code>{p.sku}</code></dd></div>
            </dl>
          </div>
        </div>
      </div>

      {fromBrand.length > 0 && (
        <section className="ks-section" aria-labelledby="brand-title">
          <h2 id="brand-title" className="ks-h3">MORE BY {p.brand.toUpperCase()}</h2>
          <ul className="ks-row">{fromBrand.map((x) => <ProductCard key={x.sku} p={x} />)}</ul>
        </section>
      )}
      <section className="ks-section" aria-labelledby="similar-title">
        <h2 id="similar-title" className="ks-h3">SIMILAR PRODUCTS</h2>
        <ul className="ks-row">{similar.map((x) => <ProductCard key={x.sku} p={x} />)}</ul>
      </section>

      {zoom !== null && (
        <div className="ks-zoom" role="dialog" aria-modal="true" aria-label={`${p.name}, image ${zoom + 1}`} onClick={() => setZoom(null)} onKeyDown={(e) => e.key === "Escape" && setZoom(null)}>
          <button type="button" className="ks-zoom-close" autoFocus onClick={() => setZoom(null)} aria-label="Close image"><Icon name="close" size={22} /></button>
          <div className="ks-zoom-img" onClick={(e) => e.stopPropagation()}><Packshot p={p} variant={zoom} /></div>
          <div className="ks-zoom-thumbs" onClick={(e) => e.stopPropagation()}>
            {[0, 1, 2, 3].map((v) => <button key={v} type="button" aria-pressed={v === zoom} onClick={() => setZoom(v)} aria-label={`Image ${v + 1}`}><Packshot p={p} variant={v} /></button>)}
          </div>
        </div>
      )}
    </div>
  )
}
