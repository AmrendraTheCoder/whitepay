// Resolve who a payee is: an address, a merchant handle, or an ENS name (*.whitepay.eth).
// Order: ENS (if configured) -> Arkiv merchant directory -> plain address.
import { isAddress, getAddress, type Address } from "viem"
import { getMerchantByAddress, getMerchantByLabel, config } from "@whitepay/server"
import { json, errorMessage } from "@/lib/json"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase()
  if (!q) return json({ error: "pass ?q=" }, { status: 400 })
  try {
    if (isAddress(q)) {
      const address = getAddress(q)
      const m = await getMerchantByAddress(address)
      return json({ address, name: m?.ensName, displayName: m?.displayName, kind: m ? "merchant" : "person", source: m ? "arkiv" : "address" })
    }
    const label = q.endsWith(`.${config.ensParent}`) ? q.slice(0, -(config.ensParent.length + 1)) : q.replace(/\.eth$/, "")

    if (process.env.ENS_USER_REGISTRY) {
      const ens: any = await import("@whitepay/server/ens").catch(() => null)
      const name = q.includes(".") ? q : `${q}.${config.ensParent}`
      const addr: Address | null = ens?.resolveName ? await ens.resolveName(name).catch(() => null) : null
      if (addr) {
        const texts = ens.getTexts ? await ens.getTexts(name, ["display", "kind", "verified"]).catch(() => ({})) : {}
        return json({ address: addr, name, displayName: texts.display, kind: texts.kind ?? "person", source: "ens" })
      }
    }

    const m = await getMerchantByLabel(label)
    if (m) return json({ address: m.address, name: m.ensName, displayName: m.displayName, kind: "merchant", source: "arkiv" })
    return json({ error: `No WhitePay user called ${q}` }, { status: 404 })
  } catch (e) {
    return json({ error: errorMessage(e) }, { status: 502 })
  }
}
