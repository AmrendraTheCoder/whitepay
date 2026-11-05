import { defineChain, type Address, type Hex } from "viem"

// ---------------------------------------------------------------- chains
// Verified 2026-11-05: docs.whitechain.io/learn/network/testnet.md
// NOTE: rpc-testnet.whitechain.io and viem's `whitechainTestnet` are the RETIRED chain 2625.
export const whitechainSepolia = defineChain({
  id: 1874,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WhiteBIT Coin", symbol: "WBT", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.whitechain.io"],
      webSocket: ["wss://rpc.testnet.whitechain.io/ws"],
    },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.whitechain.io" },
  },
  testnet: true,
})

export const WHITECHAIN_CHAIN_ID = 1874
/** ENSIP-11 coin type for EVM chain 1874: 0x80000000 | 1874 */
export const WHITECHAIN_COIN_TYPE = 2147485522n

// ------------------------------------------------------------- addresses
export const USDT_ADDRESS: Address = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7"
export const USDT_DECIMALS = 6
/** EIP-712 domain of the USDT token (TetherTokenV2) on 1874, verified against on-chain DOMAIN_SEPARATOR */
export const USDT_DOMAIN = {
  name: "Tether USD",
  version: "1",
  chainId: WHITECHAIN_CHAIN_ID,
  verifyingContract: USDT_ADDRESS,
} as const

export const ENS_SEPOLIA = {
  ethRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
  ethRegistrar: "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
  verifiableFactory: "0xda70306c98e97ece36f997a21368e53298572991",
  userRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
  permissionedResolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  mockUsdc: "0x240b0316df57887dbbe58b586508b19e633a14aa",
  universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
} as const satisfies Record<string, Address>

// ------------------------------------------------------------- EIP-712
/** Merchant order (UPI "Reference ID"). Signed by the merchant's order signer. */
export type Order = { merchant: Address; amount: bigint; orderId: Hex; deadline: bigint }

export const routerDomain = (router: Address) =>
  ({ name: "WhitePayRouter", version: "1", chainId: WHITECHAIN_CHAIN_ID, verifyingContract: router }) as const

export const ORDER_TYPES = {
  Order: [
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "orderId", type: "bytes32" },
    { name: "deadline", type: "uint64" },
  ],
} as const

/** EIP-3009 authorization the payer signs; `to` is always the PaymentRouter. */
export const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const

/** Typed-data for the merchant's order signature (viem signTypedData / hashTypedData input). */
export const orderTypedData = (router: Address, order: Order) =>
  ({ domain: routerDomain(router), types: ORDER_TYPES, primaryType: "Order", message: order }) as const

/** Typed-data the PAYER signs on their device (fingerprint/PIN unlocks the key). to = router, nonce = order digest. */
export const receiveAuthTypedData = (p: {
  from: Address
  to: Address
  value: bigint
  validAfter: bigint
  validBefore: bigint
  nonce: Hex
}) =>
  ({
    domain: USDT_DOMAIN,
    types: RECEIVE_WITH_AUTHORIZATION_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: p,
  }) as const

/** QR payload for a dynamic merchant QR / payment link. */
export const requestUri = (entityKey: Hex) => `whitepay://pay?req=${entityKey}`
export const parseRequestUri = (uri: string): Hex | null => {
  const m = uri.match(/[?&]req=(0x[0-9a-fA-F]{64})/)
  return m ? (m[1] as Hex) : null
}

export const ROUTER_ABI = [
  {
    type: "function", name: "payOrder", stateMutability: "nonpayable",
    inputs: [
      { name: "o", type: "tuple", components: [
        { name: "merchant", type: "address" }, { name: "amount", type: "uint256" },
        { name: "orderId", type: "bytes32" }, { name: "deadline", type: "uint64" } ] },
      { name: "merchantSig", type: "bytes" },
      { name: "a", type: "tuple", components: [
        { name: "from", type: "address" }, { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" }, { name: "v", type: "uint8" },
        { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" } ] },
    ],
    outputs: [{ name: "paymentId", type: "bytes32" }],
  },
  {
    type: "function", name: "payDirect", stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" }, { name: "amount", type: "uint256" }, { name: "memo", type: "bytes32" },
      { name: "a", type: "tuple", components: [
        { name: "from", type: "address" }, { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" }, { name: "v", type: "uint8" },
        { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" } ] },
    ],
    outputs: [],
  },
  { type: "function", name: "directNonce", stateMutability: "view",
    inputs: [{ name: "to", type: "address" }, { name: "memo", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
  { type: "event", name: "PaymentSettled", inputs: [
    { name: "paymentId", type: "bytes32", indexed: true }, { name: "orderId", type: "bytes32", indexed: true },
    { name: "merchant", type: "address", indexed: true }, { name: "payer", type: "address", indexed: false },
    { name: "payout", type: "address", indexed: false }, { name: "amount", type: "uint256", indexed: false } ] },
  { type: "event", name: "DirectPayment", inputs: [
    { name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false }, { name: "memo", type: "bytes32", indexed: false } ] },
  { type: "error", name: "OrderExpired", inputs: [] },
  { type: "error", name: "OrderAlreadyPaid", inputs: [] },
  { type: "error", name: "BadMerchantSignature", inputs: [] },
  { type: "error", name: "MerchantInactive", inputs: [] },
  { type: "error", name: "NotRelayer", inputs: [] },
] as const

export const REGISTRY_ABI = [
  { type: "function", name: "get", stateMutability: "view",
    inputs: [{ name: "merchant", type: "address" }],
    outputs: [{ type: "tuple", components: [
      { name: "payout", type: "address" }, { name: "signer", type: "address" }, { name: "ensNode", type: "bytes32" },
      { name: "active", type: "bool" }, { name: "verified", type: "bool" } ] }] },
] as const

export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const

// ---------------------------------------------------- UPI-derived rules
/** Lifetime of a payment in progress (seconds). Arkiv expiry and on-chain deadline both use these. */
export const REQUEST_TTL = {
  p2mQr: 5 * 60,
  invoiceMax: 30 * 60,
  min: 60,
} as const

export const COLLECT_EXPIRY = {
  defaultMinutes: 30,
  minMinutes: 1,
  maxMinutes: 45 * 24 * 60,
} as const

export const VELOCITY = {
  collectPerDayPerPayee: 10,
  collectPerWeekPerPayee: 25,
} as const

export const LIMITS = {
  /** per-transaction limit above which World ID step-up is required (USDT base units) */
  stepUpThreshold: 100n * 10n ** 6n,
  dailyPerPayer: 500n * 10n ** 6n,
} as const

export const formatUsdt = (v: bigint) => {
  const whole = v / 10n ** 6n
  const frac = (v % 10n ** 6n).toString().padStart(6, "0").replace(/0+$/, "")
  return frac ? `${whole}.${frac}` : whole.toString()
}
