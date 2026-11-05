// Server-only configuration. Reads process.env (load .env before importing, e.g. `node --env-file=.env`).
// Never log private keys or the keyed Arkiv RPC URL.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { Address, Hex } from "viem"

const need = (name: string): string => {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var ${name} (see .env.example)`)
  return v
}
const pk = (name: string) => need(name).split(",")[0].trim() as Hex

const deployments = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../deployments/1874.json", import.meta.url)), "utf8"),
) as {
  contracts: { PaymentRouter: { address: Address }; MerchantRegistry: { address: Address } }
  token: { USDT: Address }
}

export const config = {
  wcRpc: process.env.WC_RPC_URL || "https://rpc.testnet.whitechain.io",
  router: (process.env.ROUTER_ADDRESS || deployments.contracts.PaymentRouter.address) as Address,
  registry: (process.env.REGISTRY_ADDRESS || deployments.contracts.MerchantRegistry.address) as Address,
  usdt: deployments.token.USDT,
  arkivAccessKey: process.env.ARKIV_ACCESS_KEY ?? "",
  keys: {
    relayer: () => pk("RELAYER_PKS"),
    orderSigner: () => pk("ORDER_SIGNER_PK"),
    arkivWriter: () => pk("ARKIV_WRITER_PK"),
  },
  /** max gas price the relayer will pay (anti-drain), wei */
  maxGasPrice: 50_000_000_000n, // 50 gwei; Whitechain min base fee is 5 gwei
  explorer: "https://explorer.testnet.whitechain.io",
  arkivExplorer: "https://rabdi.explorer.arkiv.network",
}
