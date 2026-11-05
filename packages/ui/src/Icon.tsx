// Icon: one stroke style (1.75px on a 24px grid) for every product surface. Replaces emoji glyphs,
// which render differently per OS and read as placeholder art.
import type { SVGProps } from "react"

const PATHS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowUpRight: "M7 17L17 7M8 7h9v9",
  chevronDown: "M6 9l6 6 6-6",
  menu: "M4 7h16M4 12h16M4 17h16",
  scan: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8",
  fingerprint: "M12 11v3c0 2-.5 4-1.5 6M8.5 8.5A5 5 0 0 1 17 12v1.5M7 12c0 3-.5 5-1.5 7M14.5 15.5c0 1.6-.3 3-.8 4.5M5 9a8 8 0 0 1 14.5-1.5M20 12v1",
  check2: "M20 6L9 17l-5-5",
  bolt: "M13 3L5 13h6l-1 8 8-10h-6z",
  at: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z M9 12l2 2 4-4",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01",
  store: "M4 9l1.5-5h13L20 9M4 9h16v11H4zM4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 20v-5h4v5",
  code: "M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
  key: "M15 7a4 4 0 1 1-4 4.9L4 19v2h3l1-1v-2h2l1.3-1.3A4 4 0 0 1 15 7zM16 9h.01",
  bag: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2v2h-2zM18 14h2v2h-2z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  github: "M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
} as const

export type IconName = keyof typeof PATHS
export const ICONS = Object.keys(PATHS) as IconName[]

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName
  /** px, default 20 */
  size?: number
  /** Accessible name. Omit for decorative icons (the default): they are hidden from assistive tech. */
  label?: string
}

export function Icon({ name, size = 20, label, className, ...rest }: IconProps) {
  const filled = name === "star"
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} className={["wp-icon", className].filter(Boolean).join(" ")}
      fill={filled ? "currentColor" : "none"} stroke={filled ? "none" : "currentColor"} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true, focusable: false })}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
