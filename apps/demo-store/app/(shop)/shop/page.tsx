import { Suspense } from "react"
import type { Metadata } from "next"
import { Listing } from "./listing"

export const metadata: Metadata = { title: "Shop · Amaron" }

export default function ShopPage() {
  return <Suspense fallback={<div className="ks-wrap ks-listing" aria-busy="true" />}><Listing /></Suspense>
}
