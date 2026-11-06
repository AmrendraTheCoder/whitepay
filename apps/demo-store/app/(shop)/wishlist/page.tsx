"use client"
import Link from "next/link"
import { BY_SKU } from "@/lib/catalog"
import { useStore } from "../../store-context"
import { ProductCard } from "../shell"

export default function Wishlist() {
  const { wish } = useStore()
  return (
    <div className="ks-wrap ks-listing">
      <h1 className="ks-list-title">My Wishlist <span>- {wish.length} {wish.length === 1 ? "item" : "items"}</span></h1>
      {wish.length === 0 ? (
        <div className="ks-empty">
          <h2>Your wishlist is empty</h2>
          <p>Tap the heart on any product to save it here for later.</p>
          <Link href="/shop" className="ks-btn">Continue shopping</Link>
        </div>
      ) : <ul className="ks-grid">{wish.map((s) => BY_SKU[s] && <ProductCard key={s} p={BY_SKU[s]} />)}</ul>}
    </div>
  )
}
