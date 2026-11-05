"use client"
// Per-device UI preferences: theme and balance privacy. Stored in localStorage (conveniences only).
import { useEffect, useState } from "react"

export type Theme = "system" | "light" | "dark"
const THEME = "whitepay.theme"
const HIDE = "whitepay.hideBalance"

const safeGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} }

export function applyTheme(t: Theme) {
  const el = document.documentElement
  if (t === "system") el.removeAttribute("data-theme")
  else el.setAttribute("data-theme", t)
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system")
  useEffect(() => { setThemeState((safeGet(THEME) as Theme) || "system") }, [])
  const setTheme = (t: Theme) => { safeSet(THEME, t); applyTheme(t); setThemeState(t) }
  return { theme, setTheme }
}

const listeners = new Set<(v: boolean) => void>()
export function useHideBalance() {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    setHidden(safeGet(HIDE) === "1")
    listeners.add(setHidden)
    return () => { listeners.delete(setHidden) }
  }, [])
  const toggle = () => {
    const next = safeGet(HIDE) !== "1"
    safeSet(HIDE, next ? "1" : "0")
    listeners.forEach((l) => l(next))
  }
  return { hidden, toggle }
}

