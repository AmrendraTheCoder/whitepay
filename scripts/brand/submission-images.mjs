// Renders the hackathon submission images: logo (512 + 1024 square) and cover (1280x720, 16:9).
// Run: node scripts/brand/submission-images.mjs   → docs/brand/wondrpay-logo-512.png, -1024.png, wondrpay-cover.png
import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
const require = createRequire(import.meta.url)
const sharp = require(require.resolve("sharp", { paths: ["apps/web"] }))

const OUT = "docs/brand"
mkdirSync(OUT, { recursive: true })
const BRAND = "#2448ff", LIME = "#ddf05a", BG = "#0b0d14", INK = "#eceef5", MUTED = "#9aa1b5"
const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif"

// ---------------------------------------------------------------- logo
// full-bleed square (platforms round the corners themselves), the app icon's W mark + lime dot
const logo = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 512 512">
  <defs><radialGradient id="g" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="#3d5bff"/><stop offset="1" stop-color="#1630c9"/></radialGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <path d="M110 178l50 176 56-128 40 92 40-92 56 128 50-176" fill="none" stroke="#fff" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="412" cy="112" r="36" fill="${LIME}"/>
</svg>`
for (const s of [512, 1024]) await sharp(Buffer.from(logo(s))).png().toFile(`${OUT}/wondrpay-logo-${s}.png`)

// ---------------------------------------------------------------- cover 1280x720
const W = 1280, H = 720
const phone = async (file, w, patch) => {
  const h = Math.round(w * 844 / 390)
  const src = patch ? await sharp(file).composite([{ input: Buffer.from(patch), left: 0, top: 0 }]).png().toBuffer() : file
  const img = await sharp(src).resize(w, h).png().toBuffer()
  const r = Math.round(w * 0.11)
  const mask = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`)
  const rounded = await sharp(img).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer()
  // device frame: a dark bezel around the screen
  const b = 10
  const frame = Buffer.from(`<svg width="${w + 2 * b}" height="${h + 2 * b}"><rect width="${w + 2 * b}" height="${h + 2 * b}" rx="${r + b}" fill="#1b2030" stroke="#2c3346" stroke-width="2"/></svg>`)
  return sharp(frame).composite([{ input: rounded, left: b, top: b }]).png().toBuffer()
}

const chip = (x, y, text, fill, color, w) =>
  `<rect x="${x}" y="${y}" width="${w}" height="40" rx="20" fill="${fill}"/><text x="${x + w / 2}" y="${y + 26}" text-anchor="middle" font-family="${FONT}" font-size="17" font-weight="700" fill="${color}">${text}</text>`

const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="78%" cy="30%" r="60%"><stop offset="0" stop-color="${BRAND}" stop-opacity=".55"/><stop offset="1" stop-color="${BRAND}" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow2" cx="10%" cy="100%" r="45%"><stop offset="0" stop-color="${LIME}" stop-opacity=".16"/><stop offset="1" stop-color="${LIME}" stop-opacity="0"/></radialGradient>
    <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill="#ffffff" fill-opacity=".05"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- brand -->
  <g transform="translate(72 74)">
    <rect width="64" height="64" rx="16" fill="${BRAND}"/>
    <path d="M14 22l6.3 22 7-16 5 11.5 5-11.5 7 16 6.3-22" transform="translate(0 0)" fill="none" stroke="#fff" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="52" cy="14" r="4.6" fill="${LIME}"/>
    <text x="84" y="45" font-family="${FONT}" font-size="34" font-weight="800" fill="${INK}" letter-spacing="-0.5">WondrPay</text>
  </g>

  <!-- headline -->
  <text x="72" y="248" font-family="${FONT}" font-size="76" font-weight="800" fill="${INK}" letter-spacing="-2.5">UPI for</text>
  <text x="72" y="334" font-family="${FONT}" font-size="76" font-weight="800" fill="${LIME}" letter-spacing="-2.5">digital dollars.</text>
  <text x="72" y="392" font-family="${FONT}" font-size="25" font-weight="500" fill="${MUTED}">Pay a name in USDT on Whitechain with your PIN.</text>
  <text x="72" y="426" font-family="${FONT}" font-size="25" font-weight="500" fill="${MUTED}">No gas, no seed phrase, settled in ~3 seconds.</text>

  <!-- proof points -->
  ${chip(72, 466, "0 gas", LIME, "#1b2108", 96)}
  ${chip(180, 466, "~3 s settle", "#1a1f2d", INK, 138)}
  ${chip(330, 466, "PIN / fingerprint", "#1a1f2d", INK, 188)}
  ${chip(530, 466, "chai-shop.wondrpay.eth", "#1a1f2d", INK, 252)}

  <!-- built on -->
  <text x="72" y="600" font-family="${FONT}" font-size="15" font-weight="800" fill="${MUTED}" letter-spacing="3">BUILT ON</text>
  <text x="72" y="638" font-family="${FONT}" font-size="26" font-weight="800" fill="${INK}">Whitechain <tspan fill="#4a5168">·</tspan> Arkiv <tspan fill="#4a5168">·</tspan> ENS v2 <tspan fill="#4a5168">·</tspan> World ID</text>
  <text x="72" y="676" font-family="${FONT}" font-size="15" font-weight="700" fill="#5d6479">ETHGlobal Mumbai 2026 · wondrpay-app.vercel.app</text>
</svg>`

const pw = 236
// the home screenshot predates the rename of "Pay again" to "Send money": patch that title to match the app today
const sendMoney = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844"><rect x="10" y="554" width="200" height="36" fill="#f4f6fd"/>
  <text x="16" y="582" font-family="${FONT}" font-size="21" font-weight="700" fill="#121521" letter-spacing="-0.3">Send money</text></svg>`
const [p1, p2] = await Promise.all([phone("docs/screens/wondrpay-1-home.png", pw, sendMoney), phone("docs/screens/wondrpay-2-money.png", pw)])
await sharp(Buffer.from(bg))
  .composite([
    { input: p2, left: 1004, top: 128 }, // back phone
    { input: p1, left: 812, top: 70 }, // front phone
  ])
  .png({ compressionLevel: 9 })
  .toFile(`${OUT}/wondrpay-cover.png`)
console.log("wrote", `${OUT}/wondrpay-logo-512.png`, `${OUT}/wondrpay-logo-1024.png`, `${OUT}/wondrpay-cover.png`)
