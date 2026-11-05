import type { NextConfig } from "next"
import path from "node:path"
import { existsSync } from "node:fs"

const rootEnv = path.resolve(__dirname, "../../.env")
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

const nextConfig: NextConfig = {
  transpilePackages: ["@whitepay/checkout", "@whitepay/shared"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
}
export default nextConfig
