// The catalog. Prices are read by the SERVER when signing an order; the browser only sends sku + qty.
// Every brand here is invented for the demo. Prices are test USDT on Whitechain Sepolia (kept small).

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
  { sku: "dew-facewash", brand: "Dewdrop", name: "Refreshing Facial Wash 150 ml", cat: "beauty", sub: "Face Wash and Cleanser", for: "unisex", price: "3.37", mrp: "4.50", rating: 4.6, reviews: 205900, sizes: ["100 ml", "150 ml"], art: { shape: "tube", bg: "#e6f4dc", fg: "#7cc35a", accent: "#ffffff", label: "Dewdrop", claim: "soap-free" }, badge: "Bestseller", ad: true, details: ["Soap-free gel with amino acids and vitamin E", "For all skin types, dermatologically tested", "No added perfume or colour"], seller: "Dewdrop Retail" },
  { sku: "mitti-lotion", brand: "Mitti", name: "Intensive Care Body Lotion", cat: "beauty", sub: "Body Cream and Lotion", for: "unisex", price: "3.82", mrp: "7.50", rating: 4.6, reviews: 99000, sizes: ["200 ml", "400 ml"], art: { shape: "pump", bg: "#fff2d6", fg: "#f3c04a", accent: "#2d3a8c", label: "Mitti", claim: "72h moisture" }, ad: true, details: ["Ceramides and hyaluronic acid for 72 hours of moisture", "Non-greasy, absorbs in seconds", "Made in India"], seller: "Mitti Naturals" },
  { sku: "neel-toner", brand: "Neel", name: "Niacinamide Toner 150 ml", cat: "beauty", sub: "Toner", for: "unisex", price: "3.74", mrp: "4.40", rating: 4.6, reviews: 181300, sizes: ["150 ml"], art: { shape: "bottle", bg: "#2a7fd4", fg: "#e9f3ff", accent: "#0f4d91", label: "neel", claim: "pore toner" }, badge: "Trending", details: ["5% niacinamide and rice water", "Tightens pores, evens tone", "Alcohol-free"], seller: "Neel Skin Co." },
  { sku: "saanjh-shower", brand: "Saanjh", name: "Orange Shower Gel 500 ml", cat: "beauty", sub: "Body Wash and Shower Gel", for: "unisex", price: "9.99", mrp: "9.99", rating: 4.8, reviews: 15, sizes: ["500 ml"], art: { shape: "pump", bg: "#ffe1d0", fg: "#f08a5d", accent: "#ffffff", label: "Saanjh", claim: "orange" }, badge: "New", details: ["Sweet orange and neroli", "Sulphate-free, gentle lather", "Recyclable bottle"], seller: "Saanjh Living" },
  { sku: "ketaki-moist", brand: "Ketaki", name: "Moisturising Lotion 88 ml", cat: "beauty", sub: "Body Cream and Lotion", for: "unisex", price: "4.92", mrp: "5.79", rating: 4.6, reviews: 3900, sizes: ["88 ml", "236 ml"], art: { shape: "pump", bg: "#eef4fb", fg: "#ffffff", accent: "#2a6fdb", label: "Ketaki", claim: "ceramides" }, ad: true, details: ["Three essential ceramides", "48-hour hydration for normal to dry skin", "Fragrance-free"], seller: "Ketaki Derma" },
  { sku: "dew-lipbalm", brand: "Dewdrop", name: "Lip Therapy Tin, Rosy Lips 17 g", cat: "beauty", sub: "Lip Balm", for: "women", price: "1.99", mrp: "2.50", rating: 4.7, reviews: 86600, sizes: ["17 g"], art: { shape: "tin", bg: "#fde7ec", fg: "#d6345a", accent: "#ffffff", label: "Dewdrop", claim: "rosy lips" }, details: ["Petroleum jelly with rose extract", "Soothes dry, chapped lips", "Pocket-size tin"], seller: "Dewdrop Retail" },
  { sku: "aaro-facials", brand: "Aaro", name: "Set of 5 Facial Kits", cat: "beauty", sub: "Facial Kit", for: "women", price: "5.49", mrp: "8.99", rating: 4.6, reviews: 9600, sizes: ["5 × 60 g"], art: { shape: "kit", bg: "#f4ecff", fg: "#7a4fd6", accent: "#f3c04a", label: "Aaro", claim: "5 kits" }, badge: "New", details: ["Gold, papaya, diamond, wine and pearl kits", "Five steps: cleanser, scrub, cream, gel, mask", "Salon glow at home"], seller: "Aaro Beauty" },
  { sku: "foxe-mask", brand: "Foxe", name: "De-Tan Skin Mask 75 g", cat: "beauty", sub: "Mask and Peel", for: "unisex", price: "2.95", mrp: "3.95", rating: 4.4, reviews: 53800, sizes: ["75 g"], art: { shape: "jar", bg: "#f1ecfb", fg: "#7d5bc4", accent: "#3b2a66", label: "foxe", claim: "10 mins" }, details: ["Brightens in 10 minutes", "Hydra-glow technology with liquorice", "Rinse-off cream mask"], seller: "Foxe Labs" },
  { sku: "brew-bodywash", brand: "Brew", name: "Guava De-Tan Body Wash 300 ml", cat: "beauty", sub: "Body Wash and Shower Gel", for: "unisex", price: "3.49", mrp: "4.99", rating: 4.6, reviews: 23400, sizes: ["300 ml"], art: { shape: "pump", bg: "#ffd9d4", fg: "#f6a196", accent: "#6b2b1f", label: "brew", claim: "guava" }, details: ["Coffee and pink guava", "Removes tan, smooths skin", "Paraben-free"], seller: "Brew Naturals" },
  { sku: "ketaki-spf", brand: "Ketaki", name: "Tinted Ceramide SPF 50 Lip Balm", cat: "beauty", sub: "Lip Balm", for: "women", price: "2.49", mrp: "2.99", rating: 4.6, reviews: 190800, sizes: ["4.5 g"], art: { shape: "lipstick", bg: "#fff0f3", fg: "#c8325b", accent: "#ffffff", label: "Ketaki", claim: "SPF 50" }, badge: "Bestseller", details: ["SPF 50 PA++++", "Ceramides, kojic acid and niacinamide", "Sheer rose tint"], seller: "Ketaki Derma" },
  { sku: "neel-serum", brand: "Neel", name: "Vitamin C Glow Serum 30 ml", cat: "beauty", sub: "Face Serum", for: "unisex", price: "4.49", mrp: "6.49", rating: 4.5, reviews: 41200, sizes: ["30 ml"], art: { shape: "dropper", bg: "#fff1c9", fg: "#f2a516", accent: "#7a4a00", label: "neel", claim: "vit C" }, details: ["10% vitamin C with ferulic acid", "Fades dark spots in 4 weeks", "Lightweight, fast absorbing"], seller: "Neel Skin Co." },
  // women
  { sku: "rangrez-kurta", brand: "Rangrez", name: "Block-Print Cotton Kurta", cat: "women", sub: "Kurtas", for: "women", price: "7.99", mrp: "15.99", rating: 4.5, reviews: 12800, sizes: ["XS", "S", "M", "L", "XL"], art: { shape: "kurta", bg: "#f7e6d8", fg: "#b8432f", accent: "#f3c04a", label: "Rangrez" }, badge: "Trending", ad: true, details: ["100% cotton, hand block-printed in Jaipur", "Straight fit, calf length", "Machine wash cold"], seller: "Rangrez Studio" },
  { sku: "sutra-dress", brand: "Sutra", name: "Tiered Maxi Dress", cat: "women", sub: "Dresses", for: "women", price: "9.49", mrp: "18.99", rating: 4.3, reviews: 5400, sizes: ["XS", "S", "M", "L"], art: { shape: "dress", bg: "#e3edf9", fg: "#3a62b8", accent: "#ffffff", label: "Sutra" }, details: ["Breathable viscose", "Tiered flare with tie-up back", "Fully lined"], seller: "Sutra Fashion" },
  { sku: "rangrez-anarkali", brand: "Rangrez", name: "Festive Anarkali Set", cat: "women", sub: "Kurta Sets", for: "women", price: "14.99", mrp: "39.99", rating: 4.6, reviews: 2100, sizes: ["S", "M", "L", "XL"], art: { shape: "dress", bg: "#fbe3ee", fg: "#a61d5c", accent: "#f3c04a", label: "Rangrez" }, badge: "New", details: ["Kurta, palazzo and dupatta", "Zari embroidery on yoke", "Dry clean only"], seller: "Rangrez Studio" },
  { sku: "sutra-tee", brand: "Sutra", name: "Relaxed Fit Graphic Tee", cat: "women", sub: "T-shirts", for: "women", price: "3.99", mrp: "7.99", rating: 4.2, reviews: 8900, sizes: ["XS", "S", "M", "L", "XL"], art: { shape: "tee", bg: "#f2f2f2", fg: "#e85a8a", accent: "#ffffff", label: "Sutra" }, details: ["Organic cotton jersey", "Drop shoulder, relaxed fit", "Screen-printed artwork"], seller: "Sutra Fashion" },
  // men
  { sku: "banyan-shirt", brand: "Banyan", name: "Slim Fit Linen Shirt", cat: "men", sub: "Shirts", for: "men", price: "8.49", mrp: "16.99", rating: 4.4, reviews: 18300, sizes: ["S", "M", "L", "XL", "XXL"], art: { shape: "shirt", bg: "#e8efe6", fg: "#5c8a63", accent: "#ffffff", label: "Banyan" }, badge: "Bestseller", ad: true, details: ["Linen-cotton blend", "Slim fit, spread collar", "Machine wash"], seller: "Banyan Menswear" },
  { sku: "tikka-kurta", brand: "Tikka", name: "Chikankari Kurta", cat: "men", sub: "Kurtas", for: "men", price: "11.99", mrp: "24.99", rating: 4.5, reviews: 4300, sizes: ["S", "M", "L", "XL"], art: { shape: "kurta", bg: "#f4efe2", fg: "#e9dfc4", accent: "#b39549", label: "Tikka" }, badge: "Trending", details: ["Hand chikankari on cotton", "Mandarin collar", "Pairs with churidar or jeans"], seller: "Tikka Ethnic" },
  { sku: "banyan-tee", brand: "Banyan", name: "Essential Crew Neck Tee", cat: "men", sub: "T-shirts", for: "men", price: "2.99", mrp: "5.99", rating: 4.3, reviews: 31000, sizes: ["S", "M", "L", "XL", "XXL"], art: { shape: "tee", bg: "#dde6f2", fg: "#1f3b66", accent: "#ffffff", label: "Banyan" }, details: ["180 GSM combed cotton", "Regular fit", "Pre-shrunk"], seller: "Banyan Menswear" },
  { sku: "stride-sneaker", brand: "Stride", name: "Court Low Sneakers", cat: "men", sub: "Sneakers", for: "unisex", price: "19.99", mrp: "34.99", rating: 4.5, reviews: 7600, sizes: ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10"], art: { shape: "sneaker", bg: "#eceff3", fg: "#ffffff", accent: "#e44b3c", label: "Stride" }, badge: "New", details: ["Vegan leather upper", "Cushioned EVA sole", "Wipe clean"], seller: "Stride Footwear" },
  // accessories
  { sku: "orbit-watch", brand: "Orbit", name: "Minimal Analog Watch", cat: "accessories", sub: "Watches", for: "unisex", price: "24.99", mrp: "49.99", rating: 4.6, reviews: 11200, sizes: ["One size"], art: { shape: "watch", bg: "#efe8de", fg: "#1c1c1c", accent: "#c9a66b", label: "Orbit" }, ad: true, details: ["Japanese quartz movement", "Stainless steel case, 40 mm", "Water resistant to 30 m"], seller: "Orbit Time" },
  { sku: "jhola-tote", brand: "Jhola", name: "Hand Block-Printed Tote", cat: "accessories", sub: "Bags", for: "women", price: "1.20", mrp: "2.40", rating: 4.7, reviews: 389, sizes: ["One size"], art: { shape: "tote", bg: "#f2e1d6", fg: "#c2562b", accent: "#f8efe6", label: "Jhola" }, details: ["Organic cotton canvas", "Hand block-printed in Jaipur", "Fits a 14\" laptop"], seller: "Jhola Craft" },
  { sku: "noon-shades", brand: "Noon", name: "Polarised Aviator Sunglasses", cat: "accessories", sub: "Sunglasses", for: "unisex", price: "6.99", mrp: "13.99", rating: 4.3, reviews: 6100, sizes: ["One size"], art: { shape: "shades", bg: "#fdf0d2", fg: "#1b1b1b", accent: "#c9a66b", label: "Noon" }, badge: "Trending", details: ["UV400 polarised lenses", "Metal frame, spring hinges", "Case included"], seller: "Noon Eyewear" },
  // home
  { sku: "diya-candle", brand: "Diya", name: "Sandalwood Soy Candle", cat: "home", sub: "Candles", for: "unisex", price: "2.99", mrp: "4.99", rating: 4.8, reviews: 2700, sizes: ["200 g"], art: { shape: "candle", bg: "#f6eadb", fg: "#e7c9a1", accent: "#7a4f2a", label: "Diya" }, badge: "Bestseller", details: ["Natural soy wax, cotton wick", "40-hour burn time", "Sandalwood and vetiver"], seller: "Diya Home" },
  { sku: "chai-kit", brand: "Chai & Co.", name: "Masala Chai Kit", cat: "home", sub: "Gourmet", for: "unisex", price: "2.50", mrp: "3.50", rating: 4.9, reviews: 812, sizes: ["20 cups"], art: { shape: "kit", bg: "#f4dfc2", fg: "#8a4b1f", accent: "#e9a23b", label: "Chai & Co.", claim: "20 cups" }, details: ["Assam CTC, green cardamom, ginger and clove", "Small batch from Mumbai", "Brews 20 cups"], seller: "Chai & Co." },
  { sku: "gift-box", brand: "Chai & Co.", name: "Cardamom Gift Box", cat: "home", sub: "Gifting", for: "unisex", price: "3.80", mrp: "5.00", rating: 4.8, reviews: 214, sizes: ["3 blends"], art: { shape: "gift", bg: "#dfe8d2", fg: "#4e7a3a", accent: "#e9a23b", label: "Chai & Co." }, badge: "New", details: ["Three blends and a brass strainer", "Gift-wrapped with a handwritten note", "Ships in 48 hours"], seller: "Chai & Co." },
  { sku: "kulhad-mug", brand: "Kulhad", name: "Terracotta Chai Mugs, Set of 4", cat: "home", sub: "Mugs", for: "unisex", price: "1.99", mrp: "3.49", rating: 4.5, reviews: 3300, sizes: ["Set of 4"], art: { shape: "mug", bg: "#f3e2d3", fg: "#b5643a", accent: "#7a3a1c", label: "Kulhad" }, details: ["Hand-thrown terracotta", "Glazed inside, food safe", "150 ml each"], seller: "Kulhad Clay" },
  { sku: "sticker-pack", brand: "Chai & Co.", name: "Cutting Chai Sticker Pack", cat: "accessories", sub: "Stationery", for: "unisex", price: "0.40", mrp: "0.80", rating: 4.9, reviews: 1204, sizes: ["6 designs"], art: { shape: "gift", bg: "#e2e2f2", fg: "#5b49d6", accent: "#f3c04a", label: "Stickers" }, details: ["Six waterproof vinyl stickers", "Matte finish", "For laptops and bottles"], seller: "Chai & Co." },
  { sku: "tote-bag", brand: "Chai & Co.", name: "Chai & Co. Cotton Tote", cat: "accessories", sub: "Bags", for: "unisex", price: "1.20", mrp: "2.00", rating: 4.7, reviews: 389, sizes: ["One size"], art: { shape: "tote", bg: "#f6e7d5", fg: "#8a4b1f", accent: "#f8efe6", label: "Chai & Co." }, details: ["Organic cotton", "Block-printed logo", "Long handles"], seller: "Chai & Co." },
]

export const BY_SKU: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.sku, p]))
export const PRICE: Record<string, string> = Object.fromEntries(PRODUCTS.map((p) => [p.sku, p.price]))
export const MAX_QTY = 10

export const off = (p: Product) => Math.round((1 - Number(p.price) / Number(p.mrp)) * 100)
export const BRANDS = [...new Set(PRODUCTS.map((p) => p.brand))].sort()
export const compactCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n))
