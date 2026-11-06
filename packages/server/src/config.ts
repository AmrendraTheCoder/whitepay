// Server-only configuration. Reads process.env (load .env before importing, e.g. `tsx --env-file=.env`).
// Never log private keys or the keyed Arkiv RPC URL.
import type { Hex } from "viem"
import { ROUTER_ADDRESS, REGISTRY_ADDRESS, USDT_ADDRESS, EXPLORER_URL } from "@whitepay/shared"

const need = (name: string): string => {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var ${name} (see .env.example)`)
  return v
}
const pk = (name: string) => need(name).split(",")[0].trim() as Hex

export const config = {
  wcRpc: process.env.WC_RPC_URL || "https://rpc.testnet.whitechain.io",
  /** second Whitechain RPC, used automatically when the first one errors or times out */
  wcRpcFallback: process.env.WC_RPC_FALLBACK || "",
  router: ROUTER_ADDRESS,
  registry: REGISTRY_ADDRESS,
  usdt: USDT_ADDRESS,
  arkivAccessKey: process.env.ARKIV_ACCESS_KEY ?? "",
  keys: {
    relayer: () => pk("RELAYER_PKS"),
    /** every relayer key (comma separated): payers are spread across them so parallel payments don't share a nonce */
    relayers: () => need("RELAYER_PKS").split(",").map((k) => k.trim()).filter((k) => /^0x[0-9a-fA-F]{64}$/.test(k)) as Hex[],
    /** registry admin (registers merchants); holds WBT for gas */
    admin: () => pk("DEPLOYER_PK"),
    orderSigner: () => pk("ORDER_SIGNER_PK"),
    arkivWriter: () => pk("ARKIV_WRITER_PK"),
  },
  /** max gas price the relayer will pay (anti-drain), wei */
  maxGasPrice: 50_000_000_000n, // 50 gwei; Whitechain min base fee is 5 gwei
  explorer: EXPLORER_URL,
  arkivExplorer: "https://rabdi.explorer.arkiv.network",
  ensParent: process.env.ENS_PARENT || "wondrpay.eth",
}
