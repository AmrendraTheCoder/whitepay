"use client"
// "Verify with World ID" button: gets a backend-signed RP context, opens the IDKit widget,
// sends the proof to OUR backend for verification. Cancel / reject / backend denial => onDenied.
import { useRef, useState } from "react"
import { IDKitRequestWidget, proofOfHuman, type IDKitResult } from "@worldcoin/idkit"

type Ctx = { action: string; action_description: string; app_id: `app_${string}`; environment: "staging" | "production"; rp_context: any }

const ERRORS: Record<string, string> = {
  nullifier_replayed: "This World ID has already been used for this (one per person). If it was you, refresh: your verification may already be recorded.",
  max_verifications_reached: "This World ID has reached the limit for this action.",
  user_rejected: "You declined the request in World App.",
  verification_rejected: "World App rejected the verification.",
  credential_unavailable: "Your World ID doesn't have the required credential yet.",
  connection_failed: "Couldn't reach World App. Check your connection and try again.",
}

export function WorldVerify({
  purpose,
  paymentRef,
  signal,
  label,
  verify,
  onVerified,
  onDenied,
  className = "btn btn-primary",
}: {
  /** name = personal WondrPay name, shop = verified merchant, pay = step-up for one large payment */
  purpose: "name" | "shop" | "pay"
  paymentRef?: string
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
      const r = await fetch(`/api/world/context?purpose=${purpose}${paymentRef ? `&ref=${paymentRef}` : ""}`)
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
          action_description={ctx.action_description}
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
            backendError.current ?? ERRORS[String(code)] ?? `World ID error: ${code}`,
          )}
        />
      )}
    </>
  )
}
