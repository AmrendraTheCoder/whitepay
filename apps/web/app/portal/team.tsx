"use client"
// Team (portal, owner only): add a teammate's wallet as a developer, or remove them.
import { useCallback, useEffect, useState } from "react"
import { isAddress, getAddress } from "viem"
import { teamMessage } from "@whitepay/shared"
import { Identicon } from "../ui"
import { Field, useWalletAction } from "./kit"

type Member = { member: string; role: "developer"; status: "active" | "removed"; label?: string; createdAt: number; updatedAt: number }

export function Team({ merchant }: { merchant: string }) {
  const [team, setTeam] = useState<Member[] | null>(null)
  const [form, setForm] = useState({ member: "", label: "" })
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState("")
  const [confirm, setConfirm] = useState("")
  const { ask, sheet } = useWalletAction()

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/business/team?merchant=${merchant}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error?.message)
      setTeam(d.team)
    } catch (e) { setErr((e as Error).message || "Couldn't load your team"); setTeam((x) => x ?? []) }
  }, [merchant])
  useEffect(() => { void load() }, [load])

  const send = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/business/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error?.message ?? "That didn't work. Try again.")
    return d
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault(); setErr("")
    const m = form.member.trim()
    if (!isAddress(m)) return setErr("Paste your teammate's wallet address (0x followed by 40 characters).")
    if (getAddress(m) === getAddress(merchant)) return setErr("That's your own wallet.")
    const member = getAddress(m), label = form.label.trim() || undefined
    const prev = team?.find((x) => x.member === member)
    ask("Add a developer", label ?? `${member.slice(0, 6)}…${member.slice(-4)}`, async (acct) => {
      setBusy("add")
      try {
        const issuedAt = Math.max(Math.floor(Date.now() / 1000), (prev?.updatedAt ?? 0) + 1)
        const signature = await acct.signMessage({ message: teamMessage({ action: "add", merchant: merchant as `0x${string}`, member, role: "developer", label, issuedAt }) })
        await send({ action: "add", merchant, member, label, issuedAt, signature })
        setForm({ member: "", label: "" }); await load()
      } catch (e) { setErr((e as Error).message) } finally { setBusy("") }
    })
  }

  const remove = (m: Member) => ask("Remove teammate", m.label ?? m.member, async (acct) => {
    setBusy(m.member); setErr("")
    try {
      const issuedAt = Math.max(Math.floor(Date.now() / 1000), m.updatedAt + 1)
      const signature = await acct.signMessage({ message: teamMessage({ action: "remove", merchant: merchant as `0x${string}`, member: m.member as `0x${string}`, role: "developer", label: m.label, issuedAt }) })
      const d = await send({ action: "remove", merchant, member: m.member, issuedAt, signature })
      setConfirm(""); await load()
      if (d?.keysOff?.length) setErr(`Removed. ${d.keysOff.length} secret key${d.keysOff.length > 1 ? "s" : ""} they made ${d.keysOff.length > 1 ? "were" : "was"} switched off: make a new one in Websites & API keys.`)
    } catch (e) { setErr((e as Error).message) } finally { setBusy("") }
  })

  const active = (team ?? []).filter((m) => m.status === "active")
  return (
    <div className="pt-int">
      <p className="pt-sub">Give a developer or agency their own access: they open this portal with their wallet and can make new secret keys, payment links and test webhooks for your websites. They can't add or switch off websites, change the team, or touch your money. Removing someone also switches off any secret key they made.</p>
      {team === null ? <div className="skel" style={{ height: 60 }} /> : active.length > 0 && (
        <ul className="pt-sites">
          {active.map((m) => (
            <li key={m.member}>
              <div className="pt-row">
                <Identicon seed={m.member} size={36} />
                <div className="pt-grow"><b>{m.label ?? "Developer"}</b><span className="pt-muted mono">{m.member}</span></div>
                <span className="pt-pill">Developer</span>
              </div>
              <div className="pt-actions">
                {confirm === m.member ? (
                  <>
                    <button className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => remove(m)}>{busy === m.member ? <span className="spinner" /> : null} Yes, remove</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirm("")}>Keep</button>
                  </>
                ) : <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => setConfirm(m.member)}>Remove</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="pt-form" onSubmit={add} noValidate>
        <h3>Add a developer</h3>
        <Field id="tm-member" label="Their wallet address" value={form.member} onChange={(v) => setForm({ ...form, member: v.trim() })} placeholder="0x…" maxLength={42} />
        <Field id="tm-label" label="Note (optional)" hint="Stored publicly on Arkiv with the team list: don't put private details here" value={form.label} onChange={(v) => setForm({ ...form, label: v })} placeholder="Priya (web agency)" maxLength={40} />
        {err && <div className="pt-err" role="alert">{err}</div>}
        <button className="btn btn-primary" type="submit" disabled={!!busy || active.length >= 10}>{busy === "add" ? <><span className="spinner" /> Adding…</> : "Add developer"}</button>
      </form>
      {sheet}
    </div>
  )
}
