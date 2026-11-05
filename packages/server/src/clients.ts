import { createPublicClient, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import {
  createPublicClient as createArkivPublic,
  createWalletClient as createArkivWallet,
} from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { whitechainSepolia } from "@whitepay/shared"
import { config } from "./config"

let _wc: ReturnType<typeof makeWc> | undefined
const makeWc = () => {
  const transport = http(config.wcRpc)
  const relayer = privateKeyToAccount(config.keys.relayer())
  return {
    pub: createPublicClient({ chain: whitechainSepolia, transport }),
    relayer: createWalletClient({ chain: whitechainSepolia, transport, account: relayer }),
    relayerAddress: relayer.address,
    /** MerchantRegistry owner: only used to register/verify merchants */
    admin: () => createWalletClient({ chain: whitechainSepolia, transport, account: privateKeyToAccount(config.keys.admin()) }),
  }
}
/** Whitechain clients (lazy, so read-only callers don't need relayer keys loaded twice). */
export const wc = () => (_wc ??= makeWc())

let _arkiv: ReturnType<typeof makeArkiv> | undefined
const makeArkiv = () => {
  const chain = rabdi({ accessKey: config.arkivAccessKey })
  const writer = privateKeyToAccount(config.keys.arkivWriter())
  return {
    pub: createArkivPublic({ chain, transport: http() }),
    writer: createArkivWallet({ chain, transport: http(), account: writer }),
    /** every WhitePay entity is owned by this address; reads MUST filter on it */
    owner: writer.address,
  }
}
export const arkiv = () => (_arkiv ??= makeArkiv())
