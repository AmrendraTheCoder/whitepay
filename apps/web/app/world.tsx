"use client"
// "Verify with World ID" button: gets a backend-signed RP context, opens the IDKit widget,
// sends the proof to OUR backend for verification. Cancel / reject / backend denial => onDenied.
import { useRef, useState } from "react"
import { CredentialRequest, IDKitRequestWidget, IDKitSessionWidget, proofOfHuman, type IDKitResult } from "@worldcoin/idkit"

type Base = { action_description: string; app_id: `app_${string}`; environment: "staging" | "production"; rp_context: any }
// "session": this person already set up a World ID session, so the check is a fresh proof of it (never "already used")
type Ctx = (Base & { mode?: undefined; action: string }) | (Base & { mode: "session"; sessionId: `session_${string}` })

const ERRORS: Record<string, string> = {
  // World only lets one scan per person per action. Extra wallets/shops don't need a scan: they're
  // approved by the wallet that already verified (needs that wallet on this device).
  nullifier_replayed: "Your World ID is already verified with WondrPay. Add this wallet with \"Approve from your verified wallet\" instead; no new scan needed. If the button isn't shown, add your verified wallet to this device first (You → + Add wallet → import).",
  max_verifications_reached: "Your World ID is already verified with WondrPay. Add this wallet with \"Approve from your verified wallet\" instead; no new scan needed. If the button isn't shown, add your verified wallet to this device first (You → + Add wallet → import).",
  user_rejected: "You declined the request in World App.",
  verification_rejected: "World App rejected the verification.",
  credential_unavailable: "Your World ID doesn't have the required credential yet.",
  connection_failed: "Couldn't reach World App. Check your connection and try again.",
}

/** resolves once IDKit's sheet (rendered in a shadow root) is on screen, or after `ms` */
const sheetVisible = (ms: number) =>
  new Promise<void>((done) => {
    const t0 = Date.now()
    const tick = () => {
      const up = [...document.body.children].some((e) => e.shadowRoot?.querySelector(".idkit-modal, .idkit-backdrop"))
      if (up || Date.now() - t0 > ms) return done()
      setTimeout(tick, 120)
    }
    tick()
  })

const REPEAT = "Your World ID already did this one-time check from another wallet. Claim your WondrPay name on this wallet with World ID (or add this wallet from your verified one), then try again. No new scan is needed after that."

export function WorldVerify({
  purpose,
  paymentRef,
  signal,
  label,
  verify,
  onVerified,
  onDenied,
  address,
  onRepeat,
  className = "btn btn-primary",
}: {
  /** name = personal WondrPay name, shop = verified merchant, pay = step-up for one large payment */
  purpose: "name" | "shop" | "pay" | "refund" | "reward"
  paymentRef?: string
  signal: string
  label: string
  /** POST the proof to the backend; resolve with data on success, throw on denial */
  verify: (result: IDKitResult) => Promise<any>
  onVerified: (data: any) => void
  onDenied: (reason: string) => void
  /** the wallet being checked: lets the backend pick a World ID session this person already has */
  address?: string
  /** World refused a repeat one-time proof: ask the backend to pass an already-verified person instead */
  onRepeat?: () => Promise<any>
  className?: string
}) {
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // refs, not state: the widget calls onSuccess/onError right after handleVerify, before a re-render
  const backendData = useRef<any>(null)
  const backendError = useRef<string | null>(null)
  // World App / IDKit error already reported: closing the error sheet must not overwrite it with "cancelled"
  const reported = useRef(false)

  const start = async () => {
    if (busy) return
    setBusy(true)
    try {
      // never spin forever: a dropped connection or a stale page gets a clear message within 15 s
      const r = await fetch(`/api/world/context?purpose=${purpose}${paymentRef ? `&ref=${paymentRef}` : ""}${address ? `&address=${address}` : ""}`, { signal: AbortSignal.timeout(15_000), cache: "no-store" })
        .catch((e) => { throw new Error((e as Error).name === "TimeoutError" ? "World ID took too long to start. Check your connection and try again." : "Couldn't reach WondrPay. Check your connection, reload the page and try again.") })
      const d = await r.json().catch(() => ({ error: "World ID couldn't start. Reload the page and try again." }))
      if (!r.ok) throw new Error(d.error)
      backendData.current = null
      backendError.current = null
      reported.current = false
      setCtx(d)
      setOpen(true)
      // the World ID sheet connects to World's bridge before it shows: keep "Opening World ID…" until it's on screen
      await sheetVisible(8_000)
    } catch (e) {
      onDenied((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handlers = {
    open,
    onOpenChange: (o: boolean) => {
      setOpen(o)
      if (!o && !backendData.current && !reported.current) onDenied(backendError.current ?? "World ID verification was cancelled")
    },
    // throws => widget shows failure; backend is the only judge of validity
    handleVerify: async (result: IDKitResult) => {
      try {
        backendData.current = await verify(result)
      } catch (e) {
        backendError.current = (e as Error).message
        throw e
      }
    },
    onSuccess: () => onVerified(backendData.current),
    onError: (code: unknown) => {
      reported.current = true
      console.warn("[world] IDKit error", code)
      const c = String(code)
      // names/shops: one scan per person. pay/refund/reward: an already-verified person passes without a new scan
      const repeat = purpose !== "name" && purpose !== "shop" && (c === "max_verifications_reached" || c === "nullifier_replayed")
      if (repeat && onRepeat && !backendError.current) {
        setOpen(false)
        onRepeat().then(onVerified, (e) => onDenied((e as Error).message || REPEAT))
        return
      }
      onDenied(backendError.current ?? (repeat ? REPEAT : ERRORS[c]) ?? `World ID error: ${code}`)
    },
  }

  return (
    <>
      <button className={className} onClick={start} disabled={busy}>
        {busy ? <><span className="spinner" /> Opening World ID…</> : <><span aria-hidden>◎</span> {label}</>}
      </button>
      {ctx && (ctx.mode === "session" ? (
        <IDKitSessionWidget {...(handlers as any)}
          app_id={ctx.app_id} existing_session_id={ctx.sessionId} action_description={ctx.action_description}
          rp_context={ctx.rp_context} environment={ctx.environment} constraints={CredentialRequest("proof_of_human", { signal })} />
      ) : (
        <IDKitRequestWidget {...handlers}
          app_id={ctx.app_id}
          action={ctx.action}
          action_description={ctx.action_description}
          rp_context={ctx.rp_context}
          environment={ctx.environment}
          allow_legacy_proofs={false}
          preset={proofOfHuman({ signal })}
        />
      ))}
    </>
  )
}
