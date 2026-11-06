"use client"
// Payment links (portal): a fixed title + price on one of your websites. Share the link or its QR anywhere.
import { useCallback, useEffect, useState } from "react"
import { paymentLinkMessage } from "@whitepay/shared"
import { usdt } from "@/lib/format"
import { CopyField, Field, useWalletAction } from "./kit"

type Link = { linkId: string; site: string; title: string; amount: string; status: "active" | "disabled"; siteActive: boolean; url: string; paid: number; volume: string; createdAt: number; updatedAt: number }
type Site = { siteId: string; name: string; status: string }

const newLinkId = () => `pl_${Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, "0")).join("")}`

export function PaymentLinks({ merchant, sites }: { merchant: string; sites: Site[] }) {
  const active = sites.filter((s) => s.status === "active")
  const [links, setLinks] = useState<Link[] | null>(null)
  const [form, setForm] = useState({ title: "", amount: "", site: "" })
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState("")
  const [qr, setQr] = useState<string>("")
  const { ask, sheet } = useWalletAction()

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/business/links?merchant=${merchant}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error?.message)
      setLinks(d.links)
    } catch (e) { setErr((e as Error).message || "Couldn't load your links"); setLinks((x) => x ?? []) }
  }, [merchant])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!form.site && active[0]) setForm((f) => ({ ...f, site: active[0].siteId })) }, [active, form.site])

  const create = (e: React.FormEvent) => {
    e.preventDefault(); setErr("")
    const title = form.title.trim(), amount = form.amount.trim()
    if (!title) return setErr("Give the link a title, like \"Silk dupatta\".")
    if (!/^\d{1,4}(\.\d{1,6})?$/.test(amount) || Number(amount) < 0.01 || Number(amount) > 1000) return setErr("Enter a price between 0.01 and 1000 USDT, like 12.40.")
    if (!form.site) return setErr("Add a website first: links are paid through one of your websites.")
    const linkId = newLinkId()
    ask("Approve payment link", `${title} · ${amount} USDT`, async (acct) => {
      setBusy("create")
      try {
        const issuedAt = Math.floor(Date.now() / 1000)
        const signature = await acct.signMessage({ message: paymentLinkMessage({ action: "create", merchant: merchant as `0x${string}`, site: form.site, linkId, title, amount, issuedAt }) })
        const r = await fetch("/api/business/links", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "create", merchant, actor: acct.address, siteId: form.site, linkId, title, amount, issuedAt, signature }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error?.message ?? "Couldn't create the link")
        setForm((f) => ({ ...f, title: "", amount: "" })); setQr(d.linkId)
        await load()
      } catch (e) { setErr((e as Error).message) } finally { setBusy("") }
    })
  }

  const disable = (l: Link) => ask("Switch off this link", l.title, async (acct) => {
    setBusy(l.linkId); setErr("")
    try {
      const issuedAt = Math.max(Math.floor(Date.now() / 1000), l.updatedAt + 1)
      const amount = (Number(l.amount) / 1e6).toString()
      const signature = await acct.signMessage({ message: paymentLinkMessage({ action: "disable", merchant: merchant as `0x${string}`, site: l.site, linkId: l.linkId, title: l.title, amount, issuedAt }) })
      const r = await fetch("/api/business/links", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "disable", merchant, actor: acct.address, linkId: l.linkId, issuedAt, signature }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error?.message ?? "Couldn't switch it off")
      await load()
    } catch (e) { setErr((e as Error).message) } finally { setBusy("") }
  })

  return (
    <div className="pt-int">
      <p className="pt-sub">A link with a fixed price, paid through one of your websites. Share it in chats, on social media or print its QR. No code needed.</p>
      {links === null ? <div className="skel" style={{ height: 70 }} /> : links.length > 0 && (
        <ul className="pt-sites">
          {links.map((l) => (
            <li key={l.linkId} className={l.status === "active" ? "" : "revoked"}>
              <div className="pt-site-h">
                <div><b>{l.title}</b><span className="pt-muted">{usdt(l.amount)} USDT · {l.paid} paid{l.paid ? ` · ${usdt(l.volume)} USDT in` : ""}</span></div>
                <span className={`pt-pill ${l.status === "active" && l.siteActive ? "ok" : ""}`}>{l.status !== "active" ? "Switched off" : l.siteActive ? "Active" : "Website off"}</span>
              </div>
              <CopyField label="Link" value={l.url} mono />
              {qr === l.linkId && l.status === "active" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="pt-qr" src={`/api/qr?data=${encodeURIComponent(l.url)}`} width={180} height={180} alt={`QR code for ${l.title}`} />
              )}
              {l.status === "active" && (
                <div className="pt-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setQr(qr === l.linkId ? "" : l.linkId)} aria-expanded={qr === l.linkId}>{qr === l.linkId ? "Hide QR" : "Show QR"}</button>
                  <a className="btn btn-ghost btn-sm" href={l.url} target="_blank" rel="noreferrer">Open ↗</a>
                  <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => disable(l)}>{busy === l.linkId ? <span className="spinner" /> : null} Switch off</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="pt-form" onSubmit={create} noValidate>
        <h3>New payment link</h3>
        <Field id="pl-title" label="Title" hint="What the customer pays for, shown on the link" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Silk dupatta" maxLength={60} />
        <Field id="pl-amount" label="Price (USDT)" value={form.amount} onChange={(v) => setForm({ ...form, amount: v.replace(/[^\d.]/g, "") })} placeholder="12.40" maxLength={11} />
        {active.length > 1 && (
          <div className="pt-field">
            <label htmlFor="pl-site">Website</label>
            <select id="pl-site" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })}>
              {active.map((s) => <option key={s.siteId} value={s.siteId}>{s.name}</option>)}
            </select>
          </div>
        )}
        {err && <div className="pt-err" role="alert">{err}</div>}
        <button className="btn btn-primary" type="submit" disabled={!!busy || !active.length}>
          {busy === "create" ? <><span className="spinner" /> Creating…</> : "Create payment link"}
        </button>
        {!active.length && <p className="pt-fine">Add a website above first.</p>}
      </form>
      {sheet}
    </div>
  )
}
