"use client"
// Button + ButtonLink. One visual API for <button> and <a>, so links that look like buttons stay links
// (middle-click, open in new tab, crawlable) and actions stay buttons.
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Icon, type IconName } from "./Icon"
import { Spinner } from "./Feedback"
import { cx } from "./cx"

export type ButtonVariant = "primary" | "highlight" | "secondary" | "ghost"
export type ButtonSize = "sm" | "md" | "lg"

export type Common = {
  variant?: ButtonVariant
  size?: ButtonSize
  iconLeft?: IconName
  iconRight?: IconName
  fullWidth?: boolean
  children?: ReactNode
}

export type ButtonProps = Common & ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Shows a spinner, keeps the button's width, sets aria-busy and blocks clicks. */
  loading?: boolean
  /** Accessible label while loading (default "Loading"). */
  loadingLabel?: string
}

export const inner = (p: Common) => (
  <>
    {p.iconLeft && <Icon name={p.iconLeft} size={p.size === "lg" ? 20 : 18} />}
    {p.children != null && <span>{p.children}</span>}
    {p.iconRight && <Icon name={p.iconRight} size={p.size === "lg" ? 20 : 18} />}
  </>
)

export function Button({ variant = "primary", size = "md", iconLeft, iconRight, fullWidth, loading, loadingLabel = "Loading", disabled, className, children, onClick, type = "button", ...rest }: ButtonProps) {
  const inert = disabled || loading
  return (
    <button
      type={type}
      className={cx("wp-btn", className)}
      data-variant={variant} data-size={size} data-full={fullWidth || undefined}
      // aria-disabled (not the disabled attribute) keeps the button focusable so screen readers can find it
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      onClick={inert ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {inner({ iconLeft, iconRight, size, children })}
      {loading && <Spinner label={loadingLabel} />}
    </button>
  )
}

export type IconButtonProps = Omit<ButtonProps, "children" | "iconLeft" | "iconRight"> & { icon: IconName; label: string }
/** Icon-only button: `label` is required because there is no visible text. */
export function IconButton({ icon, label, variant = "ghost", className, ...rest }: IconButtonProps) {
  return <Button variant={variant} className={cx("wp-icon-btn", className)} aria-label={label} title={label} {...rest} iconLeft={icon} />
}
