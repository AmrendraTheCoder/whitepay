// End-to-end gasless USDT payment on Whitechain Sepolia (chain 1874).
//  1. Merchant backend (ORDER_SIGNER) signs an EIP-712 Order  ("UPI Reference ID")
//  2. Customer signs EIP-3009 ReceiveWithAuthorization to the router, nonce = order digest
//  3. Relayer submits PaymentRouter.payOrder and pays the WBT gas. The customer holds 0 WBT.
// Usage: node scripts/first-payment.mjs [amountUSDT=1]
// Reads keys from .env. Never prints private keys.
import { readFileSync } from "node:fs"
import { createPublicClient, createWalletClient, http, parseUnits, keccak256, toHex, parseSignature, formatUnits, parseAbi } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { defineChain } from "viem"

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
)
const deployments = JSON.parse(readFileSync(new URL("../deployments/1874.json", import.meta.url), "utf8"))

const chain = defineChain({
  id: 1874, name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.whitechain.io"] } },
})
const EXPLORER = "https://explorer.testnet.whitechain.io"
const USDT = deployments.token.USDT
const ROUTER = deployments.contracts.PaymentRouter.address
const MERCHANT = deployments.demo.merchant.address

const orderSigner = privateKeyToAccount(env.ORDER_SIGNER_PK)
const customer = privateKeyToAccount(env.CUSTOMER_PK)
const relayer = privateKeyToAccount(env.RELAYER_PKS.split(",")[0])

const pub = createPublicClient({ chain, transport: http() })
const relayerWallet = createWalletClient({ chain, transport: http(), account: relayer })

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"])
const routerAbi = parseAbi([
  "function hashOrder((address merchant,uint256 amount,bytes32 orderId,uint64 deadline) o) view returns (bytes32)",
  "function payOrder((address merchant,uint256 amount,bytes32 orderId,uint64 deadline) o, bytes merchantSig, (address from,uint256 validAfter,uint256 validBefore,uint8 v,bytes32 r,bytes32 s) a) returns (bytes32)",
  "event PaymentSettled(bytes32 indexed paymentId, bytes32 indexed orderId, address indexed merchant, address payer, address payout, uint256 amount)",
])

const amount = parseUnits(process.argv[2] ?? "1", 6)
const now = BigInt(Math.floor(Date.now() / 1000))
const order = {
  merchant: MERCHANT,
  amount,
  orderId: keccak256(toHex(`chai-shop/order/${Date.now()}`)),
  deadline: now + 15n * 60n,
}

const bal = async (a) => formatUnits(await pub.readContract({ address: USDT, abi: erc20, functionName: "balanceOf", args: [a] }), 6)
console.log("customer", customer.address, "USDT", await bal(customer.address), "WBT", formatUnits(await pub.getBalance({ address: customer.address }), 18))
console.log("merchant", MERCHANT, "USDT", await bal(MERCHANT))

// 1. merchant backend signs the order
const merchantSig = await orderSigner.signTypedData({
  domain: { name: "WhitePayRouter", version: "1", chainId: 1874, verifyingContract: ROUTER },
  types: { Order: [
    { name: "merchant", type: "address" }, { name: "amount", type: "uint256" },
    { name: "orderId", type: "bytes32" }, { name: "deadline", type: "uint64" },
  ] },
  primaryType: "Order",
  message: order,
})
const digest = await pub.readContract({ address: ROUTER, abi: routerAbi, functionName: "hashOrder", args: [order] })
console.log("order digest / paymentId", digest)

// 2. customer signs EIP-3009 ReceiveWithAuthorization (to = router, nonce = digest). No gas.
const validAfter = 0n
const validBefore = now + 15n * 60n
const authSig = await customer.signTypedData({
  domain: { name: "Tether USD", version: "1", chainId: 1874, verifyingContract: USDT },
  types: { ReceiveWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
  ] },
  primaryType: "ReceiveWithAuthorization",
  message: { from: customer.address, to: ROUTER, value: amount, validAfter, validBefore, nonce: digest },
})
const { r, s, v, yParity } = parseSignature(authSig)
const auth = { from: customer.address, validAfter, validBefore, v: Number(v ?? BigInt(27 + yParity)), r, s }

// 3. relayer simulates, then submits and pays gas
const { request } = await pub.simulateContract({ account: relayer, address: ROUTER, abi: routerAbi, functionName: "payOrder", args: [order, merchantSig, auth] })
const hash = await relayerWallet.writeContract(request)
console.log("submitted", hash)
const receipt = await pub.waitForTransactionReceipt({ hash })
console.log("status", receipt.status, "gasUsed", receipt.gasUsed.toString(), "(paid by relayer)")
console.log("explorer", `${EXPLORER}/tx/${hash}`)
console.log("customer USDT now", await bal(customer.address), "| merchant USDT now", await bal(MERCHANT))
