"use client"
// "Pay a person" search (opened from the home search bar).
//  - autofocused input with search icon, clear and paste; Enter picks the highlighted result
//  - recent people from your own activity, filtered as you type (instant, no network)
//  - live lookup of names, handles and 0x addresses (debounced, cancels stale requests)
//  - WAI-ARIA combobox: arrow keys move through results, aria-activedescendant, announced status
import { useEffect, useMemo, useRef, useState } from "react"
import { isAddress, type Address } from "viem"
import { Identicon } from "../ui"
import { getWallet } from "@/lib/wallet"
import { short } from "@/lib/format"
import "./search.css"

export type Payee = { address: Address; name?: string; displayName?: string; kind?: string; source?: string }
type Recent = { address: Address; name?: string; at: number }

const looksResolvable = (q: string) => isAddress(q) || /^[a-z0-9][a-z0-9-]{1,30}(\.whitepay)?(\.eth)?$/i.test(q)
const titleOf = (p: { displayName?: string; name?: string; address: string }) => p.displayName ?? p.name?.replace(/\.whitepay\.eth$/, "") ?? short(p.address)

export function PayeeSearch({ initialQuery = "", onPick }: { initialQuery?: string; onPick: (p: Payee) => void }) {
  const [q, setQ] = useState(initialQuery)
  const [recents, setRecents] = useState<Recent[] | null>(null)
  const [hit, setHit] = useState<Payee | null>(null)
  const [state, setState] = useState<"idle" | "searching" | "found" | "none" | "invalid" | "error">("idle")
  const [msg, setMsg] = useState("")
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const me = useRef<string>("")

  useEffect(() => {
    input.current?.focus()
    const w = getWallet()
    if (!w) { setRecents([]); return }
    me.current = w.address.toLowerCase()
    // people you've paid or been paid by, newest first, one row each; router hops are not people
    fetch(`/api/activity?address=${w.address}`).then((r) => r.json()).then((d) => {
      const seen = new Map<string, Recent>()
      for (const r of (d.rows ?? []) as { counterparty: string; counterpartyName?: string; at: number; kind: string }[]) {
        if (r.kind === "whitepay" || r.kind === "refund") continue
        const k = r.counterparty.toLowerCase()
        if (k === me.current || seen.has(k)) continue
        seen.set(k, { address: r.counterparty as Address, name: r.counterpartyName, at: r.at })
      }
      setRecents([...seen.values()].slice(0, 8))
    }).catch(() => setRecents([]))
  }, [])

  // live lookup: debounced, and a newer keystroke cancels the older request
  useEffect(() => {
    const term = q.trim().toLowerCase()
    setHit(null); setActive(0)
    if (!term) { setState("idle"); setMsg(""); return }
    if (term.startsWith("0x") && !isAddress(term)) { setState(term.length >= 42 ? "invalid" : "idle"); setMsg(term.length >= 42 ? "That isn't a valid address. Check for a typo." : ""); return }
    if (!looksResolvable(term)) { setState("idle"); setMsg(""); return }
    const ctl = new AbortController()
    setState("searching")
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/resolve?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        const d = await r.json()
        if (r.status === 404) { setState("none"); setMsg(`No WhitePay user called “${term}”.`); return }
        if (!r.ok) throw new Error(d.error)
        if (d.address?.toLowerCase() === me.current) { setState("none"); setMsg("That's your own wallet."); return }
        setHit(d); setState("found"); setMsg("")
      } catch (e) {
        if ((e as Error).name === "AbortError") return
        setState("error"); setMsg("Couldn't search right now. Check your connection.")
      }
    }, 350)
    return () => { clearTimeout(t); ctl.abort() }
  }, [q])

  const filteredRecents = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = recents ?? []
    if (!term) return list
    return list.filter((r) => r.address.toLowerCase().includes(term) || (r.name ?? "").toLowerCase().includes(term))
  }, [q, recents])

  // one flat option list for keyboard navigation: lookup result first, then matching recents
  const options: Payee[] = useMemo(() => {
    const out: Payee[] = []
    if (hit) out.push(hit)
    for (const r of filteredRecents) if (!hit || r.address.toLowerCase() !== hit.address.toLowerCase()) out.push({ address: r.address, name: r.name })
    return out
  }, [hit, filteredRecents])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === "Enter" && options[active]) { e.preventDefault(); onPick(options[active]) }
    else if (e.key === "Escape" && q) { e.preventDefault(); setQ("") }
  }

  const paste = async () => {
    try { const t = (await navigator.clipboard.readText()).trim(); if (t) setQ(t.replace(/^ethereum:/, "").split(/[?@]/)[0]) } catch { input.current?.focus() }
  }

  const status = state === "searching" ? "Searching…" : state === "found" ? "1 match" : msg
  const optId = (i: number) => `payee-opt-${i}`

  return (
    <div className="ps">
      <div className={`ps-field ${state === "searching" ? "busy" : ""}`}>
        <svg className="ps-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
          placeholder="Name, handle or 0x address" aria-label="Search for a person or shop"
          role="combobox" aria-expanded={options.length > 0} aria-controls="payee-list" aria-autocomplete="list"
          aria-activedescendant={options.length ? optId(active) : undefined}
          autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" inputMode="text" />
        {state === "searching" && <span className="spinner ps-spin" aria-hidden />}
        {q ? <button className="ps-clear" onClick={() => { setQ(""); input.current?.focus() }} aria-label="Clear search">✕</button>
          : <button className="ps-paste" onClick={paste}>Paste</button>}
      </div>

      <div className="ps-actions">
        <a className="ps-action" href="/scan"><span aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8" /></svg>
        </span>Scan a QR</a>
        <a className="ps-action" href="/receive"><span aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z" /></svg>
        </span>My QR</a>
      </div>

      <p className="sr-only" role="status" aria-live="polite">{status}</p>

      <ul id="payee-list" role="listbox" aria-label="People" className="ps-list">
        {hit && (
          <>
            <li className="ps-head" role="presentation">Best match</li>
            <Option p={hit} id={optId(0)} on={active === 0} onPick={onPick} onHover={() => setActive(0)} best />
          </>
        )}
        {state === "searching" && !hit && (
          <li className="ps-row ps-skel" role="presentation" aria-hidden><span className="skel circle" style={{ width: 44, height: 44 }} /><div className="grow"><span className="skel" style={{ width: "45%", height: 14 }} /><br /><span className="skel" style={{ width: "30%", height: 11, marginTop: 6 }} /></div></li>
        )}
        {(state === "none" || state === "invalid" || state === "error") && (
          <li className={`ps-msg ${state === "error" ? "bad" : ""}`} role="presentation">{msg}{state === "none" && <span>Ask them for their WhitePay QR, or paste their 0x address.</span>}</li>
        )}
        {filteredRecents.length > 0 && <li className="ps-head" role="presentation">{q.trim() ? "From your recents" : "Recent"}</li>}
        {options.slice(hit ? 1 : 0).map((p, i) => {
          const idx = i + (hit ? 1 : 0)
          return <Option key={p.address} p={p} id={optId(idx)} on={active === idx} onPick={onPick} onHover={() => setActive(idx)} />
        })}
        {recents === null && !q && [0, 1, 2].map((i) => (
          <li key={i} className="ps-row ps-skel" role="presentation" aria-hidden><span className="skel circle" style={{ width: 44, height: 44 }} /><div className="grow"><span className="skel" style={{ width: "50%", height: 14 }} /></div></li>
        ))}
        {recents?.length === 0 && !q && (
          <li className="ps-empty" role="presentation">
            <b>Pay anyone on WhitePay</b>
            <span>Type their name (like <i>ravi</i>), their full <i>ravi.whitepay.eth</i>, or paste a 0x address. People you pay show up here.</span>
          </li>
        )}
      </ul>
    </div>
  )
}

function Option({ p, id, on, onPick, onHover, best }: { p: Payee; id: string; on: boolean; onPick: (p: Payee) => void; onHover: () => void; best?: boolean }) {
  const verifiedName = p.source === "ens" || p.kind === "merchant" || !!p.name
  return (
    <li id={id} role="option" aria-selected={on} className={`ps-row ${on ? "on" : ""}`} onClick={() => onPick(p)} onMouseEnter={onHover}>
      <Identicon seed={p.address} name={p.displayName ?? p.name} size={44} />
      <div className="grow">
        <div className="ps-name">{titleOf(p)}{p.kind === "merchant" && <span className="badge badge-ok">Shop</span>}</div>
        <div className="ps-sub">{p.name && p.name !== titleOf(p) ? p.name : short(p.address)}{best && !verifiedName && " · unnamed address"}</div>
      </div>
      <svg className="ps-go" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
    </li>
  )
}
