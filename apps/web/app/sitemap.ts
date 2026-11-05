import type { MetadataRoute } from "next"
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://whitepay.vercel.app"
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: [string, number][] = [["/", 1], ["/business", .9], ["/developers", .9], ["/pricing", .8], ["/security", .7], ["/status", .5], ["/app", .6], ["/terms", .3], ["/privacy", .3]]
  return pages.map(([p, priority]) => ({ url: `${SITE}${p}`, lastModified: new Date("2026-11-06"), changeFrequency: p === "/status" ? "always" : "weekly", priority }))
}
