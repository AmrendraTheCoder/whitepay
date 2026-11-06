// The catalog. Prices are read by the SERVER when signing an order; the browser only sends sku + qty.
// Every brand here is invented for the demo; product photos are from Unsplash (free license).
// Prices are test USDT on Whitechain Sepolia, kept tiny so a demo wallet lasts.

export type Category = "beauty" | "women" | "men" | "home" | "accessories"
export type Shape =
  | "tube" | "pump" | "jar" | "dropper" | "tin" | "bottle" | "lipstick" | "mask"
  | "tee" | "kurta" | "dress" | "shirt" | "sneaker" | "watch" | "tote" | "shades" | "mug" | "candle" | "kit" | "gift"

export type Product = {
  sku: string
  brand: string
  name: string
  cat: Category
  sub: string
  for: "women" | "men" | "unisex"
  price: string
  mrp: string
  rating: number
  reviews: number
  sizes: string[]
  /** Unsplash photo id (images.unsplash.com/<id>); the drawn packshot is the fallback */
  photo?: string
  art: { shape: Shape; bg: string; fg: string; accent: string; label: string; claim?: string }
  badge?: "Bestseller" | "New" | "Trending"
  ad?: boolean
  details: string[]
  seller: string
}

export const CATEGORIES: { id: Category; label: string; blurb: string }[] = [
  { id: "women", label: "Women", blurb: "Kurtas, dresses and festive edits" },
  { id: "men", label: "Men", blurb: "Shirts, tees and sneakers" },
  { id: "beauty", label: "Beauty", blurb: "Skincare, bath and body" },
  { id: "home", label: "Home", blurb: "Candles, mugs and gifting" },
  { id: "accessories", label: "Accessories", blurb: "Watches, bags and shades" },
]

export const PRODUCTS: Product[] = [
  // beauty
  { sku: "dew-facewash", photo: "photo-1746227638992-50b1e1e0d96b", brand: "Dewdrop", name: "Refreshing Facial Wash 150 ml", cat: "beauty", sub: "Face Wash and Cleanser", for: "unisex", price: "0.34", mrp: "0.45", rating: 4.6, reviews: 205900, sizes: ["100 ml", "150 ml"], art: { shape: "tube", bg: "#e6f4dc", fg: "#7cc35a", accent: "#ffffff", label: "Dewdrop", claim: "soap-free" }, badge: "Bestseller", ad: true, details: ["Soap-free gel with amino acids and vitamin E", "For all skin types, dermatologically tested", "No added perfume or colour"], seller: "Dewdrop Retail" },
  { sku: "mitti-lotion", photo: "photo-1623143445418-40c192fa3d11", brand: "Mitti", name: "Intensive Care Body Lotion", cat: "beauty", sub: "Body Cream and Lotion", for: "unisex", price: "0.38", mrp: "0.75", rating: 4.6, reviews: 99000, sizes: ["200 ml", "400 ml"], art: { shape: "pump", bg: "#fff2d6", fg: "#f3c04a", accent: "#2d3a8c", label: "Mitti", claim: "72h moisture" }, ad: true, details: ["Ceramides and hyaluronic acid for 72 hours of moisture", "Non-greasy, absorbs in seconds", "Made in India"], seller: "Mitti Naturals" },
  { sku: "neel-toner", photo: "photo-1576426863848-c21f53c60b19", brand: "Neel", name: "Niacinamide Toner 150 ml", cat: "beauty", sub: "Toner", for: "unisex", price: "0.37", mrp: "0.44", rating: 4.6, reviews: 181300, sizes: ["150 ml"], art: { shape: "bottle", bg: "#2a7fd4", fg: "#e9f3ff", accent: "#0f4d91", label: "neel", claim: "pore toner" }, badge: "Trending", details: ["5% niacinamide and rice water", "Tightens pores, evens tone", "Alcohol-free"], seller: "Neel Skin Co." },
  { sku: "saanjh-shower", photo: "photo-1574670700790-fa314ab37787", brand: "Saanjh", name: "Orange Shower Gel 500 ml", cat: "beauty", sub: "Body Wash and Shower Gel", for: "unisex", price: "1.00", mrp: "1.00", rating: 4.8, reviews: 15, sizes: ["500 ml"], art: { shape: "pump", bg: "#ffe1d0", fg: "#f08a5d", accent: "#ffffff", label: "Saanjh", claim: "orange" }, badge: "New", details: ["Sweet orange and neroli", "Sulphate-free, gentle lather", "Recyclable bottle"], seller: "Saanjh Living" },
  { sku: "ketaki-moist", photo: "photo-1597931752949-98c74b5b159f", brand: "Ketaki", name: "Moisturising Lotion 88 ml", cat: "beauty", sub: "Body Cream and Lotion", for: "unisex", price: "0.49", mrp: "0.58", rating: 4.6, reviews: 3900, sizes: ["88 ml", "236 ml"], art: { shape: "pump", bg: "#eef4fb", fg: "#ffffff", accent: "#2a6fdb", label: "Ketaki", claim: "ceramides" }, ad: true, details: ["Three essential ceramides", "48-hour hydration for normal to dry skin", "Fragrance-free"], seller: "Ketaki Derma" },
  { sku: "dew-lipbalm", photo: "photo-1672883435480-81b9f385654e", brand: "Dewdrop", name: "Lip Therapy Tin, Rosy Lips 17 g", cat: "beauty", sub: "Lip Balm", for: "women", price: "0.20", mrp: "0.25", rating: 4.7, reviews: 86600, sizes: ["17 g"], art: { shape: "tin", bg: "#fde7ec", fg: "#d6345a", accent: "#ffffff", label: "Dewdrop", claim: "rosy lips" }, details: ["Petroleum jelly with rose extract", "Soothes dry, chapped lips", "Pocket-size tin"], seller: "Dewdrop Retail" },
  { sku: "aaro-facials", photo: "photo-1670201203150-bf8771401590", brand: "Aaro", name: "Set of 5 Facial Kits", cat: "beauty", sub: "Facial Kit", for: "women", price: "0.55", mrp: "0.90", rating: 4.6, reviews: 9600, sizes: ["5 × 60 g"], art: { shape: "kit", bg: "#f4ecff", fg: "#7a4fd6", accent: "#f3c04a", label: "Aaro", claim: "5 kits" }, badge: "New", details: ["Gold, papaya, diamond, wine and pearl kits", "Five steps: cleanser, scrub, cream, gel, mask", "Salon glow at home"], seller: "Aaro Beauty" },
  { sku: "foxe-mask", photo: "photo-1768235146447-26b1549f845a", brand: "Foxe", name: "De-Tan Skin Mask 75 g", cat: "beauty", sub: "Mask and Peel", for: "unisex", price: "0.30", mrp: "0.40", rating: 4.4, reviews: 53800, sizes: ["75 g"], art: { shape: "jar", bg: "#f1ecfb", fg: "#7d5bc4", accent: "#3b2a66", label: "foxe", claim: "10 mins" }, details: ["Brightens in 10 minutes", "Hydra-glow technology with liquorice", "Rinse-off cream mask"], seller: "Foxe Labs" },
  { sku: "brew-bodywash", photo: "photo-1642505172841-d25d158baf9c", brand: "Brew", name: "Guava De-Tan Body Wash 300 ml", cat: "beauty", sub: "Body Wash and Shower Gel", for: "unisex", price: "0.35", mrp: "0.50", rating: 4.6, reviews: 23400, sizes: ["300 ml"], art: { shape: "pump", bg: "#ffd9d4", fg: "#f6a196", accent: "#6b2b1f", label: "brew", claim: "guava" }, details: ["Coffee and pink guava", "Removes tan, smooths skin", "Paraben-free"], seller: "Brew Naturals" },
  { sku: "ketaki-spf", photo: "photo-1617992477191-bb534afd4921", brand: "Ketaki", name: "Tinted Ceramide SPF 50 Lip Balm", cat: "beauty", sub: "Lip Balm", for: "women", price: "0.25", mrp: "0.30", rating: 4.6, reviews: 190800, sizes: ["4.5 g"], art: { shape: "lipstick", bg: "#fff0f3", fg: "#c8325b", accent: "#ffffff", label: "Ketaki", claim: "SPF 50" }, badge: "Bestseller", details: ["SPF 50 PA++++", "Ceramides, kojic acid and niacinamide", "Sheer rose tint"], seller: "Ketaki Derma" },
  { sku: "neel-serum", photo: "photo-1713768704571-6aeb0d0e5105", brand: "Neel", name: "Vitamin C Glow Serum 30 ml", cat: "beauty", sub: "Face Serum", for: "unisex", price: "0.45", mrp: "0.65", rating: 4.5, reviews: 41200, sizes: ["30 ml"], art: { shape: "dropper", bg: "#fff1c9", fg: "#f2a516", accent: "#7a4a00", label: "neel", claim: "vit C" }, details: ["10% vitamin C with ferulic acid", "Fades dark spots in 4 weeks", "Lightweight, fast absorbing"], seller: "Neel Skin Co." },
  // women
  { sku: "rangrez-kurta", photo: "photo-1766994063823-ed214f883548", brand: "Rangrez", name: "Block-Print Cotton Kurta", cat: "women", sub: "Kurtas", for: "women", price: "0.80", mrp: "1.60", rating: 4.5, reviews: 12800, sizes: ["XS", "S", "M", "L", "XL"], art: { shape: "kurta", bg: "#f7e6d8", fg: "#b8432f", accent: "#f3c04a", label: "Rangrez" }, badge: "Trending", ad: true, details: ["100% cotton, hand block-printed in Jaipur", "Straight fit, calf length", "Machine wash cold"], seller: "Rangrez Studio" },
  { sku: "sutra-dress", photo: "photo-1685703203919-0c2cfc893c60", brand: "Sutra", name: "Tiered Maxi Dress", cat: "women", sub: "Dresses", for: "women", price: "0.95", mrp: "1.90", rating: 4.3, reviews: 5400, sizes: ["XS", "S", "M", "L"], art: { shape: "dress", bg: "#e3edf9", fg: "#3a62b8", accent: "#ffffff", label: "Sutra" }, details: ["Breathable viscose", "Tiered flare with tie-up back", "Fully lined"], seller: "Sutra Fashion" },
  { sku: "rangrez-anarkali", photo: "photo-1756483509254-3cc48a5a15b2", brand: "Rangrez", name: "Festive Anarkali Set", cat: "women", sub: "Kurta Sets", for: "women", price: "1.50", mrp: "4.00", rating: 4.6, reviews: 2100, sizes: ["S", "M", "L", "XL"], art: { shape: "dress", bg: "#fbe3ee", fg: "#a61d5c", accent: "#f3c04a", label: "Rangrez" }, badge: "New", details: ["Kurta, palazzo and dupatta", "Zari embroidery on yoke", "Dry clean only"], seller: "Rangrez Studio" },
  { sku: "sutra-tee", photo: "photo-1554568218-0f1715e72254", brand: "Sutra", name: "Relaxed Fit Graphic Tee", cat: "women", sub: "T-shirts", for: "women", price: "0.40", mrp: "0.80", rating: 4.2, reviews: 8900, sizes: ["XS", "S", "M", "L", "XL"], art: { shape: "tee", bg: "#f2f2f2", fg: "#e85a8a", accent: "#ffffff", label: "Sutra" }, details: ["Organic cotton jersey", "Drop shoulder, relaxed fit", "Screen-printed artwork"], seller: "Sutra Fashion" },
  // men
  { sku: "banyan-shirt", photo: "photo-1740711152088-88a009e877bb", brand: "Banyan", name: "Slim Fit Linen Shirt", cat: "men", sub: "Shirts", for: "men", price: "0.85", mrp: "1.70", rating: 4.4, reviews: 18300, sizes: ["S", "M", "L", "XL", "XXL"], art: { shape: "shirt", bg: "#e8efe6", fg: "#5c8a63", accent: "#ffffff", label: "Banyan" }, badge: "Bestseller", ad: true, details: ["Linen-cotton blend", "Slim fit, spread collar", "Machine wash"], seller: "Banyan Menswear" },
  { sku: "tikka-kurta", photo: "photo-1734418040900-e964f84e8abb", brand: "Tikka", name: "Chikankari Kurta", cat: "men", sub: "Kurtas", for: "men", price: "1.20", mrp: "2.50", rating: 4.5, reviews: 4300, sizes: ["S", "M", "L", "XL"], art: { shape: "kurta", bg: "#f4efe2", fg: "#e9dfc4", accent: "#b39549", label: "Tikka" }, badge: "Trending", details: ["Hand chikankari on cotton", "Mandarin collar", "Pairs with churidar or jeans"], seller: "Tikka Ethnic" },
  { sku: "banyan-tee", photo: "photo-1621951753163-ee63e7fc147e", brand: "Banyan", name: "Essential Crew Neck Tee", cat: "men", sub: "T-shirts", for: "men", price: "0.30", mrp: "0.60", rating: 4.3, reviews: 31000, sizes: ["S", "M", "L", "XL", "XXL"], art: { shape: "tee", bg: "#dde6f2", fg: "#1f3b66", accent: "#ffffff", label: "Banyan" }, details: ["180 GSM combed cotton", "Regular fit", "Pre-shrunk"], seller: "Banyan Menswear" },
  { sku: "stride-sneaker", photo: "photo-1787691220334-cda7d4f90c31", brand: "Stride", name: "Court Low Sneakers", cat: "men", sub: "Sneakers", for: "unisex", price: "2.00", mrp: "3.50", rating: 4.5, reviews: 7600, sizes: ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10"], art: { shape: "sneaker", bg: "#eceff3", fg: "#ffffff", accent: "#e44b3c", label: "Stride" }, badge: "New", details: ["Vegan leather upper", "Cushioned EVA sole", "Wipe clean"], seller: "Stride Footwear" },
  // accessories
  { sku: "orbit-watch", photo: "photo-1607298786129-cea6ce0d5788", brand: "Orbit", name: "Minimal Analog Watch", cat: "accessories", sub: "Watches", for: "unisex", price: "2.50", mrp: "5.00", rating: 4.6, reviews: 11200, sizes: ["One size"], art: { shape: "watch", bg: "#efe8de", fg: "#1c1c1c", accent: "#c9a66b", label: "Orbit" }, ad: true, details: ["Japanese quartz movement", "Stainless steel case, 40 mm", "Water resistant to 30 m"], seller: "Orbit Time" },
  { sku: "jhola-tote", photo: "photo-1544816155-12df9643f363", brand: "Jhola", name: "Hand Block-Printed Tote", cat: "accessories", sub: "Bags", for: "women", price: "0.12", mrp: "0.24", rating: 4.7, reviews: 389, sizes: ["One size"], art: { shape: "tote", bg: "#f2e1d6", fg: "#c2562b", accent: "#f8efe6", label: "Jhola" }, details: ["Organic cotton canvas", "Hand block-printed in Jaipur", "Fits a 14\" laptop"], seller: "Jhola Craft" },
  { sku: "noon-shades", photo: "photo-1567473810954-507d59716c25", brand: "Noon", name: "Polarised Aviator Sunglasses", cat: "accessories", sub: "Sunglasses", for: "unisex", price: "0.70", mrp: "1.40", rating: 4.3, reviews: 6100, sizes: ["One size"], art: { shape: "shades", bg: "#fdf0d2", fg: "#1b1b1b", accent: "#c9a66b", label: "Noon" }, badge: "Trending", details: ["UV400 polarised lenses", "Metal frame, spring hinges", "Case included"], seller: "Noon Eyewear" },
  // home
  { sku: "diya-candle", photo: "photo-1603905179139-db12ab535ca9", brand: "Diya", name: "Sandalwood Soy Candle", cat: "home", sub: "Candles", for: "unisex", price: "0.30", mrp: "0.50", rating: 4.8, reviews: 2700, sizes: ["200 g"], art: { shape: "candle", bg: "#f6eadb", fg: "#e7c9a1", accent: "#7a4f2a", label: "Diya" }, badge: "Bestseller", details: ["Natural soy wax, cotton wick", "40-hour burn time", "Sandalwood and vetiver"], seller: "Diya Home" },
  { sku: "chai-kit", photo: "photo-1761483281417-778013dc0177", brand: "Chai & Co.", name: "Masala Chai Kit", cat: "home", sub: "Gourmet", for: "unisex", price: "0.25", mrp: "0.35", rating: 4.9, reviews: 812, sizes: ["20 cups"], art: { shape: "kit", bg: "#f4dfc2", fg: "#8a4b1f", accent: "#e9a23b", label: "Chai & Co.", claim: "20 cups" }, details: ["Assam CTC, green cardamom, ginger and clove", "Small batch from Mumbai", "Brews 20 cups"], seller: "Chai & Co." },
  { sku: "gift-box", photo: "photo-1593522427820-c35045888f11", brand: "Chai & Co.", name: "Cardamom Gift Box", cat: "home", sub: "Gifting", for: "unisex", price: "0.38", mrp: "0.50", rating: 4.8, reviews: 214, sizes: ["3 blends"], art: { shape: "gift", bg: "#dfe8d2", fg: "#4e7a3a", accent: "#e9a23b", label: "Chai & Co." }, badge: "New", details: ["Three blends and a brass strainer", "Gift-wrapped with a handwritten note", "Ships in 48 hours"], seller: "Chai & Co." },
  { sku: "kulhad-mug", photo: "photo-1619581073186-5b4ae1b0caad", brand: "Kulhad", name: "Terracotta Chai Mugs, Set of 4", cat: "home", sub: "Mugs", for: "unisex", price: "0.20", mrp: "0.35", rating: 4.5, reviews: 3300, sizes: ["Set of 4"], art: { shape: "mug", bg: "#f3e2d3", fg: "#b5643a", accent: "#7a3a1c", label: "Kulhad" }, details: ["Hand-thrown terracotta", "Glazed inside, food safe", "150 ml each"], seller: "Kulhad Clay" },
  { sku: "sticker-pack", photo: "photo-1625768376503-68d2495d78c5", brand: "Chai & Co.", name: "Cutting Chai Sticker Pack", cat: "accessories", sub: "Stationery", for: "unisex", price: "0.04", mrp: "0.08", rating: 4.9, reviews: 1204, sizes: ["6 designs"], art: { shape: "gift", bg: "#e2e2f2", fg: "#5b49d6", accent: "#f3c04a", label: "Stickers" }, details: ["Six waterproof vinyl stickers", "Matte finish", "For laptops and bottles"], seller: "Chai & Co." },
  { sku: "tote-bag", photo: "photo-1630381260512-e3fe55c11973", brand: "Chai & Co.", name: "Chai & Co. Cotton Tote", cat: "accessories", sub: "Bags", for: "unisex", price: "0.12", mrp: "0.20", rating: 4.7, reviews: 389, sizes: ["One size"], art: { shape: "tote", bg: "#f6e7d5", fg: "#8a4b1f", accent: "#f8efe6", label: "Chai & Co." }, details: ["Organic cotton", "Block-printed logo", "Long handles"], seller: "Chai & Co." },
]

export const BY_SKU: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.sku, p]))
export const PRICE: Record<string, string> = Object.fromEntries(PRODUCTS.map((p) => [p.sku, p.price]))
export const MAX_QTY = 10

export const off = (p: Product) => Math.round((1 - Number(p.price) / Number(p.mrp)) * 100)
export const BRANDS = [...new Set(PRODUCTS.map((p) => p.brand))].sort()
export const compactCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n))
