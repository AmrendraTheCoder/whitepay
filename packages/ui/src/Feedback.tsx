// Loading and status primitives.
import type { CSSProperties } from "react"
import { cx } from "./cx"

/** Inline spinner. Announces `label` to screen readers. */
export function Spinner({ label = "Loading", className }: { label?: string; className?: string }) {
  return <span className={cx("wp-spinner", className)} role="status" aria-label={label} />
}

export type SkeletonProps = { width?: number | string; height?: number | string; radius?: "sm" | "md" | "lg" | "pill"; lines?: number; className?: string }
/** Placeholder with the shape of the content that is loading. Hidden from assistive tech: pair it with aria-busy on the region. */
export function Skeleton({ width = "100%", height = 16, radius = "sm", lines = 1, className }: SkeletonProps) {
  const style: CSSProperties = { width, height, borderRadius: `var(--radius-${radius})` }
  if (lines === 1) return <span className={cx("wp-skeleton", className)} style={style} aria-hidden />
  return (
    <span className="wp-stack" data-gap="2" aria-hidden>
      {Array.from({ length: lines }, (_, i) => <span key={i} className={cx("wp-skeleton", className)} style={{ ...style, width: i === lines - 1 ? "60%" : width }} />)}
    </span>
  )
}

export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="wp-visually-hidden">{children}</span>
}
