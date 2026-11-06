import type { Metadata } from "next"
import { Badge, Section, SectionHeader, type BadgeTone } from "@whitepay/ui"
import { statusChecks } from "@/lib/site-stats"
import { ROUTER_ADDRESS, REGISTRY_ADDRESS, USDT_ADDRESS, EXPLORER_URL, ENS_WHITEPAY } from "@whitepay/shared"

export const metadata: Metadata = { title: "System status", description: "Live health of the WondrPay network: Whitechain, Arkiv, the gasless relayer and the checkout SDK.", alternates: { canonical: "/status" } }
export const dynamic = "force-dynamic"

const TONE: Record<string, BadgeTone> = { ok: "success", degraded: "warning", down: "danger" }
const WORD: Record<string, string> = { ok: "Operational", degraded: "Degraded", down: "Down" }

export default async function Status() {
  const checks = await statusChecks()
  const worst = checks.some((c) => c.state === "down") ? "down" : checks.some((c) => c.state === "degraded") ? "degraded" : "ok"
  const now = new Date()
  const contracts = [
    ["PaymentRouter", ROUTER_ADDRESS, `${EXPLORER_URL}/address/${ROUTER_ADDRESS}`],
    ["MerchantRegistry", REGISTRY_ADDRESS, `${EXPLORER_URL}/address/${REGISTRY_ADDRESS}`],
    ["USDT (Whitechain Sepolia)", USDT_ADDRESS, `${EXPLORER_URL}/address/${USDT_ADDRESS}`],
    ["ENS parent name (Sepolia)", ENS_WHITEPAY.parent, ENS_WHITEPAY.app(ENS_WHITEPAY.parent)],
    ["ENS UserRegistry (ENSv2)", ENS_WHITEPAY.userRegistry, `https://sepolia.etherscan.io/address/${ENS_WHITEPAY.userRegistry}`],
  ]
  return (
    <>
      <Section>
        <SectionHeader level={1} eyebrow="Status" title="System status" />
        <div className="status-banner" role="status">
          <Badge tone={TONE[worst]} dot>{worst === "ok" ? "All systems operational" : worst === "degraded" ? "Partially degraded" : "Service disruption"}</Badge>
          <time dateTime={now.toISOString()}>Checked {now.toUTCString().slice(17, 25)} UTC · reload to refresh</time>
        </div>
        <ul className="status-list status-gap" aria-label="Components">
          {checks.map((c) => (
            <li key={c.name}>
              <Badge tone={TONE[c.state]} dot>{WORD[c.state]}</Badge>
              <div><b>{c.name}</b><span>{c.detail}</span></div>
              {c.ms != null && <span className="ms">{c.ms} ms</span>}
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="muted" id="contracts" aria-labelledby="contracts-title">
        <SectionHeader id="contracts-title" title="Contracts and registries" />
        <ul className="status-list" aria-label="Contracts">
          {contracts.map(([name, addr, url]) => (
            <li key={name} className="status-wide"><div><b>{name}</b><a className="site-mono" href={url} target="_blank" rel="noopener noreferrer">{addr}<span className="wp-visually-hidden"> (opens in a new tab)</span></a></div></li>
          ))}
        </ul>
      </Section>
    </>
  )
}
