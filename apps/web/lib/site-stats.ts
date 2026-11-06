// Live numbers for the marketing site and /status (server only). Every probe has a hard timeout,
// so a slow chain can never hang a page: it just shows "unavailable".
import { arkiv, wc } from "@whitepay/server"
import { Receipt, Mandate } from "@whitepay/shared/arkiv"
import { eq } from "@arkiv-network/sdk/query"
import { formatEther } from "viem"

const within = <T,>(p: Promise<T>, ms = 2500): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))])

const timed = async <T,>(f: () => Promise<T>) => {
  const t = performance.now()
  const v = await within(f())
  return { value: v, ms: Math.round(performance.now() - t) }
}

export async function networkStats() {
  const a = arkiv()
  const [block, receipts, autopay] = await Promise.all([
    within(wc().pub.getBlock()),
    within(a.pub.select({ $key: true }).from(Receipt).ownedBy(a.owner).withCount().limit(1).fetch()),
    within(a.pub.select({ $key: true }).from(Mandate).ownedBy(a.owner).where(eq("status", "active")).withCount().limit(1).fetch()),
  ])
  return {
    block: block ? Number(block.number) : null,
    blockAgeS: block ? Math.max(0, Math.round(Date.now() / 1000 - Number(block.timestamp))) : null,
    receipts: (receipts as any)?.count == null ? null : Number((receipts as any).count),
    activeAutopay: (autopay as any)?.count == null ? null : Number((autopay as any).count),
  }
}

export type Check = { name: string; detail: string; ms?: number; state: "ok" | "degraded" | "down" }

export async function statusChecks(): Promise<Check[]> {
  const a = arkiv()
  const [chain, arkivRpc, relayer] = await Promise.all([
    timed(() => wc().pub.getBlock()),
    timed(() => a.pub.getBlockNumber()),
    timed(() => wc().pub.getBalance({ address: wc().relayerAddress })),
  ])
  const age = chain.value ? Date.now() / 1000 - Number(chain.value.timestamp) : null
  const wbt = relayer.value != null ? Number(formatEther(relayer.value)) : null
  return [
    { name: "Whitechain (payments)", ms: chain.ms, state: !chain.value ? "down" : age! > 60 ? "degraded" : "ok",
      detail: chain.value ? `block ${chain.value.number} · ${Math.round(age!)}s ago` : "RPC not responding" },
    { name: "Arkiv (requests, receipts, autopay)", ms: arkivRpc.ms, state: arkivRpc.value == null ? "down" : "ok",
      detail: arkivRpc.value != null ? `block ${arkivRpc.value}` : "RPC not responding" },
    { name: "Gasless relayer", ms: relayer.ms, state: wbt == null ? "down" : wbt < 0.05 ? "degraded" : "ok",
      detail: wbt == null ? "balance unavailable" : wbt < 0.05 ? `low gas balance (${wbt.toFixed(3)} WBT)` : `funded (${wbt.toFixed(2)} WBT for gas)` },
    { name: "Checkout SDK", state: "ok", detail: "v1.4.0 · immutable + SRI pinned" },
  ]
}
