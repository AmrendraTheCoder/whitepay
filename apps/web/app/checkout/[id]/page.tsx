"use client"
// Hosted checkout for WondrPay for Business sessions: /checkout/<session id>.
// The shop's server created the session with its secret key; this page shows what's being paid, lets the customer
// pay with the WondrPay app (QR on desktop, a button on phones), watches for the payment, then sends them back to the
// shop's successUrl. It never signs or holds anything itself: paying happens on /pay with the customer's own wallet.
import { use, useCallback, useEffect, useRef, useState } from "react"
import { Countdown, Icon, Identicon, LogoLoader, SuccessCheck } from "../../ui"
import { usdt } from "@/lib/format"
import "./checkout.css"

type Req = {
  merchant: string; merchantName?: string; amount: string; deadline: string; status: string; note?: string
  site?: string; reference?: string; successUrl?: string; cancelUrl?: string
}
type Status =
  | { state: "loading" }
  | { state: "publishing" }
  | { state: "pending"; request: Req; verifiedMerchant: boolean; merchantDisplayName?: string }
  | { state: "paid"; request: Req; receipt?: { explorer?: string; txHash?: string } }
  | { state: "gone"; reason: string; request?: Req }

const POLL_MS = 2500
const REDIRECT_S = 5

/** Append the session id and status to a return URL without breaking its own query or hash. */
function returnUrl(base: string, id: string, status: "paid" | "cancelled") {
  try {
    const u = new URL(base)
    if (!(u.protocol === "https:" || (u.protocol === "http:" && u.hostname === "localhost"))) return ""
    u.searchParams.set("wondrpay_session", id)
    u.searchParams.set("wondrpay_status", status)
    return u.toString()
  } catch { return "" }
}

export default function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const valid = /^0x[0-9a-fA-F]{64}$/.test(id)
  const [s, setS] = useState<Status>({ state: "loading" })
  const [isPhone, setIsPhone] = useState(false)
  const tries = useRef(0)

  useEffect(() => setIsPhone(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)), [])

  const load = useCallback(async (): Promise<Status> => {
    const r = await fetch(`/api/requests/${id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ state: "error" }))
    if (r.state === "pending") return { state: "pending", request: r.request, verifiedMerchant: !!r.verifiedMerchant, merchantDisplayName: r.merchantDisplayName }
    if (r.state === "paid") return { state: "paid", request: r.request, receipt: r.receipt }
    if (r.state === "publishing") return tries.current++ < 24 ? { state: "publishing" } : { state: "gone", reason: "This checkout link expired or doesn't exist. Go back to the shop and try again." }
    if (r.state === "error") return { state: "publishing" } // network blip: keep trying quietly
    return { state: "gone", reason: r.state === "depleted" ? "This checkout expired. Go back to the shop to start again; nothing was charged." : r.reason ?? "This checkout can't be paid.", request: r.request }
  }, [id])

  // poll until paid or gone; pause while the tab is hidden
  useEffect(() => {
    if (!valid) return
    let stop = false, t: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      if (document.hidden) { t = setTimeout(tick, POLL_MS); return }
      const next = await load()
      if (stop) return
      setS((prev) => (prev.state === "paid" ? prev : next))
      if (next.state !== "paid" && next.state !== "gone") t = setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => { stop = true; if (t) clearTimeout(t) }
  }, [load, valid])

  if (!valid) return <Shell><Gone reason="This isn't a WondrPay checkout link." /></Shell>
  if (s.state === "loading" || s.state === "publishing")
    return <Shell><LogoLoader label={s.state === "publishing" ? "Getting your checkout ready…" : "Loading checkout…"} /></Shell>
  if (s.state === "gone") return <Shell request={s.request}><Gone reason={s.reason} back={s.request?.cancelUrl && returnUrl(s.request.cancelUrl, id, "cancelled")} /></Shell>
  if (s.state === "paid") return <Shell request={s.request}><Paid id={id} request={s.request} explorer={s.receipt?.explorer} /></Shell>

  const { request: r } = s
  const payUrl = `${location.origin}/pay?req=${id}`
  const shop = s.merchantDisplayName ?? r.merchantName ?? "the shop"
  return (
    <Shell request={r}>
      <section className="co-card co-summary" aria-labelledby="co-shop">
        <div className="co-shop">
          <Identicon seed={r.merchant} name={r.merchantName} size={48} />
          <div className="co-shop-txt">
            <h1 id="co-shop">{shop}</h1>
            {r.merchantName && <span className="co-ens">{r.merchantName}</span>}
          </div>
        </div>
        <div className="co-badges">
          {s.verifiedMerchant ? <span className="co-badge ok">{Icon.check(13)} Verified shop</span> : <span className="co-badge">Shop not World ID verified</span>}
          <span className="co-badge">Whitechain</span>
          <span className="co-badge">0 gas</span>
        </div>
        <dl className="co-lines">
          {r.note && <><dt>For</dt><dd>{r.note}</dd></>}
          {r.reference && <><dt>Order</dt><dd className="mono">{r.reference}</dd></>}
          <dt>Network</dt><dd>Whitechain Sepolia · USDT</dd>
          <dt>Expires in</dt><dd aria-live="off"><Countdown to={Number(r.deadline)} /></dd>
        </dl>
        <div className="co-total"><span>Total</span><b>{usdt(r.amount)} <small>USDT</small></b></div>
      </section>

      <section className="co-card co-pay" aria-labelledby="co-pay-h">
        <h2 id="co-pay-h">Pay with WondrPay</h2>
        {isPhone ? (
          <p className="co-sub">Approve with your PIN or fingerprint in WondrPay. You pay no network fee.</p>
        ) : (
          <>
            <p className="co-sub">Scan with the camera in the WondrPay app on your phone.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="co-qr" src={`/api/qr?data=${encodeURIComponent(payUrl)}`} width={220} height={220} alt={`QR code to pay ${usdt(r.amount)} USDT to ${shop}`} />
          </>
        )}
        <a className="btn btn-primary" href={payUrl}>{isPhone ? "Pay with WondrPay" : "Pay in this browser"}</a>
        <div className="co-wait" role="status" aria-live="polite"><span className="co-dot" aria-hidden /> Waiting for your payment…</div>
        <p className="co-fine">No WondrPay yet? <a href="/app">Create a wallet</a> in 20 seconds, then come back to this page.</p>
        {r.cancelUrl && <a className="co-cancel" href={returnUrl(r.cancelUrl, id, "cancelled")}>Cancel and go back to the shop</a>}
      </section>
    </Shell>
  )
}

function Shell({ children, request }: { children: React.ReactNode; request?: Req }) {
  return (
    <main className="co" id="main">
      <header className="co-top">
        <span className="co-brand">WondrPay<small>Checkout</small></span>
        {request?.merchantName && <span className="co-secure">{Icon.shield(16)} Secure checkout</span>}
      </header>
      <div className="co-grid">{children}</div>
      <footer className="co-foot">Payments settle in USDT on Whitechain. Money goes straight to the shop's wallet; WondrPay never holds it.</footer>
    </main>
  )
}

function Paid({ id, request, explorer }: { id: string; request: Req; explorer?: string }) {
  const back = request.successUrl ? returnUrl(request.successUrl, id, "paid") || null : null
  const [left, setLeft] = useState(REDIRECT_S)
  const [hold, setHold] = useState(false)
  useEffect(() => {
    if (!back || hold) return
    if (left <= 0) { location.assign(back); return }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [back, left, hold])
  return (
    <section className="co-card co-done">
      <span className="sr-only" role="status">Payment confirmed: {usdt(request.amount)} USDT paid.</span>
      <SuccessCheck />
      <h1>Paid {usdt(request.amount)} USDT</h1>
      <p className="co-sub">to {request.merchantName ?? "the shop"}. Settled on Whitechain, receipt saved on Arkiv.</p>
      {explorer && <a className="co-link" href={explorer} target="_blank" rel="noreferrer">View transaction ↗</a>}
      {back ? (
        <>
          <a className="btn btn-primary" href={back}>Back to the shop</a>
          {!hold
            ? <p className="co-fine" aria-hidden={left < REDIRECT_S}>Taking you back in {left}s · <button className="co-textbtn" onClick={() => setHold(true)}>Stay here</button></p>
            : <p className="co-fine">You can close this page.</p>}
        </>
      ) : <p className="co-fine">You can close this page and go back to the shop.</p>}
    </section>
  )
}

function Gone({ reason, back }: { reason: string; back?: string | false }) {
  return (
    <section className="co-card co-done" role="alert">
      <div className="co-x" aria-hidden>{Icon.close(34)}</div>
      <h1>Can't pay this checkout</h1>
      <p className="co-sub">{reason}</p>
      {back && <a className="btn btn-primary" href={back}>Back to the shop</a>}
    </section>
  )
}
