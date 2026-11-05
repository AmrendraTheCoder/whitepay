"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ButtonLink, type ButtonSize } from "@whitepay/ui"

/** Primary CTA. Says "Open your wallet" when this browser already has one. */
export function OpenApp({ size = "md", fullWidth, label = "Open app" }: { size?: ButtonSize; fullWidth?: boolean; label?: string }) {
  const [has, setHas] = useState(false)
  useEffect(() => {
    try { setHas((JSON.parse(localStorage.getItem("whitepay.wallets.v2") ?? "null")?.list?.length ?? 0) > 0) } catch {}
  }, [])
  return <ButtonLink href="/app" variant="highlight" size={size} fullWidth={fullWidth}>{has ? "Open your wallet" : label}</ButtonLink>
}

/** Nav links that mark the current page for assistive tech (aria-current). */
export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname()
  return <>{items.map((n) => <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>{n.label}</Link>)}</>
}

/** Installed PWA launches (old start_url "/") go straight into the wallet. */
export function StandaloneRedirect() {
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone
    if (standalone) location.replace("/app")
  }, [])
  return null
}
