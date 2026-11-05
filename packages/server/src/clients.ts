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
    writer: serialize(createArkivWallet({ chain, transport: http(), account: writer })),
    /** every WhitePay entity is owned by this address; reads MUST filter on it */
    owner: writer.address,
  }
}
export const arkiv = () => (_arkiv ??= makeArkiv())

/**
 * Every WhitePay Arkiv write comes from ONE account, so concurrent writes race for its nonce and one fails
 * ("Execution error without revert data"). Queue them per instance; reads are untouched.
 */
function serialize<W extends object>(w: W): W {
  let tail: Promise<unknown> = Promise.resolve()
  const WRITES = new Set(["createEntity", "executeBatch", "patchEntity", "deleteEntity", "extendEntity", "updateEntity"])
  return new Proxy(w, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv)
      if (typeof v !== "function" || !WRITES.has(String(prop))) return v
      return (...args: unknown[]) => {
        const run = tail.then(() => (v as (...a: unknown[]) => Promise<unknown>).apply(target, args))
        // a write that never settles must not block every later write on this instance:
        // the queue moves on after 30 s (the write itself may still land; callers see its own result)
        tail = Promise.race([run, new Promise((r) => setTimeout(r, 30_000))]).catch(() => {})
        return run
      }
    },
  })
}
