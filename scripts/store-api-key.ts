// One-time: give the demo store (Kesar) a WondrPay for Business website + API key, approved by the store wallet.
// The secret key is written to the file named in argv[2] (mode 600) and NEVER printed.
// Run: npx tsx --env-file=.env scripts/store-api-key.ts <out-file>
import { writeFileSync } from "node:fs"
import { privateKeyToAccount } from "viem/accounts"
import type { Hex } from "viem"
import { siteApprovalMessage } from "@whitepay/shared"
import { createSite, listSites, orderSignerAddress } from "@whitepay/server"

const out = process.argv[2]
if (!out) throw new Error("pass an output file for the secret key")
const shop = privateKeyToAccount(process.env.STORE_MERCHANT_PK as Hex)

async function main() {
  const existing = (await listSites(shop.address)).filter((s) => s.status === "active")
  if (existing.length) console.log(`note: store already has ${existing.length} active website(s): ${existing.map((s) => s.name).join(", ")}`)
  const site = {
    siteId: [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join(""),
    name: "Kesar demo store",
    domains: ["wondrpay-demo-store.vercel.app", "localhost"],
    webhook: "https://wondrpay-demo-store.vercel.app/api/webhook",
  }
  const issuedAt = Math.floor(Date.now() / 1000)
  const signature = await shop.signMessage({ message: siteApprovalMessage({ action: "create", merchant: shop.address, ...site, orderSigner: orderSignerAddress(), issuedAt }) })
  const r = await createSite({ merchant: shop.address, ...site, issuedAt, signature })
  writeFileSync(out, r.secretKey, { mode: 0o600 })
  console.log(`website ${r.site.siteId} created for ${shop.address}; publishable ${r.site.publishableKey}; secret …${r.site.secretHint} saved to the file; signer tx ${r.signerTx ?? "(already set)"}`)
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
