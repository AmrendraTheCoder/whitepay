// Content primitives: Badge, Card, Stat, CheckList, CodeBlock.
import type { HTMLAttributes, ReactNode } from "react"
import { Icon, type IconName } from "./Icon"
import { cx } from "./cx"

export type BadgeTone = "neutral" | "highlight" | "success" | "warning" | "danger"
export function Badge({ tone = "neutral", dot, children, className }: { tone?: BadgeTone; dot?: boolean; children: ReactNode; className?: string }) {
  return <span className={cx("wp-badge", className)} data-tone={tone}>{dot && <span className="wp-dot" aria-hidden />}{children}</span>
}

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "article" | "li" | "section"
  padding?: "none" | "sm" | "md"
  /** Hover lift for cards that are links or contain the primary action. */
  interactive?: boolean
  icon?: IconName
  title?: ReactNode
  /** Heading level for `title` (default 3) so cards slot into any document outline. */
  level?: 2 | 3 | 4
}
export function Card({ as: Tag = "div", padding = "md", interactive, icon, title, level = 3, className, children, ...rest }: CardProps) {
  const H = `h${level}` as "h3"
  return (
    <Tag className={cx("wp-card", className)} data-padding={padding} data-interactive={interactive || undefined} {...rest}>
      {icon && <span className="wp-card-icon"><Icon name={icon} /></span>}
      {title && <H className="wp-title-3">{title}</H>}
      {children}
    </Tag>
  )
}

export type StatProps = {
  label: ReactNode
  /** undefined/null renders "—" with an accessible "unavailable" note (e.g. a chain RPC timed out). */
  value?: ReactNode | null
  loading?: boolean
  /** Pulsing dot: the value is live data. */
  live?: boolean
}
export function Stat({ label, value, loading, live }: StatProps) {
  return (
    <div className="wp-stat" aria-busy={loading || undefined}>
      <span className="wp-stat-value">
        {loading ? <span className="wp-skeleton" style={{ width: 96, height: 32 }} aria-hidden /> : value ?? <><span aria-hidden>—</span><span className="wp-visually-hidden">unavailable</span></>}
      </span>
      <span className="wp-stat-label" data-live={live || undefined}>{live && <span className="wp-dot" aria-hidden />}{label}</span>
    </div>
  )
}
export const Stats = ({ children, label }: { children: ReactNode; label?: string }) => <div className="wp-stats" role="group" aria-label={label}>{children}</div>

export function CheckList({ items }: { items: ReactNode[] }) {
  return <ul className="wp-checklist">{items.map((it, i) => <li key={i}><Icon name="check" size={18} /><span>{it}</span></li>)}</ul>
}

/** Read-only code sample. `label` names it for screen readers and copy UIs. */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return <pre className="wp-code" aria-label={label} tabIndex={0}><code>{code}</code></pre>
}
