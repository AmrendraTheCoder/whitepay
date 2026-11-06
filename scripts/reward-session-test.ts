// Rewards session plumbing (everything except the World App scan): RP contexts for enrol + session, session
// storage on Arkiv, lookup by wallet and by device hint, and claimRewards refusing bad proofs.
// Run: npx tsx --env-file=.env scripts/reward-session-test.ts
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { rpContext, rpSessionContext, WORLD_ACTIONS, rewardSessionFor, claimRewards, RewardSession } from "@whitepay/server"
import { arkiv } from "../packages/server/src/clients"
import { addr, u64 } from "@arkiv-network/sdk/schema"
import { ExpirationTime } from "@arkiv-network/sdk"

async function main() {
  const enroll = rpContext(WORLD_ACTIONS.reward, "Set up WondrPay rewards (once per person)")
  const sess = rpSessionContext("Claim your WondrPay rewards")
  console.log("1. enrol action:", enroll.action, "| session ctx has action:", "action" in sess, "| sig len", sess.rp_context.signature.length)
  const w1 = privateKeyToAccount(generatePrivateKey()).address, w2 = privateKeyToAccount(generatePrivateKey()).address
  console.log("2. new wallet ->", await rewardSessionFor(w1))
  const sid = `session_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`
  const a = arkiv()
  await a.writer.createEntity(RewardSession, { sessionId: sid, human: "0xtesthuman", owner: addr(w1), createdAt: u64(BigInt(Math.floor(Date.now() / 1000))) }, { expiration: ExpirationTime.fromDays(1) }, { gas: 1_000_000n })
  console.log("3. after enrol, same wallet ->", (await rewardSessionFor(w1))?.sessionId === sid)
  console.log("4. other wallet, no hint ->", await rewardSessionFor(w2), "| with device hint ->", (await rewardSessionFor(w2, sid))?.sessionId === sid, "| bogus hint ->", await rewardSessionFor(w2, "session_deadbeef00"))
  const k = ("0x" + "11".repeat(32)) as `0x${string}`
  const bad = async (proof: any) => claimRewards({ owner: w2, keys: [k], proof }).catch((e) => (e as Error).message)
  console.log("5. unknown session:", await bad({ session_id: "session_" + "ab".repeat(32), responses: [] }))
  console.log("6. forged session proof:", await bad({ protocol_version: "4.0", nonce: "0x01", session_id: sid, responses: [{ identifier: "proof_of_human", signal_hash: "0x00", proof: ["0", "0", "0", "0", "0"], session_nullifier: ["1", "2"] }] }))
  console.log("7. enrol proof for the wrong action:", await bad({ action: "whitepay-pay", session_id: sid, responses: [] }))
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
