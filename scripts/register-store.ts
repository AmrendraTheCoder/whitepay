// Register the demo store's shop (the separate app that integrates the WondrPay checkout SDK).
// Run: npx tsx --env-file=.env scripts/register-store.ts [label] [displayName]
import { type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { merchantSignupMessage } from "@whitepay/shared"
import { registerMerchant, getMerchantByAddress } from "@whitepay/server"

async function main() {
  const [label = "demo-store", displayName = "WondrPay Demo Store"] = process.argv.slice(2)
  const shop = privateKeyToAccount(process.env.STORE_MERCHANT_PK as Hex)
  const existing = await getMerchantByAddress(shop.address)
  if (existing) return console.log("already registered:", existing.ensName, shop.address)
  const issuedAt = Math.floor(Date.now() / 1000)
  const signature = await shop.signMessage({ message: merchantSignupMessage({ label, displayName, address: shop.address, issuedAt }) })
  const m = await registerMerchant({ label, displayName, category: "Online store", address: shop.address, issuedAt, signature })
  console.log("registered", m.ensName, shop.address, "registry tx", m.registryTx, "ens txs", m.ensTx)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
