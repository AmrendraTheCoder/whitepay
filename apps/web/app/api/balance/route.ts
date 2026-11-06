import { isAddress, type Address } from "viem"
import { wc, config, cached } from "@whitepay/server"
import { ERC20_ABI } from "@whitepay/shared"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const address = url.searchParams.get("address")
  if (!address || !isAddress(address)) return json({ error: "pass ?address=" }, { status: 400 })
  try {
    // 1 s blocks; several tabs/devices polling the same wallet within 3 s share one pair of RPC calls
    // ?fresh=1 right after a payment: skip the shared 3 s cache so the new balance shows immediately
    const [usdt, wbt] = await cached(`bal:${address.toLowerCase()}`, url.searchParams.has("fresh") ? 0 : 3_000, () => Promise.all([
      wc().pub.readContract({ address: config.usdt, abi: ERC20_ABI, functionName: "balanceOf", args: [address as Address] }),
      wc().pub.getBalance({ address: address as Address }),
    ]))
    return json({ usdt, wbt })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}
