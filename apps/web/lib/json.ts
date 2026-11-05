import { NextResponse } from "next/server"

/** JSON response that serialises bigint as decimal strings. */
export const json = (data: unknown, init?: ResponseInit) =>
  new NextResponse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(init?.headers ?? {}) },
  })

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message.split("\n")[0].slice(0, 240) : String(e)

/** CORS for endpoints the checkout button calls from merchants' websites. */
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
}
export const preflight = () => new NextResponse(null, { status: 204, headers: CORS })
