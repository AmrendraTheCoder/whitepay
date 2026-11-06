"use client"
import { useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { CATEGORIES, PRODUCTS, off, type Product } from "@/lib/catalog"
import { ProductCard } from "../shell"

const SORTS = [
  { id: "recommended", label: "Recommended" },
  { id: "new", label: "What's New" },
  { id: "popularity", label: "Popularity" },
  { id: "discount", label: "Better Discount" },
  { id: "price_asc", label: "Price: Low to High" },
  { id: "price_desc", label: "Price: High to Low" },
  { id: "rating", label: "Customer Rating" },
] as const
const PRICE_BANDS = [{ id: "0-2", label: "Under 2 USDT", min: 0, max: 2 }, { id: "2-5", label: "2 to 5 USDT", min: 2, max: 5 }, { id: "5-10", label: "5 to 10 USDT", min: 5, max: 10 }, { id: "10-999", label: "10 USDT and above", min: 10, max: 999 }]
const DISCOUNTS = [10, 20, 30, 40, 50]
const GENDERS = [{ id: "men", label: "Men" }, { id: "women", label: "Women" }, { id: "unisex", label: "Unisex" }]

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : [])

function sortBy(items: Product[], s: string) {
  const a = [...items]
  const score = (p: Product) => (p.ad ? 2 : 0) + (p.badge ? 1 : 0) + Math.log10(p.reviews + 1) * p.rating
  switch (s) {
    case "new": return a.sort((x, y) => Number(y.badge === "New") - Number(x.badge === "New") || score(y) - score(x))
    case "popularity": return a.sort((x, y) => y.reviews - x.reviews)
    case "discount": return a.sort((x, y) => off(y) - off(x))
    case "price_asc": return a.sort((x, y) => Number(x.price) - Number(y.price))
    case "price_desc": return a.sort((x, y) => Number(y.price) - Number(x.price))
    case "rating": return a.sort((x, y) => y.rating - x.rating || y.reviews - x.reviews)
    default: return a.sort((x, y) => score(y) - score(x))
  }
}

function FilterGroup({ title, children, search, onSearch }: { title: string; children: React.ReactNode; search?: string; onSearch?: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <fieldset className="ks-fgroup">
      <legend>
        <span>{title}</span>
        {onSearch && (open
          ? <input autoFocus className="ks-fsearch" placeholder={`Search for ${title.toLowerCase()}`} value={search} onChange={(e) => onSearch(e.target.value)} onBlur={() => !search && setOpen(false)} aria-label={`Search ${title}`} />
          : <button type="button" className="ks-fsearch-btn" onClick={() => setOpen(true)} aria-label={`Search ${title}`}><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>)}
      </legend>
      {children}
    </fieldset>
  )
}

export function Listing() {
  const params = useSearchParams()
  const path = usePathname()
  const [brandQ, setBrandQ] = useState("")
  const [subQ, setSubQ] = useState("")
  const [showAll, setShowAll] = useState<{ sub?: boolean; brand?: boolean }>({})
  const [filtersOpen, setFiltersOpen] = useState(false)

  const cat = params.get("cat")
  const q = (params.get("q") ?? "").trim().toLowerCase()
  const sort = params.get("sort") ?? "recommended"
  const gender = params.get("for")
  const subs = list(params.get("sub"))
  const brands = list(params.get("brand"))
  const prices = list(params.get("price"))
  const disc = Number(params.get("off") ?? 0)

  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(params.toString())
    if (v) n.set(k, v); else n.delete(k)
    // shallow URL update: Next syncs useSearchParams with history, no server round trip
    window.history.replaceState(null, "", n.size ? `${path}?${n.toString()}` : path)
  }
  const toggle = (k: string, cur: string[], v: string) => set(k, (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(","))

  // scope = category + search; facets count within the scope so numbers match what a click would show
  const scope = useMemo(() => PRODUCTS.filter((p) => (!cat || p.cat === cat) && (!q || `${p.brand} ${p.name} ${p.sub} ${p.cat}`.toLowerCase().includes(q))), [cat, q])
  const pass = (p: Product, skip?: string) =>
    (skip === "for" || !gender || p.for === gender || p.for === "unisex") &&
    (skip === "sub" || !subs.length || subs.includes(p.sub)) &&
    (skip === "brand" || !brands.length || brands.includes(p.brand)) &&
    (skip === "price" || !prices.length || prices.some((id) => { const b = PRICE_BANDS.find((x) => x.id === id); return b && Number(p.price) >= b.min && Number(p.price) < b.max })) &&
    (skip === "off" || off(p) >= disc)
  const shown = useMemo(() => sortBy(scope.filter((p) => pass(p)), sort), [scope, params]) // eslint-disable-line react-hooks/exhaustive-deps
  const facet = (skip: string, key: (p: Product) => string) => {
    const m = new Map<string, number>()
    for (const p of scope) if (pass(p, skip)) m.set(key(p), (m.get(key(p)) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }
  const subFacet = facet("sub", (p) => p.sub).filter(([s]) => s.toLowerCase().includes(subQ.toLowerCase()))
  const brandFacet = facet("brand", (p) => p.brand).filter(([b]) => b.toLowerCase().includes(brandQ.toLowerCase()))
  const catLabel = CATEGORIES.find((c) => c.id === cat)?.label
  const title = q ? `Results for “${params.get("q")}”` : catLabel ? `${catLabel} Collection` : "All Products"
  const active = [gender, ...subs, ...brands, ...prices, disc ? `${disc}%` : ""].filter(Boolean).length

  return (
    <div className="ks-wrap ks-listing">
      <nav aria-label="Breadcrumb" className="ks-crumbs">
        <Link href="/">Home</Link><span>/</span>
        {catLabel ? <><Link href="/shop">Shop</Link><span>/</span><b aria-current="page">{catLabel}</b></> : <b aria-current="page">Shop</b>}
      </nav>
      <h1 className="ks-list-title">{title} <span>- {shown.length} {shown.length === 1 ? "item" : "items"}</span></h1>

      <div className="ks-list-bar">
        <div className="ks-list-bar-left">
          <b className="ks-filters-label">FILTERS</b>
          {active > 0 && <button type="button" className="ks-clear" onClick={() => window.history.replaceState(null, "", `${path}${cat ? `?cat=${cat}` : q ? `?q=${encodeURIComponent(params.get("q")!)}` : ""}`)}>CLEAR ALL</button>}
          <button type="button" className="ks-filters-toggle" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>Filters{active ? ` (${active})` : ""}</button>
        </div>
        <div className="ks-chips" role="group" aria-label="Quick filters">
          {CATEGORIES.map((c) => <Link key={c.id} href={`/shop?cat=${c.id}`} className="ks-chip" aria-current={cat === c.id ? "true" : undefined}>{c.label}</Link>)}
        </div>
        <label className="ks-sort">
          <span>Sort by :</span>
          <select value={sort} onChange={(e) => set("sort", e.target.value === "recommended" ? null : e.target.value)}>
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <div className="ks-list-body">
        <aside className="ks-filters" data-open={filtersOpen || undefined} aria-label="Filters">
          <FilterGroup title="Gender">
            {GENDERS.map((g) => (
              <label key={g.id} className="ks-radio"><input type="radio" name="for" checked={gender === g.id} onChange={() => set("for", g.id)} onClick={() => gender === g.id && set("for", null)} />{g.label}</label>
            ))}
          </FilterGroup>
          <FilterGroup title="Categories" search={subQ} onSearch={setSubQ}>
            {(showAll.sub ? subFacet : subFacet.slice(0, 8)).map(([s, n]) => (
              <label key={s} className="ks-check"><input type="checkbox" checked={subs.includes(s)} onChange={() => toggle("sub", subs, s)} /><span>{s}</span><small>({n})</small></label>
            ))}
            {subFacet.length > 8 && <button type="button" className="ks-more" onClick={() => setShowAll((x) => ({ ...x, sub: !x.sub }))}>{showAll.sub ? "Show less" : `+ ${subFacet.length - 8} more`}</button>}
          </FilterGroup>
          <FilterGroup title="Brand" search={brandQ} onSearch={setBrandQ}>
            {(showAll.brand ? brandFacet : brandFacet.slice(0, 8)).map(([b, n]) => (
              <label key={b} className="ks-check"><input type="checkbox" checked={brands.includes(b)} onChange={() => toggle("brand", brands, b)} /><span>{b}</span><small>({n})</small></label>
            ))}
            {brandFacet.length > 8 && <button type="button" className="ks-more" onClick={() => setShowAll((x) => ({ ...x, brand: !x.brand }))}>{showAll.brand ? "Show less" : `+ ${brandFacet.length - 8} more`}</button>}
          </FilterGroup>
          <FilterGroup title="Price">
            {PRICE_BANDS.map((b) => {
              const n = scope.filter((p) => pass(p, "price") && Number(p.price) >= b.min && Number(p.price) < b.max).length
              return <label key={b.id} className="ks-check"><input type="checkbox" checked={prices.includes(b.id)} onChange={() => toggle("price", prices, b.id)} /><span>{b.label}</span><small>({n})</small></label>
            })}
          </FilterGroup>
          <FilterGroup title="Discount range">
            {DISCOUNTS.map((d) => (
              <label key={d} className="ks-radio"><input type="radio" name="off" checked={disc === d} onChange={() => set("off", String(d))} onClick={() => disc === d && set("off", null)} />{d}% and above</label>
            ))}
          </FilterGroup>
        </aside>

        <section aria-label="Products" className="ks-results">
          {shown.length === 0 ? (
            <div className="ks-empty">
              <h2>We couldn&apos;t find any matches!</h2>
              <p>Check the spelling, or try fewer filters.</p>
              <Link href="/shop" className="ks-btn">Browse all products</Link>
            </div>
          ) : <ul className="ks-grid">{shown.map((p) => <ProductCard key={p.sku} p={p} />)}</ul>}
        </section>
      </div>
    </div>
  )
}
