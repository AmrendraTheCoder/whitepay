"use client"
// Payment link: /l/<pl_…>. Anyone with the link can pay its fixed price, like a printed UPI QR.
// Shows what's being paid; "Pay" creates a fresh 15-minute checkout session and opens the hosted checkout.
import { use, useEffect, useState } from "react"
import { Icon, Identicon, LogoLoader } from "../../ui"
import { usdt } from "@/lib/format"
import { LocalAmount } from "../../local-amount"
import "../../checkout/[id]/checkout.css"

type Link = { linkId: string; title: string; amount: string; active: boolean; merchant: string; merchantName?: string; displayName?: string; verified: boolean }

export default function PayLinkPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = use(params)
  const [link, setLink] = useState<Link | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  useEffect(() => {
    if (!/^pl_[0-9a-f]{20}$/.test(linkId)) { setLink(null); return }
    fetch(`/api/v1/links/${linkId}`).then(async (r) => (r.ok ? setLink(await r.json()) : setLink(null))).catch(() => setLink(null))
  }, [linkId])

  const pay = async () => {
    setBusy(true); setErr("")
    try {
      const r = await fetch(`/api/v1/links/${linkId}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error?.message ?? "Couldn't start the payment. Try again.")
      location.assign(`/checkout/${d.id}`)
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  return (
    <main className="co" id="main">
      <header className="co-top">
        <span className="co-brand">WondrPay<small>Payment link</small></span>
        {link && <span className="co-secure">{Icon.shield(16)} Secure checkout</span>}
      </header>
      <div className="co-grid">
        {link === undefined ? <div className="co-done"><LogoLoader label="Loading…" /></div>
          : link === null ? (
            <section className="co-card co-done" role="alert">
              <div className="co-x" aria-hidden>{Icon.close(34)}</div>
              <h1>Link not found</h1>
              <p className="co-sub">This payment link doesn't exist. Check the link with the shop.</p>
            </section>
          ) : (
            <section className="co-card co-done" aria-labelledby="pl-title">
              <Identicon seed={link.merchant} name={link.merchantName} size={56} />
              <div>
                <div className="co-ens">{link.displayName ?? link.merchantName}</div>
                {link.merchantName && link.displayName && <div className="co-ens">{link.merchantName}</div>}
              </div>
              <h1 id="pl-title">{link.title}</h1>
              <div className="co-badges" style={{ justifyContent: "center" }}>
                {link.verified ? <span className="co-badge ok">{Icon.check(13)} Verified shop</span> : <span className="co-badge">Shop not World ID verified</span>}
                <span className="co-badge">Whitechain</span><span className="co-badge">0 gas</span>
              </div>
              <div className="co-total" style={{ width: "100%" }}><span>Price</span><span className="co-total-r"><b>{usdt(link.amount)} <small>USDT</small></b><LocalAmount micro={link.amount} className="co-local" /></span></div>
              {link.active ? (
                <button className="btn btn-primary" onClick={pay} disabled={busy} aria-describedby={err ? "pl-err" : undefined}>
                  {busy ? <><span className="spinner" /> Starting checkout…</> : `Pay ${usdt(link.amount)} USDT`}
                </button>
              ) : <p className="co-sub" role="status">The shop switched this link off. Ask them for a new one.</p>}
              {err && <p id="pl-err" className="co-sub" role="alert" style={{ color: "var(--bad)" }}>{err}</p>}
              <p className="co-fine">You'll pay with the WondrPay app or a browser wallet. The money goes straight to the shop.</p>
            </section>
          )}
      </div>
      <footer className="co-foot">Payments settle in USDT on Whitechain. WondrPay never holds the money.</footer>
    </main>
  )
}
