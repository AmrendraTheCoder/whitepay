import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { BY_SKU, PRODUCTS } from "@/lib/catalog"
import { ProductView } from "./product"

export const generateStaticParams = () => PRODUCTS.map((p) => ({ sku: p.sku }))

export async function generateMetadata({ params }: { params: Promise<{ sku: string }> }): Promise<Metadata> {
  const p = BY_SKU[(await params).sku]
  return p ? { title: `${p.brand} ${p.name} · Amaron`, description: `${p.brand} ${p.name} for ${p.price} USDT. Pay with WondrPay, zero gas.` } : {}
}

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params
  if (!Object.hasOwn(BY_SKU, sku)) notFound()
  return <ProductView sku={sku} />
}
