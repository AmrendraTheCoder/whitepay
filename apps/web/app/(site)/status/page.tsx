import type { Metadata } from "next"
import { statusChecks } from "@/lib/site-stats"
import { ROUTER_ADDRESS, REGISTRY_ADDRESS, USDT_ADDRESS, EXPLORER_URL, ENS_WHITEPAY } from "@whitepay/shared"

export const metadata: Metadata = { title: "System status", description: "Live health of the WhitePay network: Whitechain, Arkiv, the gasless relayer and the checkout SDK.", alternates: { canonical: "/status" } }
export const dynamic = "force-dynamic"

export default async function Status() {
  const checks = await statusChecks()
  const worst = checks.some((c) => c.state === "down") ? "down" : checks.some((c) => c.state === "degraded") ? "degraded" : "ok"
  const title = { ok: "All systems operational", degraded: "Partially degraded", down: "Service disruption" }[worst]
  const contracts = [
    ["PaymentRouter", ROUTER_ADDRESS, `${EXPLORER_URL}/address/${ROUTER_ADDRESS}`],
    ["MerchantRegistry", REGISTRY_ADDRESS, `${EXPLORER_URL}/address/${REGISTRY_ADDRESS}`],
    ["USDT (official, Whitechain Sepolia)", USDT_ADDRESS, `${EXPLORER_URL}/address/${USDT_ADDRESS}`],
    ["ENS parent name (Sepolia)", ENS_WHITEPAY.parent, ENS_WHITEPAY.app(ENS_WHITEPAY.parent)],
    ["ENS UserRegistry (ENSv2)", ENS_WHITEPAY.userRegistry, `https://sepolia.etherscan.io/address/${ENS_WHITEPAY.userRegistry}`],
  ]
  return (
    <>
      <section className="s-page-head">
        <div className="s-wrap">
          <div className="s-kicker">Status</div>
          <h1>System status</h1>
          <div className={`s-banner ${worst}`}><span className={`s-dot ${worst}`} />{title}<span style={{ marginLeft: "auto", fontSize: 13, color: "var(--s-muted)", fontWeight: 600 }}>Checked {new Date().toUTCString().slice(17, 25)} UTC · reload to refresh</span></div>
        </div>
      </section>
      <section className="s-wrap">
        <div className="s-card" style={{ paddingTop: 6, paddingBottom: 6 }}>
          {checks.map((c) => (
            <div key={c.name} className="s-status-row"><span className={`s-dot ${c.state}`} /><div><b>{c.name}</b><span>{c.detail}</span></div>{c.ms != null && <em>{c.ms} ms</em>}</div>
          ))}
        </div>
      </section>
      <section className="s-section" id="contracts" style={{ paddingTop: 56 }}>
        <div className="s-wrap">
          <h2 className="s-h2" style={{ fontSize: 30 }}>Contracts and registries</h2>
          <div className="s-card" style={{ paddingTop: 6, paddingBottom: 6 }}>
            {contracts.map(([n, a, u]) => (
              <div key={n} className="s-status-row"><div style={{ minWidth: 0 }}><b>{n}</b><a className="s-mono" href={u} target="_blank" rel="noopener noreferrer" style={{ color: "var(--s-muted)" }}>{a} ↗</a></div></div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
