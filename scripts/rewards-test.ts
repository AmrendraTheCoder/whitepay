// Rewards v2 (WBT cashback, World ID claims, fee-funded pool), tested against the real chain + Arkiv.
//   npx tsx --env-file=.env scripts/rewards-test.ts sim            -> 200k-card simulation of the economics (no chain)
//   npx tsx --env-file=.env scripts/rewards-test.ts fund-wbt 0.3   -> move test WBT from the deployer into the rewards pool
//   npx tsx --env-file=.env scripts/rewards-test.ts                -> live: pay shop, earn, scratch, claim (as a test human), limits
//   npx tsx --env-file=.env scripts/rewards-test.ts earn           -> pay a shop 0.10 and earn one unscratched card (UI testing)
//   npx tsx --env-file=.env scripts/rewards-test.ts scratch <cardKey>  -> scratch one of the demo customer's cards
//   npx tsx --env-file=.env scripts/rewards-test.ts offer [text] [CODE]
// The live run claims with `trustedHuman` (a fixed test nullifier): the API itself always demands a World ID proof.
// Never prints keys.
import { createWalletClient, http, keccak256, parseEther, formatEther, toHex, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { receiveAuthTypedData, ROUTER_ABI, whitechainSepolia } from "@whitepay/shared"
import { MerchantProfile } from "@whitepay/shared/arkiv"
import { ECON, economicsPer100, rollPrize, cashbackMicro, winProbBps, expectedWinRateBps, offerMessage } from "@whitepay/shared/rewards"
import {
  arkiv, config, wc, relayDirectPayment, awardScratchCard, setOffer, listRewards, scratchCard, claimRewards, rewardsLedger,
  rewardsPool, rewardPoolWbt, getMerchantByAddress,
} from "@whitepay/server"

const key = (n: string) => process.env[n]!.split(",")[0].trim() as Hex
const customer = privateKeyToAccount(key("CUSTOMER_PK"))
const usd = (micro: bigint | string) => `$${(Number(micro) / 1e6).toFixed(4)}`

async function push(from: ReturnType<typeof privateKeyToAccount>, to: Address, amount: bigint, memoText: string) {
  const memo = keccak256(toHex(memoText))
  const nonce = await wc().pub.readContract({ address: config.router, abi: ROUTER_ABI, functionName: "directNonce", args: [to, memo] })
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600)
  const signature = await from.signTypedData(receiveAuthTypedData({ from: from.address, to: config.router, value: amount, validAfter: 0n, validBefore, nonce }))
  return relayDirectPayment({ to, amount, memo, auth: { from: from.address, validAfter: 0n, validBefore, signature } })
}

async function anyShop() {
  const a = arkiv()
  const any = await a.pub.select({ address: true }).from(MerchantProfile).ownedBy(a.owner).limit(1).fetch()
  const addr = (any.entities[0] as any)?.address
  const shop = addr ? await getMerchantByAddress((addr.value ?? addr) as Address) : null
  if (!shop) throw new Error("no listed merchant on Arkiv")
  return shop
}

function sim() {
  // random seeds, random payments between $0.10 and $200 (log-uniform), no welcome: the steady state
  const N = 200_000
  let vol = 0n, cost = 0n, wins = 0, rateSum = 0
  const buf = new Uint8Array(32)
  for (let i = 0; i < N; i++) {
    crypto.getRandomValues(buf)
    const seed = BigInt(toHex(buf))
    const paid = BigInt(Math.round(Math.exp(Math.log(0.1) + Math.random() * Math.log(2000)) * 1e6))
    const r = rollPrize(seed, { hasOffer: true, welcome: false })
    vol += paid
    if (r.prize === "wbt") { wins++; rateSum += r.rateBps; cost += cashbackMicro(paid, r.rateBps, false) }
  }
  const fees = (vol * BigInt(ECON.feeBps)) / 10_000n
  const e = economicsPer100()
  console.log("model:   fee %s%%, reward share %s%%, E[win rate] %s%%, win probability %s%% (1 in %d)",
    ECON.feeBps / 100, ECON.rewardShareBps / 100, (expectedWinRateBps() / 100).toFixed(2), (winProbBps() / 100).toFixed(2), e.oneIn)
  console.log("per $100: fee $%s, expected rewards $%s, margin $%s", e.fee.toFixed(2), e.expectedRewards.toFixed(3), e.margin.toFixed(3))
  console.log("sim %d cards: win rate %s%%, mean winning rate %s%%", N, ((wins / N) * 100).toFixed(2), (rateSum / wins / 100).toFixed(2))
  console.log("sim: volume %s, fees %s, rewards %s = %s%% of fees (target ≤ %s%%, caps push it lower)",
    usd(vol), usd(fees), usd(cost), ((Number(cost) / Number(fees)) * 100).toFixed(1), ECON.rewardShareBps / 100)
  if (cost > fees) throw new Error("BUG: rewards exceed fees")
}

async function main() {
  if (process.argv[2] === "sim") return sim()
  const pool = rewardsPool()
  if (!pool) throw new Error("REWARDS_PK not set")

  if (process.argv[2] === "fund-wbt") {
    const deployer = privateKeyToAccount(key("DEPLOYER_PK"))
    const w = createWalletClient({ chain: whitechainSepolia, transport: http(config.wcRpc), account: deployer })
    const tx = await w.sendTransaction({ to: pool.address, value: parseEther(process.argv[3] ?? "0.3") })
    await wc().pub.waitForTransactionReceipt({ hash: tx })
    console.log(`pool ${pool.address} now holds ${formatEther(await wc().pub.getBalance({ address: pool.address }))} WBT\n${config.explorer}/tx/${tx}`)
    return
  }

  const shop = await anyShop()

  if (process.argv[2] === "offer") {
    for (const n of ["MERCHANT_PK", "STORE_MERCHANT_PK"]) {
      if (!process.env[n]) continue
      const m = privateKeyToAccount(key(n))
      if (!(await getMerchantByAddress(m.address))) continue
      const [text, code] = [process.argv[3] ?? "10% off your next order", process.argv[4] ?? "SAVE10"]
      const issuedAt = Math.floor(Date.now() / 1000)
      const signature = await m.signMessage({ message: offerMessage({ merchant: m.address, text, code, active: true, issuedAt }) })
      const o = await setOffer({ merchant: m.address, text, code, active: true, issuedAt, signature })
      console.log(`${o.merchantName}: offer "${o.text}" code ${o.code}`)
    }
    return
  }

  const earn = async (from = customer) => {
    const paid = await push(from, shop.address, 100_000n, `rewards-test/${Date.now()}/${Math.random()}`)
    const k = await awardScratchCard({ payer: from.address, merchant: shop.address, merchantName: shop.ensName, amount: 100_000n, txHash: paid.txHash })
    if (!k) throw new Error("no card awarded")
    return k
  }
  if (process.argv[2] === "earn") return console.log(`card ${await earn()}`)
  if (process.argv[2] === "scratch") {
    const r = await scratchCard(process.argv[3] as Hex, customer.address)
    await r.persist()
    return console.log(`${r.card.status} ${r.card.prize}${r.card.rateBps ? ` ${r.card.rateBps / 100}%` : ""}${r.card.amount ? ` = ${usd(r.card.amount)}` : ""}`)
  }

  console.log(`pool ${pool.address}: ${formatEther(await rewardPoolWbt())} WBT`)
  const before = await rewardsLedger()
  console.log(`ledger: volume ${usd(before.volumeMicro)}, accrued ${usd(before.accruedMicro)} + launch ${usd(before.launchBudgetMicro)}, paid ${usd(before.paidMicro)}, available ${usd(before.availableMicro)}, WBT $${before.wbtUsd}`)

  // a brand-new test wallet: its first cards are welcome wins
  const fresh = privateKeyToAccount(keccak256(toHex(`rewards-test-wallet/${Date.now()}`)))
  await push(customer, fresh.address, 400_000n, `fund-fresh/${Date.now()}`)
  console.log(`1. fresh wallet ${fresh.address} funded 0.40 USDT; pays ${shop.ensName} 0.10 x 4`)
  const keys: Hex[] = []
  for (let i = 0; i < 4; i++) keys.push(await earn(fresh))

  console.log("2. scratch all 4")
  const won: Hex[] = []
  for (const k of keys) {
    const r = await scratchCard(k, fresh.address)
    await r.persist()
    console.log(`   ${k.slice(0, 10)} -> ${r.card.prize}${r.card.rateBps ? ` ${r.card.rateBps / 100}%` : ""}${r.card.amount ? ` = ${usd(r.card.amount)}` : ""}`)
    if (r.card.status === "won") won.push(k)
  }
  const welcomeWon = (await listRewards(fresh.address)).filter((c) => c.prize === "wbt_welcome").length
  console.log(`   welcome wins: ${welcomeWon} (expected ${ECON.welcomeWins})`)

  const HUMAN = `test-human-${Date.now()}`
  console.log("3. claim as a test human (World ID proof replaced by trustedHuman)")
  const wbt0 = await wc().pub.getBalance({ address: fresh.address })
  const c1 = await claimRewards({ owner: fresh.address, keys: won, trustedHuman: HUMAN })
  const wbt1 = await wc().pub.getBalance({ address: fresh.address })
  console.log(`   paid ${usd(c1.usdMicro)} as ${formatEther(BigInt(c1.wbtWei))} WBT @ $${c1.wbtUsd}; wallet +${formatEther(wbt1 - wbt0)} WBT; ${c1.explorer}`)
  console.log(`   ${BigInt(c1.wbtWei) === wbt1 - wbt0 ? "ok: on-chain amount matches" : "MISMATCH"}`)

  const again = await claimRewards({ owner: fresh.address, keys: won, trustedHuman: HUMAN }).then(() => "PAID TWICE: BUG", (e) => `rejected (${e.code}): ${e.message}`)
  console.log(`4. claim the same cards again -> ${again}`)

  console.log("5. same human, second wallet: welcome must NOT pay again")
  const fresh2 = privateKeyToAccount(keccak256(toHex(`rewards-test-wallet-2/${Date.now()}`)))
  await push(customer, fresh2.address, 100_000n, `fund-fresh2/${Date.now()}`)
  const k2 = await earn(fresh2)
  const s2 = await scratchCard(k2, fresh2.address); await s2.persist()
  console.log(`   card -> ${s2.card.prize}`)
  if (s2.card.status === "won") {
    const c2 = await claimRewards({ owner: fresh2.address, keys: [k2], trustedHuman: HUMAN })
    console.log(`   claim -> paid ${usd(c2.usdMicro)}, expired: ${c2.expired.map((x) => x.reason).join("; ") || "none"}`)
    console.log(`   ${s2.card.prize === "wbt_welcome" && c2.expired.length === 1 ? "ok: welcome stacking blocked" : "check"}`)
  }

  const stranger = await claimRewards({ owner: customer.address, keys: won, trustedHuman: "someone-else" }).then(() => "ALLOWED: BUG", (e) => `rejected (${e.code})`)
  console.log(`6. claiming someone else's cards -> ${stranger}`)

  const after = await rewardsLedger()
  console.log(`7. ledger: paid ${usd(before.paidMicro)} -> ${usd(after.paidMicro)}, claims ${before.claims} -> ${after.claims}, available ${usd(after.availableMicro)}`)
}
main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
