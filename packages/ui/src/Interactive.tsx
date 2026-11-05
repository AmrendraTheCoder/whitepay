"use client"
// Pointer-driven polish, dependency-free (ported from the Magic UI magic-card / number-ticker patterns,
// minus Tailwind/motion): pointer position goes into CSS variables, so React never re-renders on mousemove.
// Every effect is off for touch/coarse pointers and prefers-reduced-motion, and degrades to static content.
import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react"
import { cx } from "./cx"

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
const finePointer = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches

/** Wrap anything with a border-and-glow spotlight that follows the cursor. */
export function Spotlight({ className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !finePointer()) return
    let raf = 0
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        el.style.setProperty("--mx", `${e.clientX - r.left}px`)
        el.style.setProperty("--my", `${e.clientY - r.top}px`)
      })
    }
    el.addEventListener("pointermove", move)
    return () => { el.removeEventListener("pointermove", move); cancelAnimationFrame(raf) }
  }, [])
  return <div ref={ref} className={cx("wp-spotlight", className)} {...rest}>{children}</div>
}

/** 3D tilt toward the cursor with a moving glare. `max` = degrees. */
export function Tilt({ max = 8, className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { max?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !finePointer() || reducedMotion()) return
    let raf = 0
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5
        el.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`)
        el.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`)
        el.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`)
        el.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`)
      })
    }
    const leave = () => { cancelAnimationFrame(raf); el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg") }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerleave", leave)
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); cancelAnimationFrame(raf) }
  }, [max])
  return <div ref={ref} className={cx("wp-tilt", className)} {...rest}><div className="wp-tilt-inner">{children}</div></div>
}

export type NumberTickerProps = { /** number or bigint (coerced; values above 2^53 lose precision only in the animation) */ value: number | bigint; decimals?: number; durationMs?: number; className?: string; locale?: string }
/**
 * Counts up to `value` the first time it scrolls into view. Server-renders the FINAL value, so there is no layout
 * shift, crawlers and no-JS readers see the real number, and screen readers announce only the final value.
 */
export function NumberTicker({ value: raw, decimals = 0, durationMs = 1400, className, locale = "en-US" }: NumberTickerProps) {
  const value = Number(raw)
  const ref = useRef<HTMLSpanElement>(null)
  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion() || !("IntersectionObserver" in window)) return
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now(), from = value * 0.92 // roll the last digits, not from zero: big numbers stay readable
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / durationMs)
        const eased = 1 - Math.pow(1 - p, 4)
        el.textContent = fmt(from + (value - from) * eased)
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, { threshold: 0.6 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [value, durationMs]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <span ref={ref} className={cx("wp-ticker", className)} aria-hidden>{fmt(value)}</span>
      <span className="wp-visually-hidden">{fmt(value)}</span>
    </>
  )
}
