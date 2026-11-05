import type { NextConfig } from "next"
import path from "node:path"
import { existsSync } from "node:fs"

// Load the monorepo root .env (server-only secrets live there, never in NEXT_PUBLIC_*).
const rootEnv = path.resolve(__dirname, "../../.env")
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

const nextConfig: NextConfig = {
  transpilePackages: ["@whitepay/ui", "@whitepay/shared", "@whitepay/server"],
  serverExternalPackages: ["@arkiv-network/sdk"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  // dev only: allow a second origin (separate test wallet) and phones on the LAN
  allowedDevOrigins: ["127.0.0.1", "*.local", "192.168.*.*", "10.*.*.*"],
  poweredByHeader: false,
  async headers() {
    return [
      // the checkout SDK is embedded on merchants' sites
      { source: "/sdk/:path*", headers: [
        { key: "access-control-allow-origin", value: "*" },
        { key: "cross-origin-resource-policy", value: "cross-origin" },
        { key: "x-content-type-options", value: "nosniff" },
        { key: "cache-control", value: "public, max-age=300, must-revalidate" },
      ] },
      // exact versions never change (that is what makes an SRI pin safe): cache them forever
      { source: "/sdk/:version(v\\d+\\.\\d+\\.\\d+)/:file*", headers: [
        { key: "cache-control", value: "public, max-age=31536000, immutable" },
      ] },
    ]
  },
}
export default nextConfig
