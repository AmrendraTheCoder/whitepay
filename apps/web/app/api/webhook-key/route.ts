// Public: the address that signs WondrPay webhooks (merchants pin it in verifyWondrPayWebhook).
import { webhookSignerAddress } from "@whitepay/server"
import { json, CORS } from "@/lib/json"

export const runtime = "nodejs"
export async function GET() {
  return json({ signer: webhookSignerAddress(), scheme: "EIP-191 personal_sign over whitepay-webhook:v1:<timestamp>:<keccak256(body)>", maxAgeSeconds: 300 }, { headers: CORS })
}
