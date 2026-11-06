// WondrPay for Business phase 3 on testnet, in-process: teammates (developer role) and local-currency rates.
// Run: npx tsx --env-file=.env scripts/business-phase3-test.ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { merchantSignupMessage, siteApprovalMessage, paymentLinkMessage, teamMessage } from "@whitepay/shared"
import {
  registerMerchant, createSite, rotateSiteKey, revokeSite, orderSignerAddress, createLink, addTeammate, removeTeammate, authenticateSecretKey,
  listTeam, membershipsOf, roleOf, usdtRates, SiteError,
} from "@whitepay/server"

const ORIGIN = "https://wondrpay.vercel.app"
const owner = privateKeyToAccount(generatePrivateKey())
const dev = privateKeyToAccount(generatePrivateKey())
const stranger = privateKeyToAccount(generatePrivateKey())
const now = () => Math.floor(Date.now() / 1000)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
let fails = 0
const ok = (c: unknown, what: string) => { console.log(`${c ? "PASS" : "FAIL"}  ${what}`); if (!c) fails++ }
const code = async (f: () => Promise<unknown>) => { try { await f(); return "ok" } catch (e) { return e instanceof SiteError ? `${e.status} ${e.code}` : `error: ${(e as Error).message.split("\n")[0]}` } }
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("")

async function main() {
  const label = `biz3-${hex(3)}`, t = now()
  await registerMerchant({ label, displayName: "Phase 3 Shop", address: owner.address, issuedAt: t, signature: await owner.signMessage({ message: merchantSignupMessage({ label, displayName: "Phase 3 Shop", address: owner.address, issuedAt: t }) }) })
  const site = { siteId: hex(16), name: "P3 site", domains: ["shop.example.com"] }
  let i = now()
  await createSite({ merchant: owner.address, ...site, issuedAt: i, signature: await owner.signMessage({ message: siteApprovalMessage({ action: "create", merchant: owner.address, ...site, orderSigner: orderSignerAddress(), issuedAt: i }) }) })
  ok(true, `shop ${label} with a website`)

  // add a developer (owner only)
  i = now()
  const addMsg = teamMessage({ action: "add", merchant: owner.address, member: dev.address, role: "developer", label: "Agency", issuedAt: i })
  ok(await code(() => addTeammate({ merchant: owner.address, member: stranger.address, issuedAt: i, signature: "0x00" })) !== "ok", "garbage signature can't add teammates")
  const addSig = await owner.signMessage({ message: addMsg })
  await addTeammate({ merchant: owner.address, member: dev.address, label: "Agency", issuedAt: i, signature: addSig })
  ok((await roleOf(owner.address, dev.address)) === "developer", "teammate added as developer")
  ok(await code(() => addTeammate({ merchant: owner.address, member: dev.address, label: "Agency", issuedAt: i, signature: addSig })) === "409 conflict", "replaying the add approval is refused")
  const shops = await membershipsOf(dev.address)
  ok(shops[0]?.merchant === owner.address && shops[0]?.shopName === "Phase 3 Shop", "developer sees the shop in their memberships")

  // developer: allowed actions
  await wait(1100)
  i = now()
  const rot = await rotateSiteKey({ merchant: owner.address, actor: dev.address, siteId: site.siteId, issuedAt: i,
    signature: await dev.signMessage({ message: siteApprovalMessage({ action: "rotate", merchant: owner.address, ...site, orderSigner: orderSignerAddress(), issuedAt: i }) }) })
  ok(/^wp_sk_test_/.test(rot.secretKey), "developer can make a new secret key")
  i = now()
  const linkId = `pl_${hex(10)}`
  const link = await createLink({ merchant: owner.address, actor: dev.address, siteId: site.siteId, linkId, title: "Dev link", amount: "0.10", issuedAt: i,
    signature: await dev.signMessage({ message: paymentLinkMessage({ action: "create", merchant: owner.address, site: site.siteId, linkId, title: "Dev link", amount: "0.10", issuedAt: i }) }) }, ORIGIN)
  ok(link.linkId === linkId, "developer can create a payment link")

  // developer: owner-only actions refused
  await wait(1100)
  i = now()
  ok(await code(async () => revokeSite({ merchant: owner.address, actor: dev.address, siteId: site.siteId, issuedAt: i,
    signature: await dev.signMessage({ message: siteApprovalMessage({ action: "revoke", merchant: owner.address, ...site, orderSigner: orderSignerAddress(), issuedAt: i }) }) })) === "403 forbidden", "developer can't switch off a website")
  ok(await code(async () => addTeammate({ merchant: owner.address, member: stranger.address, issuedAt: i,
    signature: await dev.signMessage({ message: teamMessage({ action: "add", merchant: owner.address, member: stranger.address, role: "developer", issuedAt: i }) }) })) === "401 unauthorized", "developer can't add teammates")
  ok(await code(async () => rotateSiteKey({ merchant: owner.address, actor: stranger.address, siteId: site.siteId, issuedAt: i,
    signature: await stranger.signMessage({ message: siteApprovalMessage({ action: "rotate", merchant: owner.address, ...site, orderSigner: orderSignerAddress(), issuedAt: i }) }) })) === "403 forbidden", "a stranger's wallet can't act for the shop")

  // remove the developer: their next action is refused at once
  await wait(1100)
  i = now()
  await removeTeammate({ merchant: owner.address, member: dev.address, issuedAt: i, signature: await owner.signMessage({ message: teamMessage({ action: "remove", merchant: owner.address, member: dev.address, role: "developer", label: "Agency", issuedAt: i }) }) })
  await wait(3500) // role cache
  ok((await roleOf(owner.address, dev.address)) === null, "removed teammate has no role")
  ok(await code(() => authenticateSecretKey(`Bearer ${rot.secretKey}`)) === "401 unauthorized", "the secret key the teammate made stopped working when they were removed")
  await wait(1100)
  i = now()
  ok(await code(async () => rotateSiteKey({ merchant: owner.address, actor: dev.address, siteId: site.siteId, issuedAt: i,
    signature: await dev.signMessage({ message: siteApprovalMessage({ action: "rotate", merchant: owner.address, ...site, orderSigner: orderSignerAddress(), issuedAt: i }) }) })) === "403 forbidden", "removed teammate can't rotate keys")
  const team = await listTeam(owner.address)
  ok(team.length === 1 && team[0].status === "removed", "team list shows them as removed")

  // local currency
  const fx = await usdtRates()
  ok(fx && fx.rates.INR && fx.rates.INR > 50 && fx.rates.EUR && fx.rates.EUR < 2, `USDT rates: ₹${fx?.rates.INR} · €${fx?.rates.EUR}`)
  console.log(fails ? `\n${fails} FAILED` : "\nall passed")
}
main().then(() => process.exit(fails ? 1 : 0), (e) => { console.error(e); process.exit(1) })
