// QR image for the checkout button (so merchants' pages need no QR library).
import QRCode from "qrcode"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const data = new URL(req.url).searchParams.get("data") ?? ""
  if (!/^https:\/\/|^http:\/\/localhost/.test(data) || data.length > 512) return new Response("bad data", { status: 400 })
  const png = await QRCode.toBuffer(data, { margin: 1, width: 480, errorCorrectionLevel: "M" })
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=600", "access-control-allow-origin": "*" } })
}
