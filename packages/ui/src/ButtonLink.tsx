// ButtonLink: a real <a> styled as a button (middle-click, new tab, crawlable). Server-safe: ships no JS.
import type { AnchorHTMLAttributes, ReactNode } from "react"
import { Icon, type IconName } from "./Icon"
import { cx } from "./cx"
import type { ButtonVariant, ButtonSize } from "./Button"

const inner = (p: Common) => (
  <>
    {p.iconLeft && <Icon name={p.iconLeft} size={p.size === "lg" ? 20 : 18} />}
    {p.children != null && <span>{p.children}</span>}
    {p.iconRight && <Icon name={p.iconRight} size={p.size === "lg" ? 20 : 18} />}
  </>
)

type Common = { variant?: ButtonVariant; size?: ButtonSize; iconLeft?: IconName; iconRight?: IconName; fullWidth?: boolean; children?: ReactNode }

export type ButtonLinkProps = Common & AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  /** Open in a new tab with rel=noopener noreferrer. Defaults to true for http(s) links to other sites. */
  external?: boolean
}

export function ButtonLink({ variant = "primary", size = "md", iconLeft, iconRight, fullWidth, external, href, className, children, ...rest }: ButtonLinkProps) {
  const ext = external ?? /^https?:\/\//.test(href)
  return (
    <a
      href={href} className={cx("wp-btn", className)} data-variant={variant} data-size={size} data-full={fullWidth || undefined}
      {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {inner({ iconLeft, iconRight: iconRight ?? (ext ? "arrowUpRight" : undefined), size, children })}
      {ext && <span className="wp-visually-hidden"> (opens in a new tab)</span>}
    </a>
  )
}

