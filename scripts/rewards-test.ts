// Scratch-card rewards, end to end on Whitechain Sepolia + Arkiv.
//   npx tsx --env-file=.env scripts/rewards-test.ts            -> pay a listed shop, earn a card, scratch it, check payout
//   npx tsx --env-file=.env scripts/rewards-test.ts fund 2      -> move 2 test USDT from the demo customer into the rewards pool
//   npx tsx --env-file=.env scripts/rewards-test.ts scratch <cardKey>
//   npx tsx --env-file=.env scripts/rewards-test.ts earn            -> pay a shop 0.10 and earn one unscratched card (UI testing)
//   npx tsx --env-file=.env scripts/rewards-test.ts offer [text] [CODE] -> publish an offer for each listed shop key in .env
// Never prints keys.
import { erc20Abi, keccak256, parseUnits, toHex, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { receiveAuthTypedData, ROUTER_ABI, USDT_ADDRESS } from "@whitepay/shared"
import { offerMessage } from "@whitepay/shared/rewards"
import { MerchantProfile } from "@whitepay/shared/arkiv"
import { arkiv, config, wc, relayDirectPayment, awardScratchCard, setOffer, listRewards, scratchCard, rewardsPool, rewardsPoolBalance, getMerchantByAddress } from "@whitepay/server"

const customer = privateKeyToAccount(process.env.CUSTOMER_PK!.split(",")[0].trim() as Hex)
const bal = (a: Address) => wc().pub.readContract({ address: USDT_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [a] })
const fmt = (v: bigint) => (Number(v) / 1e6).toFixed(3)

async function push(to: Address, amount: bigint, memoText: string) {
  const memo = keccak256(toHex(memoText))
  const nonce = await wc().pub.readContract({ address: config.router, abi: ROUTER_ABI, functionName: "directNonce", args: [to, memo] })
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600)
  const signature = await customer.signTypedData(receiveAuthTypedData({ from: customer.address, to: config.router, value: amount, validAfter: 0n, validBefore, nonce }))
  return relayDirectPayment({ to, amount, memo, auth: { from: customer.address, validAfter: 0n, validBefore, signature } })
}

async function main() {
  const pool = rewardsPool()
  if (!pool) throw new Error("REWARDS_PK not set")
  console.log(`customer ${customer.address}: ${fmt(await bal(customer.address))} USDT`)
  console.log(`rewards pool ${pool.address}: ${fmt(await bal(pool.address))} USDT`)

  if (process.argv[2] === "fund") {
    const amt = parseUnits(process.argv[3] ?? "2", 6)
    const r = await push(pool.address, amt, `rewards-fund/${Date.now()}`)
    console.log(`funded pool with ${fmt(amt)} USDT\n${r.explorer}`)
    return
  }

  if (process.argv[2] === "scratch") {
    const r = await scratchCard(process.argv[3] as Hex, customer.address)
    console.log(`prize=${r.card.prize}${r.card.amount ? ` amount=${fmt(BigInt(r.card.amount))}` : ""}${r.payout ? ` payout ${r.payout.explorer}` : ""}`)
    await r.persist()
    return
  }

  // any shop listed in the Arkiv directory (prefer the demo merchant wallet from .env)
  const preferred = process.env.MERCHANT_PK ? privateKeyToAccount(process.env.MERCHANT_PK.split(",")[0].trim() as Hex).address : null
  let shop = preferred ? await getMerchantByAddress(preferred) : null
  if (!shop) {
    const a = arkiv()
    const any = await a.pub.select({ address: true }).from(MerchantProfile).ownedBy(a.owner).limit(1).fetch()
    const addr = (any.entities[0] as any)?.address
    shop = addr ? await getMerchantByAddress((addr.value ?? addr) as Address) : null
  }
  if (!shop) throw new Error("no listed merchant on Arkiv")

  if (process.argv[2] === "offer") {
    // publish a demo offer for every listed shop whose key is in .env
    for (const n of ["MERCHANT_PK", "STORE_MERCHANT_PK"]) {
      if (!process.env[n]) continue
      const m = privateKeyToAccount(process.env[n]!.split(",")[0].trim() as Hex)
      const listed = await getMerchantByAddress(m.address)
      if (!listed) { console.log(`${n}: not a listed shop, skipped`); continue }
      const [text, code] = [process.argv[3] ?? "10% off your next order", process.argv[4] ?? "SAVE10"]
      const issuedAt = Math.floor(Date.now() / 1000)
      const signature = await m.signMessage({ message: offerMessage({ merchant: m.address, text, code, active: true, issuedAt }) })
      const o = await setOffer({ merchant: m.address, text, code, active: true, issuedAt, signature })
      console.log(`${listed.ensName}: offer "${o.text}" code ${o.code}`)
    }
    return
  }
  console.log(`1. pay ${shop.ensName} 0.10 USDT`)
  const paid = await push(shop.address, 100_000n, `rewards-test/${Date.now()}`)
  console.log(`   ${paid.explorer}`)

  console.log("2. award card")
  if (process.argv[2] === "earn") {
    console.log(`   card ${await awardScratchCard({ payer: customer.address, merchant: shop.address, merchantName: shop.ensName, amount: 100_000n, txHash: paid.txHash })}`)
    return
  }
  const key = await awardScratchCard({ payer: customer.address, merchant: shop.address, merchantName: shop.ensName, amount: 100_000n, txHash: paid.txHash })
  if (!key) throw new Error("no card awarded")
  const again = await awardScratchCard({ payer: customer.address, merchant: shop.address, merchantName: shop.ensName, amount: 100_000n, txHash: paid.txHash })
  console.log(`   card ${key}  (re-award same tx -> ${again === key ? "same card, ok" : "DIFFERENT: BUG"})`)
  const small = await awardScratchCard({ payer: customer.address, merchant: shop.address, amount: 50_000n, txHash: ("0x" + "11".repeat(32)) as Hex })
  console.log(`   0.05 USDT payment -> ${small === null ? "no card, ok" : "card: BUG"}`)

  const cards = await listRewards(customer.address)
  console.log(`3. listRewards: ${cards.length} card(s), newest ${cards[0]?.key === key ? "matches" : "MISMATCH"}; prize hidden: ${cards[0]?.prize === undefined}`)

  const stranger = privateKeyToAccount(("0x" + "42".repeat(32)) as Hex).address
  const denied = await scratchCard(key, stranger).then(() => "ALLOWED: BUG", (e) => `rejected (${e.code})`)
  console.log(`4. scratch by another wallet -> ${denied}`)

  const before = await bal(customer.address)
  const poolBefore = await rewardsPoolBalance()
  const r = await scratchCard(key, customer.address)
  console.log(`5. scratch -> prize=${r.card.prize}${r.card.amount ? ` amount=${fmt(BigInt(r.card.amount))}` : ""}${r.card.offerCode ? ` code=${r.card.offerCode}` : ""} (pool had ${fmt(poolBefore)})`)
  if (r.payout) console.log(`   payout ${r.payout.explorer}; customer +${fmt((await bal(customer.address)) - before)} USDT`)
  await r.persist()
  const r2 = await scratchCard(key, customer.address)
  console.log(`6. re-scratch -> ${r2.card.prize === r.card.prize && !r2.payout ? "same prize, no second payout, ok" : "BUG"}`)
}
main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
