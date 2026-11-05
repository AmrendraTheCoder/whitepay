import { NextResponse } from "next/server"

/** JSON response that serialises bigint as decimal strings. */
export const json = (data: unknown, init?: ResponseInit) =>
  new NextResponse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(init?.headers ?? {}) },
  })

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message.split("\n")[0].slice(0, 240) : String(e)
