// The catalog. Prices are read by the SERVER when signing an order; the browser only sends sku + qty.
export type Product = { sku: string; name: string; price: string; tagline: string; notes: string[]; badge?: string; rating: number; reviews: number; art: "kit" | "tote" | "stickers" | "gift" }

export const PRODUCTS: Product[] = [
  { sku: "chai-kit", name: "Masala Chai Kit", price: "2.50", tagline: "Assam CTC, green cardamom, ginger and clove. Brews 20 cups.", notes: ["Small batch", "Brews 20 cups"], badge: "Bestseller", rating: 4.9, reviews: 812, art: "kit" },
  { sku: "gift-box", name: "Cardamom Gift Box", price: "3.80", tagline: "Three blends, a brass strainer and a handwritten note.", notes: ["Gift-wrapped", "3 blends"], badge: "New", rating: 4.8, reviews: 214, art: "gift" },
  { sku: "tote-bag", name: "Chai & Co. Tote", price: "1.20", tagline: "Organic cotton, hand block-printed in Jaipur.", notes: ["Organic cotton", "Block-printed"], rating: 4.7, reviews: 389, art: "tote" },
  { sku: "sticker-pack", name: "Cutting Chai Stickers", price: "0.40", tagline: "Six waterproof vinyl stickers for your laptop.", notes: ["Waterproof", "6 designs"], rating: 4.9, reviews: 1204, art: "stickers" },
]

export const PRICE: Record<string, string> = Object.fromEntries(PRODUCTS.map((p) => [p.sku, p.price]))
export const MAX_QTY = 10
