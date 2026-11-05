import type { NextConfig } from "next"
import path from "node:path"
import { existsSync } from "node:fs"

// Load the monorepo root .env (server-only secrets live there, never in NEXT_PUBLIC_*).
const rootEnv = path.resolve(__dirname, "../../.env")
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

const nextConfig: NextConfig = {
  transpilePackages: ["@whitepay/shared", "@whitepay/server"],
  serverExternalPackages: ["@arkiv-network/sdk"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  // dev only: allow a second origin (separate test wallet) and phones on the LAN
  allowedDevOrigins: ["127.0.0.1", "*.local", "192.168.*.*", "10.*.*.*"],
}
export default nextConfig
