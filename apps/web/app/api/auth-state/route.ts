// Did a signed EIP-3009 authorization land on-chain? The app asks this when the network dropped after
// it handed a signature to the relayer, so it can say "paid" or "not charged" instead of guessing.
// Read-only: USDT.authorizationState(from, nonce) plus the AuthorizationUsed log for the tx link.
import { isAddress, isHex, parseAbi, parseAbiItem, type Address, type Hex } from "viem"
import { wc, cached } from "@whitepay/server"
import { USDT_ADDRESS, EXPLORER_URL } from "@whitepay/shared"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

const ABI = parseAbi(["function authorizationState(address authorizer, bytes32 nonce) view returns (bool)"])
const USED = parseAbiItem("event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)")

export async function GET(req: Request) {
  const u = new URL(req.url)
  const from = u.searchParams.get("from") ?? ""
  const nonce = u.searchParams.get("nonce") ?? ""
  if (!isAddress(from) || !isHex(nonce) || nonce.length !== 66) return json({ error: "bad query" }, { status: 400 })
  try {
    const body = await cached(`auth:${from.toLowerCase()}:${nonce.toLowerCase()}`, 1_500, () => check(from as Address, nonce as Hex))
    return json(body)
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}

async function check(from: Address, nonce: Hex) {
  const { pub } = wc()
  const used = await pub.readContract({ address: USDT_ADDRESS, abi: ABI, functionName: "authorizationState", args: [from, nonce] })
  if (!used) return { used: false }
  let explorer: string | undefined
  try {
    const head = await pub.getBlockNumber()
    const logs = await pub.getLogs({ address: USDT_ADDRESS, event: USED, args: { authorizer: from, nonce }, fromBlock: head > 2000n ? head - 2000n : 0n, toBlock: head })
    if (logs[0]) explorer = `${EXPLORER_URL}/tx/${logs[0].transactionHash}`
  } catch {}
  return { used: true, explorer }
}
