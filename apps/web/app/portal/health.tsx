"use client"
// Integration checker + webhook delivery log for one website (portal, inside each website card).
import { useCallback, useEffect, useState } from "react"
import { webhookActionMessage } from "@whitepay/shared"
import { Icon } from "../ui"
import { useWalletAction } from "./kit"

type Delivery = { key: string; eventId: string; event: string; sessionId?: string; url: string; status: "delivered" | "failed"; httpStatus: number; attempts: number; at: number }
type Health = {
  checks: { id: string; label: string; ok: boolean; detail: string }[]
  payments: { count: number; volume: string; last?: { at: number; amount: string; explorer: string } }
  deliveries: Delivery[]
}

const ago = (t: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - t)
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(t * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

export function SiteHealth({ merchant, siteId, hasWebhook }: { merchant: string; siteId: string; hasWebhook: boolean }) {
  const [h, setH] = useState<Health | null>(null)
  const [err, setErr] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState("")
  const { ask, sheet } = useWalletAction()

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/business/sites/${siteId}/health?merchant=${merchant}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error?.message)
      setH(d); setErr("")
    } catch (e) { setErr((e as Error).message || "Couldn't check this website") }
  }, [merchant, siteId])
  useEffect(() => { void load() }, [load])

  const act = (action: "ping" | "resend", target: string, deliveryKey?: string) =>
    ask(action === "ping" ? "Send a test webhook" : "Re-send this webhook", target, async (acct) => {
      setBusy(deliveryKey ?? "ping"); setNote(""); setErr("")
      try {
        const issuedAt = Math.floor(Date.now() / 1000)
        const signature = await acct.signMessage({ message: webhookActionMessage({ action, merchant: acct.address, site: siteId, target: action === "ping" ? target : deliveryKey!, issuedAt }) })
        const r = await fetch("/api/business/webhooks", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, merchant: acct.address, siteId, deliveryKey, issuedAt, signature }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error?.message ?? "Couldn't send it")
        setNote(d.status === "delivered" ? `Delivered: your server answered HTTP ${d.httpStatus}.` : `Not delivered: ${d.httpStatus ? `your server answered HTTP ${d.httpStatus}` : "no answer from your server"}${d.error ? ` (${d.error})` : ""}.`)
        await load()
      } catch (e) { setErr((e as Error).message) } finally { setBusy("") }
    })

  if (!h && !err) return <div className="skel" style={{ height: 120 }} aria-label="Checking this website" />
  return (
    <div className="pt-health">
      <h4>Integration check</h4>
      {h && (
        <ul className="pt-checks">
          {h.checks.map((c) => (
            <li key={c.id} className={c.ok ? "ok" : ""}>
              <span className="pt-check-i" aria-hidden>{c.ok ? Icon.check(13) : "·"}</span>
              <div><b>{c.label}</b><span>{c.detail}</span></div>
              <span className="sr-only">{c.ok ? "done" : "not yet"}</span>
            </li>
          ))}
        </ul>
      )}
      {h?.payments.last && (
        <p className="pt-fine">Last payment {ago(h.payments.last.at)} · <a href={h.payments.last.explorer} target="_blank" rel="noreferrer">view on Whitechain ↗</a></p>
      )}
      <div className="pt-actions">
        <button className="btn btn-ghost btn-sm" disabled={!hasWebhook || !!busy} onClick={() => act("ping", h?.checks.find((c) => c.id === "webhook_set")?.detail ?? "")}>
          {busy === "ping" ? <span className="spinner" /> : null} Send test webhook
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={!!busy}>Check again</button>
      </div>
      <div role="status" aria-live="polite" className="pt-fine">{note}</div>
      {err && <div className="pt-err" role="alert">{err}</div>}

      {h && h.deliveries.length > 0 && (
        <>
          <h4>Webhook deliveries</h4>
          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead><tr><th scope="col">Event</th><th scope="col">Result</th><th scope="col">When</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {h.deliveries.map((d) => (
                  <tr key={d.key}>
                    <td><code>{d.event}</code><span className="pt-muted mono">{d.eventId.slice(0, 14)}…</span></td>
                    <td><span className={`pt-pill ${d.status === "delivered" ? "ok" : "bad"}`}>{d.status === "delivered" ? `HTTP ${d.httpStatus}` : d.httpStatus ? `HTTP ${d.httpStatus}` : "No answer"}</span>{d.attempts > 1 && <span className="pt-muted"> {d.attempts} tries</span>}</td>
                    <td className="pt-muted">{ago(d.at)}</td>
                    <td><button className="pt-link" disabled={!!busy} onClick={() => act("resend", d.event, d.key)}>{busy === d.key ? "Sending…" : "Resend"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {sheet}
    </div>
  )
}
