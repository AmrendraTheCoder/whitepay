"use client"
// Live chain watcher: Whitechain makes a block about every second, so the app watches the chain directly instead of
// polling our API every few seconds. One shared watcher per tab:
//  - every ~1 s while visible (8 s in the background): eth_blockNumber; on a new block, eth_getLogs for USDT
//    Transfer events to or from the active wallet in the new blocks
//  - on a hit: read the balance and fire `wondrpay:transfer` (and `wondrpay:balance`), so the balance, history,
//    the "money received" pop-up and sounds react within a second or two, like a web2 app.
//  - `wondrpay:block` fires on each new block (the home screen shows the live block height).
// Read-only RPC calls straight to Whitechain; nothing is signed here.
import { createPublicClient, http, parseAbiItem, type Address } from "viem"
import { whitechainSepolia, USDT_ADDRESS } from "@whitepay/shared"

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)")
const BALANCE = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }] as const

export type LiveTransfer = { direction: "in" | "out"; from: Address; to: Address; value: bigint; txHash: string; block: bigint }

let client: ReturnType<typeof createPublicClient> | null = null
const rpc = () => (client ??= createPublicClient({ chain: whitechainSepolia, transport: http(whitechainSepolia.rpcUrls.default.http[0], { timeout: 6000, retryCount: 1 }) }))

const targets = new Map<string, { address: Address; users: number }>() // every address someone is watching
let timer: ReturnType<typeof setTimeout> | null = null
let lastBlock: bigint | null = null
let busy = false
export let latestBlock: bigint | null = null

async function tick() {
  if (!targets.size || busy) return schedule()
  busy = true
  try {
    const head = await rpc().getBlockNumber({ cacheTime: 0 })
    if (lastBlock === null) lastBlock = head
    if (head > lastBlock) {
      latestBlock = head
      window.dispatchEvent(new CustomEvent("wondrpay:block", { detail: { block: head.toString() } }))
      const fromBlock = head - lastBlock > 30n ? head - 30n : lastBlock + 1n // after a long sleep, only look back ~30 s
      lastBlock = head
      for (const { address: addr } of [...targets.values()]) {
        const [ins, outs] = await Promise.all([
          rpc().getLogs({ address: USDT_ADDRESS, event: TRANSFER, args: { to: addr }, fromBlock, toBlock: head }),
          rpc().getLogs({ address: USDT_ADDRESS, event: TRANSFER, args: { from: addr }, fromBlock, toBlock: head }),
        ])
        const hits: LiveTransfer[] = [
          ...ins.map((l) => ({ direction: "in" as const, from: l.args.from!, to: l.args.to!, value: l.args.value!, txHash: l.transactionHash!, block: l.blockNumber! })),
          ...outs.map((l) => ({ direction: "out" as const, from: l.args.from!, to: l.args.to!, value: l.args.value!, txHash: l.transactionHash!, block: l.blockNumber! })),
        ].filter((h) => h.from.toLowerCase() !== h.to.toLowerCase())
        if (!hits.length) continue
        const bal = await rpc().readContract({ address: USDT_ADDRESS, abi: BALANCE, functionName: "balanceOf", args: [addr] }).catch(() => null)
        window.dispatchEvent(new CustomEvent("wondrpay:transfer", { detail: { address: addr.toLowerCase(), transfers: hits, balance: bal?.toString() } }))
        if (bal !== null) window.dispatchEvent(new CustomEvent("wondrpay:balance", { detail: { address: addr.toLowerCase(), usdt: bal.toString(), live: true } }))
      }
    }
  } catch {
    // RPC hiccup: try again on the next tick
  } finally {
    busy = false
    schedule()
  }
}

function schedule() {
  if (timer) clearTimeout(timer)
  if (!targets.size) return
  timer = setTimeout(tick, document.visibilityState === "visible" ? 1000 : 8000)
}

/** Start watching `address` (call the returned function to stop). Several callers share one watcher. */
export function watchChain(address: string | null | undefined): () => void {
  if (!address || typeof window === "undefined") return () => {}
  const k = address.toLowerCase()
  const t = targets.get(k)
  if (t) t.users++
  else { targets.set(k, { address: address as Address, users: 1 }); if (targets.size === 1) lastBlock = null }
  schedule()
  const onVis = () => { if (document.visibilityState === "visible") void tick() }
  document.addEventListener("visibilitychange", onVis)
  let done = false
  return () => {
    if (done) return
    done = true
    document.removeEventListener("visibilitychange", onVis)
    const cur = targets.get(k)
    if (cur && --cur.users <= 0) targets.delete(k)
    if (!targets.size && timer) { clearTimeout(timer); timer = null }
  }
}
