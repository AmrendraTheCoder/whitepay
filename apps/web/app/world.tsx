"use client"
// "Verify with World ID" button: gets a backend-signed RP context, opens the IDKit widget,
// sends the proof to OUR backend for verification. Cancel / reject / backend denial => onDenied.
import { useRef, useState } from "react"
import { IDKitRequestWidget, proofOfHuman, type IDKitResult } from "@worldcoin/idkit"

type Ctx = { action: string; app_id: `app_${string}`; environment: "staging" | "production"; rp_context: any }

export function WorldVerify({
  action,
  signal,
  label,
  verify,
  onVerified,
  onDenied,
  className = "btn btn-primary",
}: {
  action: "ens-claim" | "step-up"
  signal: string
  label: string
  /** POST the proof to the backend; resolve with data on success, throw on denial */
  verify: (result: IDKitResult) => Promise<any>
  onVerified: (data: any) => void
  onDenied: (reason: string) => void
  className?: string
}) {
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // refs, not state: the widget calls onSuccess/onError right after handleVerify, before a re-render
  const backendData = useRef<any>(null)
  const backendError = useRef<string | null>(null)

  const start = async () => {
    setBusy(true)
    try {
      const r = await fetch(`/api/world/context?action=${action}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      backendData.current = null
      backendError.current = null
      setCtx(d)
      setOpen(true)
    } catch (e) {
      onDenied((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className={className} onClick={start} disabled={busy}>
        {busy ? <span className="spinner" /> : <span aria-hidden>◎</span>} {label}
      </button>
      {ctx && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o && !backendData.current) onDenied(backendError.current ?? "World ID verification was cancelled")
          }}
          app_id={ctx.app_id}
          action={ctx.action}
          rp_context={ctx.rp_context}
          environment={ctx.environment}
          allow_legacy_proofs={false}
          preset={proofOfHuman({ signal })}
          handleVerify={async (result) => {
            // throws => widget shows failure; backend is the only judge of validity
            try {
              backendData.current = await verify(result)
            } catch (e) {
              backendError.current = (e as Error).message
              throw e
            }
          }}
          onSuccess={() => onVerified(backendData.current)}
          onError={(code) => onDenied(
            backendError.current ?? (code === "user_rejected" ? "You declined the World ID request" : `World ID error: ${code}`),
          )}
        />
      )}
    </>
  )
}
