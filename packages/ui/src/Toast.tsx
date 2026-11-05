"use client"
// Toasts: a polite live region in the top layer (popover), so they show above open drawers/dialogs.
// One provider per app; call useToast().show() anywhere below it.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Icon } from "./Icon"

export type ToastInput = { message: ReactNode; tone?: "neutral" | "success"; action?: { label: string; onClick: () => void }; /** ms, default 3500; 0 = sticky */ duration?: number }
type Item = ToastInput & { id: number }

const Ctx = createContext<{ show: (t: ToastInput) => number; dismiss: (id: number) => void } | null>(null)

export function ToastProvider({ children, max = 3 }: { children: ReactNode; max?: number }) {
  const [items, setItems] = useState<Item[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const seq = useRef(0)
  const dismiss = useCallback((id: number) => setItems((x) => x.filter((t) => t.id !== id)), [])
  const show = useCallback((t: ToastInput) => {
    const id = ++seq.current
    setItems((x) => [...x, { ...t, id }].slice(-max))
    if ((t.duration ?? 3500) > 0) setTimeout(() => dismiss(id), t.duration ?? 3500)
    return id
  }, [dismiss, max])

  // keep the region in the top layer while it has toasts; fall back to fixed positioning without Popover API
  useEffect(() => {
    const el = ref.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null
    if (!el) return
    if (!el.showPopover) { el.classList.add("wp-fallback"); return }
    try { items.length ? (el.hidePopover?.(), el.showPopover()) : el.hidePopover?.() } catch {}
  }, [items])

  // stable identity: consumers can put the toast API in effect dependencies without re-running them
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div ref={ref} className="wp-toaster" {...{ popover: "manual" }} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="wp-toast" data-tone={t.tone}>
            {t.tone === "success" && <Icon name="check" size={18} />}
            <span>{t.message}</span>
            {t.action && <button type="button" onClick={() => { t.action!.onClick(); dismiss(t.id) }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const c = useContext(Ctx)
  if (!c) throw new Error("useToast must be used inside <ToastProvider>")
  return c
}
