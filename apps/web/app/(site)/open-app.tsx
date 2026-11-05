"use client"
// "Open app" that knows whether this device already has a wallet; installed-app launches skip the site.
import { useEffect, useState } from "react"

export function OpenApp({ className, big }: { className?: string; big?: boolean }) {
  const [has, setHas] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("whitepay.wallets.v2")
      setHas(!!raw && (JSON.parse(raw)?.list?.length ?? 0) > 0)
    } catch {}
  }, [])
  return <a href="/app" className={className}>{has ? "Open your wallet" : big ? "Get started free" : "Open app"}</a>
}

/** Installed PWA (old start_url was "/"): go straight into the wallet. */
export function StandaloneRedirect() {
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone
    if (standalone) location.replace("/app")
  }, [])
  return null
}
