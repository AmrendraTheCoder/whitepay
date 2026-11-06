// Add extra relayer keys: allow-list them on the PaymentRouter (owner = DEPLOYER_PK) and fund each with WBT for gas.
// New keys are appended to RELAYER_PKS in .env; nothing secret is printed.
// Run: npx tsx --env-file=.env scripts/add-relayers.ts <count>
import { readFileSync, writeFileSync } from "node:fs"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { formatEther, parseAbi, parseEther, type Hex } from "viem"
import { config, wc } from "@whitepay/server"

const ABI = parseAbi(["function setRelayer(address relayer, bool allowed)", "function isRelayer(address) view returns (bool)", "function relayerGated() view returns (bool)", "function owner() view returns (address)"])
async function main() {
  const n = Number(process.argv[2] ?? 2)
  const admin = wc().admin()
  const owner = await wc().pub.readContract({ address: config.router, abi: ABI, functionName: "owner" })
  if (owner.toLowerCase() !== admin.account!.address.toLowerCase()) throw new Error("DEPLOYER_PK is not the router owner")
  const gated = await wc().pub.readContract({ address: config.router, abi: ABI, functionName: "relayerGated" })
  console.log("router relayerGated:", gated, "| admin WBT:", formatEther(await wc().pub.getBalance({ address: admin.account!.address })))
  const keys = (process.env.RELAYER_PKS ?? "").split(",").map((k) => k.trim()).filter(Boolean) as Hex[]
  const fresh: Hex[] = Array.from({ length: n }, () => generatePrivateKey())
  for (const k of fresh) {
    const a = privateKeyToAccount(k).address
    const h1 = await admin.writeContract({ address: config.router, abi: ABI, functionName: "setRelayer", args: [a, true] } as any)
    await wc().pub.waitForTransactionReceipt({ hash: h1 })
    const h2 = await admin.sendTransaction({ to: a, value: parseEther("0.3") } as any)
    await wc().pub.waitForTransactionReceipt({ hash: h2 })
    console.log("relayer", a, "allow-listed + funded 0.3 WBT")
  }
  const env = readFileSync(".env", "utf8")
  const all = [...keys, ...fresh].join(",")
  writeFileSync(".env", env.replace(/^RELAYER_PKS=.*$/m, `RELAYER_PKS=${all}`))
  console.log(`RELAYER_PKS now has ${keys.length + fresh.length} keys (in .env)`)
}
main().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1) })
