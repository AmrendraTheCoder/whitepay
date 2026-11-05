// Accordion built on native <details>/<summary>: keyboard, screen-reader and no-JS support for free,
// and find-in-page opens the matching item.
import type { ReactNode } from "react"
import { Icon } from "./Icon"

export type AccordionItem = { id: string; title: ReactNode; content: ReactNode }
export type AccordionProps = {
  items: AccordionItem[]
  /** ids open on first render */
  defaultOpen?: string[]
  /** shared name makes it exclusive (one open at a time) in supporting browsers */
  exclusive?: boolean
  name?: string
}
export function Accordion({ items, defaultOpen = [], exclusive, name = "wp-accordion" }: AccordionProps) {
  return (
    <div className="wp-accordion">
      {items.map((it) => (
        <details key={it.id} id={it.id} open={defaultOpen.includes(it.id) || undefined} {...(exclusive ? { name } : {})}>
          <summary>{it.title}<Icon name="plus" /></summary>
          <div className="wp-accordion-body">{it.content}</div>
        </details>
      ))}
    </div>
  )
}
