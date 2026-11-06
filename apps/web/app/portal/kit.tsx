"use client"
// Small, reusable building blocks for WondrPay Business screens (portal, docs). All use the app's tokens.
//  <Steps>     progress through a setup flow; state per step, announced to screen readers
//  <Field>     labelled text input with a hint wired through aria-describedby
//  <CopyField> read-only value + Copy button (clipboard with a select-text fallback, live "Copied" feedback)
//  <CodeBlock> labelled, scrollable code with a Copy button
import { useEffect, useId, useRef, useState } from "react"
import type { PrivateKeyAccount } from "viem/accounts"
import { Icon } from "../ui"
import { UnlockSheet } from "../components"

export type StepState = "todo" | "current" | "done"

export function Steps({ items }: { items: { title: string; state: StepState }[] }) {
  return (
    <ol className="pt-steps" aria-label="Setup progress">
      {items.map((s, i) => (
        <li key={s.title} className={s.state} aria-current={s.state === "current" ? "step" : undefined}>
          <span className="pt-steps-n" aria-hidden>{s.state === "done" ? Icon.check(14) : i + 1}</span>
          <span>{s.title}<span className="sr-only">{s.state === "done" ? " (done)" : s.state === "current" ? " (next)" : ""}</span></span>
        </li>
      ))}
    </ol>
  )
}

export function Field(p: {
  id: string; label: string; value: string; onChange: (v: string) => void
  hint?: string; placeholder?: string; maxLength?: number; type?: "text" | "url"
}) {
  const hintId = `${p.id}-hint`
  return (
    <div className="pt-field">
      <label htmlFor={p.id}>{p.label}</label>
      <input id={p.id} name={p.id} type={p.type ?? "text"} value={p.value} placeholder={p.placeholder} maxLength={p.maxLength}
        autoComplete="off" spellCheck={false} aria-describedby={p.hint ? hintId : undefined} onChange={(e) => p.onChange(e.target.value)} />
      {p.hint && <span id={hintId} className="pt-hint">{p.hint}</span>}
    </div>
  )
}

/** Clipboard write inside the click; if the browser refuses, select the text so Cmd/Ctrl+C works. */
function useCopy(target: React.RefObject<HTMLElement | null>) {
  const [copied, setCopied] = useState<"" | "ok" | "select">("")
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(""), 1800); return () => clearTimeout(t) }, [copied])
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied("ok") } catch {
      const el = target.current
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r) }
      setCopied("select")
    }
  }
  return { copied, copy }
}

export function CopyField({ label, value, mono, autoSelect }: { label: string; value: string; mono?: boolean; autoSelect?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const id = useId()
  const { copied, copy } = useCopy(ref)
  useEffect(() => {
    if (!autoSelect || !ref.current) return
    const r = document.createRange(); r.selectNodeContents(ref.current); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r)
  }, [autoSelect])
  return (
    <div className="pt-copy">
      <span className="pt-copy-l" id={id}>{label}</span>
      <div className="pt-copy-row">
        <code ref={ref} className={mono ? "mono" : undefined} aria-labelledby={id} tabIndex={0}>{value}</code>
        <button type="button" className="pt-copy-btn" onClick={() => copy(value)} aria-label={`Copy ${label.toLowerCase()}`}>
          {copied === "ok" ? Icon.check(15) : <span aria-hidden>⧉</span>}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{copied === "ok" ? `${label} copied` : copied === "select" ? "Selected. Press Ctrl or Cmd + C to copy." : ""}</span>
    </div>
  )
}

export function CodeBlock({ label, code }: { label: string; code: string }) {
  const ref = useRef<HTMLElement>(null)
  const { copied, copy } = useCopy(ref)
  return (
    <figure className="pt-code">
      <figcaption>
        <span>{label}</span>
        <button type="button" className="pt-copy-btn" onClick={() => copy(code)} aria-label={`Copy ${label}`}>
          {copied === "ok" ? <>{Icon.check(14)} Copied</> : "Copy"}
        </button>
      </figcaption>
      <pre tabIndex={0} aria-label={label}><code ref={ref}>{code}</code></pre>
      <span className="sr-only" aria-live="polite">{copied === "ok" ? "Code copied" : copied === "select" ? "Selected. Press Ctrl or Cmd + C to copy." : ""}</span>
    </figure>
  )
}

/** Ask the shop wallet to sign something: renders the PIN / fingerprint / browser-wallet sheet when needed.
 *  const { ask, sheet } = useWalletAction();  ask("Approve …", "sub", async (acct) => { … });  return <>{sheet}</> */
export function useWalletAction() {
  const [pending, setPending] = useState<{ title: string; subtitle?: string; run: (a: PrivateKeyAccount) => Promise<void> } | null>(null)
  const ask = (title: string, subtitle: string | undefined, run: (a: PrivateKeyAccount) => Promise<void>) => setPending({ title, subtitle, run })
  const sheet = pending ? (
    <UnlockSheet title={pending.title} subtitle={pending.subtitle}
      onUnlocked={(a) => { const p = pending; setPending(null); void p.run(a) }} onCancel={() => setPending(null)} />
  ) : null
  return { ask, sheet, asking: !!pending }
}
