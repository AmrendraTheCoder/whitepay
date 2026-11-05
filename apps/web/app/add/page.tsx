"use client"
import { Onboard } from "../onboard"

/** Add another wallet to this device (new device wallet, import, or a browser wallet). */
export default function AddWallet() {
  const business = typeof location !== "undefined" && new URLSearchParams(location.search).get("type") === "business"
  return <Onboard adding business={business} onDone={() => { location.href = business ? "/merchant" : "/" }} />
}
