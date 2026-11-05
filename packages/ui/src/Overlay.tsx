"use client"
// Drawer + Dialog on the native <dialog> element (showModal): focus trap, Esc to close, inert page behind,
// top-layer stacking and focus return to the opener all come from the browser. We add: controlled `open`,
// click-outside to close, scroll lock, labelled heading, and an optional footer slot.
import { useEffect, useId, useRef, type ReactNode } from "react"
import { IconButton } from "./Button"
import { cx } from "./cx"

type Base = {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Close when the backdrop is clicked (default true). Turn off for flows that must not be lost. */
  dismissible?: boolean
  className?: string
  /** Render with a different theme than the page (e.g. a dark inspector on a light store). */
  theme?: "ink" | "chai"
}

function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
    const html = document.documentElement
    if (open) html.style.overflow = "hidden"
    return () => { html.style.overflow = "" }
  }, [open])
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onCancel = (e: Event) => { e.preventDefault(); onClose() } // Esc: let React own the state
    d.addEventListener("cancel", onCancel)
    return () => d.removeEventListener("cancel", onCancel)
  }, [onClose])
  return ref
}

function Shell({ kind, side, open, onClose, title, description, children, footer, dismissible = true, className, theme }: Base & { kind: "drawer" | "dialog"; side?: "left" | "right" }) {
  const ref = useModal(open, onClose)
  const titleId = useId(), descId = useId()
  return (
    <dialog
      ref={ref}
      className={cx("wp-overlay", kind === "drawer" ? "wp-drawer" : "wp-dialog", className)}
      data-side={side}
      data-theme={theme}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClick={(e) => { if (dismissible && e.target === e.currentTarget) onClose() }}
    >
      {open && (
        <>
          <div className="wp-overlay-head">
            <div className="wp-stack" data-gap="1">
              <h2 id={titleId}>{title}</h2>
              {description && <p id={descId} className="wp-overlay-desc">{description}</p>}
            </div>
            <IconButton icon="close" label="Close" onClick={onClose} />
          </div>
          <div className="wp-overlay-body">{children}</div>
          {footer && <div className="wp-overlay-foot">{footer}</div>}
        </>
      )}
    </dialog>
  )
}

export type DrawerProps = Base & { side?: "left" | "right" }
/** Side sheet for carts, filters and inspectors. */
export const Drawer = ({ side = "right", ...p }: DrawerProps) => <Shell kind="drawer" side={side} {...p} />

export type DialogProps = Base
/** Centered modal for confirmations and results. */
export const Dialog = (p: DialogProps) => <Shell kind="dialog" {...p} />
