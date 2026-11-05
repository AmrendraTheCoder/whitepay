"use client"
// Tabs (WAI-ARIA tabs pattern): roving tabindex, Arrow/Home/End keys, panels linked by aria-controls.
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"

export type TabItem = { id: string; label: ReactNode; badge?: ReactNode; content: ReactNode }
export type TabsProps = { items: TabItem[]; defaultTab?: string; /** accessible name of the tab list */ label: string; onChange?: (id: string) => void }

export function Tabs({ items, defaultTab, label, onChange }: TabsProps) {
  const [active, setActive] = useState(defaultTab ?? items[0]?.id)
  const base = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const select = (i: number) => { const t = items[i]; setActive(t.id); onChange?.(t.id); refs.current[i]?.focus() }
  const onKey = (e: KeyboardEvent, i: number) => {
    const last = items.length - 1
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1
    if (next >= 0) { e.preventDefault(); select(next) }
  }
  return (
    <div className="wp-tabs">
      <div role="tablist" aria-label={label} className="wp-tablist">
        {items.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[i] = el }} role="tab" type="button" id={`${base}-t-${t.id}`} aria-controls={`${base}-p-${t.id}`}
            aria-selected={active === t.id} tabIndex={active === t.id ? 0 : -1} onClick={() => select(i)} onKeyDown={(e) => onKey(e, i)}>
            {t.label}{t.badge != null && <span className="wp-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      {items.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-p-${t.id}`} aria-labelledby={`${base}-t-${t.id}`} hidden={active !== t.id} tabIndex={0} className="wp-tabpanel">{t.content}</div>
      ))}
    </div>
  )
}
