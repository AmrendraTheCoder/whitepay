import type { NextConfig } from "next"
import path from "node:path"
import { existsSync } from "node:fs"

const rootEnv = path.resolve(__dirname, "../../.env")
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

const nextConfig: NextConfig = {
  transpilePackages: ["@whitepay/ui", "@whitepay/checkout", "@whitepay/shared"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  poweredByHeader: false,
  async headers() {
    // the static plain-HTML demo can't carry a per-request nonce, so it gets a host allow-list CSP instead
    const WP = process.env.NEXT_PUBLIC_WHITEPAY_URL ?? "https://wondrpay.vercel.app"
    const csp = `default-src 'self'; script-src 'self' ${WP}; connect-src 'self' ${WP}; img-src 'self' data: ${WP}; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`
    return [{ source: "/plain.html", headers: [
      { key: "content-security-policy", value: csp },
      { key: "x-frame-options", value: "DENY" }, { key: "x-content-type-options", value: "nosniff" },
      { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
      { key: "strict-transport-security", value: "max-age=63072000; includeSubDomains; preload" },
    ] }]
  },
}
export default nextConfig
