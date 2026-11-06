"use client"
// The rewards claim button. World ID 4 counts each one-time check once per person, so repeat claims use a
// World ID *session*: the first claim sets it up (one uniqueness check, "Set up WondrPay rewards"), and every claim
// after that is a fresh proof of that session in World App ("Claim your WondrPay rewards"). The backend verifies
// every proof and binds it to this wallet + these exact cards.
import { useRef, useState } from "react"
import { CredentialRequest, IDKitRequestWidget, IDKitSessionWidget, type IDKitResult } from "@worldcoin/idkit"

type Base = { app_id: `app_${string}`; environment: "staging" | "production"; action_description: string; rp_context: any }
type Ctx = (Base & { mode: "enroll"; action: string }) | (Base & { mode: "session"; sessionId: `session_${string}` })

const HINT = "whitepay.rewardSession"
const readHint = () => { try { return localStorage.getItem(HINT) ?? "" } catch { return "" } }
const saveHint = (s?: string) => { try { if (s) localStorage.setItem(HINT, s) } catch {} }

const ERRORS: Record<string, string> = {
  nullifier_replayed: "This World ID already set up rewards from another wallet. Claim once from that wallet on this phone and this wallet will be recognised too.",
  max_verifications_reached: "This World ID already set up rewards from another wallet. Claim once from that wallet on this phone and this wallet will be recognised too.",
  user_rejected: "You declined the check in World App.",
  verification_rejected: "World App rejected the check. Try again.",
  credential_unavailable: "Your World ID isn't Orb-verified yet, which rewards need.",
  connection_failed: "Couldn't reach World App. Check your connection and try again.",
  world_id_4_not_available: "Update World App to the latest version, then try again.",
  feature_unavailable: "Update World App to the latest version, then try again.",
}

/** Asks the backend which check this wallet needs, so the button can say it before the scan. */
export async function rewardMode(owner: string): Promise<"enroll" | "session" | null> {
  try {
    const r = await fetch(`/api/rewards/verify?owner=${owner}&hint=${encodeURIComponent(readHint())}`)
    const d = await r.json()
    return r.ok ? d.mode : null
  } catch { return null }
}

export function ClaimVerify({ owner, signal, label, claim, onClaimed, onError, onStage }: {
  owner: string
  signal: string
  label: string
  /** POST the proof to the backend; throws on denial */
  claim: (proof: IDKitResult) => Promise<any>
  onClaimed: (data: any) => void
  onError: (reason: string) => void
  onStage?: (s: "idle" | "world" | "paying") => void
}) {
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const data = useRef<any>(null)
  const backendError = useRef<string | null>(null)
  const reported = useRef(false)

  const start = async () => {
    setBusy(true)
    try {
      const r = await fetch(`/api/rewards/verify?owner=${owner}&hint=${encodeURIComponent(readHint())}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      data.current = null; backendError.current = null; reported.current = false
      setCtx(d); setOpen(true); onStage?.("world")
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const shared = {
    open,
    onOpenChange: (o: boolean) => {
      setOpen(o)
      if (!o && !data.current) { onStage?.("idle"); if (!reported.current) onError(backendError.current ?? "World ID check was cancelled") }
    },
    handleVerify: async (result: IDKitResult) => {
      onStage?.("paying")
      try {
        data.current = await claim(result)
        saveHint((result as any).session_id)
      } catch (e) {
        backendError.current = (e as Error).message
        onStage?.("idle")
        throw e
      }
    },
    onSuccess: () => { onStage?.("idle"); onClaimed(data.current) },
    onError: (code: unknown) => {
      reported.current = true
      onStage?.("idle")
      console.warn("[world] IDKit error", code)
      onError(backendError.current ?? ERRORS[String(code)] ?? `World ID error: ${code}`)
    },
  }
  const constraints = CredentialRequest("proof_of_human", { signal })

  return (
    <>
      <button className="btn rw-claim-btn" onClick={start} disabled={busy || !signal}>
        {busy ? <span className="spinner" /> : <span aria-hidden>◎</span>} {label}
      </button>
      {ctx?.mode === "enroll" && (
        <IDKitRequestWidget {...shared}
          app_id={ctx.app_id} action={ctx.action} action_description={ctx.action_description} rp_context={ctx.rp_context}
          environment={ctx.environment} allow_legacy_proofs={false} session_id="create" constraints={constraints} />
      )}
      {ctx?.mode === "session" && (
        <IDKitSessionWidget {...(shared as any)}
          app_id={ctx.app_id} existing_session_id={ctx.sessionId} action_description={ctx.action_description}
          rp_context={ctx.rp_context} environment={ctx.environment} constraints={constraints} />
      )}
    </>
  )
}
