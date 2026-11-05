// Page structure: Container, Section, SectionHeader, Grid, Cluster. Spacing comes only from tokens,
// so every page shares one vertical rhythm.
import type { CSSProperties, HTMLAttributes, ReactNode } from "react"
import { cx } from "./cx"

export const Container = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cx("wp-container", className)} {...p} />

export type SectionProps = HTMLAttributes<HTMLElement> & { tone?: "default" | "muted"; size?: "sm" | "md"; /** accessible name when the section has no visible heading */ label?: string }
export function Section({ tone = "default", size = "md", label, className, children, ...rest }: SectionProps) {
  return <section className={cx("wp-section", className)} data-tone={tone} data-size={size} aria-label={label} {...rest}><div className="wp-container">{children}</div></section>
}

export type SectionHeaderProps = {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** h1 for page heads, h2 for sections (default) */
  level?: 1 | 2
  align?: "start" | "center"
  /** put the description on the right on wide screens */
  split?: boolean
  actions?: ReactNode
  id?: string
}
export function SectionHeader({ eyebrow, title, description, level = 2, align = "start", split, actions, id }: SectionHeaderProps) {
  const H = level === 1 ? "h1" : "h2"
  const text = <><H id={id} className={level === 1 ? "wp-title-1" : "wp-title-2"}>{title}</H></>
  return (
    <header className="wp-section-header" data-align={align} data-split={split || undefined}>
      {split ? <div className="wp-stack" data-gap="3">{eyebrow && <span className="wp-eyebrow">{eyebrow}</span>}{text}</div> : <>{eyebrow && <span className="wp-eyebrow">{eyebrow}</span>}{text}</>}
      {description && <p className="wp-lead">{description}</p>}
      {actions && <div className="wp-cluster">{actions}</div>}
    </header>
  )
}

export function Grid({ cols = 3, as: Tag = "div", className, style, ...rest }: HTMLAttributes<HTMLElement> & { cols?: 2 | 3 | 4; as?: "div" | "ul" | "ol" }) {
  return <Tag className={cx("wp-grid", className)} style={{ ...style, ["--cols" as string]: cols } as CSSProperties} {...rest} />
}
export const Cluster = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cx("wp-cluster", className)} {...p} />
