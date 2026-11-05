"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { parseRequestUri } from "@whitepay/shared"
import { Icon } from "../ui"

/** GPay-style scanner: full-screen camera, corner frame, upload from gallery, paste fallback. */
export default function Scan() {
  const router = useRouter()
  const video = useRef<HTMLVideoElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState("")
  const [manual, setManual] = useState("")

  const go = (raw: string) => {
    const text = raw.trim()
    // 0. autopay / subscription link: .../subscribe?plan=0x<planKey>
    const plan = text.match(/\/subscribe\?(?:.*&)?plan=(0x[0-9a-fA-F]{64})/)
    if (plan) {
      if (!isWhitePayHost(text)) { setErr(`This subscription QR points to ${hostOf(text)}, not WhitePay. Not opened, for your safety.`); return false }
      router.push(`/subscribe?plan=${plan[1]}`); return true
    }
    // 1. shop request (dynamic QR): .../pay?req=0x<entityKey>
    const key = parseRequestUri(text) ?? (/^0x[0-9a-fA-F]{64}$/.test(text) ? text : null)
    if (key) { router.push(`/pay?req=${key}`); return true }
    // 2. personal "Receive" QR: .../send?to=0x..&name=..
    try {
      const u = new URL(text)
      if (u.pathname === "/send" && (u.searchParams.get("to") || u.searchParams.get("name"))) { router.push(`/send${u.search}`); return true }
    } catch {}
    // 3. bare address, name.whitepay.eth, ethereum: URI
    const addr = text.replace(/^ethereum:/, "").split(/[@?]/)[0]
    if (/^0x[0-9a-fA-F]{40}$/.test(addr)) { router.push(`/send?to=${addr}`); return true }
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/.test(text.toLowerCase())) { router.push(`/send?name=${encodeURIComponent(text.toLowerCase())}`); return true }
    setErr(explainUnknown(text))
    return false
  }

  useEffect(() => {
    let scanner: { stop: () => void; destroy: () => void } | undefined
    let done = false
    ;(async () => {
      try {
        const QrScanner = (await import("qr-scanner")).default
        if (!video.current) return
        const s = new QrScanner(
          video.current,
          (res) => { if (!done && go(res.data)) { done = true; s.stop() } },
          { preferredCamera: "environment", highlightScanRegion: false, returnDetailedScanResult: true },
        )
        scanner = s
        await s.start()
      } catch (e) {
        setErr(location.protocol !== "https:" && location.hostname !== "localhost"
          ? "Camera needs HTTPS. Paste the payment link below."
          : `Camera unavailable: ${(e as Error)?.message ?? e}`)
      }
    })()
    return () => { scanner?.stop(); scanner?.destroy() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fromGallery = async (f: File | undefined) => {
    if (!f) return
    try {
      const QrScanner = (await import("qr-scanner")).default
      const r = await QrScanner.scanImage(f, { returnDetailedScanResult: true })
      go(r.data)
    } catch {
      setErr("No QR code found in that image")
    }
  }

  return (
    <div className="scan-page">
      <video ref={video} playsInline muted />
      <div className="scan-top">
        <button onClick={() => router.push("/")} aria-label="Close">{Icon.close()}</button>
        <span style={{ fontWeight: 700 }}>WhitePay</span>
        <span style={{ width: 42 }} />
      </div>
      <div className="scan-frame"><i /><i /><i /><i /></div>
      <button className="scan-upload" onClick={() => file.current?.click()}>{Icon.gallery()} Upload from gallery</button>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => fromGallery(e.target.files?.[0])} />
      <div className="scan-sheet">
        <div className="h">Scan any WhitePay QR to pay</div>
        <div className="s">Shop QR · Friend's QR · name.whitepay.eth</div>
        {err && <div className="err">{err}</div>}
        <div className="row" style={{ gap: 8 }}>
          <input className="input" placeholder="Or paste a link, name or 0x…" value={manual} onChange={(e) => setManual(e.target.value)} />
          <button className="btn btn-primary" style={{ width: "auto", padding: "14px 18px" }} onClick={() => go(manual)} disabled={!manual}>Go</button>
        </div>
      </div>
    </div>
  )
}

const WHITEPAY_HOSTS = ["whitepay.vercel.app", "localhost", "127.0.0.1"]
const hostOf = (t: string) => { try { return new URL(t).host } catch { return "another site" } }
const isWhitePayHost = (t: string) => {
  try { const h = new URL(t).hostname; return h === location.hostname || WHITEPAY_HOSTS.includes(h) || /^whitepay(-[a-z0-9-]+)?\.vercel\.app$/.test(h) } catch { return false }
}
/** Say WHY a scanned code was rejected instead of a generic "not WhitePay". */
function explainUnknown(t: string) {
  if (!t) return "The QR code was empty. Try again, holding the phone steady."
  try {
    const u = new URL(t)
    if (isWhitePayHost(t)) {
      if (u.pathname === "/subscribe") return "This subscription QR is incomplete or damaged (no valid plan id). Ask the shop for a new QR."
      if (u.pathname === "/pay") return "This payment QR is incomplete (missing request id). Ask the shop to show it again."
      return `This WhitePay link (${u.pathname}) isn't a payment, receive or subscription code.`
    }
    if (/^upi:/i.test(t)) return "That's a UPI QR. WhitePay pays in USDT on Whitechain, so ask for the shop's WhitePay QR."
    return `This QR opens ${u.host}, which isn't WhitePay. Not opened, for your safety.`
  } catch {}
  if (/^upi:/i.test(t)) return "That's a UPI QR. WhitePay pays in USDT on Whitechain, so ask for the shop's WhitePay QR."
  if (/^0x[0-9a-fA-F]+$/.test(t)) return `That looks like a ${t.length - 2}-character hex value, not a wallet address (40) or WhitePay request (64).`
  return `Not a WhitePay code. It contains: "${t.slice(0, 40)}${t.length > 40 ? "…" : ""}"`
}
