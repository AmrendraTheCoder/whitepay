import type { MetadataRoute } from "next"
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://whitepay.vercel.app"
export default function robots(): MetadataRoute.Robots {
  // payment, subscribe and wallet screens are per-user and short-lived: keep them out of search
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/pay", "/subscribe", "/send", "/scan", "/receive", "/money", "/you", "/merchant", "/autopay", "/transactions", "/add"] }], sitemap: `${SITE}/sitemap.xml` }
}
