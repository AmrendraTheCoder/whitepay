"use client"
import { Onboard } from "../onboard"

/** Add another wallet to this device (new device wallet, import, or a browser wallet). */
export default function AddWallet() {
  return <Onboard adding onDone={() => { location.href = "/" }} />
}
