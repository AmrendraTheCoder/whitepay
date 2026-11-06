import { createPublicClient, createWalletClient, fallback, http, keccak256, toBytes, type Address } from "viem"
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
  // two RPCs with retries: one flaky RPC call must not fail a payment
  const one = (url: string) => http(url, { retryCount: 2, retryDelay: 300, timeout: 12_000 })
  const transport = config.wcRpcFallback && config.wcRpcFallback !== config.wcRpc
    ? fallback([one(config.wcRpc), one(config.wcRpcFallback)], { rank: false, retryCount: 1 })
    : one(config.wcRpc)
  const keys = config.keys.relayers()
  const relayers = (keys.length ? keys : [config.keys.relayer()]).map((k) => createWalletClient({ chain: whitechainSepolia, transport, pollingInterval: 750, account: privateKeyToAccount(k) })) // nonces: relayer.ts takeNonce
  const relayer = relayers[0]
  return {
    // Whitechain makes a block every ~1 s: check for receipts every 0.75 s instead of viem's default 4 s
    pub: createPublicClient({ chain: whitechainSepolia, transport, pollingInterval: 750 }),
    relayer,
    relayers,
    /** the relayer for this payer: the same payer always gets the same relayer (their payments queue in order),
     *  different payers are spread across relayers (no shared nonce between them) */
    relayerFor: (payer: Address) => relayers[Number(BigInt(keccak256(toBytes(payer.toLowerCase()))) % BigInt(relayers.length))],
    relayerAddress: relayer.account.address,
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
    /** every WondrPay entity is owned by this address; reads MUST filter on it */
    owner: writer.address,
  }
}
export const arkiv = () => (_arkiv ??= makeArkiv())

/**
 * Every WondrPay Arkiv write comes from ONE account, so concurrent writes race for its nonce and one fails
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
        // another server instance can still take the writer's nonce first: the node then REJECTS the tx (it never
        // lands), so sending it again is safe. Two retries with a little jitter.
        const attempt = async () => {
          for (let i = 0; ; i++) {
            try { return await (v as (...a: unknown[]) => Promise<unknown>).apply(target, args) } catch (e) {
              const m = `${(e as any)?.shortMessage ?? ""} ${(e as Error)?.message ?? ""} ${(e as any)?.cause?.message ?? ""}`
              if (i >= 2 || !/missing or invalid parameters|nonce too low|replacement transaction underpriced|nonce has already been used/i.test(m)) throw e
              await new Promise((r) => setTimeout(r, 400 + Math.random() * 900))
            }
          }
        }
        const run = tail.then(attempt)
        // a write that never settles must not block every later write on this instance:
        // the queue moves on after 30 s (the write itself may still land; callers see its own result)
        tail = Promise.race([run, new Promise((r) => setTimeout(r, 30_000))]).catch(() => {})
        return run
      }
    },
  })
}
